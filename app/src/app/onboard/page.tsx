"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { usePrograms } from "@/hooks/usePrograms";
import {
  findWorkerPda,
  USDC_MINT,
  EURC_MINT,
  explorerTxUrl,
} from "@/lib/constants";

type WorkerType = "employee" | "contractor" | "freelancer";
type TxState = { sig: string } | { error: string } | null;

const WORKER_TYPES: { value: WorkerType; label: string; desc: string }[] = [
  { value: "employee",   label: "Employee",   desc: "Fixed salary · Calendar-based release" },
  { value: "contractor", label: "Contractor", desc: "Milestone-based release" },
  { value: "freelancer", label: "Freelancer", desc: "Invoice-triggered release" },
];

const PAYOUT_TOKENS = [
  { mint: USDC_MINT.toBase58(), label: "USDC" },
  { mint: EURC_MINT.toBase58(), label: "EURC" },
];

function workerTypeArg(type: WorkerType) {
  return { [type]: {} };
}

function isValidPubkey(s: string): boolean {
  try { new PublicKey(s); return true; } catch { return false; }
}

export default function OnboardPage() {
  const { publicKey }  = useWallet();
  const programs       = usePrograms();

  const [workerAddress, setWorkerAddress] = useState("");
  const [workerType, setWorkerType]       = useState<WorkerType>("employee");
  const [payoutMint, setPayoutMint]       = useState(USDC_MINT.toBase58());
  const [loading, setLoading]             = useState(false);
  const [tx, setTx]                       = useState<TxState>(null);

  const validAddress = isValidPubkey(workerAddress);

  async function handleRegister() {
    if (!programs || !publicKey || !validAddress) return;
    setLoading(true);
    setTx(null);

    try {
      const workerWallet = new PublicKey(workerAddress);
      const [workerPda]  = findWorkerPda(publicKey, workerWallet);

      const sig = await programs.workerRegistry.methods
        .registerWorker(workerTypeArg(workerType), new PublicKey(payoutMint))
        .accounts({
          worker:        workerPda,
          employer:      publicKey,
          workerWallet,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTx({ sig });
      setWorkerAddress("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTx({ error: msg });
    } finally {
      setLoading(false);
    }
  }

  if (!publicKey) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="text-4xl mb-4">👤</div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Register a Worker</h1>
        <p className="text-slate-500 text-sm mb-6">
          Connect your employer wallet to register workers on-chain.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Register a Worker</h1>
        <p className="text-slate-500 text-sm mt-1">
          Creates a KYC-pending worker account on-chain. Use the Workers page to verify.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">

        {/* Worker wallet */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Worker Wallet Address
          </label>
          <input
            type="text"
            placeholder="Solana public key (base58)"
            value={workerAddress}
            onChange={(e) => setWorkerAddress(e.target.value.trim())}
            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono outline-none transition-colors
              ${workerAddress && !validAddress
                ? "border-red-300 focus:border-red-400 bg-red-50"
                : "border-slate-200 focus:border-indigo-400"
              }`}
          />
          {workerAddress && !validAddress && (
            <p className="text-red-500 text-xs mt-1">Invalid Solana address</p>
          )}
        </div>

        {/* Worker type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Worker Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {WORKER_TYPES.map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => setWorkerType(value)}
                className={`border rounded-lg p-3 text-left transition-colors
                  ${workerType === value
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
              >
                <div className={`text-sm font-medium ${workerType === value ? "text-indigo-700" : "text-slate-800"}`}>
                  {label}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Payout currency */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Payout Currency
          </label>
          <div className="flex gap-2">
            {PAYOUT_TOKENS.map(({ mint, label }) => (
              <button
                key={mint}
                onClick={() => setPayoutMint(mint)}
                className={`flex-1 border rounded-lg py-2 text-sm font-medium transition-colors
                  ${payoutMint === mint
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleRegister}
          disabled={loading || !validAddress || !programs}
          className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium
            hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Registering…" : "Register Worker"}
        </button>

        {/* Result */}
        {tx && "sig" in tx && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-emerald-700">Worker registered ✓</p>
            <p className="text-emerald-600 text-xs mt-1">
              KYC status: <span className="font-mono">Pending</span> — go to Workers to verify.
            </p>
            <a
              href={explorerTxUrl(tx.sig)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 text-xs mt-1 inline-block hover:underline font-mono"
            >
              {tx.sig.slice(0, 20)}…{tx.sig.slice(-6)} ↗
            </a>
          </div>
        )}

        {tx && "error" in tx && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-red-700">Transaction failed</p>
            <p className="text-red-500 text-xs mt-1 font-mono break-all">{tx.error}</p>
          </div>
        )}
      </div>

      {/* Employer info */}
      <p className="text-xs text-slate-400 mt-3 text-center font-mono">
        Employer: {publicKey.toBase58().slice(0, 8)}…{publicKey.toBase58().slice(-6)}
      </p>
    </div>
  );
}
