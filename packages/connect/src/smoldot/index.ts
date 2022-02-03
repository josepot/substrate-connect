import * as extension from "./extension.js"
import * as smoldotLight from "./smoldot-light.js"

export type { Chain } from "@substrate/connect-extension-interface"

export const { addChain, addWellKnownChain } = window.substrateSmoldotAddChain
  ? extension
  : smoldotLight
