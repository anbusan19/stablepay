import type { Metadata } from "next";
import { SolanaProvider } from "@/providers/SolanaProvider";
import { NavBar }         from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title:       "StablePayroll",
  description: "Compliant global payroll on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <SolanaProvider>
          <NavBar />
          <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        </SolanaProvider>
      </body>
    </html>
  );
}
