#!/usr/bin/env bash
# One-shot devnet setup script.
# Run once after `anchor build` + `anchor keys sync`.
set -euo pipefail

echo "==> Checking Solana CLI config"
solana config set --url devnet
solana config get

echo "==> Airdropping 2 SOL for fees"
solana airdrop 2

echo "==> Building programs"
anchor build

echo "==> Syncing program IDs (Anchor.toml ↔ declare_id!)"
anchor keys sync

echo "==> Rebuilding with synced IDs"
anchor build

echo "==> Deploying to devnet"
anchor deploy --provider.cluster devnet

echo ""
echo "✓ Deployment complete. Copy program IDs from Anchor.toml into .env.local:"
grep -A4 '\[programs.devnet\]' Anchor.toml
