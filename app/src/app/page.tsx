import Link from "next/link";

const FEATURES = [
  { icon: "🔐", title: "KYC-gated",       desc: "Workers verified on-chain before receiving funds" },
  { icon: "⚡", title: "Instant",          desc: "Settlement in <400ms on Solana" },
  { icon: "🌐", title: "Multi-currency",   desc: "USDC, EURC — atomic on-chain FX via Orca" },
  { icon: "📋", title: "Audit-ready",      desc: "Immutable compliance log with Travel Rule metadata" },
];

export default function HomePage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mt-12 mb-16">
        <span className="inline-block bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full mb-4 border border-indigo-200">
          StableHacks 2026 · Devnet Demo
        </span>
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          Global Payroll Infrastructure
        </h1>
        <p className="text-slate-500 text-lg mb-8">
          Pay employees, contractors and freelancers anywhere — instantly,
          compliantly, and in stablecoins.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/onboard"
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-colors"
          >
            Register a Worker
          </Link>
          <Link
            href="/workers"
            className="px-5 py-2.5 bg-white text-slate-700 rounded-lg font-medium text-sm border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Manage Workers
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {FEATURES.map(({ icon, title, desc }) => (
          <div
            key={title}
            className="bg-white rounded-xl border border-slate-200 p-5"
          >
            <div className="text-2xl mb-2">{icon}</div>
            <div className="font-semibold text-slate-800 text-sm mb-1">{title}</div>
            <div className="text-slate-500 text-xs">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
