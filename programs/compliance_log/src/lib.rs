use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// ─── Program ─────────────────────────────────────────────────────────────────

#[program]
pub mod compliance_log {
    use super::*;

    /// Write an immutable compliance record for a disbursement.
    ///
    /// Called by the employer (or a crank) immediately after a successful
    /// escrow_manager disbursement. Each record is a unique PDA keyed by
    /// (employer, tx_signature) so it can never be overwritten.
    ///
    /// On devnet:
    ///   - `kyt_score` is set by the caller (mock; production = oracle feed)
    ///   - `travel_rule_hash` is a SHA-256 hash of the Travel Rule payload stored off-chain
    ///   - `purpose_code` is a free-form string (e.g. "SALARY", "MILESTONE", "INVOICE")
    pub fn write_entry(
        ctx: Context<WriteEntry>,
        params: EntryParams,
    ) -> Result<()> {
        require!(params.amount > 0, ComplianceError::ZeroAmount);
        require!(
            params.purpose_code.len() <= 32,
            ComplianceError::PurposeCodeTooLong
        );

        let entry = &mut ctx.accounts.entry;
        entry.employer          = ctx.accounts.employer.key();
        entry.worker_wallet     = params.worker_wallet;
        entry.tx_signature      = params.tx_signature;
        entry.amount            = params.amount;
        entry.mint              = params.mint;
        entry.kyt_score         = params.kyt_score;
        entry.travel_rule_hash  = params.travel_rule_hash;
        entry.purpose_code      = params.purpose_code.clone();
        entry.timestamp         = Clock::get()?.unix_timestamp;
        entry.bump              = ctx.bumps.entry;

        emit!(ComplianceEntryWritten {
            entry:             entry.key(),
            employer:          entry.employer,
            worker_wallet:     entry.worker_wallet,
            amount:            entry.amount,
            kyt_score:         entry.kyt_score,
            travel_rule_hash:  entry.travel_rule_hash,
            purpose_code:      params.purpose_code,
            timestamp:         entry.timestamp,
        });

        Ok(())
    }

    /// Grant a regulator wallet read-only access to this employer's compliance records.
    ///
    /// Stored on-chain so any indexer or frontend can verify authorization without
    /// an off-chain allowlist. A time-limited grant is enforced by `expires_at`.
    pub fn grant_regulator_access(
        ctx: Context<GrantRegulatorAccess>,
        expires_at: i64,
    ) -> Result<()> {
        let grant = &mut ctx.accounts.grant;
        grant.employer    = ctx.accounts.employer.key();
        grant.regulator   = ctx.accounts.regulator.key();
        grant.expires_at  = expires_at;
        grant.bump        = ctx.bumps.grant;

        emit!(RegulatorAccessGranted {
            employer:   grant.employer,
            regulator:  grant.regulator,
            expires_at: grant.expires_at,
        });

        Ok(())
    }

    /// Revoke a previously granted regulator access.
    pub fn revoke_regulator_access(ctx: Context<RevokeRegulatorAccess>) -> Result<()> {
        emit!(RegulatorAccessRevoked {
            employer:  ctx.accounts.grant.employer,
            regulator: ctx.accounts.grant.regulator,
        });
        // Closing the account returns rent to employer
        Ok(())
    }
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(params: EntryParams)]
pub struct WriteEntry<'info> {
    /// Compliance entry PDA, keyed by (employer, tx_signature).
    /// Unique per transaction — cannot be overwritten.
    #[account(
        init,
        payer = employer,
        space = ComplianceEntry::SIZE,
        seeds = [b"entry", employer.key().as_ref(), &params.tx_signature],
        bump,
    )]
    pub entry: Account<'info, ComplianceEntry>,

    #[account(mut)]
    pub employer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GrantRegulatorAccess<'info> {
    #[account(
        init_if_needed,
        payer  = employer,
        space  = RegulatorGrant::SIZE,
        seeds  = [b"regulator", employer.key().as_ref(), regulator.key().as_ref()],
        bump,
    )]
    pub grant: Account<'info, RegulatorGrant>,

    #[account(mut)]
    pub employer: Signer<'info>,

    /// CHECK: Regulator wallet — stored for access control, does not sign.
    pub regulator: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeRegulatorAccess<'info> {
    #[account(
        mut,
        seeds  = [b"regulator", employer.key().as_ref(), grant.regulator.as_ref()],
        bump   = grant.bump,
        constraint = grant.employer == employer.key() @ ComplianceError::Unauthorized,
        close  = employer,
    )]
    pub grant: Account<'info, RegulatorGrant>,

    #[account(mut)]
    pub employer: Signer<'info>,
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
/// Immutable compliance record for a single disbursement.
/// Append-only by design — the PDA seed includes tx_signature so no entry
/// can ever be updated or deleted.
pub struct ComplianceEntry {
    /// Employer who made the payment.
    pub employer: Pubkey,
    /// Worker's receiving wallet.
    pub worker_wallet: Pubkey,
    /// The on-chain transaction signature that executed the disbursement (32 bytes).
    pub tx_signature: [u8; 32],
    /// Amount in stablecoin lamports.
    pub amount: u64,
    /// Stablecoin mint address.
    pub mint: Pubkey,
    /// KYT risk score: 0 = low, 1 = medium, 2 = high (mock on devnet).
    pub kyt_score: u8,
    /// SHA-256 hash of the off-chain Travel Rule payload (mock on devnet).
    pub travel_rule_hash: [u8; 32],
    /// Payment purpose code, max 32 chars (e.g. "SALARY", "MILESTONE", "INVOICE").
    pub purpose_code: String,
    /// Unix timestamp when this entry was written.
    pub timestamp: i64,
    /// PDA bump.
    pub bump: u8,
}

impl ComplianceEntry {
    pub const MAX_PURPOSE_CODE: usize = 32;

    pub const SIZE: usize = 8    // discriminator
        + 32   // employer
        + 32   // worker_wallet
        + 32   // tx_signature
        + 8    // amount
        + 32   // mint
        + 1    // kyt_score
        + 32   // travel_rule_hash
        + 4 + Self::MAX_PURPOSE_CODE  // purpose_code (String prefix + chars)
        + 8    // timestamp
        + 1;   // bump
}

#[account]
/// Grants a regulator wallet time-limited read access to an employer's compliance records.
pub struct RegulatorGrant {
    pub employer:   Pubkey,
    pub regulator:  Pubkey,
    /// Unix timestamp after which this grant is considered expired.
    pub expires_at: i64,
    pub bump:       u8,
}

impl RegulatorGrant {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1;
}

// ─── Params ───────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct EntryParams {
    pub worker_wallet:     Pubkey,
    pub tx_signature:      [u8; 32],
    pub amount:            u64,
    pub mint:              Pubkey,
    /// 0 = low, 1 = medium, 2 = high
    pub kyt_score:         u8,
    /// SHA-256 of Travel Rule JSON payload (mocked on devnet)
    pub travel_rule_hash:  [u8; 32],
    pub purpose_code:      String,
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct ComplianceEntryWritten {
    pub entry:            Pubkey,
    pub employer:         Pubkey,
    pub worker_wallet:    Pubkey,
    pub amount:           u64,
    pub kyt_score:        u8,
    pub travel_rule_hash: [u8; 32],
    pub purpose_code:     String,
    pub timestamp:        i64,
}

#[event]
pub struct RegulatorAccessGranted {
    pub employer:   Pubkey,
    pub regulator:  Pubkey,
    pub expires_at: i64,
}

#[event]
pub struct RegulatorAccessRevoked {
    pub employer:  Pubkey,
    pub regulator: Pubkey,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum ComplianceError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Purpose code exceeds 32 characters")]
    PurposeCodeTooLong,
    #[msg("Signer is not authorized")]
    Unauthorized,
}
