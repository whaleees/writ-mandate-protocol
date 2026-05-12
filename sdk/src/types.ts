import type { PublicKey } from "@solana/web3.js";

export enum TradeDirection {
  Buy  = 0,
  Sell = 1,
}

export interface CreateMandateArgs {
  /** Max single trade size as basis points (1000 = 10%). EUint64. */
  maxTradeSizeBps: number;
  /** Daily volume cap as basis points (2500 = 25%). EUint64. */
  dailyVolumeLimitBps: number;
  /** Unix timestamp this mandate expires. EUint64. */
  expiryTimestamp: number;
  /** Encrypted token mint allowlist (EAddress). Max 8. Empty = no restriction. */
  allowedTokenMints: PublicKey[];
  /** Encrypted counterparty allowlist (EAddress). Max 4. Empty = no restriction. */
  allowedCounterparties: PublicKey[];
  /** Ika dWallet controlled by this mandate. */
  dwalletId: PublicKey;
}

export interface TransactionRequest {
  /** Token mint being traded — checked against mandate's encrypted allowlist. */
  tokenMint: PublicKey;
  /** Destination address or program — checked against mandate's encrypted counterparty list. */
  counterparty: PublicKey;
  /** Trade size as basis points of portfolio. */
  sizeBps: number;
  direction: TradeDirection;
  /** Target chain (0 = Solana, 1 = Ethereum, …). */
  targetChain: number;
}

export interface MandateAccount {
  owner: PublicKey;
  agent: PublicKey;
  dwalletId: PublicKey;
  maxTradeSizeBps: bigint;
  dailyVolumeLimitBps: bigint;
  expiryTimestamp: bigint;
  allowedTokenMints: number[][];
  allowedTokenCount: number;
  allowedCounterparties: number[][];
  allowedCounterpartyCount: number;
  createdAt: bigint;
  bump: number;
}

export interface DecisionLogAccount {
  mandate: PublicKey;
  slot: bigint;
  timestamp: bigint;
  requestHash: number[];
  approved: boolean;
  rejectionFlags: number;
  bump: number;
}

export const REJECTION_FLAGS = {
  EXPIRED:                  1 << 0,
  TOKEN_NOT_ALLOWED:        1 << 1,
  SIZE_EXCEEDED:            1 << 2,
  DAILY_LIMIT_EXCEEDED:     1 << 3,
  UNAUTHORIZED_AGENT:       1 << 4,
  COUNTERPARTY_NOT_ALLOWED: 1 << 5,
} as const;

export function describeRejection(flags: number): string[] {
  const reasons: string[] = [];
  if (flags & REJECTION_FLAGS.EXPIRED)                  reasons.push("mandate expired");
  if (flags & REJECTION_FLAGS.TOKEN_NOT_ALLOWED)        reasons.push("token mint not in allowed list");
  if (flags & REJECTION_FLAGS.SIZE_EXCEEDED)            reasons.push("trade size exceeds max_trade_size");
  if (flags & REJECTION_FLAGS.DAILY_LIMIT_EXCEEDED)     reasons.push("would exceed daily volume limit");
  if (flags & REJECTION_FLAGS.COUNTERPARTY_NOT_ALLOWED) reasons.push("counterparty not in allowed list");
  return reasons;
}
