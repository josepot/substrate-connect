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
import { healthChecker } from "./Health.js"

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
  #isChainReady: boolean = false

  public constructor(getChain: (handler: JsonRpcCallback) => Promise<Chain>) {
    this.#getChain = getChain
  }

  public get hasSubscriptions(): boolean {
    return true
  }

  public get isConnected(): boolean {
    return !!this.#chain && this.#isChainReady
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
      if (!hc.responsePassThrough(res)) {
        return
      }

      const response = JSON.parse(res) as JsonRpcResponse

      if (
        typeof response.id === "string" &&
        (response.id as unknown as string).startsWith("extern:")
      ) {
        // removing the `extern:` prefix that the healthChecker adds
        response.id = Number((response.id as unknown as string).slice(7))
      }

      let decodedResponse: string | Error
      try {
        decodedResponse = this.#coder.decodeResponse(response) as string
      } catch (e) {
        decodedResponse =
          e instanceof Error ? e : new Error(`Error decoding response. ${e}`)
      }

      // It's not a subscription message, but rather a response
      if (response.method === undefined) {
        return this.#requests.get(response.id)?.(decodedResponse)
      }

      // It has a `method`, then it's a subscription message
      const subscriptionId = `${response.method}::${response.params.subscription}`

      const callback = this.#subscriptions.get(subscriptionId)
      if (callback) return callback(decodedResponse)

      // It's possible to receive subscriptions messages before having received
      // the id of the subscription. In that case We should keep these
      // messages around until we receive the subscription-id message.
      if (!this.#orphanMessages.has(subscriptionId))
        this.#orphanMessages.set(subscriptionId, [])
      this.#orphanMessages.get(subscriptionId)!.push(decodedResponse)
    }

    this.#isChainReady = false
    this.#chain = this.#getChain(onResponse).then((chain) => {
      hc.setSendJsonRpc((msg) => {
        chain.sendJsonRpc(msg)
      })

      hc.start((health) => {
        const isReady =
          !health.isSyncing && (health.peers > 0 || !health.shouldHavePeers)

        if (this.#isChainReady !== isReady) {
          this.#isChainReady = isReady
          this.#eventemitter.emit(isReady ? "connected" : "disconnected")
        }
      })

      return {
        ...chain,
        sendJsonRpc: hc.sendJsonRpc.bind(hc),
        remove: () => {
          hc.stop()

          // If there are any
          const disconnectionError = new Error("Disconnected")
          this.#requests.forEach((cb) => cb(disconnectionError))
          this.#subscriptions.forEach((cb) => cb(disconnectionError))
          this.#orphanMessages.clear()
          chain.remove()
        },
      }
    })

    try {
      await this.#chain
    } catch (e) {
      this.#eventemitter.emit("error", e)
      this.#chain = null
      throw e
    }
  }

  async disconnect(): Promise<void> {
    if (!this.#chain) return

    const chain = await this.#chain
    this.#chain = null
    this.#isChainReady = false
    this.#eventemitter.emit("disconnected")
    chain.remove()
  }

  public on(
    type: ProviderInterfaceEmitted,
    sub: ProviderInterfaceEmitCb,
  ): () => void {
    if (type === "connected" && this.isConnected) {
      sub()
    }

    this.#eventemitter.on(type, sub)
    return (): void => {
      this.#eventemitter.removeListener(type, sub)
    }
  }

  public async send(method: string, params: unknown[]): Promise<any> {
    if (!this.isConnected) throw new Error("Provider is not connected")

    const chain = await this.#chain!
    const json = this.#coder.encodeJson(method, params)
    const id = this.#coder.getId()

    const result = new Promise((res, rej): void => {
      this.#requests.set(id, (response) => {
        ;(response instanceof Error ? rej : res)(response)
      })
      try {
        chain.sendJsonRpc(json)
      } catch (e) {
        this.#chain = null
        chain.remove()
        this.#eventemitter.emit("error", e)
      }
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

    this.#orphanMessages.get(subscriptionId)?.forEach(cb)
    this.#orphanMessages.delete(subscriptionId)

    this.#subscriptions.set(subscriptionId, cb)
    return returnId
  }

  public unsubscribe(
    type: string,
    method: string,
    id: number | string,
  ): Promise<boolean> {
    if (!this.isConnected) throw new Error("Provider is not connected")

    const subscriptionId = `${type}::${id}`

    if (!this.#subscriptions.has(subscriptionId)) {
      console.debug(
        () => `Unable to find active subscription=${subscriptionId}`,
      )
      return Promise.resolve(false)
    }
    this.#subscriptions.delete(subscriptionId)

    return this.send(method, [id])
  }
}

export const createScClient = (): ScClient => {
  const client = getConnectorClient()

  return {
    addChain: async (chainSpec: string) => {
      const provider = new Provider((callback: JsonRpcCallback) =>
        client.addChain(chainSpec, callback),
      )
      await provider.connect()
      return provider
    },
    addWellKnownChain: async (wellKnownChain: WellKnownChains) => {
      const provider = new Provider((callback: JsonRpcCallback) =>
        client.addWellKnownChain(wellKnownChain, callback),
      )
      await provider.connect()
      return provider
    },
  }
}
