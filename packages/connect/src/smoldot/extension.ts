/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { Chain } from "@substrate/connect-extension-interface"
import { SupportedChains } from "../specs/index.js"

export const addChain = async (
  chainSpec: string,
  potentialRelayChains: Chain[] = [],
  jsonRpcCallback?: (msg: string) => void,
): Promise<Chain> =>
  window.substrateSmoldotAddChain!({
    chainSpec,
    potentialRelayChains,
    jsonRpcCallback,
  })

export const addWellKnownChain = async (
  supposedChain: SupportedChains,
  jsonRpcCallback?: (msg: string) => void,
): Promise<Chain> =>
  window.substrateSmoldotAddWellKnownChain!({
    name: supposedChain,
    jsonRpcCallback,
  })
