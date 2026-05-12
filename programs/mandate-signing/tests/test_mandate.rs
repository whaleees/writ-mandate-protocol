use {
    anchor_lang::{
        solana_program::instruction::Instruction, AccountDeserialize, InstructionData,
        ToAccountMetas,
    },
    litesvm::LiteSVM,
    mandate_signing::{
        accounts,
        constants::{DAILY_USAGE_SEED, DECISION_LOG_SEED, MANDATE_SEED},
        instruction,
        instructions::{CreateMandateArgs, TransactionRequest},
        state::{rejection, DecisionLog, Mandate, TradeDirection},
    },
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};
use anchor_lang::solana_program::pubkey::Pubkey;

const PROGRAM_ID: Pubkey = mandate_signing::ID;

// Deterministic test mints — byte values chosen for readability, not real mints.
const SOL_USDC_MINT: Pubkey = Pubkey::new_from_array([1u8; 32]);
const ETH_USDC_MINT: Pubkey = Pubkey::new_from_array([2u8; 32]); // not in default allowlist
const ALLOWED_DEX:   Pubkey = Pubkey::new_from_array([10u8; 32]);
const UNKNOWN_PROG:  Pubkey = Pubkey::new_from_array([99u8; 32]); // not in default allowlist

fn setup() -> (LiteSVM, Keypair, Keypair) {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/mandate_signing.so");
    svm.add_program(PROGRAM_ID, bytes).unwrap();

    let owner = Keypair::new();
    let agent = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&agent.pubkey(), 10_000_000_000).unwrap();

    (svm, owner, agent)
}

fn mandate_pda(owner: &Pubkey, agent: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[MANDATE_SEED, owner.as_ref(), agent.as_ref()],
        &PROGRAM_ID,
    )
}

fn daily_usage_pda(mandate: &Pubkey, day: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[DAILY_USAGE_SEED, mandate.as_ref(), &day.to_le_bytes()],
        &PROGRAM_ID,
    )
}

fn decision_log_pda(mandate: &Pubkey, nonce: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[DECISION_LOG_SEED, mandate.as_ref(), &nonce.to_le_bytes()],
        &PROGRAM_ID,
    )
}

fn send_ix(
    svm: &mut LiteSVM,
    ix: Instruction,
    signers: Vec<&Keypair>,
) -> litesvm::types::TransactionResult {
    let blockhash = svm.latest_blockhash();
    let payer = signers[0].pubkey();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
    svm.send_transaction(tx)
}

/// Creates a mandate: SOL/USDC mint only, ALLOWED_DEX counterparty only,
/// max 10% trade, 25% daily, never expires.
fn create_test_mandate(svm: &mut LiteSVM, owner: &Keypair, agent: &Keypair) -> Pubkey {
    let dwallet_id = Pubkey::new_unique();
    let (mandate_pda, _) = mandate_pda(&owner.pubkey(), &agent.pubkey());

    let args = CreateMandateArgs {
        max_trade_size_bps:     1_000,
        daily_volume_limit_bps: 2_500,
        expiry_timestamp:       u64::MAX,
        allowed_token_mints:    vec![SOL_USDC_MINT.to_bytes()],
        allowed_counterparties: vec![ALLOWED_DEX.to_bytes()],
        dwallet_id,
    };

    let ix = Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::CreateMandate { args }.data(),
        accounts::CreateMandate {
            owner: owner.pubkey(),
            agent: agent.pubkey(),
            mandate: mandate_pda,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    );

    send_ix(svm, ix, vec![owner]).expect("create_mandate should succeed");
    mandate_pda
}

fn current_day() -> u64 {
    // litesvm initialises clock.unix_timestamp to 0, so day = 0 / 86400 = 0.
    0
}

fn submit(
    svm: &mut LiteSVM,
    agent: &Keypair,
    mandate: &Pubkey,
    request: TransactionRequest,
    nonce: u64,
) -> litesvm::types::TransactionResult {
    let day = current_day();
    let (daily_usage, _)  = daily_usage_pda(mandate, day);
    let (decision_log, _) = decision_log_pda(mandate, nonce);

    let ix = Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::SubmitRequest { request, request_nonce: nonce, day }.data(),
        accounts::SubmitRequest {
            agent:         agent.pubkey(),
            mandate:       *mandate,
            daily_usage,
            decision_log,
            fee_payer:     agent.pubkey(),
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    );

    send_ix(svm, ix, vec![agent])
}

fn fetch_decision_log(svm: &LiteSVM, mandate: &Pubkey, nonce: u64) -> DecisionLog {
    let (pda, _) = decision_log_pda(mandate, nonce);
    let data = svm.get_account(&pda).unwrap().data;
    DecisionLog::try_deserialize(&mut &data[..]).unwrap()
}

fn valid_request(size_bps: u64) -> TransactionRequest {
    TransactionRequest {
        token_mint:   SOL_USDC_MINT,
        counterparty: ALLOWED_DEX,
        size_bps,
        direction:    TradeDirection::Buy,
        target_chain: 0,
    }
}

// --- Tests ---

#[test]
fn test_create_mandate() {
    let (mut svm, owner, agent) = setup();
    let pda = create_test_mandate(&mut svm, &owner, &agent);

    let account = svm.get_account(&pda).unwrap();
    let mandate = Mandate::try_deserialize(&mut &account.data[..]).unwrap();

    assert_eq!(mandate.owner, owner.pubkey());
    assert_eq!(mandate.agent, agent.pubkey());
    assert_eq!(mandate.max_trade_size_bps, 1_000);
    assert_eq!(mandate.daily_volume_limit_bps, 2_500);
    assert_eq!(mandate.allowed_token_count, 1);
    assert_eq!(mandate.allowed_token_mints[0], SOL_USDC_MINT.to_bytes());
    assert_eq!(mandate.allowed_counterparty_count, 1);
    assert_eq!(mandate.allowed_counterparties[0], ALLOWED_DEX.to_bytes());
}

#[test]
fn test_valid_request_approved() {
    let (mut svm, owner, agent) = setup();
    let mandate = create_test_mandate(&mut svm, &owner, &agent);

    submit(&mut svm, &agent, &mandate, valid_request(500), 0).unwrap();

    let log = fetch_decision_log(&svm, &mandate, 0);
    assert!(log.approved);
    assert_eq!(log.rejection_flags, 0);
}

#[test]
fn test_router_attack_rejected() {
    let (mut svm, owner, agent) = setup();
    let mandate = create_test_mandate(&mut svm, &owner, &agent);

    // Router changed mint to ETH/USDC (not allowed) and inflated size to 30%.
    let injected = TransactionRequest {
        token_mint:   ETH_USDC_MINT,
        counterparty: UNKNOWN_PROG,
        size_bps:     3_000,
        direction:    TradeDirection::Buy,
        target_chain: 1,
    };

    submit(&mut svm, &agent, &mandate, injected, 0).unwrap();

    let log = fetch_decision_log(&svm, &mandate, 0);
    assert!(!log.approved);
    assert!(log.rejection_flags & rejection::TOKEN_NOT_ALLOWED       != 0);
    assert!(log.rejection_flags & rejection::SIZE_EXCEEDED            != 0);
    assert!(log.rejection_flags & rejection::COUNTERPARTY_NOT_ALLOWED != 0);
}

#[test]
fn test_token_not_in_allowlist_rejected() {
    let (mut svm, owner, agent) = setup();
    let mandate = create_test_mandate(&mut svm, &owner, &agent);

    let request = TransactionRequest {
        token_mint:   ETH_USDC_MINT, // not allowed
        counterparty: ALLOWED_DEX,
        size_bps:     500,
        direction:    TradeDirection::Buy,
        target_chain: 0,
    };

    submit(&mut svm, &agent, &mandate, request, 0).unwrap();
    let log = fetch_decision_log(&svm, &mandate, 0);
    assert!(!log.approved);
    assert!(log.rejection_flags & rejection::TOKEN_NOT_ALLOWED != 0);
    assert_eq!(log.rejection_flags & rejection::COUNTERPARTY_NOT_ALLOWED, 0);
}

#[test]
fn test_counterparty_not_in_allowlist_rejected() {
    let (mut svm, owner, agent) = setup();
    let mandate = create_test_mandate(&mut svm, &owner, &agent);

    let request = TransactionRequest {
        token_mint:   SOL_USDC_MINT,
        counterparty: UNKNOWN_PROG, // not allowed
        size_bps:     500,
        direction:    TradeDirection::Buy,
        target_chain: 0,
    };

    submit(&mut svm, &agent, &mandate, request, 0).unwrap();
    let log = fetch_decision_log(&svm, &mandate, 0);
    assert!(!log.approved);
    assert!(log.rejection_flags & rejection::COUNTERPARTY_NOT_ALLOWED != 0);
    assert_eq!(log.rejection_flags & rejection::TOKEN_NOT_ALLOWED, 0);
}

#[test]
fn test_no_counterparty_restriction() {
    // A mandate with empty counterparty list should allow any counterparty.
    let (mut svm, owner, agent) = setup();
    let dwallet_id = Pubkey::new_unique();
    let (mandate_pda, _) = mandate_pda(&owner.pubkey(), &agent.pubkey());

    let args = CreateMandateArgs {
        max_trade_size_bps:     1_000,
        daily_volume_limit_bps: 2_500,
        expiry_timestamp:       u64::MAX,
        allowed_token_mints:    vec![SOL_USDC_MINT.to_bytes()],
        allowed_counterparties: vec![], // no restriction
        dwallet_id,
    };

    let ix = Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::CreateMandate { args }.data(),
        accounts::CreateMandate {
            owner: owner.pubkey(),
            agent: agent.pubkey(),
            mandate: mandate_pda,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    );
    send_ix(&mut svm, ix, vec![&owner]).unwrap();

    let request = TransactionRequest {
        token_mint:   SOL_USDC_MINT,
        counterparty: UNKNOWN_PROG, // any counterparty — no restriction
        size_bps:     500,
        direction:    TradeDirection::Buy,
        target_chain: 0,
    };

    submit(&mut svm, &agent, &mandate_pda, request, 0).unwrap();
    assert!(fetch_decision_log(&svm, &mandate_pda, 0).approved);
}

#[test]
fn test_daily_volume_accumulates() {
    let (mut svm, owner, agent) = setup();
    let mandate = create_test_mandate(&mut svm, &owner, &agent);

    submit(&mut svm, &agent, &mandate, valid_request(1_000), 0).unwrap();
    submit(&mut svm, &agent, &mandate, valid_request(1_000), 1).unwrap();
    assert!(fetch_decision_log(&svm, &mandate, 1).approved, "20% total should be under 25% limit");

    submit(&mut svm, &agent, &mandate, valid_request(1_000), 2).unwrap();
    let log = fetch_decision_log(&svm, &mandate, 2);
    assert!(!log.approved, "30% total should exceed 25% daily limit");
    assert!(log.rejection_flags & rejection::DAILY_LIMIT_EXCEEDED != 0);
}

#[test]
fn test_trade_size_limit() {
    let (mut svm, owner, agent) = setup();
    let mandate = create_test_mandate(&mut svm, &owner, &agent);

    submit(&mut svm, &agent, &mandate, valid_request(1_000), 0).unwrap();
    assert!(fetch_decision_log(&svm, &mandate, 0).approved, "exactly at max should pass");

    submit(&mut svm, &agent, &mandate, valid_request(1_001), 1).unwrap();
    let log = fetch_decision_log(&svm, &mandate, 1);
    assert!(!log.approved);
    assert!(log.rejection_flags & rejection::SIZE_EXCEEDED != 0);
}

#[test]
fn test_unauthorized_agent_rejected() {
    let (mut svm, owner, agent) = setup();
    let mandate = create_test_mandate(&mut svm, &owner, &agent);

    let impersonator = Keypair::new();
    svm.airdrop(&impersonator.pubkey(), 10_000_000_000).unwrap();

    let day = current_day();
    let (daily_usage, _)  = daily_usage_pda(&mandate, day);
    let (decision_log, _) = decision_log_pda(&mandate, 99);

    let ix = Instruction::new_with_bytes(
        PROGRAM_ID,
        &instruction::SubmitRequest {
            request: valid_request(100),
            request_nonce: 99,
            day,
        }
        .data(),
        accounts::SubmitRequest {
            agent:         impersonator.pubkey(),
            mandate,
            daily_usage,
            decision_log,
            fee_payer:     impersonator.pubkey(),
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    );

    let result = send_ix(&mut svm, ix, vec![&impersonator]);
    assert!(result.is_err(), "impersonator must be rejected at constraint level");
}
