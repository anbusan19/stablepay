"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const NAV_LINKS = [
  { href: "/onboard",  label: "Onboard" },
  { href: "/workers",  label: "Workers" },
  { href: "/payroll",  label: "Payroll" },
  { href: "/audit",    label: "Audit" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-bold text-slate-900 text-sm tracking-tight">
            StablePayroll
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <WalletMultiButton
          style={{
            backgroundColor: "#4f46e5",
            fontSize: "13px",
            height: "34px",
            padding: "0 14px",
            borderRadius: "6px",
          }}
        />
      </div>
    </header>
  );
}
