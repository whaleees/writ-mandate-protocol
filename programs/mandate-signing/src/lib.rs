pub mod constants;
pub mod encrypt;
pub mod error;
pub mod ika;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("22m5A3ezi2qoBKESrQbQ1g5jwQ9denrwegpSm7yrC9Eh");

#[program]
pub mod mandate_signing {
    use super::*;

    /// Create a mandate defining what an agent is allowed to sign.
    pub fn create_mandate(ctx: Context<CreateMandate>, args: CreateMandateArgs) -> Result<()> {
        instructions::create_mandate::handler(ctx, args)
    }

    /// Submit a transaction request for mandate evaluation.
    /// If approved, Ika produces a signature for the target chain.
    /// Every decision is logged on-chain regardless of outcome.
    pub fn submit_request(
        ctx: Context<SubmitRequest>,
        request: TransactionRequest,
        request_nonce: u64,
        day: u64,
    ) -> Result<()> {
        instructions::submit_request::handler(ctx, request, request_nonce, day)
    }
}
