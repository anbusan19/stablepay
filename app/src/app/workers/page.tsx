"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { usePrograms } from "@/hooks/usePrograms";
import { KycBadge, WorkerTypeBadge } from "@/components/StatusBadge";
import { explorerAccountUrl, explorerTxUrl, USDC_MINT, EURC_MINT } from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

type KycStatus   = "pending" | "verified" | "flagged";
type WorkerType  = "employee" | "contractor" | "freelancer";

type WorkerRow = {
  pda:         PublicKey;
  wallet:      PublicKey;
  workerType:  WorkerType;
  kycStatus:   KycStatus;
  payoutMint:  PublicKey;
};

function parseKycStatus(raw: Record<string, unknown>): KycStatus {
  if ("verified" in raw) return "verified";
  if ("flagged"  in raw) return "flagged";
  return "pending";
}

function parseWorkerType(raw: Record<string, unknown>): WorkerType {
  if ("contractor" in raw) return "contractor";
  if ("freelancer" in raw) return "freelancer";
  return "employee";
}

function mintLabel(mint: PublicKey): string {
  if (mint.equals(USDC_MINT)) return "USDC";
  if (mint.equals(EURC_MINT)) return "EURC";
  return mint.toBase58().slice(0, 6) + "…";
}

function truncate(pk: PublicKey): string {
  const s = pk.toBase58();
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function kycStatusArg(status: KycStatus) {
  return { [status]: {} };
}

// ─── KYC action buttons for a row ────────────────────────────────────────────

const KYC_TRANSITIONS: Record<KycStatus, KycStatus[]> = {
  pending:  ["verified", "flagged"],
  verified: ["flagged"],
  flagged:  ["verified", "pending"],
};

const ACTION_LABELS: Record<KycStatus, { label: string; cls: string }> = {
  verified: { label: "Verify",  cls: "text-emerald-700 border-emerald-200 hover:bg-emerald-50" },
  pending:  { label: "Clear",   cls: "text-amber-700   border-amber-200   hover:bg-amber-50"   },
  flagged:  { label: "Flag",    cls: "text-red-700     border-red-200     hover:bg-red-50"     },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkersPage() {
  const { publicKey } = useWallet();
  const programs      = usePrograms();

  const [workers,   setWorkers]   = useState<WorkerRow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [txMap,     setTxMap]     = useState<Record<string, { sig?: string; error?: string; loading?: boolean }>>({});

  // ── Fetch all workers for this employer ─────────────────────────────────

  const fetchWorkers = useCallback(async () => {
    if (!programs || !publicKey) return;
    setLoading(true);
    try {
      const accounts = await programs.workerRegistry.account.workerAccount.all([
        {
          memcmp: {
            offset: 8, // skip 8-byte discriminator; employer is first field
            bytes:  publicKey.toBase58(),
          },
        },
      ]);

      setWorkers(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accounts.map((a: any) => ({
          pda:        a.publicKey   as PublicKey,
          wallet:     a.account.wallet     as PublicKey,
          workerType: parseWorkerType(a.account.workerType),
          kycStatus:  parseKycStatus(a.account.kycStatus),
          payoutMint: a.account.payoutMint as PublicKey,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch workers:", err);
    } finally {
      setLoading(false);
    }
  }, [programs, publicKey]);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  // ── Set KYC status ───────────────────────────────────────────────────────

  async function setKyc(workerPda: PublicKey, status: KycStatus) {
    if (!programs || !publicKey) return;
    const key = workerPda.toBase58();
    setTxMap((prev) => ({ ...prev, [key]: { loading: true } }));

    try {
      const sig = await programs.workerRegistry.methods
        .setKycStatus(kycStatusArg(status))
        .accounts({ worker: workerPda, admin: publicKey })
        .rpc();

      setTxMap((prev) => ({ ...prev, [key]: { sig } }));
      await fetchWorkers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxMap((prev) => ({ ...prev, [key]: { error: msg } }));
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (!publicKey) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="text-4xl mb-4">👥</div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Workers</h1>
        <p className="text-slate-500 text-sm mb-6">
          Connect your employer wallet to manage your workers.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workers</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {workers.length} registered under your wallet
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchWorkers}
            disabled={loading}
            className="px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <Link
            href="/onboard"
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Add Worker
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {!loading && workers.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="text-4xl mb-3">👤</div>
          <p className="text-slate-600 font-medium">No workers registered yet</p>
          <p className="text-slate-400 text-sm mt-1 mb-4">
            Register your first worker to get started.
          </p>
          <Link
            href="/onboard"
            className="inline-block px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
          >
            Register a Worker
          </Link>
        </div>
      )}

      {/* Workers table */}
      {workers.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Wallet
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Type
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  KYC Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Payout
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workers.map((w) => {
                const key      = w.pda.toBase58();
                const rowTx    = txMap[key];
                const actions  = KYC_TRANSITIONS[w.kycStatus];

                return (
                  <tr key={key} className="hover:bg-slate-50/50">
                    {/* Wallet */}
                    <td className="px-4 py-3">
                      <a
                        href={explorerAccountUrl(w.wallet.toBase58())}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-indigo-600 hover:underline text-xs"
                      >
                        {truncate(w.wallet)}
                      </a>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      <WorkerTypeBadge type={w.workerType} />
                    </td>

                    {/* KYC status */}
                    <td className="px-4 py-3">
                      <KycBadge status={w.kycStatus} />
                    </td>

                    {/* Payout mint */}
                    <td className="px-4 py-3 text-slate-600 text-xs font-medium">
                      {mintLabel(w.payoutMint)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {actions.map((targetStatus) => {
                          const { label, cls } = ACTION_LABELS[targetStatus];
                          const busy = rowTx?.loading;
                          return (
                            <button
                              key={targetStatus}
                              onClick={() => setKyc(w.pda, targetStatus)}
                              disabled={!!busy}
                              className={`px-2.5 py-1 text-xs font-medium border rounded-md transition-colors disabled:opacity-50 ${cls}`}
                            >
                              {busy ? "…" : label}
                            </button>
                          );
                        })}

                        {/* Tx feedback */}
                        {rowTx?.sig && (
                          <a
                            href={explorerTxUrl(rowTx.sig)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            ✓ confirmed ↗
                          </a>
                        )}
                        {rowTx?.error && (
                          <span className="text-xs text-red-500" title={rowTx.error}>
                            ✗ failed
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Employer info footer */}
      <p className="text-xs text-slate-400 mt-4 font-mono">
        Employer:{" "}
        <a
          href={explorerAccountUrl(publicKey.toBase58())}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {publicKey.toBase58()}
        </a>
      </p>
    </div>
  );
}
