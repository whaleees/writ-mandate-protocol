# mandate-signing

Private mandate-gated signing for autonomous financial agents.

Agents never hold private keys. A user defines an encrypted mandate — allowed
markets, max trade size, daily volume cap, expiry — stored on Solana via
Encrypt's FHE infrastructure. Every agent request is evaluated against the
mandate before Ika's dWallet MPC network produces a signature. A compromised
LLM router can alter a request; it cannot bypass the mandate.

## Pre-alpha status

**Ika:** single mock signer. The dWallet interface and CPI structure are
production-correct. Real threshold MPC activates at Ika mainnet.

**Encrypt:** values stored as plaintext `u64` with the production `EUint64`
interface, consistent with Encrypt's documented pre-alpha behavior. Full FHE
evaluation over ciphertexts activates at Encrypt mainnet — no code changes
required.

***

## Project structure

```
mandate-signing/
│
├── programs/mandate-signing/          # On-chain Solana program (Rust / Anchor)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                     # Program entry point and instruction dispatch
│       ├── instructions/
│       │   ├── create_mandate.rs      # CreateMandate instruction — stores encrypted limits
│       │   └── submit_request.rs      # SubmitRequest — evaluates mandate and triggers Ika
│       ├── instructions.rs            # Module declarations and re-exports
│       ├── state.rs                   # Account types: Mandate, DailyUsage, DecisionLog
│       ├── encrypt.rs                 # Encrypt FHE interface (EUint64 ops)
│       ├── ika.rs                     # Ika dWallet signing interface
│       ├── error.rs                   # Program error codes
│       └── constants.rs               # PDA seeds
│   └── tests/
│       └── test_mandate.rs            # Integration tests using LiteSVM (6 tests)
│
├── sdk/                               # TypeScript client library
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                   # Public exports
│       ├── client.ts                  # MandateClient — createMandate, submitRequest, fetch helpers
│       └── types.ts                   # Shared types, enums, rejection flag helpers
│
├── demo/                              # End-to-end demo against a local validator
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── demo.ts                    # Three scenarios: valid request, router attack, daily limit
│
├── migrations/
│   └── deploy.ts                      # Anchor deployment script
│
├── Anchor.toml                        # Anchor workspace config (program IDs, cluster, scripts)
├── Cargo.toml                         # Rust workspace manifest
├── package.json                       # JS workspace root (build, test, demo scripts)
├── tsconfig.json                      # Root TypeScript config (IDE baseline)
└── rust-toolchain.toml                # Pinned Rust toolchain
```

***

## Quick start

**Prerequisites:** Rust (via `rust-toolchain.toml`), Anchor CLI, Solana CLI, Node.js 18+.

### Build and test (Rust)

```Shell
# Build the on-chain program
anchor build

# Run all integration tests (LiteSVM — no validator required)
cargo test
```

### Run the demo

```Shell
# Start a local validator in a separate terminal
solana-test-validator

# Deploy the program
anchor deploy

# Run the end-to-end demo (three scenarios)
npm run demo
```

The demo prints three scenarios side by side:

1. A valid agent request — approved, Ika signing initiated.
2. A router-injected request — rejected before any signature is produced.
3. Daily volume accumulation — third trade rejected when the daily cap is hit.

### Build the SDK

```Shell
cd sdk && npm install && npm run build
```

***

## Core accounts

| Account       | PDA seeds                           | Purpose                               |
| ------------- | ----------------------------------- | ------------------------------------- |
| `Mandate`     | `[b"mandate", owner, agent]`        | Stores encrypted limits for one agent |
| `DailyUsage`  | `[b"daily_usage", mandate, day]`    | Tracks volume consumed today          |
| `DecisionLog` | `[b"decision_log", mandate, nonce]` | Immutable record of every evaluation  |

## Mandate constraints

| Field                    | Type      | Check                             |
| ------------------------ | --------- | --------------------------------- |
| `max_trade_size_bps`     | `EUint64` | `requested <= max`                |
| `daily_volume_limit_bps` | `EUint64` | `used + requested <= daily_limit` |
| `expiry_timestamp`       | `EUint64` | `now <= expiry`                   |
| `allowed_markets_mask`   | `EUint64` | bitmask bit-test                  |

