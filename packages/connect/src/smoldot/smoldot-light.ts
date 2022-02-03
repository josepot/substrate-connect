/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { Chain } from "@substrate/connect-extension-interface"
import type {
  Chain as SChain,
  Client,
  ClientOptions,
} from "@substrate/smoldot-light"
import { getSpec, SupportedChains } from "../specs/index.js"

let startPromise: Promise<(options: ClientOptions) => Client> | null = null
const getStart = () => {
  if (startPromise) return startPromise
  return (startPromise = import("@substrate/smoldot-light").then(
    (sm) => sm.start,
  ))
}

let clientPromise: Promise<Client> | null = null
const getClient = (): Promise<Client> => {
  if (clientPromise) return clientPromise
  return (clientPromise = getStart().then((start) =>
    start({
      forbidNonLocalWs: true, // Prevents browsers from emitting warnings if smoldot tried to establish non-secure WebSocket connections
      maxLogLevel: 3 /* no debug/trace messages */,
    }),
  ))
}

let refCount = 0
const decreaseRefCount = () => {
  if (--refCount === 0) {
    clientPromise!.then((c) => c.terminate())
    clientPromise = null
  }
}

export const addChain = async (
  chainSpec: string,
  potentialRelayChains: Chain[] = [],
  jsonRpcCallback?: (msg: string) => void,
): Promise<Chain> => {
  const client = await getClient()
  refCount++
  try {
    const chain = await client.addChain({
      chainSpec,
      potentialRelayChains: potentialRelayChains as SChain[],
      jsonRpcCallback,
    })
    const originalRemove = chain.remove.bind(chain)
    chain.remove = () => {
      originalRemove()
      decreaseRefCount()
    }
    return chain
  } catch (e) {
    decreaseRefCount()
    throw e
  }
}

export const addWellKnownChain = async (
  supposedChain: SupportedChains,
  jsonRpcCallback?: (msg: string) => void,
): Promise<Chain> => {
  // the following line ensures that the http request for the dynamic import
  // of smoldot-light and the request for the dynamic import of the spec
  // happen in parallel
  getClient()
  const spec = await getSpec(supposedChain)
  return await addChain(spec, [], jsonRpcCallback)
}
