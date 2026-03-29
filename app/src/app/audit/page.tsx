"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { createHash } from "crypto";
import { usePrograms } from "@/hooks/usePrograms";
import { lamportsToUi, explorerTxUrl, USDC_MINT, EURC_MINT } from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

type ComplianceEntry = {
  pda:             PublicKey;
  workerWallet:    PublicKey;
  amount:          BN;
  mint:            PublicKey;
  kytScore:        number;
  purposeCode:     string;
  timestamp:       BN;
  travelRuleHash:  number[];
  txSignature:     number[];
};

type RegulatorGrant = {
  pda:        PublicKey;
  regulator:  PublicKey;
  expiresAt:  BN;
};

const KYT_LABELS = ["🟢 Low", "🟡 Medium", "🔴 High"];
const KYT_STYLES = [
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-amber-50   text-amber-700   border-amber-200",
  "bg-red-50     text-red-700     border-red-200",
];

const PURPOSE_CODES = ["SALARY", "MILESTONE", "INVOICE", "BONUS"];

function truncate(pk: PublicKey | string, n = 6): string {
  const s = typeof pk === "string" ? pk : pk.toBase58();
  return `${s.slice(0, n)}…${s.slice(-4)}`;
}

function mintLabel(mint: PublicKey): string {
  if (mint.equals(USDC_MINT)) return "USDC";
  if (mint.equals(EURC_MINT)) return "EURC";
  return truncate(mint, 4);
}

function timeAgo(unixTs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixTs;
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(unixTs * 1000).toLocaleDateString();
}

/** Generate a deterministic-looking mock tx signature (32 bytes) from random bytes */
function randomBytes32(): number[] {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)));
}

/** SHA-256 of a Travel Rule JSON payload */
function travelRuleHash(sender: string, receiver: string, amount: string): number[] {
  const payload = JSON.stringify({ sender, receiver, amount, ts: Date.now() });
  return Array.from(createHash("sha256").update(payload).digest());
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const { publicKey } = useWallet();
  const programs      = usePrograms();

  const [entries,      setEntries]      = useState<ComplianceEntry[]>([]);
  const [grants,       setGrants]       = useState<RegulatorGrant[]>([]);
  const [loading,      setLoading]      = useState(false);

  // write entry form (demo — normally called automatically after disbursement)
  const [showWriteForm, setShowWriteForm]  = useState(false);
  const [writeWorker,   setWriteWorker]    = useState("");
  const [writeAmount,   setWriteAmount]    = useState("");
  const [writeKyt,      setWriteKyt]       = useState(0);
  const [writePurpose,  setWritePurpose]   = useState("SALARY");
  const [writeBusy,     setWriteBusy]      = useState(false);
  const [writeTx,       setWriteTx]        = useState<{ sig?: string; error?: string } | null>(null);

  // grant regulator form
  const [showGrantForm, setShowGrantForm]  = useState(false);
  const [grantAddress,  setGrantAddress]   = useState("");
  const [grantDays,     setGrantDays]      = useState("30");
  const [grantBusy,     setGrantBusy]      = useState(false);
  const [grantTx,       setGrantTx]        = useState<{ sig?: string; error?: string } | null>(null);

  // revoke state
  const [revokeBusy, setRevokeBusy] = useState<Record<string, boolean>>({});

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!programs || !publicKey) return;
    setLoading(true);
    try {
      // Compliance entries
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawEntries = await programs.complianceLog.account.complianceEntry.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]) as any[];

      setEntries(
        rawEntries
          .map((e) => ({
            pda:            e.publicKey,
            workerWallet:   e.account.workerWallet,
            amount:         e.account.amount,
            mint:           e.account.mint,
            kytScore:       e.account.kytScore,
            purposeCode:    e.account.purposeCode,
            timestamp:      e.account.timestamp,
            travelRuleHash: e.account.travelRuleHash,
            txSignature:    e.account.txSignature,
          }))
          .sort((a, b) => b.timestamp.toNumber() - a.timestamp.toNumber())
      );

      // Regulator grants
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawGrants = await programs.complianceLog.account.regulatorGrant.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]) as any[];

      setGrants(rawGrants.map((g) => ({
        pda:       g.publicKey,
        regulator: g.account.regulator,
        expiresAt: g.account.expiresAt,
      })));
    } finally {
      setLoading(false);
    }
  }, [programs, publicKey]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Write compliance entry ────────────────────────────────────────────────

  async function handleWriteEntry() {
    if (!programs || !publicKey || !writeWorker || !writeAmount) return;
    setWriteBusy(true);
    setWriteTx(null);
    try {
      const workerWallet = new PublicKey(writeWorker);
      const txSig        = randomBytes32();
      const trHash       = travelRuleHash(publicKey.toBase58(), writeWorker, writeAmount);
      const amount       = BigInt(Math.round(parseFloat(writeAmount) * 1_000_000));

      // PDA: ["entry", employer, tx_signature]
      const [entryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("entry"), publicKey.toBuffer(), Buffer.from(txSig)],
        programs.complianceLog.programId
      );

      const sig = await programs.complianceLog.methods
        .writeEntry({
          workerWallet,
          txSignature:    txSig,
          amount:         new BN(amount.toString()),
          mint:           USDC_MINT,
          kytScore:       writeKyt,
          travelRuleHash: trHash,
          purposeCode:    writePurpose,
        })
        .accounts({
          entry:         entryPda,
          employer:      publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setWriteTx({ sig });
      setWriteWorker("");
      setWriteAmount("");
      await fetchAll();
    } catch (err: unknown) {
      setWriteTx({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setWriteBusy(false);
    }
  }

  // ── Grant regulator access ────────────────────────────────────────────────

  async function handleGrant() {
    if (!programs || !publicKey || !grantAddress) return;
    setGrantBusy(true);
    setGrantTx(null);
    try {
      const regulator  = new PublicKey(grantAddress);
      const expiresAt  = Math.floor(Date.now() / 1000) + parseInt(grantDays) * 86400;

      const [grantPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("regulator"), publicKey.toBuffer(), regulator.toBuffer()],
        programs.complianceLog.programId
      );

      const sig = await programs.complianceLog.methods
        .grantRegulatorAccess(new BN(expiresAt))
        .accounts({
          grant:         grantPda,
          employer:      publicKey,
          regulator,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setGrantTx({ sig });
      setGrantAddress("");
      setShowGrantForm(false);
      await fetchAll();
    } catch (err: unknown) {
      setGrantTx({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setGrantBusy(false);
    }
  }

  // ── Revoke regulator access ───────────────────────────────────────────────

  async function handleRevoke(grant: RegulatorGrant) {
    if (!programs || !publicKey) return;
    const key = grant.pda.toBase58();
    setRevokeBusy((p) => ({ ...p, [key]: true }));
    try {
      await programs.complianceLog.methods
        .revokeRegulatorAccess()
        .accounts({ grant: grant.pda, employer: publicKey })
        .rpc();
      await fetchAll();
    } catch (err) {
      console.error("Revoke error:", err);
    } finally {
      setRevokeBusy((p) => ({ ...p, [key]: false }));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!publicKey) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="text-4xl mb-4">📋</div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Audit Dashboard</h1>
        <p className="text-slate-500 text-sm mb-6">Connect your wallet to view compliance records.</p>
        <WalletMultiButton />
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Immutable compliance log · Travel Rule records</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button onClick={() => { setShowWriteForm((v) => !v); setShowGrantForm(false); }}
            className="px-3 py-1.5 text-sm font-medium border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50">
            + Log Entry
          </button>
          <button onClick={() => { setShowGrantForm((v) => !v); setShowWriteForm(false); }}
            className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Grant Regulator Access
          </button>
        </div>
      </div>

      {/* Write entry form */}
      {showWriteForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">Write Compliance Entry (Demo)</h3>
          <p className="text-xs text-slate-400">
            In production this is called automatically after each disbursement.
            Here you can write entries manually for the demo.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Worker Wallet Address</label>
              <input type="text" placeholder="Solana public key"
                value={writeWorker} onChange={(e) => setWriteWorker(e.target.value.trim())}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Amount (USDC)</label>
              <input type="number" placeholder="e.g. 5000"
                value={writeAmount} onChange={(e) => setWriteAmount(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Purpose Code</label>
              <select value={writePurpose} onChange={(e) => setWritePurpose(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white">
                {PURPOSE_CODES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1 block">KYT Risk Score</label>
              <div className="flex gap-2">
                {["Low", "Medium", "High"].map((label, i) => (
                  <button key={label} onClick={() => setWriteKyt(i)}
                    className={`flex-1 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                      writeKyt === i
                        ? ["border-emerald-400 bg-emerald-50 text-emerald-700",
                           "border-amber-400 bg-amber-50 text-amber-700",
                           "border-red-400 bg-red-50 text-red-700"][i]
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleWriteEntry} disabled={writeBusy || !writeWorker || !writeAmount}
            className="w-full py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {writeBusy ? "Writing…" : "Write Entry On-Chain"}
          </button>
          {writeTx?.sig && (
            <p className="text-xs text-emerald-600">
              ✓ Entry written &mdash;{" "}
              <a href={explorerTxUrl(writeTx.sig)} target="_blank" rel="noopener noreferrer" className="underline font-mono">
                {writeTx.sig.slice(0,12)}…
              </a>
            </p>
          )}
          {writeTx?.error && (
            <p className="text-xs text-red-500 font-mono break-all">{writeTx.error}</p>
          )}
        </div>
      )}

      {/* Grant form */}
      {showGrantForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Grant Regulator Read Access</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Regulator Wallet</label>
              <input type="text" placeholder="Solana public key"
                value={grantAddress} onChange={(e) => setGrantAddress(e.target.value.trim())}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Duration (days)</label>
              <input type="number" min={1} max={365}
                value={grantDays} onChange={(e) => setGrantDays(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            </div>
          </div>
          <button onClick={handleGrant} disabled={grantBusy || !grantAddress}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {grantBusy ? "Granting…" : "Grant Access"}
          </button>
          {grantTx?.sig && (
            <p className="text-xs text-emerald-600">
              ✓ Access granted &mdash;{" "}
              <a href={explorerTxUrl(grantTx.sig)} target="_blank" rel="noopener noreferrer" className="underline font-mono">
                {grantTx.sig.slice(0,12)}…
              </a>
            </p>
          )}
          {grantTx?.error && <p className="text-xs text-red-500 font-mono break-all">{grantTx.error}</p>}
        </div>
      )}

      {/* Compliance entries table */}
      <div>
        <h2 className="font-semibold text-slate-800 mb-3">
          Compliance Log{" "}
          <span className="text-slate-400 font-normal text-sm">({entries.length} entries)</span>
        </h2>

        {entries.length === 0 && !loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
            No compliance entries yet. They are written after each disbursement.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Worker", "Amount", "KYT", "Purpose", "Travel Rule Hash", "Timestamp"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => {
                  const hashHex = Buffer.from(e.travelRuleHash).toString("hex").slice(0, 16) + "…";
                  return (
                    <tr key={e.pda.toBase58()} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600">
                        {truncate(e.workerWallet)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {lamportsToUi(BigInt(e.amount.toString()))} {mintLabel(e.mint)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${KYT_STYLES[e.kytScore] ?? KYT_STYLES[0]}`}>
                          {KYT_LABELS[e.kytScore] ?? "Unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono">
                          {e.purposeCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400" title={Buffer.from(e.travelRuleHash).toString("hex")}>
                        {hashHex}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {timeAgo(e.timestamp.toNumber())}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Regulator grants */}
      <div>
        <h2 className="font-semibold text-slate-800 mb-3">
          Regulator Access Grants{" "}
          <span className="text-slate-400 font-normal text-sm">({grants.length} active)</span>
        </h2>

        {grants.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
            No regulator grants. Use the button above to grant time-limited read access.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Regulator Wallet", "Expires", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grants.map((g) => {
                  const expired = g.expiresAt.toNumber() < now;
                  const key     = g.pda.toBase58();
                  return (
                    <tr key={key} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600">
                        {truncate(g.regulator, 8)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(g.expiresAt.toNumber() * 1000).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                          expired
                            ? "bg-slate-50 text-slate-400 border-slate-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}>
                          {expired ? "Expired" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleRevoke(g)}
                          disabled={!!revokeBusy[key]}
                          className="px-2.5 py-1 text-xs font-medium border border-red-200 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
                        >
                          {revokeBusy[key] ? "…" : "Revoke"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
