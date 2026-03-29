import * as anchor from "@coral-xyz/anchor";
import { Program }     from "@coral-xyz/anchor";
import { EscrowManager } from "../target/types/escrow_manager";
import { WorkerRegistry } from "../target/types/worker_registry";
import { PayrollVault }   from "../target/types/payroll_vault";
import {
  Keypair, PublicKey, SystemProgram,
} from "@solana/web3.js";
import {
  createMint, createAssociatedTokenAccount, mintTo,
  getAssociatedTokenAddress, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bvDZ"
);

// Unix timestamp helpers
const now   = () => Math.floor(Date.now() / 1000);
const WEEK  = 7 * 24 * 60 * 60;
const BIWEEKLY = 2 * WEEK;

describe("escrow_manager", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const escrowProgram    = anchor.workspace.EscrowManager   as Program<EscrowManager>;
  const registryProgram  = anchor.workspace.WorkerRegistry  as Program<WorkerRegistry>;
  const vaultProgram     = anchor.workspace.PayrollVault    as Program<PayrollVault>;

  const employer   = provider.wallet;
  const workerKey  = Keypair.generate();

  let mint:                 PublicKey;
  let vaultPda:             PublicKey;
  let vaultTokenAccount:    PublicKey;
  let employerTokenAccount: PublicKey;
  let workerTokenAccount:   PublicKey;
  let workerRegistryPda:    PublicKey;
  let schedulePda:          PublicKey;
  let escrowAuthority:      PublicKey;

  before(async () => {
    // ── Mint setup ────────────────────────────────────────────────────────────
    mint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      employer.publicKey,
      null,
      6
    );

    employerTokenAccount = await createAssociatedTokenAccount(
      provider.connection, (provider.wallet as any).payer, mint, employer.publicKey
    );
    workerTokenAccount = await createAssociatedTokenAccount(
      provider.connection, (provider.wallet as any).payer, mint, workerKey.publicKey
    );

    await mintTo(
      provider.connection, (provider.wallet as any).payer,
      mint, employerTokenAccount, employer.publicKey, 100_000_000
    );

    // ── Derive PDAs ───────────────────────────────────────────────────────────
    [workerRegistryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("worker"), employer.publicKey.toBuffer(), workerKey.publicKey.toBuffer()],
      registryProgram.programId
    );

    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), employer.publicKey.toBuffer()],
      vaultProgram.programId
    );
    vaultTokenAccount = await getAssociatedTokenAddress(mint, vaultPda, true);

    [escrowAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_authority"), employer.publicKey.toBuffer()],
      escrowProgram.programId
    );

    [schedulePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("schedule"),
        employer.publicKey.toBuffer(),
        workerRegistryPda.toBuffer(),
      ],
      escrowProgram.programId
    );

    // ── Register + verify worker ──────────────────────────────────────────────
    await registryProgram.methods
      .registerWorker({ employee: {} }, mint)
      .accounts({
        worker:        workerRegistryPda,
        employer:      employer.publicKey,
        workerWallet:  workerKey.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await registryProgram.methods
      .setKycStatus({ verified: {} })
      .accounts({ worker: workerRegistryPda, admin: employer.publicKey })
      .rpc();

    // ── Initialize vault with escrowAuthority as release_authority ────────────
    await vaultProgram.methods
      .initializeVault(escrowAuthority)
      .accounts({
        vault:                  vaultPda,
        vaultTokenAccount,
        mint,
        employer:               employer.publicKey,
        systemProgram:          SystemProgram.programId,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    // ── Deposit 50 USDC into vault ────────────────────────────────────────────
    await vaultProgram.methods
      .deposit(new anchor.BN(50_000_000))
      .accounts({
        vault:                  vaultPda,
        vaultTokenAccount,
        employerTokenAccount,
        employer:               employer.publicKey,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
  });

  it("creates an employee salary schedule", async () => {
    await escrowProgram.methods
      .createSchedule({
        scheduleType:     { calendar: {} },
        amountPerPeriod:  new anchor.BN(5_000_000), // 5 USDC per period
        startAt:          new anchor.BN(now() - 10), // already past — disbursable immediately
        intervalSeconds:  new anchor.BN(BIWEEKLY),
      })
      .accounts({
        schedule:       schedulePda,
        workerAccount:  workerRegistryPda,
        employer:       employer.publicKey,
        systemProgram:  SystemProgram.programId,
      })
      .rpc();

    const schedule = await escrowProgram.account.paymentSchedule.fetch(schedulePda);
    assert.deepEqual(schedule.scheduleType, { calendar: {} });
    assert.equal(schedule.amountPerPeriod.toString(), "5000000");
    assert.ok(schedule.isActive, "schedule should be active");
    assert.equal(schedule.totalPaid.toString(), "0");
  });

  it("disburses salary to employee on schedule", async () => {
    const balBefore = await provider.connection.getTokenAccountBalance(workerTokenAccount);

    await escrowProgram.methods
      .disburseEmployee()
      .accounts({
        schedule:               schedulePda,
        workerAccount:          workerRegistryPda,
        authority:              escrowAuthority,
        vault:                  vaultPda,
        vaultTokenAccount,
        workerTokenAccount,
        vaultProgram:           vaultProgram.programId,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const balAfter = await provider.connection.getTokenAccountBalance(workerTokenAccount);
    const diff = BigInt(balAfter.value.amount) - BigInt(balBefore.value.amount);
    assert.equal(diff.toString(), "5000000", "worker should have received 5 USDC");

    const schedule = await escrowProgram.account.paymentSchedule.fetch(schedulePda);
    assert.equal(schedule.totalPaid.toString(), "5000000");
  });

  it("rejects double disbursement before next period", async () => {
    try {
      await escrowProgram.methods
        .disburseEmployee()
        .accounts({
          schedule:               schedulePda,
          workerAccount:          workerRegistryPda,
          authority:              escrowAuthority,
          vault:                  vaultPda,
          vaultTokenAccount,
          workerTokenAccount,
          vaultProgram:           vaultProgram.programId,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("should have thrown TooEarlyToDisburse");
    } catch (err: any) {
      assert.include(err.message, "TooEarlyToDisburse");
    }
  });

  it("employer pauses and resumes a schedule", async () => {
    await escrowProgram.methods
      .setScheduleActive(false)
      .accounts({ schedule: schedulePda, employer: employer.publicKey })
      .rpc();

    let schedule = await escrowProgram.account.paymentSchedule.fetch(schedulePda);
    assert.isFalse(schedule.isActive);

    await escrowProgram.methods
      .setScheduleActive(true)
      .accounts({ schedule: schedulePda, employer: employer.publicKey })
      .rpc();

    schedule = await escrowProgram.account.paymentSchedule.fetch(schedulePda);
    assert.isTrue(schedule.isActive);
  });

  // ── Contractor milestone test ─────────────────────────────────────────────

  it("releases contractor milestone payment", async () => {
    const contractorKey = Keypair.generate();
    const contractorTokenAccount = await createAssociatedTokenAccount(
      provider.connection, (provider.wallet as any).payer, mint, contractorKey.publicKey
    );

    const [contractorRegistryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("worker"), employer.publicKey.toBuffer(), contractorKey.publicKey.toBuffer()],
      registryProgram.programId
    );
    const [contractorSchedulePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("schedule"), employer.publicKey.toBuffer(), contractorRegistryPda.toBuffer()],
      escrowProgram.programId
    );

    // Register + verify contractor
    await registryProgram.methods
      .registerWorker({ contractor: {} }, mint)
      .accounts({
        worker:        contractorRegistryPda,
        employer:      employer.publicKey,
        workerWallet:  contractorKey.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await registryProgram.methods
      .setKycStatus({ verified: {} })
      .accounts({ worker: contractorRegistryPda, admin: employer.publicKey })
      .rpc();

    // Create milestone schedule (8 USDC per milestone)
    await escrowProgram.methods
      .createSchedule({
        scheduleType:     { milestone: {} },
        amountPerPeriod:  new anchor.BN(8_000_000),
        startAt:          new anchor.BN(now()),
        intervalSeconds:  new anchor.BN(0),
      })
      .accounts({
        schedule:       contractorSchedulePda,
        workerAccount:  contractorRegistryPda,
        employer:       employer.publicKey,
        systemProgram:  SystemProgram.programId,
      })
      .rpc();

    const balBefore = await provider.connection.getTokenAccountBalance(contractorTokenAccount);

    await escrowProgram.methods
      .completeMilestone()
      .accounts({
        schedule:               contractorSchedulePda,
        workerAccount:          contractorRegistryPda,
        authority:              escrowAuthority,
        vault:                  vaultPda,
        vaultTokenAccount,
        workerTokenAccount:     contractorTokenAccount,
        vaultProgram:           vaultProgram.programId,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const balAfter = await provider.connection.getTokenAccountBalance(contractorTokenAccount);
    const diff = BigInt(balAfter.value.amount) - BigInt(balBefore.value.amount);
    assert.equal(diff.toString(), "8000000", "contractor should receive 8 USDC per milestone");
  });
});
