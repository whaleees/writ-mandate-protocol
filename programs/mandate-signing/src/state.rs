use anchor_lang::prelude::*;

/// Pre-alpha Encrypt FHE type — numeric.
/// Production: ciphertext; comparisons run without revealing values.
/// Pre-alpha (per Encrypt docs): stored as plaintext u64 with the production interface.
pub type EUint64 = u64;

/// Pre-alpha Encrypt FHE type — 32-byte address (Solana pubkey / token mint).
/// Production: FHE ciphertext; equality checks run without revealing the stored value.
/// Pre-alpha: stored as plaintext [u8; 32].
pub type EAddress = [u8; 32];

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[borsh(use_discriminant = true)]
pub enum TradeDirection {
    Buy  = 0,
    Sell = 1,
}

/// User-defined mandate: what an agent is allowed to sign.
/// Numeric limits are EUint64; token/counterparty lists are EAddress arrays.
/// All encrypted fields are pre-alpha plaintext with the production interface.
#[account]
#[derive(Debug)]
pub struct Mandate {
    /// User who controls this mandate.
    pub owner: Pubkey,
    /// Authorized agent — submits requests, never holds signing keys.
    pub agent: Pubkey,
    /// Ika dWallet ID controlled by this mandate program.
    pub dwallet_id: Pubkey,
    /// Max single trade as basis points of portfolio. EUint64.
    pub max_trade_size_bps: EUint64,
    /// Daily total volume cap as basis points of portfolio. EUint64.
    pub daily_volume_limit_bps: EUint64,
    /// Unix timestamp after which mandate expires. EUint64.
    pub expiry_timestamp: EUint64,
    /// Encrypted token mint allowlist (EAddress × 8). Empty = no token restriction.
    pub allowed_token_mints: [EAddress; 8],
    pub allowed_token_count: u8,
    /// Encrypted counterparty allowlist (EAddress × 4). Empty = no counterparty restriction.
    pub allowed_counterparties: [EAddress; 4],
    pub allowed_counterparty_count: u8,
    pub created_at: u64,
    pub bump: u8,
}

impl Mandate {
    pub const LEN: usize = 8         // discriminator
        + 32 + 32 + 32               // owner, agent, dwallet_id
        + 8 + 8 + 8                  // euint64 limits
        + (32 * 8) + 1               // allowed_token_mints + count
        + (32 * 4) + 1               // allowed_counterparties + count
        + 8                          // created_at
        + 1;                         // bump
}

/// Daily volume consumed by an agent per mandate.
/// PDA: [DAILY_USAGE_SEED, mandate, day_le_bytes]
#[account]
pub struct DailyUsage {
    pub mandate: Pubkey,
    /// Day number (unix_timestamp / 86400).
    pub day: u64,
    /// Volume used today as basis points. EUint64.
    pub used_bps: EUint64,
    pub bump: u8,
}

impl DailyUsage {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 1;
}

/// Immutable on-chain record of every mandate evaluation.
/// PDA: [DECISION_LOG_SEED, mandate, nonce_le_bytes]
#[account]
pub struct DecisionLog {
    pub mandate: Pubkey,
    pub slot: u64,
    pub timestamp: u64,
    pub request_hash: [u8; 32],
    pub approved: bool,
    /// Bitmask of rejection reasons (see `rejection` module). 0 if approved.
    pub rejection_flags: u8,
    pub bump: u8,
}

impl DecisionLog {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 32 + 1 + 1 + 1;
}

pub mod rejection {
    pub const EXPIRED:                 u8 = 1 << 0;
    pub const TOKEN_NOT_ALLOWED:       u8 = 1 << 1;
    pub const SIZE_EXCEEDED:           u8 = 1 << 2;
    pub const DAILY_LIMIT_EXCEEDED:    u8 = 1 << 3;
    pub const UNAUTHORIZED_AGENT:      u8 = 1 << 4;
    pub const COUNTERPARTY_NOT_ALLOWED: u8 = 1 << 5;
}
