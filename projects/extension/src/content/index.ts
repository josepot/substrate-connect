/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Chain } from "@substrate/connect-extension-interface"
import {
  AlreadyDestroyedError,
  CrashError,
  JsonRpcDisabledError,
} from "@substrate/smoldot-light"
import { wellKnownChains } from "../background/ConnectionManager"
import { ToBackground } from "../background/types"
import { ToContent } from "./types"

function getRandomChainId(): string {
  const arr = new BigUint64Array(2)
  // It can only be used from the browser, so this is fine.
  crypto.getRandomValues(arr)
  const result = (arr[1] << BigInt(64)) | arr[0]
  return result.toString(36)
}

const addChain = (
  port: chrome.runtime.Port,
  chainSpec: string,
  potentialRelayChainIds: string[],
) =>
  new Promise<void>((res, rej) => {
    function onInitialResponse(message: ToContent) {
      port.onMessage.removeListener(onInitialResponse)
      if (message.type === "chain-added-ok") return res()
      rej(
        new Error(
          message.type === "chain-added-ko"
            ? message.payload
            : "Unexpected error while adding the Chain",
        ),
      )
    }
    port.onMessage.addListener(onInitialResponse)

    const message: ToBackground = {
      type: "add-chain",
      payload: {
        chainSpec: chainSpec,
        potentialRelayChainIds,
      },
    }
    port.postMessage(message)
  })

const activeChains = new WeakMap<Chain, string>()

window.substrateSmoldotAddChain = async (options) => {
  const chainId = getRandomChainId()
  const port = chrome.runtime.connect(chainId)
  const postMessage = (msg: ToBackground) => {
    port.postMessage(msg)
  }

  const potentialRelayChainIds = (options.potentialRelayChains ?? [])
    .map((c) => activeChains.get(c)!)
    .filter(Boolean)

  await addChain(port, options.chainSpec, potentialRelayChainIds)

  let crashError: CrashError | null = null

  const chainFn =
    <Args extends Array<any>>(fn: (...args: Args) => void) =>
    (...args: Args) => {
      if (crashError) throw crashError
      if (!activeChains.has(chain)) throw new AlreadyDestroyedError()
      fn(...args)
    }

  const chain: Chain = {
    sendJsonRpc: chainFn((payload) => {
      if (!options.jsonRpcCallback) throw new JsonRpcDisabledError()
      postMessage({ type: "rpc", payload })
    }),
    remove: chainFn(port.disconnect.bind(port)),
  }

  activeChains.set(chain, chainId)

  function onMessage(msg: ToContent) {
    if (msg.type !== "rpc") {
      crashError = new CrashError(
        msg.type === "crash-error"
          ? msg.payload
          : "Unexpected message received from the Extension",
      )
      port.disconnect()
      return
    }
    options.jsonRpcCallback?.(msg.payload)
  }

  function onDisconnect() {
    activeChains.delete(chain)
    port.onMessage.removeListener(onMessage)
    port.onDisconnect.removeListener(onDisconnect)
  }

  port.onMessage.addListener(onMessage)
  port.onDisconnect.addListener(onDisconnect)

  return chain
}

window.substrateSmoldotAddWellKnownChain = (options): Promise<Chain> => {
  const chainSpec = wellKnownChains.get(options.name)

  return chainSpec
    ? window.substrateSmoldotAddChain!({
        chainSpec,
        jsonRpcCallback: options.jsonRpcCallback,
      })
    : Promise.reject(new Error("Unknown chain name"))
}
