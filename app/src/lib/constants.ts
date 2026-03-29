import { PublicKey, clusterApiUrl } from "@solana/web3.js";

// ─── Cluster ─────────────────────────────────────────────────────────────────

export const CLUSTER = "devnet" as const;
export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl("devnet");

// ─── Mints ───────────────────────────────────────────────────────────────────

/** Circle devnet USDC */
export const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

/** EURC devnet (placeholder — swap for real devnet EURC mint when available) */
export const EURC_MINT = new PublicKey(
  "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr"
);

// ─── Program IDs ─────────────────────────────────────────────────────────────
// Populated from env after `anchor keys sync` + `anchor deploy --provider.cluster devnet`

export const PROGRAM_IDS = {
  workerRegistry: new PublicKey(
    process.env.NEXT_PUBLIC_WORKER_REGISTRY_PROGRAM_ID ??
      "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
  ),
  payrollVault: new PublicKey(
    process.env.NEXT_PUBLIC_PAYROLL_VAULT_PROGRAM_ID ??
      "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
  ),
  escrowManager: new PublicKey(
    process.env.NEXT_PUBLIC_ESCROW_MANAGER_PROGRAM_ID ??
      "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
  ),
  complianceLog: new PublicKey(
    process.env.NEXT_PUBLIC_COMPLIANCE_LOG_PROGRAM_ID ??
      "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
  ),
} as const;

// ─── PDA helpers ─────────────────────────────────────────────────────────────

/** Derive the WorkerAccount PDA for a given employer + worker wallet pair. */
export function findWorkerPda(
  employer: PublicKey,
  workerWallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("worker"), employer.toBuffer(), workerWallet.toBuffer()],
    PROGRAM_IDS.workerRegistry
  );
}

/** Derive the VaultAccount PDA for an employer. */
export function findVaultPda(employer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), employer.toBuffer()],
    PROGRAM_IDS.payrollVault
  );
}

/**
 * Derive the escrow_manager authority PDA for an employer.
 * This is set as the `release_authority` when initializing a vault,
 * allowing escrow_manager to sign vault releases via CPI.
 */
export function findEscrowAuthorityPda(employer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_authority"), employer.toBuffer()],
    PROGRAM_IDS.escrowManager
  );
}

/** Derive the PaymentSchedule PDA for a given employer + workerRegistryPda pair. */
export function findSchedulePda(
  employer: PublicKey,
  workerRegistryPda: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("schedule"), employer.toBuffer(), workerRegistryPda.toBuffer()],
    PROGRAM_IDS.escrowManager
  );
}

// ─── Token amount helpers ─────────────────────────────────────────────────────

export const STABLECOIN_DECIMALS = 6;

/** Convert on-chain u64 lamports to a human-readable decimal string. */
export const lamportsToUi = (lamports: bigint | number): string =>
  (Number(lamports) / 10 ** STABLECOIN_DECIMALS).toFixed(2);

/** Convert a UI decimal amount to a u64 bigint for on-chain instructions. */
export const uiToLamports = (ui: number): bigint =>
  BigInt(Math.round(ui * 10 ** STABLECOIN_DECIMALS));

// ─── Explorer links ───────────────────────────────────────────────────────────

export const explorerTxUrl = (signature: string): string =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

export const explorerAccountUrl = (address: string): string =>
  `https://explorer.solana.com/address/${address}?cluster=devnet`;
