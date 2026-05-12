/// Encrypt pre-alpha FHE interface.
///
/// Production: EUint64/EAddress are ciphertexts; arithmetic and comparisons run
/// over ciphertexts with no party learning the plaintext values. Ika never sees
/// the mandate limits during evaluation.
///
/// Pre-alpha (per Encrypt's documented behavior): values stored as plaintext.
/// The same code runs with full FHE guarantees when Encrypt reaches mainnet —
/// no interface changes required.

use anchor_lang::prelude::Pubkey;
use crate::state::{EAddress, EUint64};

/// Encrypted comparison: a <= b → EBool.
/// Pre-alpha: plaintext u64 <=.
#[inline(always)]
pub fn euint64_lte(a: EUint64, b: EUint64) -> bool {
    a <= b
}

/// Encrypted addition: a + b → EUint64.
/// Pre-alpha: saturating plaintext add.
#[inline(always)]
pub fn euint64_add(a: EUint64, b: EUint64) -> EUint64 {
    a.saturating_add(b)
}

/// Encrypted equality: plaintext_addr == encrypted_addr → EBool.
/// Used for set-membership checks against EAddress allowlists.
/// Pre-alpha: plaintext Pubkey bytes == [u8; 32] comparison.
/// Production: FHE equality over 256-bit EAddress ciphertexts — the stored
/// allowlist values are never revealed.
#[inline(always)]
pub fn eaddress_eq(plaintext: &Pubkey, encrypted: &EAddress) -> bool {
    plaintext.to_bytes() == *encrypted
}
