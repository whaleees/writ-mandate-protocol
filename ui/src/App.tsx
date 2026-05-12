import { useEffect, useMemo, useState } from 'react'
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { Keypair, PublicKey } from '@solana/web3.js'
import idl from './idl/mandate_signing.json'

const PROGRAM_ID = new PublicKey('22m5A3ezi2qoBKESrQbQ1g5jwQ9denrwegpSm7yrC9Eh')

interface MandateForm {
  maxTradePct:    string
  dailyVolumePct: string
  expiryDays:     string
  allowedTokens:  string  // newline / comma separated base58
  allowedCps:     string
}

interface RequestForm {
  tokenMint:    string
  counterparty: string
  sizePct:      string
  direction:    'buy' | 'sell'
  targetChain:  string
}

interface SubmittedDecision {
  nonce:        bigint
  request:      RequestForm
  approved:     boolean
  reasons:      string[]
  signature:    string
  decisionPda:  string
}

const DEFAULTS: MandateForm = {
  maxTradePct:    '10',
  dailyVolumePct: '25',
  expiryDays:     '7',
  allowedTokens:  'So11111111111111111111111111111111111111112',
  allowedCps:     'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
}

const REQUEST_DEFAULT: RequestForm = {
  tokenMint:    'So11111111111111111111111111111111111111112',
  counterparty: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  sizePct:      '5',
  direction:    'buy',
  targetChain:  '0',
}

function parsePubkeyList(raw: string): PublicKey[] {
  return raw
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => new PublicKey(s))
}

function explorerTx(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`
}

function explorerAddr(addr: string) {
  return `https://explorer.solana.com/address/${addr}?cluster=devnet`
}

export default function App() {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()

  const [agent, setAgent] = useState<Keypair>(() => Keypair.generate())
  const [mandateForm, setMandateForm] = useState<MandateForm>(DEFAULTS)
  const [requestForm, setRequestForm] = useState<RequestForm>(REQUEST_DEFAULT)
  const [mandatePda, setMandatePda] = useState<PublicKey | null>(null)
  const [createTx, setCreateTx] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<SubmittedDecision[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)

  // Refresh wallet balance
  useEffect(() => {
    if (!wallet) { setBalance(null); return }
    let cancel = false
    connection.getBalance(wallet.publicKey).then(b => { if (!cancel) setBalance(b / 1e9) }).catch(() => {})
    return () => { cancel = true }
  }, [wallet, connection, decisions.length, mandatePda])

  const nextNonce = useMemo(() => BigInt(decisions.length), [decisions.length])

  const handleCreateMandate = async () => {
    if (!wallet) return
    setBusy(true); setError(null)
    try {
      const anchor   = await import('@anchor-lang/core')
      const { MandateClient } = await import('@sdk/index')

      const provider = new anchor.AnchorProvider(connection, wallet as any, { commitment: 'confirmed' })
      const program  = new anchor.Program(idl as any, provider)
      const client   = new MandateClient(program as any, PROGRAM_ID)

      const maxBps   = Math.round(parseFloat(mandateForm.maxTradePct) * 100)
      const dailyBps = Math.round(parseFloat(mandateForm.dailyVolumePct) * 100)
      const expiry   = Math.floor(Date.now() / 1000) + parseInt(mandateForm.expiryDays) * 86400
      const tokens   = parsePubkeyList(mandateForm.allowedTokens)
      const cps      = parsePubkeyList(mandateForm.allowedCps)

      if (tokens.length > 8) throw new Error('Max 8 allowed tokens')
      if (cps.length > 4)    throw new Error('Max 4 allowed counterparties')

      const dwalletId = Keypair.generate().publicKey

      const { signature, mandatePda: pda } = await client.createMandate(
        { publicKey: wallet.publicKey } as any,
        agent.publicKey,
        {
          maxTradeSizeBps:       maxBps,
          dailyVolumeLimitBps:   dailyBps,
          expiryTimestamp:       expiry,
          allowedTokenMints:     tokens,
          allowedCounterparties: cps,
          dwalletId,
        },
      )
      setMandatePda(pda)
      setCreateTx(signature)
      setDecisions([])
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleSubmitRequest = async () => {
    if (!wallet || !mandatePda) return
    setBusy(true); setError(null)
    try {
      const anchor   = await import('@anchor-lang/core')
      const { MandateClient, TradeDirection, describeRejection } = await import('@sdk/index')

      const provider = new anchor.AnchorProvider(connection, wallet as any, { commitment: 'confirmed' })
      const program  = new anchor.Program(idl as any, provider)
      const client   = new MandateClient(program as any, PROGRAM_ID)

      const sizeBps = Math.round(parseFloat(requestForm.sizePct) * 100)
      const tokenMint    = new PublicKey(requestForm.tokenMint)
      const counterparty = new PublicKey(requestForm.counterparty)
      const targetChain  = parseInt(requestForm.targetChain) || 0
      const direction    = requestForm.direction === 'buy' ? TradeDirection.Buy : TradeDirection.Sell

      const agentWallet = { publicKey: agent.publicKey, payer: agent } as any
      const result = await client.submitRequest(
        agentWallet,
        mandatePda,
        { tokenMint, counterparty, sizeBps, direction, targetChain },
        nextNonce,
        wallet.publicKey,
      )

      const log = await client.fetchDecisionLog(result.decisionLogPda)
      setDecisions(prev => [...prev, {
        nonce:       nextNonce,
        request:     { ...requestForm },
        approved:    result.approved,
        reasons:     describeRejection(log.rejectionFlags),
        signature:   result.signature,
        decisionPda: result.decisionLogPda.toBase58(),
      }])
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleReset = () => {
    setMandatePda(null)
    setCreateTx(null)
    setDecisions([])
    setAgent(Keypair.generate())
    setError(null)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10 md:px-12 md:py-14">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="border-b border-slate-800 pb-7">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Tag color="purple" label="ENCRYPT" />
                <Tag color="blue"   label="IKA" />
                <Tag color="slate"  label="SOLANA DEVNET" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight leading-snug">
                Private Mandate-Gated Signing
              </h1>
              <p className="mt-2.5 text-slate-400 text-sm leading-relaxed max-w-2xl">
                Define a mandate, then submit transaction requests as the agent.
                Compliant requests are approved and signed by Ika. Non-compliant
                requests are rejected before any signature is produced — every
                decision is logged on-chain.
              </p>
            </div>
            <div className="shrink-0">
              <WalletMultiButton />
              {balance !== null && (
                <div className="text-right text-xs text-slate-500 mt-1.5 font-mono">
                  {balance.toFixed(4)} SOL
                </div>
              )}
            </div>
          </div>
        </div>

        {!wallet && (
          <Notice>
            Connect a Phantom or Solflare wallet (set to Devnet) to begin.
            You'll need a small amount of devnet SOL — get some from{' '}
            <a className="underline" href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>.
          </Notice>
        )}

        {error && (
          <div className="rounded-lg bg-red-950/50 border border-red-900 px-5 py-4 text-sm font-mono">
            <div className="text-red-300 font-semibold mb-1">Error</div>
            <div className="text-red-400 break-all">{error}</div>
          </div>
        )}

        {/* Mandate form */}
        {wallet && !mandatePda && (
          <Section title="1. Define the mandate">
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Max trade size (% of portfolio)">
                <Input value={mandateForm.maxTradePct}
                  onChange={v => setMandateForm({ ...mandateForm, maxTradePct: v })} />
              </Field>
              <Field label="Daily volume limit (%)">
                <Input value={mandateForm.dailyVolumePct}
                  onChange={v => setMandateForm({ ...mandateForm, dailyVolumePct: v })} />
              </Field>
              <Field label="Expires in (days)">
                <Input value={mandateForm.expiryDays}
                  onChange={v => setMandateForm({ ...mandateForm, expiryDays: v })} />
              </Field>
            </div>
            <Field label="Allowed token mints (one per line, max 8 — leave blank for no restriction)">
              <Textarea rows={3} value={mandateForm.allowedTokens}
                onChange={v => setMandateForm({ ...mandateForm, allowedTokens: v })} />
            </Field>
            <Field label="Allowed counterparties / DEX programs (one per line, max 4)">
              <Textarea rows={2} value={mandateForm.allowedCps}
                onChange={v => setMandateForm({ ...mandateForm, allowedCps: v })} />
            </Field>
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-500 font-mono">
                Agent identity: {agent.publicKey.toBase58().slice(0, 8)}…{agent.publicKey.toBase58().slice(-6)}
              </div>
              <button onClick={handleCreateMandate} disabled={busy}
                className="bg-slate-100 hover:bg-white disabled:opacity-50 text-slate-900 font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors">
                {busy ? 'Creating…' : 'Create Mandate'}
              </button>
            </div>
          </Section>
        )}

        {/* Mandate summary */}
        {mandatePda && (
          <Section title="Active mandate">
            <Kv k="Owner"        v={wallet!.publicKey.toBase58()} link={explorerAddr(wallet!.publicKey.toBase58())} />
            <Kv k="Agent"        v={agent.publicKey.toBase58()} />
            <Kv k="Mandate PDA"  v={mandatePda.toBase58()} link={explorerAddr(mandatePda.toBase58())} />
            <Kv k="Max trade"    v={`${mandateForm.maxTradePct}%`} />
            <Kv k="Daily limit"  v={`${mandateForm.dailyVolumePct}%`} />
            <Kv k="Expires in"   v={`${mandateForm.expiryDays} day(s)`} />
            {createTx && <Kv k="Create tx" v={createTx} link={explorerTx(createTx)} />}
            <div className="pt-3">
              <button onClick={handleReset}
                className="text-xs text-slate-400 hover:text-slate-200 underline">
                Reset and create a new mandate
              </button>
            </div>
          </Section>
        )}

        {/* Request form */}
        {mandatePda && (
          <Section title="2. Submit a transaction request">
            <div className="text-xs text-slate-500 mb-4">
              Try a compliant request, then try changing the size, token mint, or
              counterparty to see how the mandate decides.
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Token mint">
                <Input value={requestForm.tokenMint}
                  onChange={v => setRequestForm({ ...requestForm, tokenMint: v })} />
              </Field>
              <Field label="Counterparty / DEX">
                <Input value={requestForm.counterparty}
                  onChange={v => setRequestForm({ ...requestForm, counterparty: v })} />
              </Field>
              <Field label="Size (% of portfolio)">
                <Input value={requestForm.sizePct}
                  onChange={v => setRequestForm({ ...requestForm, sizePct: v })} />
              </Field>
              <Field label="Direction">
                <select value={requestForm.direction}
                  onChange={e => setRequestForm({ ...requestForm, direction: e.target.value as 'buy' | 'sell' })}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100">
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </Field>
              <Field label="Target chain (0=Solana, 1=Ethereum, 2=BNB)">
                <Input value={requestForm.targetChain}
                  onChange={v => setRequestForm({ ...requestForm, targetChain: v })} />
              </Field>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={handleSubmitRequest} disabled={busy}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors">
                {busy ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </Section>
        )}

        {/* Decisions log */}
        {decisions.length > 0 && (
          <Section title="3. Decisions">
            <div className="space-y-3">
              {decisions.map(d => (
                <DecisionRow key={d.nonce.toString()} d={d} />
              ))}
            </div>
          </Section>
        )}

      </div>
    </div>
  )
}

function DecisionRow({ d }: { d: SubmittedDecision }) {
  const approved = d.approved
  return (
    <div className={`rounded-lg border px-4 py-3 ${approved
      ? 'bg-emerald-950/30 border-emerald-900'
      : 'bg-red-950/30 border-red-900'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wider ${approved ? 'text-emerald-400' : 'text-red-400'}`}>
            #{d.nonce.toString()} · {approved ? 'Approved' : 'Rejected'}
          </span>
          {approved && (
            <span className="text-[10px] text-emerald-500 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-900">
              Ika signature produced
            </span>
          )}
        </div>
        <a href={explorerTx(d.signature)} target="_blank" rel="noreferrer"
          className="text-[10px] text-slate-500 hover:text-slate-300 font-mono">
          tx ↗
        </a>
      </div>
      <div className="text-xs text-slate-400 font-mono space-y-0.5">
        <div>size:  {d.request.sizePct}%</div>
        <div>token: {d.request.tokenMint.slice(0, 12)}…</div>
        <div>cp:    {d.request.counterparty.slice(0, 12)}…</div>
        <div>dir:   {d.request.direction} · chain {d.request.targetChain}</div>
      </div>
      {!approved && d.reasons.length > 0 && (
        <div className="mt-2 text-xs text-red-300">
          {d.reasons.map((r, i) => <div key={i}>• {r}</div>)}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-slate-400">{label}</div>
      {children}
    </div>
  )
}

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-slate-600" />
  )
}

function Textarea({ value, onChange, rows }: { value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
      className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-slate-600" />
  )
}

function Kv({ k, v, link }: { k: string; v: string; link?: string }) {
  return (
    <div className="flex items-baseline gap-3 text-xs">
      <div className="text-slate-500 w-28 shrink-0">{k}</div>
      {link
        ? <a href={link} target="_blank" rel="noreferrer" className="font-mono text-slate-300 hover:text-blue-300 break-all">{v}</a>
        : <div className="font-mono text-slate-300 break-all">{v}</div>}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-blue-950/30 border border-blue-900 px-5 py-4 text-sm text-blue-200">
      {children}
    </div>
  )
}

function Tag({ color, label }: { color: 'purple' | 'blue' | 'slate'; label: string }) {
  const cls = {
    purple: 'bg-purple-950 text-purple-400 border-purple-800',
    blue:   'bg-blue-950 text-blue-400 border-blue-800',
    slate:  'bg-slate-800 text-slate-400 border-slate-700',
  }[color]
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold border tracking-widest ${cls}`}>
      {label}
    </span>
  )
}
