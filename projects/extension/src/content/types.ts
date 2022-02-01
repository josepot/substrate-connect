interface ToContentAddChainOk {
  type: "chain-added-ok"
}

interface ToContentAddChainKo {
  type: "chain-added-ko"
  payload: string
}

interface ToContentRpc {
  type: "rpc"
  payload: string
}

interface ToContentCrashError {
  type: "crash-error"
  payload: string
}

export type ToContent =
  | ToContentAddChainOk
  | ToContentAddChainKo
  | ToContentRpc
  | ToContentCrashError
