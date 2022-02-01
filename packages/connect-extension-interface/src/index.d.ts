export interface Chain {
  sendJsonRpc(rpc: string): void
  remove(): void
}

export interface AddChainOptions {
  chainSpec: string
  potentialRelayChains?: Chain[]
  jsonRpcCallback?: (response: string) => void
}

export interface AddWellKnonwChainOptions {
  name: string
  jsonRpcCallback?: (response: string) => void
}

declare global {
  interface Window {
    substrateSmoldotAddChain?: (options: AddChainOptions) => Promise<Chain>
    substrateSmoldotAddWellKnownChain?: (
      options: AddWellKnonwChainOptions,
    ) => Promise<Chain>
  }
}
