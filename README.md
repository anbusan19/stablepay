# StablePayroll — Compliant Global Payroll Infrastructure on Solana

> **StableHacks 2026 Submission** | Track: Programmable Stablecoin Payments
> Built on Solana Devnet · Stablecoin-native · Institutional-grade compliance

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Problem Statement](#problem-statement)
3. [Solution](#solution)
4. [Key Features](#key-features)
5. [Architecture](#architecture)
6. [User Flow](#user-flow)
   - [Corporate Employer Flow](#1-corporate-employer-flow)
   - [Employee Flow](#2-employee-flow)
   - [Contractor / Freelancer Flow](#3-contractor--freelancer-flow)
   - [Compliance & Audit Flow](#4-compliance--audit-flow)
7. [Compliance Layer](#compliance-layer)
8. [Tech Stack](#tech-stack)
9. [Smart Contract Design](#smart-contract-design)
10. [Partner Integrations](#partner-integrations)
11. [Getting Started](#getting-started)
12. [Testnet Demo](#testnet-demo)
13. [Team](#team)

---

## Project Overview

**StablePayroll** is a programmable, compliance-first global payroll infrastructure built on Solana. It enables corporations to pay employees, contractors, and freelancers anywhere in the world — instantly, transparently, and in full compliance with AML, KYC, KYT, and Travel Rule requirements — using stablecoins as the settlement layer.

Traditional payroll for global teams is slow (2–5 business days), expensive (3–7% in FX and intermediary fees), and opaque. StablePayroll replaces the entire stack with smart-contract-based escrow, on-chain FX conversion, and an automated compliance pipeline — all auditable by regulators in real time.

---

## Problem Statement

Companies with globally distributed teams face a broken payroll process:

- **Speed**: Cross-border bank transfers take 2–5 business days via SWIFT rails
- **Cost**: FX conversion and intermediary fees consume 3–7% of every transfer
- **Compliance**: Travel Rule, AML reporting, and KYC verification are manual, fragmented, and error-prone
- **Fragmentation**: Different payment rails for employees (payroll), contractors (wire/ACH), and freelancers (PayPal/Wise) with no unified audit trail
- **Transparency**: No real-time proof of payment or source-of-funds verification for regulators

These problems are especially acute for startups and DAOs paying contributors across 50+ countries.

---

## Solution

StablePayroll provides a unified on-chain payroll engine with three core pillars:

### 1. Programmable Escrow
Corporate treasury deposits stablecoins (USDC/USDG) into a smart-contract payroll vault. Funds are released automatically based on configurable triggers — calendar-based for employees, milestone-based for contractors, invoice-triggered for freelancers.

### 2. On-Chain FX & Multi-Currency Settlement
Workers receive funds in their preferred stablecoin (USDC, EURC, etc.) via atomic on-chain swaps at the time of disbursement, using live FX rates from the SIX data feed. No intermediary banks, no manual FX desks.

### 3. Built-in Compliance
Every payment carries a full compliance payload: KYC-verified sender and receiver identities, KYT transaction tagging, and Travel Rule metadata — all attached on-chain. Regulators can be granted read-only access to the audit dashboard.

---

## Key Features

| Feature | Description |
|---|---|
| Multi-worker-type support | Unified payroll for employees, contractors, and freelancers |
| KYC-gated onboarding | On-chain identity verification before any funds can be received |
| Programmable release triggers | Calendar, milestone, and invoice-based disbursement logic |
| On-chain FX conversion | Atomic stablecoin-to-stablecoin swaps at point of payment |
| Travel Rule compliance | Sender/receiver metadata attached to every transaction above threshold |
| KYT transaction monitoring | Real-time risk scoring per transaction |
| Fireblocks MPC custody | Corporate treasury protected by institutional-grade custody |
| Regulator dashboard | Read-only audit access with full transaction history and compliance proofs |
| Source of funds proof | On-chain provenance trail for every payment, available on regulator demand |
| Solana-native speed | Settlement in under 400ms, fees under $0.001 per payment |

---

## Architecture

<!-- Architecture diagram — renders on GitHub and all modern markdown viewers -->
<p align="center">
<svg width="100%" viewBox="0 0 680 740" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">

  <!-- ── LAYER 1: Corporate Treasury ── -->
  <rect x="30" y="24" width="620" height="76" rx="14" fill="#EEEDFE" stroke="#534AB7" stroke-width="0.8"/>
  <text x="50" y="50" font-size="13" font-weight="600" fill="#3C3489">Corporate treasury layer</text>
  <text x="50" y="70" font-size="11" fill="#534AB7">Fireblocks MPC wallet — institutional custody</text>
  <rect x="390" y="36" width="140" height="52" rx="8" fill="#CECBF6" stroke="#534AB7" stroke-width="0.8"/>
  <text x="460" y="57" font-size="12" font-weight="600" fill="#26215C" text-anchor="middle" dominant-baseline="central">Fireblocks MPC</text>
  <text x="460" y="75" font-size="10" fill="#534AB7" text-anchor="middle" dominant-baseline="central">Treasury signer</text>
  <rect x="544" y="36" width="94" height="52" rx="8" fill="#CECBF6" stroke="#534AB7" stroke-width="0.8"/>
  <text x="591" y="57" font-size="12" font-weight="600" fill="#26215C" text-anchor="middle" dominant-baseline="central">USDC / USDG</text>
  <text x="591" y="75" font-size="10" fill="#534AB7" text-anchor="middle" dominant-baseline="central">Deposit</text>

  <!-- Arrow: Treasury → Engine -->
  <line x1="340" y1="100" x2="340" y2="128" stroke="#534AB7" stroke-width="1.2" marker-end="url(#arr)"/>
  <text x="350" y="116" font-size="10" fill="#534AB7">deposit</text>

  <!-- ── LAYER 2: Payroll Engine ── -->
  <rect x="30" y="130" width="620" height="222" rx="14" fill="#E1F5EE" stroke="#0F6E56" stroke-width="0.8"/>
  <text x="50" y="158" font-size="13" font-weight="600" fill="#085041">Payroll engine</text>
  <text x="50" y="176" font-size="11" fill="#0F6E56">On-chain programs — Solana / Anchor</text>

  <!-- Worker Registry -->
  <rect x="48" y="188" width="138" height="148" rx="10" fill="#9FE1CB" stroke="#0F6E56" stroke-width="0.8"/>
  <text x="117" y="213" font-size="12" font-weight="600" fill="#04342C" text-anchor="middle" dominant-baseline="central">Worker registry</text>
  <text x="117" y="232" font-size="10" fill="#085041" text-anchor="middle" dominant-baseline="central">KYC-gated accounts</text>
  <text x="117" y="257" font-size="10" fill="#085041" text-anchor="middle">· Employee</text>
  <text x="117" y="273" font-size="10" fill="#085041" text-anchor="middle">· Contractor</text>
  <text x="117" y="289" font-size="10" fill="#085041" text-anchor="middle">· Freelancer</text>
  <text x="117" y="305" font-size="10" fill="#085041" text-anchor="middle">· DAO contributor</text>

  <!-- Escrow Manager -->
  <rect x="202" y="188" width="140" height="148" rx="10" fill="#9FE1CB" stroke="#0F6E56" stroke-width="0.8"/>
  <text x="272" y="213" font-size="12" font-weight="600" fill="#04342C" text-anchor="middle" dominant-baseline="central">Escrow manager</text>
  <text x="272" y="232" font-size="10" fill="#085041" text-anchor="middle" dominant-baseline="central">Programmable release</text>
  <text x="272" y="257" font-size="10" fill="#085041" text-anchor="middle">· Calendar trigger</text>
  <text x="272" y="273" font-size="10" fill="#085041" text-anchor="middle">· Milestone trigger</text>
  <text x="272" y="289" font-size="10" fill="#085041" text-anchor="middle">· Invoice trigger</text>
  <text x="272" y="305" font-size="10" fill="#085041" text-anchor="middle">· Multi-sig approval</text>

  <!-- FX Executor -->
  <rect x="358" y="188" width="130" height="148" rx="10" fill="#9FE1CB" stroke="#0F6E56" stroke-width="0.8"/>
  <text x="423" y="213" font-size="12" font-weight="600" fill="#04342C" text-anchor="middle" dominant-baseline="central">FX executor</text>
  <text x="423" y="232" font-size="10" fill="#085041" text-anchor="middle" dominant-baseline="central">SIX live rates</text>
  <text x="423" y="257" font-size="10" fill="#085041" text-anchor="middle">· USDC → EURC</text>
  <text x="423" y="273" font-size="10" fill="#085041" text-anchor="middle">· Orca swap</text>
  <text x="423" y="289" font-size="10" fill="#085041" text-anchor="middle">· Atomic settle</text>
  <text x="423" y="305" font-size="10" fill="#085041" text-anchor="middle">· Rate at disbursement</text>

  <!-- Compliance Log -->
  <rect x="504" y="188" width="134" height="148" rx="10" fill="#9FE1CB" stroke="#0F6E56" stroke-width="0.8"/>
  <text x="571" y="213" font-size="12" font-weight="600" fill="#04342C" text-anchor="middle" dominant-baseline="central">Compliance log</text>
  <text x="571" y="232" font-size="10" fill="#085041" text-anchor="middle" dominant-baseline="central">Immutable on-chain</text>
  <text x="571" y="257" font-size="10" fill="#085041" text-anchor="middle">· KYT score</text>
  <text x="571" y="273" font-size="10" fill="#085041" text-anchor="middle">· Travel Rule payload</text>
  <text x="571" y="289" font-size="10" fill="#085041" text-anchor="middle">· AML screening</text>
  <text x="571" y="305" font-size="10" fill="#085041" text-anchor="middle">· Audit timestamps</text>

  <!-- Arrow: Engine → Workers -->
  <line x1="340" y1="352" x2="340" y2="383" stroke="#0F6E56" stroke-width="1.2" marker-end="url(#arr)"/>
  <text x="350" y="370" font-size="10" fill="#0F6E56">disburse</text>

  <!-- ── LAYER 3: Worker Wallets ── -->
  <rect x="30" y="385" width="620" height="76" rx="14" fill="#FAEEDA" stroke="#854F0B" stroke-width="0.8"/>
  <text x="50" y="412" font-size="13" font-weight="600" fill="#633806">Worker wallets</text>
  <text x="50" y="430" font-size="11" fill="#854F0B">Solana wallets — Phantom, Backpack</text>
  <rect x="170" y="397" width="82" height="52" rx="8" fill="#FAC775" stroke="#854F0B" stroke-width="0.8"/>
  <text x="211" y="419" font-size="11" font-weight="600" fill="#412402" text-anchor="middle" dominant-baseline="central">Employee</text>
  <text x="211" y="436" font-size="10" fill="#854F0B" text-anchor="middle" dominant-baseline="central">Recurring</text>
  <rect x="266" y="397" width="92" height="52" rx="8" fill="#FAC775" stroke="#854F0B" stroke-width="0.8"/>
  <text x="312" y="419" font-size="11" font-weight="600" fill="#412402" text-anchor="middle" dominant-baseline="central">Contractor</text>
  <text x="312" y="436" font-size="10" fill="#854F0B" text-anchor="middle" dominant-baseline="central">Milestone</text>
  <rect x="372" y="397" width="90" height="52" rx="8" fill="#FAC775" stroke="#854F0B" stroke-width="0.8"/>
  <text x="417" y="419" font-size="11" font-weight="600" fill="#412402" text-anchor="middle" dominant-baseline="central">Freelancer</text>
  <text x="417" y="436" font-size="10" fill="#854F0B" text-anchor="middle" dominant-baseline="central">Invoice</text>
  <rect x="476" y="397" width="120" height="52" rx="8" fill="#FAC775" stroke="#854F0B" stroke-width="0.8"/>
  <text x="536" y="419" font-size="11" font-weight="600" fill="#412402" text-anchor="middle" dominant-baseline="central">DAO contributor</text>
  <text x="536" y="436" font-size="10" fill="#854F0B" text-anchor="middle" dominant-baseline="central">Ad hoc</text>

  <!-- Arrow: Workers → Audit -->
  <line x1="340" y1="461" x2="340" y2="492" stroke="#854F0B" stroke-width="1.2" marker-end="url(#arr)"/>
  <text x="350" y="479" font-size="10" fill="#854F0B">on-chain proof</text>

  <!-- ── LAYER 4: Audit Dashboard ── -->
  <rect x="30" y="494" width="620" height="76" rx="14" fill="#F1EFE8" stroke="#5F5E5A" stroke-width="0.8"/>
  <text x="50" y="521" font-size="13" font-weight="600" fill="#2C2C2A">Audit dashboard</text>
  <text x="50" y="539" font-size="11" fill="#5F5E5A">Regulator read-only access — full compliance trail</text>
  <rect x="330" y="506" width="118" height="52" rx="8" fill="#D3D1C7" stroke="#5F5E5A" stroke-width="0.8"/>
  <text x="389" y="527" font-size="11" font-weight="600" fill="#2C2C2A" text-anchor="middle" dominant-baseline="central">Regulator view</text>
  <text x="389" y="544" font-size="10" fill="#5F5E5A" text-anchor="middle" dominant-baseline="central">Read-only link</text>
  <rect x="462" y="506" width="126" height="52" rx="8" fill="#D3D1C7" stroke="#5F5E5A" stroke-width="0.8"/>
  <text x="525" y="527" font-size="11" font-weight="600" fill="#2C2C2A" text-anchor="middle" dominant-baseline="central">Source of funds</text>
  <text x="525" y="544" font-size="10" fill="#5F5E5A" text-anchor="middle" dominant-baseline="central">Provenance chain</text>

  <!-- ── LAYER 5: Partners ── -->
  <text x="340" y="596" font-size="11" fill="#888780" text-anchor="middle">Partner integrations</text>
  <rect x="40" y="608" width="110" height="40" rx="8" fill="#EEEDFE" stroke="#534AB7" stroke-width="0.8"/>
  <text x="95" y="633" font-size="11" font-weight="600" fill="#3C3489" text-anchor="middle" dominant-baseline="central">Fireblocks</text>
  <rect x="164" y="608" width="90" height="40" rx="8" fill="#E1F5EE" stroke="#0F6E56" stroke-width="0.8"/>
  <text x="209" y="633" font-size="11" font-weight="600" fill="#085041" text-anchor="middle" dominant-baseline="central">SIX BFI</text>
  <rect x="268" y="608" width="108" height="40" rx="8" fill="#E1F5EE" stroke="#0F6E56" stroke-width="0.8"/>
  <text x="322" y="633" font-size="11" font-weight="600" fill="#085041" text-anchor="middle" dominant-baseline="central">Solana Pay</text>
  <rect x="390" y="608" width="116" height="40" rx="8" fill="#FAEEDA" stroke="#854F0B" stroke-width="0.8"/>
  <text x="448" y="633" font-size="11" font-weight="600" fill="#633806" text-anchor="middle" dominant-baseline="central">AMINA Bank</text>
  <rect x="520" y="608" width="130" height="40" rx="8" fill="#F1EFE8" stroke="#5F5E5A" stroke-width="0.8"/>
  <text x="585" y="633" font-size="11" font-weight="600" fill="#2C2C2A" text-anchor="middle" dominant-baseline="central">Softstack audit</text>

  <!-- Legend -->
  <rect x="40" y="672" width="12" height="12" rx="3" fill="#EEEDFE" stroke="#534AB7" stroke-width="0.8"/>
  <text x="58" y="682" font-size="10" fill="#5F5E5A" dominant-baseline="central">Treasury</text>
  <rect x="120" y="672" width="12" height="12" rx="3" fill="#E1F5EE" stroke="#0F6E56" stroke-width="0.8"/>
  <text x="138" y="682" font-size="10" fill="#5F5E5A" dominant-baseline="central">Engine</text>
  <rect x="192" y="672" width="12" height="12" rx="3" fill="#FAEEDA" stroke="#854F0B" stroke-width="0.8"/>
  <text x="210" y="682" font-size="10" fill="#5F5E5A" dominant-baseline="central">Workers</text>
  <rect x="268" y="672" width="12" height="12" rx="3" fill="#F1EFE8" stroke="#5F5E5A" stroke-width="0.8"/>
  <text x="286" y="682" font-size="10" fill="#5F5E5A" dominant-baseline="central">Audit</text>

  <!-- Arrow marker def -->
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>
</svg>
</p>

---

## User Flow

### 1. Corporate Employer Flow

```
Step 1: Company Onboarding
├── Register company on StablePayroll (legal entity KYB verification)
├── Connect Fireblocks MPC wallet as treasury signer
└── Set spending limits, approval thresholds, and compliance rules

Step 2: Fund the Payroll Vault
├── Transfer USDC/USDG from Fireblocks treasury wallet
├── System locks funds in the on-chain payroll escrow program
└── Dashboard shows available payroll balance and next disbursement date

Step 3: Add Workers
├── Invite workers via email or wallet address
├── Set worker type: Employee / Contractor / Freelancer
├── Configure payment terms:
│   ├── Employee → Fixed salary, bi-weekly or monthly schedule
│   ├── Contractor → Milestone-based or hourly, invoice required
│   └── Freelancer → Invoice-triggered, one-time or recurring
└── Set preferred payout currency (USDC, EURC, etc.)

Step 4: Payroll Execution (Automated)
├── Smart contract checks schedule / milestone / invoice trigger
├── Compliance module runs KYT check on the pending transaction
├── FX module fetches live rate from SIX data feed (if currency swap needed)
├── Atomic disbursement: escrow releases → on-chain swap → worker wallet credited
└── Travel Rule metadata packaged and stored on-chain

Step 5: Reporting
├── Employer sees real-time payroll ledger on dashboard
├── Per-payment compliance receipts available for download
└── Regulator read-access link available on demand
```

---

### 2. Employee Flow

```
Step 1: Onboarding Invitation
├── Receives invite link from employer
└── Creates or connects Solana wallet (Phantom, Backpack, etc.)

Step 2: KYC Verification
├── Submits government-issued ID and proof of address
├── KYC provider (mocked on devnet, e.g. Persona/Sumsub API)
├── On approval: KYC status written on-chain to worker account
└── Wallet is now allowlisted for payroll receipts

Step 3: Set Payout Preferences
├── Choose preferred stablecoin (USDC, EURC, etc.)
└── Confirm wallet address for disbursement

Step 4: Receive Salary
├── On scheduled date, smart contract triggers disbursement
├── If FX conversion needed: atomic swap executes at SIX rate
├── USDC/EURC lands in employee wallet within ~400ms
└── Employee receives on-chain payment receipt with compliance metadata

Step 5: Payment History
└── Employee portal shows full history of payments with on-chain proof links
```

---

### 3. Contractor / Freelancer Flow

```
Step 1: Onboarding (same KYC flow as Employee)
└── Worker type set to Contractor or Freelancer at registration

Step 2: Submit Invoice / Complete Milestone
├── Contractor: Employer marks milestone as complete on dashboard
│   └── Smart contract escrow releases funds automatically
├── Freelancer: Submits invoice with amount, currency, and due date
│   ├── Employer approves invoice (single or multi-sig)
│   └── Smart contract releases funds on approval

Step 3: Disbursement
├── Compliance module runs KYT check
├── FX module applies SIX live rate if currency conversion needed
├── Funds hit worker wallet atomically
└── Travel Rule payload written on-chain (sender + receiver metadata)

Step 4: Dispute Handling (future scope)
└── Escrow can be paused pending dispute resolution by employer or worker
```

---

### 4. Compliance & Audit Flow

```
Step 1: KYC Check (on worker onboarding)
├── Worker submits identity documents
├── KYC provider verifies and returns a signed credential
└── Credential hash stored on-chain; wallet marked as KYC-verified

Step 2: KYT Check (per transaction)
├── Before every disbursement, transaction is scored by KYT module
├── Risk score (low / medium / high) attached to transaction record
├── High-risk transactions flagged for manual review before release
└── All scores stored on-chain for regulator access

Step 3: Travel Rule Packaging
├── For payments above threshold (typically $1,000 / €1,000):
│   ├── Sender: company legal name, jurisdiction, wallet address
│   ├── Receiver: worker KYC-verified name, wallet address, jurisdiction
│   └── Transaction amount, currency, timestamp, and purpose code
└── Payload stored on-chain and shareable with counterparty VASP

Step 4: AML Monitoring
├── Continuous monitoring of all wallet addresses against sanctions lists
├── Automated blocking if a wallet appears on OFAC/EU/UN sanctions lists
└── Alert generated and transaction halted pending review

Step 5: Regulator Audit Access
├── Employer can generate a time-limited read-only audit link
├── Regulator sees: full transaction history, compliance receipts,
│   worker KYC status, Travel Rule payloads, KYT risk scores
└── Source-of-funds provenance: on-chain trail from treasury deposit
    to individual worker disbursement
```

---

## Compliance Layer

| Requirement | Implementation |
|---|---|
| **KYC** | Worker identity verified at onboarding. KYC credential hash stored on-chain. Wallet cannot receive funds without verified status. |
| **KYT** | Every disbursement transaction scored in real-time before release. Risk metadata attached to on-chain record. |
| **AML** | Continuous sanctions screening of all wallets. Automatic blocking on OFAC/EU/UN list matches. |
| **Travel Rule** | Sender and receiver identity data packaged with every transfer above threshold. Stored on-chain, shareable with counterparty VASPs. |
| **Source of Funds** | Full provenance chain from corporate treasury deposit → payroll vault → worker wallet, available on-chain. |
| **Audit Trail** | Every action (deposit, disbursement, KYT check, approval) is an on-chain transaction — immutable and timestamped. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Solana (Devnet for demo, Mainnet-ready) |
| Smart Contracts | Anchor Framework (Rust) |
| Frontend | Next.js + Tailwind CSS |
| Wallet Integration | Solana Wallet Adapter (Phantom, Backpack) |
| Stablecoins | Devnet USDC (Circle), USDG |
| FX Data | SIX BFI — FX rates and precious metals prices |
| Custody | Fireblocks Sandbox (MPC wallet for treasury) |
| KYC (devnet mock) | Persona / Sumsub API (simulated on devnet) |
| DEX / FX Swap | Orca Whirlpools (devnet) |
| RPC | Helius / QuickNode |
| Indexer | Solana FM / custom event listener |

---

## Smart Contract Design

The payroll system consists of four on-chain programs:

### `payroll_vault`
Holds corporate treasury funds. Accepts deposits from Fireblocks-connected wallets. Tracks available balance per employer.

### `worker_registry`
Manages worker accounts. Stores KYC status (verified / pending / flagged), worker type, payout currency preference, and wallet address. Only KYC-verified workers can be added to a payroll schedule.

### `escrow_manager`
Handles release logic per worker type:
- **Employee**: Time-locked releases based on employer-defined schedule (bi-weekly / monthly)
- **Contractor**: Milestone-locked; releases on employer signature confirming completion
- **Freelancer**: Invoice-locked; releases on employer approval of submitted invoice

### `compliance_log`
Immutable append-only log. Every payment writes: KYT score, Travel Rule payload hash, sender/receiver metadata, timestamp, and transaction signature. Read-accessible by regulator-permissioned wallets.

---

## Partner Integrations

| Partner | Integration |
|---|---|
| **Fireblocks** | Sandbox MPC wallet used as corporate treasury signer. Demonstrates institutional-grade custody for payroll funds. |
| **SIX BFI** | Live FX rate feed used by the FX Executor module to price stablecoin conversions at point of disbursement. |
| **Solana Foundation** | Built natively on Solana for high-throughput, low-cost settlement. Uses Solana Pay standards for payment metadata. |
| **AMINA Bank** | Architecture aligned with AMINA's institutional compliance requirements for regulated payment flows. |
| **Softstack** | Smart contract audit scope covers `payroll_vault` and `escrow_manager` programs. |

---

## Getting Started

### Prerequisites

```bash
node >= 18
rust >= 1.75
solana-cli >= 1.18
anchor >= 0.30
```

### Installation

```bash
# Clone the repository
git clone https://github.com/your-team/stablepayroll
cd stablepayroll

# Install frontend dependencies
cd app && npm install

# Build Anchor programs
cd ../programs && anchor build

# Configure Solana CLI for devnet
solana config set --url devnet
solana airdrop 2  # Get devnet SOL for fees
```

### Deploy to Devnet

```bash
# Deploy all programs
anchor deploy --provider.cluster devnet

# Run the deployment script to initialize vault and registry
npm run deploy:devnet

# Start the frontend
cd app && npm run dev
```

### Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SOLANA_RPC=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
NEXT_PUBLIC_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU  # Devnet USDC
FIREBLOCKS_API_KEY=your_fireblocks_sandbox_key
SIX_API_KEY=your_six_bfi_api_key
KYC_PROVIDER_KEY=your_kyc_provider_key
```

---

## Testnet Demo

The live demo runs entirely on **Solana Devnet**.

**Demo scenario**: A company pays three worker types in a single payroll cycle:
1. A full-time employee in Germany receiving EURC (converted from USDC via SIX FX rate)
2. A contractor in Singapore receiving USDC on milestone completion
3. A freelancer in India receiving USDC on invoice approval

Each payment generates a full on-chain compliance record including KYT score and Travel Rule payload, visible in the regulator audit dashboard.

**Demo credentials and testnet links will be provided in the submission.**

---

## Team

| Name | Role |
|---|---|
| [Name] | Smart Contract / Anchor Development |
| [Name] | Frontend / UX |
| [Name] | Compliance Architecture |
| [Name] | Product / Pitch |

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

*Built for StableHacks 2026 — organized by Tenity, co-hosted by Solana Foundation and AMINA Bank.*
