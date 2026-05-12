/**
 * Private Mandate-Gated Signing Demo
 *
 * Demonstrates the core security claim: a malicious LLM router can intercept
 * and modify an agent's transaction request, but the mandate program rejects
 * any request that violates the encrypted mandate — before Ika produces a
 * signature.
 *
 * Prerequisites:
 *   solana-test-validator running locally
 *   anchor build && anchor deploy
 */

import * as anchor from "@anchor-lang/core";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { MandateClient, TradeDirection, describeRejection } from "../../sdk/src";
import type { MandateSigning } from "../../target/types/mandate_signing";
import idl from "../../target/idl/mandate_signing.json";

const PROGRAM_ID = new PublicKey("22m5A3ezi2qoBKESrQbQ1g5jwQ9denrwegpSm7yrC9Eh");
const RPC_URL    = "http://127.0.0.1:8899";

// Simulated token mints — in production these would be real SPL mint addresses.
const SOL_USDC_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const ETH_USDC_MINT = new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs");
const JUPITER_DEX   = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const UNKNOWN_PROG  = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");

const daysFromNow = (n: number) => Math.floor(Date.now() / 1000) + n * 86400;

function banner(title: string) {
  const line = "─".repeat(60);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

async function airdrop(connection: Connection, pubkey: PublicKey, sol: number) {
  const sig = await connection.requestAirdrop(pubkey, sol * 1e9);
  await connection.confirmTransaction(sig, "confirmed");
}

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");

  const owner    = Keypair.generate();
  const agent    = Keypair.generate();
  const dwalletId = Keypair.generate().publicKey;

  console.log("\n=== Private Mandate-Gated Signing Demo ===");
  console.log(`Owner   : ${owner.publicKey.toBase58()}`);
  console.log(`Agent   : ${agent.publicKey.toBase58()}`);
  console.log(`dWallet : ${dwalletId.toBase58()}`);

  console.log("\nFunding wallets...");
  await airdrop(connection, owner.publicKey, 10);
  await airdrop(connection, agent.publicKey, 2);

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(owner),
    { commitment: "confirmed" },
  );
  const program = new anchor.Program<MandateSigning>(
    idl as MandateSigning,
    provider,
  );
  const client = new MandateClient(program, PROGRAM_ID);

  // --- Create mandate ---
  banner("Creating mandate");

  const { signature: createSig, mandatePda } = await client.createMandate(
    new anchor.Wallet(owner),
    agent.publicKey,
    {
      maxTradeSizeBps:      1_000,           // 10% max per trade
      dailyVolumeLimitBps:  2_500,           // 25% daily cap
      expiryTimestamp:      daysFromNow(7),  // 7-day mandate
      allowedTokenMints:    [SOL_USDC_MINT], // SOL/USDC only
      allowedCounterparties: [JUPITER_DEX],  // Jupiter only
      dwalletId,
    },
  );

  console.log(`Mandate PDA : ${mandatePda.toBase58()}`);
  console.log(`Tx          : ${createSig}`);
  console.log("\nMandate limits (stored as EUint64/EAddress ciphertexts via Encrypt):");
  console.log(`  Allowed tokens        : SOL/USDC only`);
  console.log(`  Allowed counterparties: Jupiter DEX only`);
  console.log(`  Max trade size        : 10% of portfolio`);
  console.log(`  Daily volume limit    : 25% of portfolio`);
  console.log(`  Expires               : ${new Date(daysFromNow(7) * 1000).toLocaleString()}`);

  // --- Scenario 1: Valid agent request ---
  banner("Scenario 1 — Valid agent request");
  console.log("Agent submits: SOL/USDC, Jupiter, BUY 5%");

  const result1 = await client.submitRequest(
    new anchor.Wallet(agent),
    mandatePda,
    { tokenMint: SOL_USDC_MINT, counterparty: JUPITER_DEX, sizeBps: 500, direction: TradeDirection.Buy, targetChain: 0 },
    0n,
  );

  if (result1.approved) {
    console.log("  Result: APPROVED ✓");
    console.log("  → Ika dWallet signing initiated");
    console.log("  → Transaction proceeds to target chain");
  } else {
    const log = await client.fetchDecisionLog(result1.decisionLogPda);
    console.log("  Result: REJECTED ✗ (unexpected)");
    describeRejection(log.rejectionFlags).forEach(r => console.log(`  reason: ${r}`));
  }

  // --- Scenario 2: Malicious router attack ---
  banner("Scenario 2 — Malicious router intercepts and modifies request");
  console.log("Original request from agent:");
  console.log("  Token       : SOL/USDC");
  console.log("  Counterparty: Jupiter DEX");
  console.log("  Size        : 5% of portfolio");
  console.log("");
  console.log("Router-injected request:");
  console.log("  Token       : ETH/USDC        ← changed by router");
  console.log("  Counterparty: Unknown program  ← changed by router");
  console.log("  Size        : 30%             ← inflated by router");
  console.log("\nInjected request reaches mandate program...");

  const result2 = await client.submitRequest(
    new anchor.Wallet(agent),
    mandatePda,
    { tokenMint: ETH_USDC_MINT, counterparty: UNKNOWN_PROG, sizeBps: 3_000, direction: TradeDirection.Buy, targetChain: 1 },
    1n,
  );

  if (!result2.approved) {
    const log = await client.fetchDecisionLog(result2.decisionLogPda);
    console.log("  Result: REJECTED ✗");
    describeRejection(log.rejectionFlags).forEach(r => console.log(`  reason: ${r}`));
    console.log("");
    console.log("  → No signature produced. Ika was never called.");
    console.log("  → Attacker controls the router — irrelevant to fund safety.");
    console.log("  → Funds move only when the mandate says so.");
  } else {
    console.log("  Result: APPROVED (unexpected)");
  }

  // --- Scenario 3: Daily volume limit ---
  banner("Scenario 3 — Daily volume limit enforcement");
  console.log("Consuming daily limit with 10% trades...");

  const r2 = await client.submitRequest(new anchor.Wallet(agent), mandatePda,
    { tokenMint: SOL_USDC_MINT, counterparty: JUPITER_DEX, sizeBps: 1_000, direction: TradeDirection.Buy, targetChain: 0 }, 2n);
  console.log(`  Trade (10%): ${r2.approved ? "APPROVED ✓" : "REJECTED ✗"}`);

  const r3 = await client.submitRequest(new anchor.Wallet(agent), mandatePda,
    { tokenMint: SOL_USDC_MINT, counterparty: JUPITER_DEX, sizeBps: 1_000, direction: TradeDirection.Buy, targetChain: 0 }, 3n);
  console.log(`  Trade (10%): ${r3.approved ? "APPROVED ✓" : "REJECTED ✗"}`);

  // Total now 5+10+10 = 25% — at the limit. Next 6% tips it over.
  const r4 = await client.submitRequest(new anchor.Wallet(agent), mandatePda,
    { tokenMint: SOL_USDC_MINT, counterparty: JUPITER_DEX, sizeBps: 600, direction: TradeDirection.Buy, targetChain: 0 }, 4n);
  if (!r4.approved) {
    const log = await client.fetchDecisionLog(r4.decisionLogPda);
    console.log(`  Trade  (6%): REJECTED ✗`);
    describeRejection(log.rejectionFlags).forEach(r => console.log(`  reason: ${r}`));
    console.log("  → Daily volume limit enforced automatically.");
  }

  banner("Demo complete");
  console.log("  Agent never held a private key.");
  console.log("  Router controlled by attacker — irrelevant to fund safety.");
  console.log("  Mandate evaluated by math, not by a company's promise.");
  console.log("  Every decision logged on-chain with an immutable audit trail.\n");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
