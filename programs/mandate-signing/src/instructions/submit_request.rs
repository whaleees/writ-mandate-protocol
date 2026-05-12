use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};
use crate::constants::*;
use crate::encrypt::{eaddress_eq, euint64_add, euint64_lte};
use crate::error::MandateError;
use crate::ika::approve_message;
use crate::state::{DailyUsage, DecisionLog, Mandate, TradeDirection, rejection};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TransactionRequest {
    /// Token mint being traded. Checked against mandate's encrypted allowlist.
    pub token_mint: Pubkey,
    /// Destination address or program. Checked against mandate's encrypted counterparty list.
    pub counterparty: Pubkey,
    /// Trade size as basis points of portfolio.
    pub size_bps: u64,
    pub direction: TradeDirection,
    /// Target chain (0 = Solana, 1 = Ethereum, 2 = BNB, …).
    pub target_chain: u8,
}

#[derive(Accounts)]
#[instruction(request: TransactionRequest, request_nonce: u64, day: u64)]
pub struct SubmitRequest<'info> {
    /// Agent identity keypair — must match mandate.agent.
    pub agent: Signer<'info>,

    #[account(
        seeds = [MANDATE_SEED, mandate.owner.as_ref(), agent.key().as_ref()],
        bump = mandate.bump,
    )]
    pub mandate: Account<'info, Mandate>,

    #[account(
        init_if_needed,
        payer = fee_payer,
        space = DailyUsage::LEN,
        seeds = [DAILY_USAGE_SEED, mandate.key().as_ref(), &day.to_le_bytes()],
        bump,
    )]
    pub daily_usage: Account<'info, DailyUsage>,

    #[account(
        init,
        payer = fee_payer,
        space = DecisionLog::LEN,
        seeds = [DECISION_LOG_SEED, mandate.key().as_ref(), &request_nonce.to_le_bytes()],
        bump,
    )]
    pub decision_log: Account<'info, DecisionLog>,

    /// Pays for PDA creation. May be the agent or a relayer.
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(
    ctx: Context<SubmitRequest>,
    request: TransactionRequest,
    request_nonce: u64,
    day: u64,
) -> Result<()> {
    let mandate      = &ctx.accounts.mandate;
    let daily_usage  = &mut ctx.accounts.daily_usage;
    let decision_log = &mut ctx.accounts.decision_log;
    let clock        = Clock::get()?;

    require_keys_eq!(
        ctx.accounts.agent.key(),
        mandate.agent,
        MandateError::UnauthorizedAgent
    );

    let expected_day = clock.unix_timestamp as u64 / 86400;
    require_eq!(day, expected_day, MandateError::InvalidDay);

    // Hash covers all request fields for the audit log.
    let mut request_bytes = Vec::with_capacity(74);
    request_bytes.extend_from_slice(&request.token_mint.to_bytes());
    request_bytes.extend_from_slice(&request.counterparty.to_bytes());
    request_bytes.extend_from_slice(&request.size_bps.to_le_bytes());
    request_bytes.push(request.direction as u8);
    request_bytes.push(request.target_chain);
    let request_hash: [u8; 32] = Sha256::digest(&request_bytes).into();

    let mut rejection_flags: u8 = 0;

    // 1. Expiry: now <= expiry_timestamp  (EUint64 lte)
    if !euint64_lte(clock.unix_timestamp as u64, mandate.expiry_timestamp) {
        rejection_flags |= rejection::EXPIRED;
    }

    // 2. Token allowlist: token_mint must appear in encrypted EAddress list.
    //    Skipped when allowed_token_count == 0 (no token restriction).
    if mandate.allowed_token_count > 0 {
        let token_allowed = (0..mandate.allowed_token_count as usize)
            .any(|i| eaddress_eq(&request.token_mint, &mandate.allowed_token_mints[i]));
        if !token_allowed {
            rejection_flags |= rejection::TOKEN_NOT_ALLOWED;
        }
    }

    // 3. Trade size: size_bps <= max_trade_size_bps  (EUint64 lte)
    if !euint64_lte(request.size_bps, mandate.max_trade_size_bps) {
        rejection_flags |= rejection::SIZE_EXCEEDED;
    }

    // 4. Daily volume: used + size_bps <= daily_volume_limit_bps  (EUint64 add + lte)
    let projected_daily = euint64_add(daily_usage.used_bps, request.size_bps);
    if !euint64_lte(projected_daily, mandate.daily_volume_limit_bps) {
        rejection_flags |= rejection::DAILY_LIMIT_EXCEEDED;
    }

    // 5. Counterparty allowlist: counterparty must appear in encrypted EAddress list.
    //    Skipped when allowed_counterparty_count == 0 (no counterparty restriction).
    if mandate.allowed_counterparty_count > 0 {
        let cp_allowed = (0..mandate.allowed_counterparty_count as usize)
            .any(|i| eaddress_eq(&request.counterparty, &mandate.allowed_counterparties[i]));
        if !cp_allowed {
            rejection_flags |= rejection::COUNTERPARTY_NOT_ALLOWED;
        }
    }

    let approved = rejection_flags == 0;

    decision_log.mandate         = mandate.key();
    decision_log.slot            = clock.slot;
    decision_log.timestamp       = clock.unix_timestamp as u64;
    decision_log.request_hash    = request_hash;
    decision_log.approved        = approved;
    decision_log.rejection_flags = rejection_flags;
    decision_log.bump            = ctx.bumps.decision_log;

    if approved {
        if daily_usage.mandate == Pubkey::default() {
            daily_usage.mandate = mandate.key();
            daily_usage.day     = day;
            daily_usage.bump    = ctx.bumps.daily_usage;
        }
        daily_usage.used_bps = projected_daily;

        approve_message(&mandate.dwallet_id, request_hash, clock.slot);

        msg!(
            "APPROVED  mint={} cp={} size={}bps nonce={} dWallet={}",
            request.token_mint, request.counterparty,
            request.size_bps, request_nonce, mandate.dwallet_id,
        );
    } else {
        msg!(
            "REJECTED  mint={} cp={} size={}bps nonce={} flags=0b{:08b}",
            request.token_mint, request.counterparty,
            request.size_bps, request_nonce, rejection_flags,
        );
        if rejection_flags & rejection::EXPIRED != 0 {
            msg!("  reason: mandate expired");
        }
        if rejection_flags & rejection::TOKEN_NOT_ALLOWED != 0 {
            msg!("  reason: token mint not in allowed list");
        }
        if rejection_flags & rejection::SIZE_EXCEEDED != 0 {
            msg!("  reason: trade size exceeds max_trade_size");
        }
        if rejection_flags & rejection::DAILY_LIMIT_EXCEEDED != 0 {
            msg!("  reason: would exceed daily volume limit");
        }
        if rejection_flags & rejection::COUNTERPARTY_NOT_ALLOWED != 0 {
            msg!("  reason: counterparty not in allowed list");
        }
    }

    Ok(())
}
