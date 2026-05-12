use anchor_lang::prelude::*;

#[error_code]
pub enum MandateError {
    #[msg("Agent pubkey does not match mandate.agent")]
    UnauthorizedAgent,
    #[msg("Mandate has expired")]
    MandateExpired,
    #[msg("Token mint is not in the mandate's allowed list")]
    TokenNotAllowed,
    #[msg("Counterparty is not in the mandate's allowed list")]
    CounterpartyNotAllowed,
    #[msg("Trade size exceeds mandate max_trade_size")]
    TradeSizeExceeded,
    #[msg("Request would exceed daily volume limit")]
    DailyVolumeExceeded,
    #[msg("Provided day does not match current on-chain clock day")]
    InvalidDay,
    #[msg("Allowed token mint list exceeds maximum of 8")]
    TooManyTokenMints,
    #[msg("Allowed counterparty list exceeds maximum of 4")]
    TooManyCounterparties,
}
