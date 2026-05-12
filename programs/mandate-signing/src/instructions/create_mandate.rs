use anchor_lang::prelude::*;
use crate::constants::*;
use crate::error::MandateError;
use crate::state::{EAddress, EUint64, Mandate};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateMandateArgs {
    /// Max single trade as basis points (e.g. 1000 = 10%). EUint64.
    pub max_trade_size_bps: EUint64,
    /// Daily volume cap as basis points (e.g. 2500 = 25%). EUint64.
    pub daily_volume_limit_bps: EUint64,
    /// Unix timestamp this mandate expires. EUint64.
    pub expiry_timestamp: EUint64,
    /// Encrypted token mint allowlist (EAddress). Max 8. Empty = no token restriction.
    pub allowed_token_mints: Vec<EAddress>,
    /// Encrypted counterparty allowlist (EAddress). Max 4. Empty = no counterparty restriction.
    pub allowed_counterparties: Vec<EAddress>,
    /// Ika dWallet to be controlled by this mandate program.
    pub dwallet_id: Pubkey,
}

#[derive(Accounts)]
pub struct CreateMandate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Agent identity — validated by owner off-chain, not a signer here.
    pub agent: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        space = Mandate::LEN,
        seeds = [MANDATE_SEED, owner.key().as_ref(), agent.key().as_ref()],
        bump,
    )]
    pub mandate: Account<'info, Mandate>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn handler(ctx: Context<CreateMandate>, args: CreateMandateArgs) -> Result<()> {
    require!(args.allowed_token_mints.len() <= 8,    MandateError::TooManyTokenMints);
    require!(args.allowed_counterparties.len() <= 4, MandateError::TooManyCounterparties);

    let mandate = &mut ctx.accounts.mandate;
    let clock = Clock::get()?;

    mandate.owner                      = ctx.accounts.owner.key();
    mandate.agent                      = ctx.accounts.agent.key();
    mandate.dwallet_id                 = args.dwallet_id;
    mandate.max_trade_size_bps         = args.max_trade_size_bps;
    mandate.daily_volume_limit_bps     = args.daily_volume_limit_bps;
    mandate.expiry_timestamp           = args.expiry_timestamp;
    mandate.allowed_token_count        = args.allowed_token_mints.len() as u8;
    mandate.allowed_counterparty_count = args.allowed_counterparties.len() as u8;
    mandate.created_at                 = clock.unix_timestamp as u64;
    mandate.bump                       = ctx.bumps.mandate;

    let mut token_mints = [[0u8; 32]; 8];
    for (i, mint) in args.allowed_token_mints.iter().enumerate() {
        token_mints[i] = *mint;
    }
    mandate.allowed_token_mints = token_mints;

    let mut counterparties = [[0u8; 32]; 4];
    for (i, cp) in args.allowed_counterparties.iter().enumerate() {
        counterparties[i] = *cp;
    }
    mandate.allowed_counterparties = counterparties;

    msg!(
        "Mandate created: owner={} agent={} max={}bps daily={}bps expiry={} tokens={} counterparties={}",
        mandate.owner,
        mandate.agent,
        mandate.max_trade_size_bps,
        mandate.daily_volume_limit_bps,
        mandate.expiry_timestamp,
        mandate.allowed_token_count,
        mandate.allowed_counterparty_count,
    );

    Ok(())
}
