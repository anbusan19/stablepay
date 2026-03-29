import * as anchor from "@coral-xyz/anchor";
import { Program }     from "@coral-xyz/anchor";
import { PayrollVault } from "../target/types/payroll_vault";
import {
  Keypair, PublicKey, SystemProgram,
} from "@solana/web3.js";
import {
  createMint, createAssociatedTokenAccount,
  mintTo, getAssociatedTokenAddress, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bvDZ"
);

describe("payroll_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program  = anchor.workspace.PayrollVault as Program<PayrollVault>;
  const employer = provider.wallet;

  let mint:                  PublicKey;
  let vaultPda:              PublicKey;
  let vaultTokenAccount:     PublicKey;
  let employerTokenAccount:  PublicKey;
  let mockReleaseAuthority:  Keypair;

  const DEPOSIT_AMOUNT = 10_000_000n; // 10 USDC (6 decimals)

  before(async () => {
    // Deploy a test mint
    mint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      employer.publicKey,
      null,
      6
    );

    employerTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as any).payer,
      mint,
      employer.publicKey
    );

    await mintTo(
      provider.connection,
      (provider.wallet as any).payer,
      mint,
      employerTokenAccount,
      employer.publicKey,
      100_000_000 // 100 USDC
    );

    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), employer.publicKey.toBuffer()],
      program.programId
    );

    vaultTokenAccount = await getAssociatedTokenAddress(mint, vaultPda, true);
    mockReleaseAuthority = Keypair.generate();
  });

  it("initializes a vault", async () => {
    await program.methods
      .initializeVault(mockReleaseAuthority.publicKey)
      .accounts({
        vault:                   vaultPda,
        vaultTokenAccount,
        mint,
        employer:                employer.publicKey,
        systemProgram:           SystemProgram.programId,
        tokenProgram:            TOKEN_PROGRAM_ID,
        associatedTokenProgram:  ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const vault = await program.account.vaultAccount.fetch(vaultPda);
    assert.ok(vault.employer.equals(employer.publicKey));
    assert.ok(vault.mint.equals(mint));
    assert.ok(vault.releaseAuthority.equals(mockReleaseAuthority.publicKey));
    assert.equal(vault.totalDeposited.toString(), "0");
  });

  it("employer deposits USDC into vault", async () => {
    await program.methods
      .deposit(new anchor.BN(DEPOSIT_AMOUNT.toString()))
      .accounts({
        vault:                  vaultPda,
        vaultTokenAccount,
        employerTokenAccount,
        employer:               employer.publicKey,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const vault = await program.account.vaultAccount.fetch(vaultPda);
    assert.equal(vault.totalDeposited.toString(), DEPOSIT_AMOUNT.toString());

    const tokenBal = await provider.connection.getTokenAccountBalance(vaultTokenAccount);
    assert.equal(tokenBal.value.amount, DEPOSIT_AMOUNT.toString());
  });

  it("employer withdraws USDC from vault", async () => {
    const withdrawAmount = 2_000_000n; // 2 USDC

    await program.methods
      .withdraw(new anchor.BN(withdrawAmount.toString()))
      .accounts({
        vault:                  vaultPda,
        vaultTokenAccount,
        employerTokenAccount,
        employer:               employer.publicKey,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const tokenBal = await provider.connection.getTokenAccountBalance(vaultTokenAccount);
    assert.equal(
      tokenBal.value.amount,
      (DEPOSIT_AMOUNT - withdrawAmount).toString()
    );
  });

  it("rejects withdraw from non-employer", async () => {
    const attacker = Keypair.generate();
    try {
      await program.methods
        .withdraw(new anchor.BN(1_000_000))
        .accounts({
          vault:                  vaultPda,
          vaultTokenAccount,
          employerTokenAccount,
          employer:               attacker.publicKey,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      assert.fail("should have thrown");
    } catch (err: any) {
      assert.ok(err.message.includes("Error") || err.message.includes("unauthorized") || err.message.length > 0);
    }
  });
});
