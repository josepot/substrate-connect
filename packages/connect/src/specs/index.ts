export enum SupportedChains {
  polkadot = "polkadot",
  kusama = "kusama",
  rococo = "rococo",
  westend = "westend",
}

export async function getSpec(chain: SupportedChains): Promise<string> {
  const specRaw = (await import("./generated/" + chain + ".js")) as
    | string
    | { default: string }

  return typeof specRaw === "string"
    ? /* istanbul ignore next line */
      specRaw
    : (specRaw as unknown as { default: string }).default
}
