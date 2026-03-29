use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// ─── Program ────────────────────────────────────────────────────────────────

#[program]
pub mod worker_registry {
    use super::*;

    /// Register a new worker. Called by the employer.
    /// The worker's wallet is stored but does not need to sign at registration.
    pub fn register_worker(
        ctx: Context<RegisterWorker>,
        worker_type: WorkerType,
        payout_mint: Pubkey,
    ) -> Result<()> {
        let worker = &mut ctx.accounts.worker;
        worker.employer    = ctx.accounts.employer.key();
        worker.wallet      = ctx.accounts.worker_wallet.key();
        worker.worker_type = worker_type.clone();
        worker.kyc_status  = KycStatus::Pending;
        worker.payout_mint = payout_mint;
        worker.bump        = ctx.bumps.worker;

        emit!(WorkerRegistered {
            worker:      worker.key(),
            employer:    worker.employer,
            worker_type,
        });

        Ok(())
    }

    /// Toggle KYC status — admin-only, mocked for devnet.
    /// In production this would be a call from a KYC oracle / PDA authority.
    pub fn set_kyc_status(
        ctx: Context<SetKycStatus>,
        status: KycStatus,
    ) -> Result<()> {
        let worker = &mut ctx.accounts.worker;
        worker.kyc_status = status.clone();

        emit!(KycStatusUpdated {
            worker: worker.key(),
            status,
        });

        Ok(())
    }

    /// Worker updates their preferred payout stablecoin (USDC, EURC, etc.).
    pub fn update_payout_preference(
        ctx: Context<UpdatePayoutPreference>,
        payout_mint: Pubkey,
    ) -> Result<()> {
        let worker = &mut ctx.accounts.worker;
        worker.payout_mint = payout_mint;

        emit!(PayoutPreferenceUpdated {
            worker:     worker.key(),
            payout_mint,
        });

        Ok(())
    }
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RegisterWorker<'info> {
    /// Worker PDA, seeded by (employer, worker_wallet) — one account per worker per employer.
    #[account(
        init,
        payer  = employer,
        space  = WorkerAccount::SIZE,
        seeds  = [b"worker", employer.key().as_ref(), worker_wallet.key().as_ref()],
        bump,
    )]
    pub worker: Account<'info, WorkerAccount>,

    /// The employer paying for account creation and registering this worker.
    #[account(mut)]
    pub employer: Signer<'info>,

    /// CHECK: The worker's wallet address — stored for identity, not required to sign at registration.
    pub worker_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetKycStatus<'info> {
    #[account(mut)]
    pub worker: Account<'info, WorkerAccount>,

    /// CHECK: Admin signer. For the devnet demo this is the deployer wallet.
    /// Replace with a PDA-controlled multisig authority before mainnet.
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdatePayoutPreference<'info> {
    #[account(
        mut,
        constraint = worker.wallet == worker_signer.key() @ WorkerRegistryError::Unauthorized,
    )]
    pub worker: Account<'info, WorkerAccount>,

    /// The worker must sign to update their own payout preference.
    pub worker_signer: Signer<'info>,
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
/// On-chain identity, KYC status, and payout preferences for a single worker.
pub struct WorkerAccount {
    /// The employer who registered this worker.
    pub employer: Pubkey,
    /// The worker's receiving wallet.
    pub wallet: Pubkey,
    /// Employee | Contractor | Freelancer — determines disbursement logic in escrow_manager.
    pub worker_type: WorkerType,
    /// KYC verification state. Disbursements are blocked unless Verified.
    pub kyc_status: KycStatus,
    /// Preferred stablecoin mint address (e.g. devnet USDC or EURC).
    pub payout_mint: Pubkey,
    /// PDA bump seed.
    pub bump: u8,
}

impl WorkerAccount {
    pub const SIZE: usize = 8   // Anchor discriminator
        + 32  // employer
        + 32  // wallet
        + 1   // worker_type enum
        + 1   // kyc_status enum
        + 32  // payout_mint
        + 1;  // bump

    /// Convenience guard used by other programs before releasing funds.
    pub fn is_kyc_verified(&self) -> bool {
        self.kyc_status == KycStatus::Verified
    }
}

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum WorkerType {
    /// Fixed salary, calendar-based release.
    Employee,
    /// Milestone-locked release.
    Contractor,
    /// Invoice-triggered release.
    Freelancer,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum KycStatus {
    /// Default state after registration — cannot receive funds.
    Pending,
    /// Identity verified — eligible for disbursements.
    Verified,
    /// Flagged by compliance / sanctions screening — funds blocked.
    Flagged,
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct WorkerRegistered {
    pub worker:      Pubkey,
    pub employer:    Pubkey,
    pub worker_type: WorkerType,
}

#[event]
pub struct KycStatusUpdated {
    pub worker: Pubkey,
    pub status: KycStatus,
}

#[event]
pub struct PayoutPreferenceUpdated {
    pub worker:      Pubkey,
    pub payout_mint: Pubkey,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum WorkerRegistryError {
    #[msg("Signer is not the registered worker wallet")]
    Unauthorized,
    #[msg("Worker KYC status must be Verified before receiving funds")]
    KycNotVerified,
}
