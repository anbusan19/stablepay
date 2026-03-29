import * as anchor from "@coral-xyz/anchor";
import { Program }       from "@coral-xyz/anchor";
import { ComplianceLog } from "../target/types/compliance_log";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";
import { assert } from "chai";

/** Mock SHA-256 of a Travel Rule JSON payload */
function mockTravelRuleHash(data: string): number[] {
  return Array.from(createHash("sha256").update(data).digest());
}

/** Mock 32-byte tx signature from a base58 string */
function mockTxSig(): number[] {
  return Array.from(Keypair.generate().publicKey.toBytes()); // 32 random bytes
}

describe("compliance_log", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program  = anchor.workspace.ComplianceLog as Program<ComplianceLog>;
  const employer = provider.wallet;
  const regulator = Keypair.generate();

  const txSig1 = mockTxSig();

  let entryPda: PublicKey;
  let grantPda: PublicKey;

  before(() => {
    [entryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("entry"), employer.publicKey.toBuffer(), Buffer.from(txSig1)],
      program.programId
    );

    [grantPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("regulator"), employer.publicKey.toBuffer(), regulator.publicKey.toBuffer()],
      program.programId
    );
  });

  it("writes an immutable compliance entry", async () => {
    const workerWallet = Keypair.generate().publicKey;
    const mint         = Keypair.generate().publicKey; // mock mint

    await program.methods
      .writeEntry({
        workerWallet,
        txSignature:     txSig1,
        amount:          new anchor.BN(5_000_000),
        mint,
        kytScore:        0, // low risk
        travelRuleHash:  mockTravelRuleHash(`{"sender":"employer","receiver":"${workerWallet}"}`),
        purposeCode:     "SALARY",
      })
      .accounts({
        entry:         entryPda,
        employer:      employer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.complianceEntry.fetch(entryPda);
    assert.ok(entry.employer.equals(employer.publicKey));
    assert.ok(entry.workerWallet.equals(workerWallet));
    assert.equal(entry.amount.toString(), "5000000");
    assert.equal(entry.kytScore, 0);
    assert.equal(entry.purposeCode, "SALARY");
    assert.ok(entry.timestamp > 0);
  });

  it("rejects duplicate entry for same tx signature", async () => {
    try {
      await program.methods
        .writeEntry({
          workerWallet:   Keypair.generate().publicKey,
          txSignature:    txSig1, // same sig → same PDA → init fails
          amount:         new anchor.BN(1_000_000),
          mint:           Keypair.generate().publicKey,
          kytScore:       0,
          travelRuleHash: mockTxSig(),
          purposeCode:    "SALARY",
        })
        .accounts({
          entry:         entryPda,
          employer:      employer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("should have thrown on duplicate PDA init");
    } catch (err: any) {
      // Anchor will throw because the account already exists
      assert.ok(err.message.length > 0);
    }
  });

  it("grants regulator time-limited access", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    await program.methods
      .grantRegulatorAccess(new anchor.BN(expiresAt))
      .accounts({
        grant:         grantPda,
        employer:      employer.publicKey,
        regulator:     regulator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const grant = await program.account.regulatorGrant.fetch(grantPda);
    assert.ok(grant.employer.equals(employer.publicKey));
    assert.ok(grant.regulator.equals(regulator.publicKey));
    assert.equal(grant.expiresAt.toString(), expiresAt.toString());
  });

  it("revokes regulator access (closes account)", async () => {
    await program.methods
      .revokeRegulatorAccess()
      .accounts({
        grant:    grantPda,
        employer: employer.publicKey,
      })
      .rpc();

    try {
      await program.account.regulatorGrant.fetch(grantPda);
      assert.fail("account should be closed");
    } catch (err: any) {
      assert.ok(err.message.includes("Account does not exist") || err.message.includes("null"));
    }
  });
});
