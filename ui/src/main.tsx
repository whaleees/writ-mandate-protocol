import { Buffer } from 'buffer'
// @ts-ignore
if (typeof window !== 'undefined') window.Buffer = window.Buffer ?? Buffer

import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { ConnectionProvider as _ConnectionProvider, WalletProvider as _WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider as _WalletModalProvider } from '@solana/wallet-adapter-react-ui'

const ConnectionProvider:    any = _ConnectionProvider
const WalletProvider:        any = _WalletProvider
const WalletModalProvider:   any = _WalletModalProvider
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

import '@solana/wallet-adapter-react-ui/styles.css'
import './index.css'
import App from './App'

function Root() {
  const endpoint = useMemo(() => clusterApiUrl('devnet'), [])
  const wallets  = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
