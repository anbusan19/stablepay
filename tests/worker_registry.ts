import * as anchor from "@coral-xyz/anchor";
import { Program }  from "@coral-xyz/anchor";
import { WorkerRegistry } from "../target/types/worker_registry";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

// Devnet USDC mint (Circle)
const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

describe("worker_registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program   = anchor.workspace.WorkerRegistry as Program<WorkerRegistry>;
  const employer  = provider.wallet;
  const workerKey = Keypair.generate();

  let workerPda: PublicKey;

  before(() => {
    [workerPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("worker"),
        employer.publicKey.toBuffer(),
        workerKey.publicKey.toBuffer(),
      ],
      program.programId
    );
  });

  it("registers a new worker with KYC pending", async () => {
    await program.methods
      .registerWorker({ employee: {} }, USDC_DEVNET)
      .accounts({
        worker:        workerPda,
        employer:      employer.publicKey,
        workerWallet:  workerKey.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const account = await program.account.workerAccount.fetch(workerPda);
    assert.deepEqual(account.workerType, { employee: {} }, "worker type should be Employee");
    assert.deepEqual(account.kycStatus,  { pending: {}  }, "KYC status should default to Pending");
    assert.ok(account.wallet.equals(workerKey.publicKey), "wallet should match worker key");
    assert.ok(account.employer.equals(employer.publicKey), "employer should match provider");
    assert.ok(account.payoutMint.equals(USDC_DEVNET), "payout mint should be USDC");
  });

  it("sets KYC status to Verified (admin toggle)", async () => {
    await program.methods
      .setKycStatus({ verified: {} })
      .accounts({
        worker: workerPda,
        admin:  employer.publicKey,
      })
      .rpc();

    const account = await program.account.workerAccount.fetch(workerPda);
    assert.deepEqual(account.kycStatus, { verified: {} }, "KYC status should be Verified");
  });

  it("flags a worker (sanctions / compliance block)", async () => {
    // Register a second worker to flag so the verified one stays clean for later tests
    const flaggedKey = Keypair.generate();
    const [flaggedPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("worker"), employer.publicKey.toBuffer(), flaggedKey.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .registerWorker({ contractor: {} }, USDC_DEVNET)
      .accounts({
        worker:        flaggedPda,
        employer:      employer.publicKey,
        workerWallet:  flaggedKey.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .setKycStatus({ flagged: {} })
      .accounts({ worker: flaggedPda, admin: employer.publicKey })
      .rpc();

    const account = await program.account.workerAccount.fetch(flaggedPda);
    assert.deepEqual(account.kycStatus, { flagged: {} });
  });

  it("worker updates their payout preference", async () => {
    // Use a mock EURC mint address for the test
    const mockEurcMint = Keypair.generate().publicKey;

    await program.methods
      .updatePayoutPreference(mockEurcMint)
      .accounts({
        worker:       workerPda,
        workerSigner: workerKey.publicKey,
      })
      .signers([workerKey])
      .rpc();

    const account = await program.account.workerAccount.fetch(workerPda);
    assert.ok(account.payoutMint.equals(mockEurcMint), "payout mint should be updated to mock EURC");
  });

  it("rejects payout preference update from wrong signer", async () => {
    const attacker = Keypair.generate();
    try {
      await program.methods
        .updatePayoutPreference(USDC_DEVNET)
        .accounts({
          worker:       workerPda,
          workerSigner: attacker.publicKey,
        })
        .signers([attacker])
        .rpc();
      assert.fail("should have thrown");
    } catch (err: any) {
      assert.include(err.message, "Unauthorized");
    }
  });
});
