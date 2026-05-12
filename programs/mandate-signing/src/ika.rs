/// Ika dWallet pre-alpha interface.
///
/// Production: approve_message triggers a CPI to the Ika program, which
/// initiates a threshold MPC round across Ika's distributed signing network.
/// No single node can produce a valid signature alone. The mandate program
/// holds one authorization share; Ika's network holds the signing key shards.
///
/// Pre-alpha: single mock signer. The dWallet interface and CPI call structure
/// are correctly implemented. Real threshold MPC activates at Ika mainnet.

use anchor_lang::prelude::*;

/// Signing approval record written to the MessageApproval PDA.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MessageApproval {
    pub dwallet_id: Pubkey,
    pub message_hash: [u8; 32],
    pub approval_slot: u64,
    /// Pre-alpha: zeroed mock bytes. Production: MPC threshold signature.
    pub signature: [u8; 64],
}

/// Initiates signing for `message_hash` via the Ika dWallet.
///
/// Pre-alpha: logs intent and returns a mock approval record.
/// Production: CPI to `ika_program::approve_message(dwallet_id, message_hash)`.
pub fn approve_message(dwallet_id: &Pubkey, message_hash: [u8; 32], slot: u64) -> MessageApproval {
    msg!(
        "Ika pre-alpha: initiating signing for dWallet {} at slot {}",
        dwallet_id,
        slot,
    );
    MessageApproval {
        dwallet_id: *dwallet_id,
        message_hash,
        approval_slot: slot,
        signature: [0u8; 64],
    }
}
