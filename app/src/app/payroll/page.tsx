"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { usePrograms } from "@/hooks/usePrograms";
import { KycBadge, WorkerTypeBadge } from "@/components/StatusBadge";
import {
  USDC_MINT,
  findVaultPda,
  findEscrowAuthorityPda,
  findSchedulePda,
  lamportsToUi,
  uiToLamports,
  explorerTxUrl,
} from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

type WorkerRow = {
  pda:        PublicKey;
  wallet:     PublicKey;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workerType: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kycStatus:  any;
  payoutMint: PublicKey;
};

type Schedule = {
  pda:                 PublicKey;
  workerRegistryPda:   PublicKey;
  workerWallet:        PublicKey;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scheduleType:        any;
  amountPerPeriod:     BN;
  nextDisbursementAt:  BN;
  isActive:            boolean;
  totalPaid:           BN;
  mint:                PublicKey;
};

type VaultInfo = {
  totalDeposited: BN;
  totalDisbursed: BN;
  mint:           PublicKey;
  releaseAuthority: PublicKey;
  bump:           number;
};

function scheduleTypeLabel(t: Record<string, unknown>): string {
  if ("calendar"  in t) return "Employee";
  if ("milestone" in t) return "Contractor";
  if ("invoice"   in t) return "Freelancer";
  return "Unknown";
}

function kycStatusKey(t: Record<string, unknown>): string {
  if ("verified" in t) return "verified";
  if ("flagged"  in t) return "flagged";
  return "pending";
}

const INTERVALS: { label: string; value: number }[] = [
  { label: "Bi-weekly",  value: 14 * 86400 },
  { label: "Monthly",    value: 30 * 86400 },
  { label: "Quarterly",  value: 90 * 86400 },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const { publicKey }     = useWallet();
  const { connection }    = useConnection();
  const programs          = usePrograms();

  const [vault,      setVault]      = useState<VaultInfo | null | "missing">(null);
  const [vaultBal,   setVaultBal]   = useState<string>("0.00");
  const [schedules,  setSchedules]  = useState<Schedule[]>([]);
  const [workers,    setWorkers]    = useState<WorkerRow[]>([]);
  const [loading,    setLoading]    = useState(false);

  // deposit form
  const [depositAmt,  setDepositAmt]  = useState("");
  const [depositTx,   setDepositTx]   = useState<{ sig?: string; error?: string } | null>(null);
  const [depositBusy, setDepositBusy] = useState(false);

  // create schedule form
  const [showCreate,   setShowCreate]   = useState(false);
  const [selWorker,    setSelWorker]    = useState("");
  const [schedAmount,  setSchedAmount]  = useState("");
  const [schedInterval,setSchedInterval] = useState(INTERVALS[0].value);
  const [createBusy,   setCreateBusy]   = useState(false);
  const [createTx,     setCreateTx]     = useState<{ sig?: string; error?: string } | null>(null);

  // per-schedule disburse state
  const [disburseMap, setDisburseMap] = useState<
    Record<string, { loading?: boolean; sig?: string; error?: string }>
  >({});

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!programs || !publicKey) return;
    setLoading(true);
    try {
      const [vaultPda]   = findVaultPda(publicKey);

      // Vault
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = await programs.payrollVault.account.vaultAccount.fetch(vaultPda) as any;
        setVault(v as VaultInfo);
        const vaultAta = await getAssociatedTokenAddress(v.mint, vaultPda, true);
        const bal = await connection.getTokenAccountBalance(vaultAta);
        setVaultBal(lamportsToUi(BigInt(bal.value.amount)));
      } catch {
        setVault("missing");
        setVaultBal("0.00");
      }

      // Schedules
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawSchedules = await programs.escrowManager.account.paymentSchedule.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]) as any[];
      setSchedules(rawSchedules.map((s) => ({
        pda:               s.publicKey,
        workerRegistryPda: s.account.workerRegistryPda,
        workerWallet:      s.account.workerWallet,
        scheduleType:      s.account.scheduleType,
        amountPerPeriod:   s.account.amountPerPeriod,
        nextDisbursementAt:s.account.nextDisbursementAt,
        isActive:          s.account.isActive,
        totalPaid:         s.account.totalPaid,
        mint:              s.account.mint,
      })));

      // Verified workers for schedule creation dropdown
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawWorkers = await programs.workerRegistry.account.workerAccount.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]) as any[];
      setWorkers(rawWorkers.map((w) => ({
        pda:        w.publicKey,
        wallet:     w.account.wallet,
        workerType: w.account.workerType,
        kycStatus:  w.account.kycStatus,
        payoutMint: w.account.payoutMint,
      })));
    } finally {
      setLoading(false);
    }
  }, [programs, publicKey, connection]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Initialize vault ──────────────────────────────────────────────────────

  async function handleInitVault() {
    if (!programs || !publicKey) return;
    setLoading(true);
    try {
      const [vaultPda]       = findVaultPda(publicKey);
      const [escrowAuthority] = findEscrowAuthorityPda(publicKey);
      const vaultAta          = await getAssociatedTokenAddress(USDC_MINT, vaultPda, true);

      await programs.payrollVault.methods
        .initializeVault(escrowAuthority)
        .accounts({
          vault:                  vaultPda,
          vaultTokenAccount:      vaultAta,
          mint:                   USDC_MINT,
          employer:               publicKey,
          systemProgram:          SystemProgram.programId,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();
      await fetchAll();
    } catch (err) {
      console.error("Init vault error:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Deposit ───────────────────────────────────────────────────────────────

  async function handleDeposit() {
    if (!programs || !publicKey || !depositAmt) return;
    setDepositBusy(true);
    setDepositTx(null);
    try {
      const [vaultPda] = findVaultPda(publicKey);
      const vaultAta   = await getAssociatedTokenAddress(USDC_MINT, vaultPda, true);
      const employerAta = await getAssociatedTokenAddress(USDC_MINT, publicKey, false);
      const amount      = uiToLamports(parseFloat(depositAmt));

      const sig = await programs.payrollVault.methods
        .deposit(new BN(amount.toString()))
        .accounts({
          vault:                  vaultPda,
          vaultTokenAccount:      vaultAta,
          employerTokenAccount:   employerAta,
          employer:               publicKey,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      setDepositTx({ sig });
      setDepositAmt("");
      await fetchAll();
    } catch (err: unknown) {
      setDepositTx({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setDepositBusy(false);
    }
  }

  // ── Create schedule ───────────────────────────────────────────────────────

  async function handleCreateSchedule() {
    if (!programs || !publicKey || !selWorker || !schedAmount) return;
    setCreateBusy(true);
    setCreateTx(null);
    try {
      const workerRegistryPda = new PublicKey(selWorker);
      const [schedulePda]     = findSchedulePda(publicKey, workerRegistryPda);
      const startAt           = Math.floor(Date.now() / 1000) + schedInterval; // first payment one interval out
      const amount            = uiToLamports(parseFloat(schedAmount));

      const sig = await programs.escrowManager.methods
        .createSchedule({
          scheduleType:     { calendar: {} },
          amountPerPeriod:  new BN(amount.toString()),
          startAt:          new BN(startAt),
          intervalSeconds:  new BN(schedInterval),
        })
        .accounts({
          schedule:       schedulePda,
          workerAccount:  workerRegistryPda,
          employer:       publicKey,
          systemProgram:  SystemProgram.programId,
        })
        .rpc();

      setCreateTx({ sig });
      setShowCreate(false);
      setSelWorker("");
      setSchedAmount("");
      await fetchAll();
    } catch (err: unknown) {
      setCreateTx({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setCreateBusy(false);
    }
  }

  // ── Disburse ──────────────────────────────────────────────────────────────

  async function handleDisburse(schedule: Schedule) {
    if (!programs || !publicKey) return;
    const key = schedule.pda.toBase58();
    setDisburseMap((p) => ({ ...p, [key]: { loading: true } }));
    try {
      const [vaultPda]        = findVaultPda(publicKey);
      const [escrowAuthority] = findEscrowAuthorityPda(publicKey);
      const vaultAta          = await getAssociatedTokenAddress(schedule.mint, vaultPda, true);
      const workerAta         = await getAssociatedTokenAddress(schedule.mint, schedule.workerWallet, false);

      const isCalendar  = "calendar"  in schedule.scheduleType;
      const isMilestone = "milestone" in schedule.scheduleType;
      const methodName  = isCalendar ? "disburseEmployee" : isMilestone ? "completeMilestone" : "approveInvoice";

      const method = programs.escrowManager.methods[methodName];
      const callArgs = methodName === "approveInvoice"
        ? [schedule.amountPerPeriod]
        : [];

      const sig = await method(...callArgs)
        .accounts({
          schedule:               schedule.pda,
          workerAccount:          schedule.workerRegistryPda,
          authority:              escrowAuthority,
          vault:                  vaultPda,
          vaultTokenAccount:      vaultAta,
          workerTokenAccount:     workerAta,
          vaultProgram:           programs.payrollVault.programId,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      setDisburseMap((p) => ({ ...p, [key]: { sig } }));
      await fetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDisburseMap((p) => ({ ...p, [key]: { error: msg } }));
    }
  }

  // ── Toggle schedule active ─────────────────────────────────────────────────

  async function handleToggleActive(schedule: Schedule) {
    if (!programs || !publicKey) return;
    try {
      await programs.escrowManager.methods
        .setScheduleActive(!schedule.isActive)
        .accounts({ schedule: schedule.pda, employer: publicKey })
        .rpc();
      await fetchAll();
    } catch (err) {
      console.error("Toggle error:", err);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!publicKey) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="text-4xl mb-4">💸</div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Payroll</h1>
        <p className="text-slate-500 text-sm mb-6">Connect your employer wallet to manage payroll.</p>
        <WalletMultiButton />
      </div>
    );
  }

  const verifiedWorkers = workers.filter((w) => kycStatusKey(w.kycStatus) === "verified");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Payroll</h1>
        <button onClick={fetchAll} disabled={loading}
          className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* ── Vault section ─────────────────────────────────────────────────── */}
      {vault === "missing" ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <div className="text-3xl mb-2">🏦</div>
          <p className="font-semibold text-slate-800 mb-1">No payroll vault yet</p>
          <p className="text-slate-500 text-sm mb-4">
            Initialize your vault to start funding payroll with USDC.
          </p>
          <button
            onClick={handleInitVault}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Initializing…" : "Initialize Vault"}
          </button>
        </div>
      ) : vault ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Vault Balance</p>
              <p className="text-3xl font-bold text-slate-900">{vaultBal} <span className="text-lg text-slate-400">USDC</span></p>
              <div className="flex gap-4 mt-2 text-xs text-slate-400">
                <span>Deposited: {lamportsToUi(BigInt(vault.totalDeposited.toString()))} USDC</span>
                <span>Disbursed: {lamportsToUi(BigInt(vault.totalDisbursed.toString()))} USDC</span>
              </div>
            </div>
            {/* Deposit form */}
            <div className="flex gap-2 items-center">
              <input
                type="number"
                placeholder="Amount USDC"
                value={depositAmt}
                onChange={(e) => setDepositAmt(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-36 outline-none focus:border-indigo-400"
              />
              <button
                onClick={handleDeposit}
                disabled={depositBusy || !depositAmt}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
              >
                {depositBusy ? "Depositing…" : "Deposit"}
              </button>
            </div>
          </div>
          {depositTx?.sig && (
            <p className="text-xs text-emerald-600 mt-2">
              ✓ Deposited &mdash;{" "}
              <a href={explorerTxUrl(depositTx.sig)} target="_blank" rel="noopener noreferrer"
                className="underline font-mono">{depositTx.sig.slice(0,12)}…</a>
            </p>
          )}
          {depositTx?.error && (
            <p className="text-xs text-red-500 mt-2 font-mono break-all">{depositTx.error}</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse h-28" />
      )}

      {/* ── Schedules section ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">
            Payment Schedules <span className="text-slate-400 font-normal text-sm">({schedules.length})</span>
          </h2>
          {vault && vault !== "missing" && verifiedWorkers.length > 0 && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              {showCreate ? "Cancel" : "+ Create Schedule"}
            </button>
          )}
        </div>

        {/* Create schedule form */}
        {showCreate && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-4 space-y-4">
            <h3 className="text-sm font-semibold text-indigo-900">New Employee Schedule</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Worker (verified)</label>
                <select
                  value={selWorker}
                  onChange={(e) => setSelWorker(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
                >
                  <option value="">Select worker…</option>
                  {verifiedWorkers.map((w) => (
                    <option key={w.pda.toBase58()} value={w.pda.toBase58()}>
                      {w.wallet.toBase58().slice(0, 8)}… ({scheduleTypeLabel(w.workerType)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Amount per period (USDC)</label>
                <input
                  type="number"
                  placeholder="e.g. 3000"
                  value={schedAmount}
                  onChange={(e) => setSchedAmount(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-700 mb-1 block">Pay interval</label>
                <div className="flex gap-2">
                  {INTERVALS.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => setSchedInterval(value)}
                      className={`flex-1 border rounded-lg py-1.5 text-sm transition-colors ${
                        schedInterval === value
                          ? "border-indigo-400 bg-indigo-100 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={handleCreateSchedule}
              disabled={createBusy || !selWorker || !schedAmount}
              className="w-full py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {createBusy ? "Creating…" : "Create Schedule"}
            </button>
            {createTx?.sig && (
              <p className="text-xs text-emerald-600">
                ✓ Schedule created &mdash;{" "}
                <a href={explorerTxUrl(createTx.sig)} target="_blank" rel="noopener noreferrer" className="underline font-mono">
                  {createTx.sig.slice(0,12)}…
                </a>
              </p>
            )}
            {createTx?.error && (
              <p className="text-xs text-red-500 font-mono break-all">{createTx.error}</p>
            )}
          </div>
        )}

        {/* No workers reminder */}
        {vault && vault !== "missing" && verifiedWorkers.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 mb-3">
            No KYC-verified workers yet.{" "}
            <Link href="/workers" className="underline font-medium">Go to Workers</Link> to verify them first.
          </div>
        )}

        {/* Schedules table */}
        {schedules.length === 0 && !loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
            No schedules yet. Create one above.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Worker", "Type", "Amount", "Total Paid", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schedules.map((s) => {
                  const key    = s.pda.toBase58();
                  const dState = disburseMap[key];
                  const typeLabel = scheduleTypeLabel(s.scheduleType);
                  const isCalendar  = "calendar"  in s.scheduleType;
                  const isMilestone = "milestone" in s.scheduleType;
                  const isInvoice   = "invoice"   in s.scheduleType;
                  const now = Math.floor(Date.now() / 1000);
                  const canDisburseCalendar = isCalendar && now >= s.nextDisbursementAt.toNumber();
                  const disburseBtnLabel = isCalendar
                    ? canDisburseCalendar ? "Disburse" : `Next: ${new Date(s.nextDisbursementAt.toNumber() * 1000).toLocaleDateString()}`
                    : isMilestone ? "Complete Milestone"
                    : "Approve Invoice";
                  const canDisburse = isCalendar ? canDisburseCalendar : (isMilestone || isInvoice);

                  return (
                    <tr key={key} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600">
                        {s.workerWallet.toBase58().slice(0, 6)}…{s.workerWallet.toBase58().slice(-4)}
                      </td>
                      <td className="px-4 py-3">
                        <WorkerTypeBadge type={typeLabel.toLowerCase() as "employee" | "contractor" | "freelancer"} />
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {lamportsToUi(BigInt(s.amountPerPeriod.toString()))} USDC
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {lamportsToUi(BigInt(s.totalPaid.toString()))} USDC
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                          s.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-500 border-slate-200"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                          {s.isActive ? "Active" : "Paused"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleDisburse(s)}
                            disabled={!!dState?.loading || !canDisburse || !s.isActive}
                            className="px-2.5 py-1 text-xs font-medium border rounded-md transition-colors
                              text-indigo-700 border-indigo-200 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {dState?.loading ? "…" : disburseBtnLabel}
                          </button>
                          <button
                            onClick={() => handleToggleActive(s)}
                            className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 text-slate-500"
                          >
                            {s.isActive ? "Pause" : "Resume"}
                          </button>
                          {dState?.sig && (
                            <a href={explorerTxUrl(dState.sig)} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-emerald-600 hover:underline">✓ ↗</a>
                          )}
                          {dState?.error && (
                            <span className="text-xs text-red-500" title={dState.error}>✗</span>
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
      </div>
    </div>
  );
}
