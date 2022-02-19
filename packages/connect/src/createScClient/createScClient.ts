import { RpcCoder } from "@polkadot/rpc-provider/coder"
import type {
  ProviderInterface,
  ProviderInterfaceCallback,
  ProviderInterfaceEmitted,
  ProviderInterfaceEmitCb,
  JsonRpcResponse,
} from "@polkadot/rpc-provider/types"
import EventEmitter from "eventemitter3"
import type { Chain, JsonRpcCallback } from "../connector/types.js"

import { WellKnownChains } from "../WellKnownChains.js"
import { getConnectorClient } from "../connector/index.js"
import { ScProvider } from "./ScProvider/index.js"
import { healthChecker } from "./ScProvider/Health"

export interface ScClient {
  addWellKnownChain: (
    wellKnownChain: WellKnownChains,
  ) => Promise<ProviderInterface>
  addChain: (chainSpec: string) => Promise<ProviderInterface>
}

type ResponseCallback = (response: string | Error) => void

class Provider implements ProviderInterface {
  readonly #coder: RpcCoder = new RpcCoder()
  readonly #getChain: (handler: JsonRpcCallback) => Promise<Chain>
  readonly #subscriptions: Map<string, ResponseCallback> = new Map()
  readonly #orphanMessages: Map<string, Array<string | Error>> = new Map()
  readonly #requests: Map<number, ResponseCallback> = new Map()
  readonly #eventemitter: EventEmitter = new EventEmitter()
  #chain: Promise<Chain> | null = null
  #isSmoldotReady: boolean = false

  public constructor(getChain: (handler: JsonRpcCallback) => Promise<Chain>) {
    this.#getChain = getChain
  }

  public get hasSubscriptions(): boolean {
    return this.#subscriptions.size > 0
  }

  public get isConnected(): boolean {
    return !!this.#chain && this.#isSmoldotReady
  }

  public clone(): ProviderInterface {
    throw new Error("clone() is not supported.")
  }

  async connect(): Promise<void> {
    if (this.#chain) {
      await this.#chain
      return
    }

    const hc = healthChecker()
    const onResponse = (res: string): void => {
      if (!hc.responsePassThrough(res)) return
      const response = JSON.parse(res) as JsonRpcResponse

      let decodedResponse: string | Error
      try {
        decodedResponse = this.#coder.decodeResponse(response) as string
      } catch (e) {
        decodedResponse =
          e instanceof Error ? e : new Error(`Error decoding response. ${e}`)
      }

      if (response.method === undefined) {
        // It's not a subscription message, but rather a response
        return this.#requests.get(response.id)?.(decodedResponse)
      }

      const subscriptionId = `${response.method}::${response.params.subscription}`

      const callback = this.#subscriptions.get(subscriptionId)
      if (callback) return callback(decodedResponse)

      if (!this.#orphanMessages.has(subscriptionId))
        this.#orphanMessages.set(subscriptionId, [])
      this.#orphanMessages.get(subscriptionId)!.push(decodedResponse)
    }

    this.#isSmoldotReady = false
    this.#chain = this.#getChain(onResponse).then((chain) => {
      hc.setSendJsonRpc(chain.sendJsonRpc)
      hc.start((health) => {
        const isSmoldotReady =
          !health.isSyncing && (health.peers > 0 || !health.shouldHavePeers)

        if (this.#isSmoldotReady !== isSmoldotReady) {
          this.#isSmoldotReady = isSmoldotReady
        }
      })

      return {
        ...chain,
        remove() {
          hc.stop()
          chain.remove()
        },
      }
    })

    await this.#chain
  }

  async disconnect(): Promise<void> {
    if (!this.#chain) return
    const chain = await this.#chain
    this.#chain = null
    this.#isSmoldotReady = false
    chain.remove()
  }

  public on(
    type: ProviderInterfaceEmitted,
    sub: ProviderInterfaceEmitCb,
  ): () => void {
    if (type === "connected" && this.isConnected) {
      sub()
    }
    if (type === "disconnected" && !this.isConnected) {
      sub()
    }

    this.#eventemitter.on(type, sub)
    return (): void => {
      this.#eventemitter.removeListener(type, sub)
    }
  }

  public async send(method: string, params: unknown[]): Promise<any> {
    if (!this.#chain) throw new Error("Chain is not initialised")
    const chain = await this.#chain
    const json = this.#coder.encodeJson(method, params)
    const id = this.#coder.getId()

    const result = new Promise((res, rej): void => {
      this.#requests.set(id, (response) => {
        ;(response instanceof Error ? rej : res)(response)
      })
      chain.sendJsonRpc(json)
    })

    result.finally(() => {
      this.#requests.delete(id)
    })

    return result
  }

  public async subscribe(
    // the "method" property of the JSON response to this subscription
    type: string,
    // the "method" property of the JSON request to register the subscription
    method: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: any[],
    callback: ProviderInterfaceCallback,
  ): Promise<number | string> {
    const returnId = await this.send(method, params)
    const subscriptionId = `${type}::${returnId}`
    const cb = (response: Error | string) => {
      if (response instanceof Error) {
        callback(response, undefined)
      } else {
        callback(null, response)
      }
    }

    ;(this.#orphanMessages.get(subscriptionId) ?? []).forEach(cb)
    this.#orphanMessages.delete(subscriptionId)

    this.#subscriptions.set(subscriptionId, cb)
    return returnId
  }

  public async unsubscribe(
    type: string,
    method: string,
    id: number | string,
  ): Promise<boolean> {
    const subscriptionId = `${type}::${id}`

    if (!this.#subscriptions.has(subscriptionId)) {
      console.debug(
        () => `Unable to find active subscription=${subscriptionId}`,
      )
      return false
    }
    this.#subscriptions.delete(subscriptionId)

    return await this.send(method, [id])
  }
}

export const createScClient = (): ScClient => {
  const client = getConnectorClient()

  return {
    addChain: async (chainSpec: string) => {
      const provider = new ScProvider((callback: JsonRpcCallback) =>
        client.addChain(chainSpec, callback),
      )
      await provider.connect()
      return provider
    },
    addWellKnownChain: async (wellKnownChain: WellKnownChains) => {
      const provider = new ScProvider((callback: JsonRpcCallback) =>
        client.addWellKnownChain(wellKnownChain, callback),
      )
      await provider.connect()
      return provider
    },
  }
}
