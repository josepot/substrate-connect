import EventEmitter from "eventemitter3"
import StrictEventEmitter from "strict-event-emitter-types"
import { HealthChecker, Chain, SmoldotHealth } from "@substrate/smoldot-light"

export interface ExposedChainConnection {
  chainId: string
  chainName: string
  tabId: number
  url: string
  healthStatus?: SmoldotHealth
}

export interface ChainConnection extends ExposedChainConnection {
  id: string
  chain?: Chain
  port: chrome.runtime.Port
  healthChecker: HealthChecker
}

export interface StateEvents {
  stateChanged: ExposedChainConnection[]
}

export type StateEmitter = StrictEventEmitter<EventEmitter, StateEvents>

interface ToBackgroundAddChain {
  type: "add-chain"
  payload: { chainSpec: string; potentialRelayChainIds: Array<string> }
}

interface ToBackgroundAddWellKnownChain {
  type: "add-well-known-chain"
  payload: string
}

interface ToBackgroundRpc {
  type: "rpc"
  payload: string
}

export type ToBackground =
  | ToBackgroundAddChain
  | ToBackgroundAddWellKnownChain
  | ToBackgroundRpc
