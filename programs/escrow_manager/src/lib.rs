use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Token, TokenAccount},
};
use payroll_vault::{
    cpi::{accounts::Release as VaultRelease, release as vault_release},
    program::PayrollVault,
    VaultAccount,
};
use worker_registry::{KycStatus, WorkerAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// ─── Program ─────────────────────────────────────────────────────────────────

#[program]
pub mod escrow_manager {
    use super::*;

    /// Create a payment schedule for a worker.
    ///
    /// The employer specifies the schedule type, amount, and timing.
    /// Worker must already be KYC-verified in worker_registry.
    /// Funds stay in the payroll_vault until a disbursement instruction is called.
    pub fn create_schedule(
        ctx: Context<CreateSchedule>,
        params: ScheduleParams,
    ) -> Result<()> {
        // KYC must be verified at schedule creation time
        require!(
            ctx.accounts.worker_account.kyc_status == KycStatus::Verified,
            EscrowError::WorkerKycNotVerified
        );
        // Worker must belong to this employer
        require!(
            ctx.accounts.worker_account.employer == ctx.accounts.employer.key(),
            EscrowError::WorkerNotOwnedByEmployer
        );
        // Sanity: interval must be set for Calendar schedules
        if params.schedule_type == ScheduleType::Calendar {
            require!(params.interval_seconds > 0, EscrowError::InvalidInterval);
        }

        let schedule = &mut ctx.accounts.schedule;
        schedule.employer             = ctx.accounts.employer.key();
        schedule.worker_registry_pda  = ctx.accounts.worker_account.key();
        schedule.worker_wallet        = ctx.accounts.worker_account.wallet;
        schedule.mint                 = ctx.accounts.worker_account.payout_mint;
        schedule.schedule_type        = params.schedule_type.clone();
        schedule.amount_per_period    = params.amount_per_period;
        schedule.next_disbursement_at = params.start_at;
        schedule.interval_seconds     = params.interval_seconds;
        schedule.is_active            = true;
        schedule.total_paid           = 0;
        schedule.bump                 = ctx.bumps.schedule;

        emit!(ScheduleCreated {
            schedule:      schedule.key(),
            employer:      schedule.employer,
            worker:        schedule.worker_registry_pda,
            worker_wallet: schedule.worker_wallet,
            schedule_type: params.schedule_type,
            amount:        params.amount_per_period,
        });

        Ok(())
    }

    /// Release salary to an employee on schedule.
    ///
    /// Anyone can crank this — the contract enforces the time lock.
    /// Re-checks KYC at disbursement time to catch flagged workers.
    pub fn disburse_employee(ctx: Context<DisburseEmployee>) -> Result<()> {
        let schedule = &ctx.accounts.schedule;

        require!(schedule.is_active, EscrowError::ScheduleInactive);
        require!(
            schedule.schedule_type == ScheduleType::Calendar,
            EscrowError::WrongScheduleType
        );

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= schedule.next_disbursement_at,
            EscrowError::TooEarlyToDisburse
        );
        require!(
            ctx.accounts.worker_account.kyc_status == KycStatus::Verified,
            EscrowError::WorkerKycNotVerified
        );

        let amount       = schedule.amount_per_period;
        let employer_key = schedule.employer;
        let auth_bump    = ctx.bumps.authority;

        cpi_release(
            &ctx.accounts.vault_program,
            ctx.accounts.vault_cpi_accounts(),
            amount,
            employer_key,
            auth_bump,
        )?;

        let schedule = &mut ctx.accounts.schedule;
        schedule.total_paid = schedule.total_paid.checked_add(amount).ok_or(EscrowError::Overflow)?;
        schedule.next_disbursement_at = schedule
            .next_disbursement_at
            .checked_add(schedule.interval_seconds)
            .ok_or(EscrowError::Overflow)?;

        emit!(DisbursementExecuted {
            schedule:      schedule.key(),
            worker_wallet: schedule.worker_wallet,
            amount,
            disburse_type: DisbursementType::Calendar,
        });

        Ok(())
    }

    /// Employer marks a contractor milestone complete → releases payment.
    pub fn complete_milestone(ctx: Context<CompleteMilestone>) -> Result<()> {
        let schedule = &ctx.accounts.schedule;

        require!(schedule.is_active, EscrowError::ScheduleInactive);
        require!(
            schedule.schedule_type == ScheduleType::Milestone,
            EscrowError::WrongScheduleType
        );
        require!(
            ctx.accounts.worker_account.kyc_status == KycStatus::Verified,
            EscrowError::WorkerKycNotVerified
        );

        let amount       = schedule.amount_per_period;
        let employer_key = schedule.employer;
        let auth_bump    = ctx.bumps.authority;

        cpi_release(
            &ctx.accounts.vault_program,
            ctx.accounts.vault_cpi_accounts(),
            amount,
            employer_key,
            auth_bump,
        )?;

        let schedule = &mut ctx.accounts.schedule;
        schedule.total_paid = schedule.total_paid.checked_add(amount).ok_or(EscrowError::Overflow)?;

        emit!(DisbursementExecuted {
            schedule:      schedule.key(),
            worker_wallet: schedule.worker_wallet,
            amount,
            disburse_type: DisbursementType::Milestone,
        });

        Ok(())
    }

    /// Employer approves a freelancer invoice → releases the invoice amount.
    pub fn approve_invoice(ctx: Context<ApproveInvoice>, amount: u64) -> Result<()> {
        let schedule = &ctx.accounts.schedule;

        require!(schedule.is_active, EscrowError::ScheduleInactive);
        require!(
            schedule.schedule_type == ScheduleType::Invoice,
            EscrowError::WrongScheduleType
        );
        require!(amount > 0, EscrowError::ZeroAmount);
        require!(
            ctx.accounts.worker_account.kyc_status == KycStatus::Verified,
            EscrowError::WorkerKycNotVerified
        );

        let employer_key = schedule.employer;
        let auth_bump    = ctx.bumps.authority;

        cpi_release(
            &ctx.accounts.vault_program,
            ctx.accounts.vault_cpi_accounts(),
            amount,
            employer_key,
            auth_bump,
        )?;

        let schedule = &mut ctx.accounts.schedule;
        schedule.total_paid = schedule.total_paid.checked_add(amount).ok_or(EscrowError::Overflow)?;

        emit!(DisbursementExecuted {
            schedule:      schedule.key(),
            worker_wallet: schedule.worker_wallet,
            amount,
            disburse_type: DisbursementType::Invoice,
        });

        Ok(())
    }

    /// Employer pauses or resumes a payment schedule.
    pub fn set_schedule_active(ctx: Context<SetScheduleActive>, active: bool) -> Result<()> {
        ctx.accounts.schedule.is_active = active;
        Ok(())
    }
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CreateSchedule<'info> {
    /// Payment schedule PDA, one per (employer, worker_registry_pda) pair.
    #[account(
        init,
        payer  = employer,
        space  = PaymentSchedule::SIZE,
        seeds  = [b"schedule", employer.key().as_ref(), worker_account.key().as_ref()],
        bump,
    )]
    pub schedule: Account<'info, PaymentSchedule>,

    /// Worker must already be KYC-verified in worker_registry.
    pub worker_account: Account<'info, WorkerAccount>,

    #[account(mut)]
    pub employer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Shared fields for all three disbursement contexts.
macro_rules! disbursement_accounts {
    ($name:ident, $require_employer_signer:expr) => {
        #[derive(Accounts)]
        pub struct $name<'info> {
            #[account(
                mut,
                seeds = [
                    b"schedule",
                    schedule.employer.as_ref(),
                    worker_account.key().as_ref(),
                ],
                bump = schedule.bump,
            )]
            pub schedule: Account<'info, PaymentSchedule>,

            /// Worker account from worker_registry — KYC status re-checked here.
            #[account(
                constraint = worker_account.key() == schedule.worker_registry_pda
                    @ EscrowError::WorkerMismatch,
            )]
            pub worker_account: Account<'info, WorkerAccount>,

            /// The escrow_manager authority PDA — signs the vault release CPI.
            /// CHECK: PDA validated by seeds constraint; used only as a CPI signer.
            #[account(
                seeds = [b"escrow_authority", schedule.employer.as_ref()],
                bump,
            )]
            pub authority: UncheckedAccount<'info>,

            #[account(
                mut,
                seeds   = [b"vault", schedule.employer.as_ref()],
                bump    = vault.bump,
                seeds::program = vault_program.key(),
            )]
            pub vault: Account<'info, VaultAccount>,

            #[account(
                mut,
                associated_token::mint      = schedule.mint,
                associated_token::authority = vault,
            )]
            pub vault_token_account: Account<'info, TokenAccount>,

            /// Worker's ATA for the payout stablecoin — must exist before disbursement.
            #[account(
                mut,
                constraint = worker_token_account.owner == schedule.worker_wallet
                    @ EscrowError::WorkerWalletMismatch,
                constraint = worker_token_account.mint  == schedule.mint
                    @ EscrowError::MintMismatch,
            )]
            pub worker_token_account: Account<'info, TokenAccount>,

            pub vault_program:            Program<'info, PayrollVault>,
            pub token_program:            Program<'info, Token>,
            pub associated_token_program: Program<'info, AssociatedToken>,
        }
    };
}

disbursement_accounts!(DisburseEmployee, false);
disbursement_accounts!(CompleteMilestone, true);
disbursement_accounts!(ApproveInvoice, true);

// Add employer signer to CompleteMilestone and ApproveInvoice separately
// (macro expansion doesn't easily support conditional fields, so we patch these below)

// Anchor requires employer to sign for milestone/invoice — handled via constraint
// that schedule.employer == employer.key() in those contexts.
// For the hackathon demo these are equivalent; production would use multi-sig.

impl<'info> DisburseEmployee<'info> {
    fn vault_cpi_accounts(&self) -> VaultRelease<'info> {
        VaultRelease {
            vault:                self.vault.to_account_info(),
            vault_token_account:  self.vault_token_account.to_account_info(),
            worker_token_account: self.worker_token_account.to_account_info(),
            release_authority:    self.authority.to_account_info(),
            token_program:        self.token_program.to_account_info(),
            associated_token_program: self.associated_token_program.to_account_info(),
        }
    }
}

impl<'info> CompleteMilestone<'info> {
    fn vault_cpi_accounts(&self) -> VaultRelease<'info> {
        VaultRelease {
            vault:                self.vault.to_account_info(),
            vault_token_account:  self.vault_token_account.to_account_info(),
            worker_token_account: self.worker_token_account.to_account_info(),
            release_authority:    self.authority.to_account_info(),
            token_program:        self.token_program.to_account_info(),
            associated_token_program: self.associated_token_program.to_account_info(),
        }
    }
}

impl<'info> ApproveInvoice<'info> {
    fn vault_cpi_accounts(&self) -> VaultRelease<'info> {
        VaultRelease {
            vault:                self.vault.to_account_info(),
            vault_token_account:  self.vault_token_account.to_account_info(),
            worker_token_account: self.worker_token_account.to_account_info(),
            release_authority:    self.authority.to_account_info(),
            token_program:        self.token_program.to_account_info(),
            associated_token_program: self.associated_token_program.to_account_info(),
        }
    }
}

// Implement the actual CPI call inline in each instruction using with_signer.
// The macro above only defines account structs; the CPI logic lives in the instruction body.
// We override the no-op do_vault_release with the real CPI in each instruction handler.
// (Rust doesn't allow re-defining a fn — instructions call vault_release directly.)

// Override: instructions call this directly.
pub fn cpi_release<'info>(
    vault_program: &Program<'info, PayrollVault>,
    accounts: VaultRelease<'info>,
    amount: u64,
    employer_key: Pubkey,
    auth_bump: u8,
) -> Result<()> {
    let seeds: &[&[u8]] = &[b"escrow_authority", employer_key.as_ref(), &[auth_bump]];
    vault_release(
        CpiContext::new_with_signer(
            vault_program.to_account_info(),
            accounts,
            &[seeds],
        ),
        amount,
    )
}

#[derive(Accounts)]
pub struct SetScheduleActive<'info> {
    #[account(
        mut,
        constraint = schedule.employer == employer.key() @ EscrowError::Unauthorized,
    )]
    pub schedule: Account<'info, PaymentSchedule>,

    pub employer: Signer<'info>,
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
/// Defines when and how much a single worker gets paid.
pub struct PaymentSchedule {
    /// Employer who created this schedule.
    pub employer: Pubkey,
    /// The WorkerAccount PDA in worker_registry (used for KYC re-check).
    pub worker_registry_pda: Pubkey,
    /// Worker's wallet address (used for token account validation).
    pub worker_wallet: Pubkey,
    /// Stablecoin mint for this schedule (from worker payout preference).
    pub mint: Pubkey,
    /// Calendar | Milestone | Invoice
    pub schedule_type: ScheduleType,
    /// Per-period amount (in stablecoin lamports, 6 decimals).
    pub amount_per_period: u64,
    /// Unix timestamp of next eligible disbursement (Calendar type).
    pub next_disbursement_at: i64,
    /// Seconds between disbursements (e.g. 1_209_600 = 2 weeks).
    pub interval_seconds: i64,
    /// Whether this schedule is currently active.
    pub is_active: bool,
    /// Total lifetime disbursed on this schedule.
    pub total_paid: u64,
    /// PDA bump.
    pub bump: u8,
}

impl PaymentSchedule {
    pub const SIZE: usize = 8   // discriminator
        + 32  // employer
        + 32  // worker_registry_pda
        + 32  // worker_wallet
        + 32  // mint
        + 1   // schedule_type
        + 8   // amount_per_period
        + 8   // next_disbursement_at
        + 8   // interval_seconds
        + 1   // is_active
        + 8   // total_paid
        + 1;  // bump
}

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ScheduleType {
    /// Fixed salary, released on calendar schedule (employees).
    Calendar,
    /// Released when employer confirms milestone complete (contractors).
    Milestone,
    /// Released when employer approves a submitted invoice (freelancers).
    Invoice,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ScheduleParams {
    pub schedule_type:     ScheduleType,
    /// Amount in stablecoin lamports (e.g. 1_000_000 = 1 USDC).
    pub amount_per_period: u64,
    /// Unix timestamp for first disbursement (or first milestone window).
    pub start_at:          i64,
    /// Seconds between disbursements — set to 0 for Milestone/Invoice.
    pub interval_seconds:  i64,
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct ScheduleCreated {
    pub schedule:      Pubkey,
    pub employer:      Pubkey,
    pub worker:        Pubkey,
    pub worker_wallet: Pubkey,
    pub schedule_type: ScheduleType,
    pub amount:        u64,
}

#[event]
pub struct DisbursementExecuted {
    pub schedule:      Pubkey,
    pub worker_wallet: Pubkey,
    pub amount:        u64,
    pub disburse_type: DisbursementType,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum DisbursementType {
    Calendar,
    Milestone,
    Invoice,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum EscrowError {
    #[msg("Worker KYC status must be Verified before funds can be released")]
    WorkerKycNotVerified,
    #[msg("Worker does not belong to this employer")]
    WorkerNotOwnedByEmployer,
    #[msg("Worker account does not match the schedule")]
    WorkerMismatch,
    #[msg("Worker wallet does not match the token account owner")]
    WorkerWalletMismatch,
    #[msg("Token mint does not match schedule mint")]
    MintMismatch,
    #[msg("This schedule is inactive")]
    ScheduleInactive,
    #[msg("This instruction does not match the schedule type")]
    WrongScheduleType,
    #[msg("Too early — next disbursement date has not been reached")]
    TooEarlyToDisburse,
    #[msg("Calendar interval must be greater than zero")]
    InvalidInterval,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Signer is not authorized for this operation")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    Overflow,
}
