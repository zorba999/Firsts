import * as chains from "genlayer-js/chains";

export type NetworkKey = "studionet" | "localnet" | "testnetAsimov" | "testnetBradbury";

const NETWORK_TABLE = {
  studionet: chains.studionet,
  localnet: chains.localnet,
  testnetAsimov: chains.testnetAsimov,
  testnetBradbury: chains.testnetBradbury,
} as const;

function resolveNetworkKey(): NetworkKey {
  const raw = (process.env.NEXT_PUBLIC_GENLAYER_NETWORK || "studionet").trim();
  const normalized = raw.replace(/[-_]/g, "").toLowerCase();
  if (normalized === "localnet") return "localnet";
  if (normalized === "testnetasimov") return "testnetAsimov";
  if (normalized === "testnetbradbury") return "testnetBradbury";
  return "studionet";
}

export const NETWORK_KEY: NetworkKey = resolveNetworkKey();
export const CHAIN = NETWORK_TABLE[NETWORK_KEY];

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").trim() as `0x${string}`;

export const HAS_CONTRACT = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);

/** StudioNet is gasless, so nothing needs funding before a write lands. */
export const IS_GASLESS = Boolean((CHAIN as { isStudio?: boolean }).isStudio);

export const RPC_URL = CHAIN.rpcUrls.default.http[0];

export const EXPLORER_TX = (hash: string) =>
  NETWORK_KEY === "studionet"
    ? `https://studio.genlayer.com/transactions/${hash}`
    : `${RPC_URL}`;

export function shortAddress(value?: string | null, size = 4): string {
  if (!value) return "—";
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}···${value.slice(-size)}`;
}
