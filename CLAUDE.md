# StablePayroll — Claude Code instructions

## Project context
StableHacks 2026 hackathon submission. Track 3: Programmable Stablecoin Payments.
Monorepo: /programs (Anchor/Rust), /app (Next.js 14), /scripts, /tests.
Deploy target: Solana Devnet only.

## Tech stack
- Anchor 0.30 + Rust for smart contracts
- Next.js 14 + Tailwind CSS + TypeScript for frontend
- @solana/wallet-adapter-react for wallet connection
- @solana/spl-token for USDC transfers
- Devnet USDC mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

## Smart contract conventions
- All programs live in /programs/<program-name>/src/lib.rs
- Use PDAs for all vault and registry accounts
- Emit events on every state change for indexing
- compliance_log is append-only — never mutate existing entries
- Check KYC status from worker_registry before every disbursement

## Frontend conventions
- Pages: /onboard, /workers, /payroll, /audit
- Always connect to Devnet — never mainnet
- Use @solana/wallet-adapter-react for all wallet interactions
- Token amounts stored as u64 lamports, display as human-readable with 6 decimals
- Show transaction signatures as Solana Explorer devnet links

## Code style
- TypeScript strict mode everywhere in /app
- Rust: follow Anchor patterns, add doc comments on all account structs
- No hardcoded private keys anywhere in the codebase
- All errors must be descriptive — judges will read the code

## What not to build
- No mainnet deployment scripts
- No real KYC provider integration — mock the status with an admin toggle
- No real Travel Rule messaging — store a mock hash in compliance_log
- No complex FX — fetch a live rate from a public API or hardcode for demo