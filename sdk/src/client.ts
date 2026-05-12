import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import type { Wallet } from "@anchor-lang/core";
import type { MandateSigning } from "../../target/types/mandate_signing";
import {
  CreateMandateArgs,
  DecisionLogAccount,
  MandateAccount,
  TradeDirection,
  TransactionRequest,
} from "./types";

const MANDATE_SEED      = Buffer.from("mandate");
const DAILY_USAGE_SEED  = Buffer.from("daily_usage");
const DECISION_LOG_SEED = Buffer.from("decision_log");

function dayBuffer(day: bigint): Buffer {
  const buf = Buffer.allocUnsafe(8);
  buf.writeBigUInt64LE(day);
  return buf;
}

function toAnchorDirection(direction: TradeDirection) {
  return direction === TradeDirection.Buy ? { buy: {} } : { sell: {} };
}

export class MandateClient {
  constructor(
    public readonly program: anchor.Program<MandateSigning>,
    public readonly programId: PublicKey,
  ) {}

  mandatePda(owner: PublicKey, agent: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [MANDATE_SEED, owner.toBuffer(), agent.toBuffer()],
      this.programId,
    );
  }

  dailyUsagePda(mandate: PublicKey, day: bigint): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [DAILY_USAGE_SEED, mandate.toBuffer(), dayBuffer(day)],
      this.programId,
    );
  }

  decisionLogPda(mandate: PublicKey, nonce: bigint): [PublicKey, number] {
    const buf = Buffer.allocUnsafe(8);
    buf.writeBigUInt64LE(nonce);
    return PublicKey.findProgramAddressSync(
      [DECISION_LOG_SEED, mandate.toBuffer(), buf],
      this.programId,
    );
  }

  currentDay(): bigint {
    return BigInt(Math.floor(Date.now() / 1000 / 86400));
  }

  async createMandate(
    ownerWallet: Wallet,
    agent: PublicKey,
    args: CreateMandateArgs,
  ): Promise<{ signature: string; mandatePda: PublicKey }> {
    const [mandatePda] = this.mandatePda(ownerWallet.publicKey, agent);

    // Anchor v1.0 auto-resolves mandate PDA (seeds: owner + agent) and systemProgram.
    const signature = await this.program.methods
      .createMandate({
        maxTradeSizeBps:       new anchor.BN(args.maxTradeSizeBps),
        dailyVolumeLimitBps:   new anchor.BN(args.dailyVolumeLimitBps),
        expiryTimestamp:       new anchor.BN(args.expiryTimestamp),
        allowedTokenMints:     args.allowedTokenMints.map(pk => Array.from(pk.toBytes())),
        allowedCounterparties: args.allowedCounterparties.map(pk => Array.from(pk.toBytes())),
        dwalletId: args.dwalletId,
      })
      .accounts({ owner: ownerWallet.publicKey, agent } as any)
      .rpc();

    return { signature, mandatePda };
  }

  async submitRequest(
    agentWallet: Wallet,
    mandatePda: PublicKey,
    request: TransactionRequest,
    nonce: bigint,
    feePayer?: PublicKey,
  ): Promise<{ signature: string; approved: boolean; decisionLogPda: PublicKey }> {
    const day = this.currentDay();
    const [dailyUsagePda]  = this.dailyUsagePda(mandatePda, day);
    const [decisionLogPda] = this.decisionLogPda(mandatePda, nonce);
    const feePayerKey = feePayer ?? agentWallet.publicKey;

    // mandate PDA seeds include mandate.owner (a field, not an arg), so not auto-resolved.
    const signature = await this.program.methods
      .submitRequest(
        {
          tokenMint:    request.tokenMint,
          counterparty: request.counterparty,
          sizeBps:      new anchor.BN(request.sizeBps),
          direction:    toAnchorDirection(request.direction),
          targetChain:  request.targetChain,
        },
        new anchor.BN(nonce.toString()),
        new anchor.BN(day.toString()),
      )
      .accounts({
        agent:       agentWallet.publicKey,
        mandate:     mandatePda,
        dailyUsage:  dailyUsagePda,
        decisionLog: decisionLogPda,
        feePayer:    feePayerKey,
      } as any)
      .signers([(agentWallet as any).payer])
      .rpc();

    const log = await this.fetchDecisionLog(decisionLogPda);
    return { signature, approved: log.approved, decisionLogPda };
  }

  async fetchMandate(mandatePda: PublicKey): Promise<MandateAccount> {
    return this.program.account.mandate.fetch(mandatePda) as unknown as Promise<MandateAccount>;
  }

  async fetchDecisionLog(decisionLogPda: PublicKey): Promise<DecisionLogAccount> {
    return this.program.account.decisionLog.fetch(decisionLogPda) as unknown as Promise<DecisionLogAccount>;
  }
}
