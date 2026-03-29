use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// ─── Program ─────────────────────────────────────────────────────────────────

#[program]
pub mod payroll_vault {
    use super::*;

    /// Create a payroll vault for an employer.
    ///
    /// `release_authority` must be the escrow_manager authority PDA for this employer:
    ///   seeds = ["escrow_authority", employer] using the escrow_manager program ID.
    /// The frontend derives this before calling so no CPI is needed for setup.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        release_authority: Pubkey,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.employer           = ctx.accounts.employer.key();
        vault.mint               = ctx.accounts.mint.key();
        vault.release_authority  = release_authority;
        vault.total_deposited    = 0;
        vault.total_disbursed    = 0;
        vault.bump               = ctx.bumps.vault;

        emit!(VaultInitialized {
            vault:             vault.key(),
            employer:          vault.employer,
            mint:              vault.mint,
            release_authority: vault.release_authority,
        });

        Ok(())
    }

    /// Employer deposits stablecoins into the vault.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.employer_token_account.to_account_info(),
                    to:        ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.employer.to_account_info(),
                },
            ),
            amount,
        )?;

        ctx.accounts.vault.total_deposited = ctx.accounts.vault
            .total_deposited
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;

        emit!(VaultDeposited {
            vault:    ctx.accounts.vault.key(),
            employer: ctx.accounts.employer.key(),
            amount,
        });

        Ok(())
    }

    /// Emergency employer withdrawal (e.g. to unwind payroll).
    /// Does not go through the compliance pipeline — employer only.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);
        require!(
            ctx.accounts.vault_token_account.amount >= amount,
            VaultError::InsufficientFunds
        );

        let employer_key = ctx.accounts.vault.employer;
        let bump         = ctx.accounts.vault.bump;
        let seeds: &[&[u8]] = &[b"vault", employer_key.as_ref(), &[bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.vault_token_account.to_account_info(),
                    to:        ctx.accounts.employer_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        emit!(VaultWithdrawn {
            vault:    ctx.accounts.vault.key(),
            employer: ctx.accounts.employer.key(),
            amount,
        });

        Ok(())
    }

    /// Release funds to a worker's token account.
    ///
    /// Only callable by the registered `release_authority` (the escrow_manager PDA).
    /// escrow_manager calls this via CPI after verifying KYC and disbursement conditions.
    pub fn release(ctx: Context<Release>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);
        require!(
            ctx.accounts.vault_token_account.amount >= amount,
            VaultError::InsufficientFunds
        );

        let employer_key = ctx.accounts.vault.employer;
        let bump         = ctx.accounts.vault.bump;
        let seeds: &[&[u8]] = &[b"vault", employer_key.as_ref(), &[bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.vault_token_account.to_account_info(),
                    to:        ctx.accounts.worker_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        ctx.accounts.vault.total_disbursed = ctx.accounts.vault
            .total_disbursed
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;

        emit!(FundsReleased {
            vault:         ctx.accounts.vault.key(),
            worker_wallet: ctx.accounts.worker_token_account.owner,
            amount,
        });

        Ok(())
    }
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    /// Vault state PDA, seeded by employer address.
    #[account(
        init,
        payer  = employer,
        space  = VaultAccount::SIZE,
        seeds  = [b"vault", employer.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, VaultAccount>,

    /// ATA owned by the vault PDA — holds all deposited stablecoins.
    #[account(
        init,
        payer  = employer,
        associated_token::mint      = mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub employer: Signer<'info>,

    pub system_program:           Program<'info, System>,
    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", employer.key().as_ref()],
        bump  = vault.bump,
        constraint = vault.employer == employer.key() @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, VaultAccount>,

    #[account(
        mut,
        associated_token::mint      = vault.mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = employer_token_account.owner == employer.key() @ VaultError::Unauthorized,
        constraint = employer_token_account.mint   == vault.mint    @ VaultError::MintMismatch,
    )]
    pub employer_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub employer: Signer<'info>,

    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds  = [b"vault", employer.key().as_ref()],
        bump   = vault.bump,
        constraint = vault.employer == employer.key() @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, VaultAccount>,

    #[account(
        mut,
        associated_token::mint      = vault.mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = employer_token_account.owner == employer.key() @ VaultError::Unauthorized,
        constraint = employer_token_account.mint   == vault.mint    @ VaultError::MintMismatch,
    )]
    pub employer_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub employer: Signer<'info>,

    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.employer.as_ref()],
        bump  = vault.bump,
    )]
    pub vault: Account<'info, VaultAccount>,

    #[account(
        mut,
        associated_token::mint      = vault.mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// The worker's ATA — must exist and match vault mint.
    #[account(
        mut,
        constraint = worker_token_account.mint == vault.mint @ VaultError::MintMismatch,
    )]
    pub worker_token_account: Account<'info, TokenAccount>,

    /// Must match the release_authority stored on the vault (the escrow_manager PDA).
    #[account(
        constraint = release_authority.key() == vault.release_authority @ VaultError::Unauthorized,
    )]
    pub release_authority: Signer<'info>,

    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
/// On-chain payroll treasury for a single employer.
pub struct VaultAccount {
    /// Employer who owns this vault.
    pub employer: Pubkey,
    /// Stablecoin mint (USDC, EURC, etc.).
    pub mint: Pubkey,
    /// The only pubkey authorized to call `release` — set to escrow_manager's PDA.
    pub release_authority: Pubkey,
    /// Lifetime deposits in stablecoin lamports (informational).
    pub total_deposited: u64,
    /// Lifetime disbursements in stablecoin lamports (informational).
    pub total_disbursed: u64,
    /// PDA bump seed.
    pub bump: u8,
}

impl VaultAccount {
    pub const SIZE: usize = 8   // Anchor discriminator
        + 32  // employer
        + 32  // mint
        + 32  // release_authority
        + 8   // total_deposited
        + 8   // total_disbursed
        + 1;  // bump
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct VaultInitialized {
    pub vault:             Pubkey,
    pub employer:          Pubkey,
    pub mint:              Pubkey,
    pub release_authority: Pubkey,
}

#[event]
pub struct VaultDeposited {
    pub vault:    Pubkey,
    pub employer: Pubkey,
    pub amount:   u64,
}

#[event]
pub struct VaultWithdrawn {
    pub vault:    Pubkey,
    pub employer: Pubkey,
    pub amount:   u64,
}

#[event]
pub struct FundsReleased {
    pub vault:         Pubkey,
    pub worker_wallet: Pubkey,
    pub amount:        u64,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum VaultError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient funds in vault")]
    InsufficientFunds,
    #[msg("Signer is not authorized for this operation")]
    Unauthorized,
    #[msg("Token account mint does not match vault mint")]
    MintMismatch,
    #[msg("Arithmetic overflow")]
    Overflow,
}
