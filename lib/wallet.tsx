"use client";

/**
 * Wallet adapter.
 *
 * Two connectors behind one interface, so pages only ever ask for `getClient()`:
 *
 *   injected  — any EIP-6963 browser wallet. Keys stay in the user's wallet.
 *   session   — a keypair generated in the browser and kept in localStorage.
 *               StudioNet is gasless, so it can write with no install and no
 *               faucet. A demo convenience, and the UI says so.
 *
 * ## Why this does not call `client.connect()`
 *
 * genlayer-js ships a `connect()` helper that adds the network *and* installs
 * the GenLayer MetaMask snap, reaching for `window.ethereum` rather than the
 * provider it was handed. Both parts are trouble: snaps are MetaMask-only, and
 * with several wallets installed an arbitrary one owns that global.
 *
 * The snap turns out not to be needed. Nothing in the SDK ever calls
 * `wallet_invokeSnap`; a browser-wallet transaction is built as a legacy
 * transaction and sent with a plain `eth_sendTransaction` through the provider
 * passed to `createClient`. So the only thing `connect()` contributes is adding
 * and switching the network, which is done below against the wallet the user
 * actually picked — leaving every EIP-6963 wallet able to sign, with nothing to
 * install.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import type { GenLayerClient } from "genlayer-js/types";
import { CHAIN } from "./chain";

export type ConnectorId = "injected" | "session";
export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

const SESSION_KEY_STORAGE = "firsts.session-key.v1";
const LAST_CONNECTOR_STORAGE = "firsts.connector.v1";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

export type DiscoveredWallet = {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
};

export type WalletState = {
  status: WalletStatus;
  address: `0x${string}` | null;
  connectorId: ConnectorId | null;
  connectorLabel: string | null;
  error: string | null;
  injectedWallets: DiscoveredWallet[];
  hasInjected: boolean;
  connectInjected: (walletId?: string) => Promise<void>;
  connectSession: () => Promise<void>;
  disconnect: () => void;
  exportSessionKey: () => string | null;
  /** Throws when nothing is connected — callers should gate on `status`. */
  getClient: () => GenLayerClient<typeof CHAIN>;
};

const WalletContext = createContext<WalletState | null>(null);

/**
 * Turn whatever a wallet threw into something a person can read.
 *
 * EIP-1193 rejections are plain `{ code, message }` objects, not Errors, so the
 * usual `String(err)` renders them as "[object Object]".
 */
function describeProviderError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;

  if (err && typeof err === "object") {
    const candidate = err as { code?: number; message?: string; data?: { message?: string } };
    const message = candidate.data?.message || candidate.message;
    switch (candidate.code) {
      case 4001:
        return "Request rejected in the wallet.";
      case 4200:
        return message || "This wallet does not support that method.";
      case 4902:
        return "This wallet would not add the GenLayer network.";
      case -32002:
        return "The wallet already has a pending request — open it and finish that one first.";
      default:
        if (message) return message;
    }
    try {
      const serialized = JSON.stringify(err);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      /* fall through */
    }
  }
  return "The wallet returned an error with no message.";
}

const CHAIN_ID_HEX = `0x${CHAIN.id.toString(16)}`;

/**
 * Put the wallet on the GenLayer network, adding it first if it is unknown.
 *
 * Switch is attempted before add: a wallet that already has the network simply
 * switches, whereas an unconditional add re-prompts on every connect.
 */
async function ensureNetwork(provider: Eip1193Provider): Promise<void> {
  try {
    const current = (await provider.request({ method: "eth_chainId" })) as string | null;
    if (current && current.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;
  } catch {
    /* some wallets refuse eth_chainId before connecting; fall through */
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
    return;
  } catch (err) {
    const code = (err as { code?: number })?.code;
    // 4902 is the standard "unrecognized chain"; several wallets report the
    // same condition as a generic internal or invalid-params error instead.
    if (code !== 4902 && code !== -32603 && code !== -32602) throw err;
  }

  const explorer = CHAIN.blockExplorers?.default?.url;
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: CHAIN_ID_HEX,
        chainName: CHAIN.name,
        rpcUrls: [...CHAIN.rpcUrls.default.http],
        nativeCurrency: CHAIN.nativeCurrency,
        ...(explorer ? { blockExplorerUrls: [explorer] } : {}),
      },
    ],
  });

  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: CHAIN_ID_HEX }],
  });
}

/** EIP-6963 discovery, so every installed wallet is offered, not just one. */
function useDiscoveredWallets(): DiscoveredWallet[] {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = new Map<string, DiscoveredWallet>();
    let alive = true;

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { info?: { uuid?: string; name?: string; icon?: string }; provider?: Eip1193Provider }
        | undefined;
      if (!detail?.provider || !detail.info?.uuid || seen.has(detail.info.uuid)) return;
      seen.set(detail.info.uuid, {
        id: detail.info.uuid,
        name: detail.info.name || "Injected wallet",
        icon: detail.info.icon,
        provider: detail.provider,
      });
      if (alive) setWallets([...seen.values()]);
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Fallback for wallets that never implemented EIP-6963. Deferred a tick so
    // a wallet that does announce wins the slot and keeps its real name.
    const legacyTimer = window.setTimeout(() => {
      const legacy = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
      if (legacy && seen.size === 0 && alive) {
        seen.set("legacy", { id: "legacy", name: "Browser wallet", provider: legacy });
        setWallets([...seen.values()]);
      }
    }, 400);

    return () => {
      alive = false;
      window.clearTimeout(legacyTimer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, []);

  return wallets;
}

function readSessionKey(): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(SESSION_KEY_STORAGE);
    return stored && /^0x[0-9a-fA-F]{64}$/.test(stored) ? (stored as `0x${string}`) : null;
  } catch {
    return null;
  }
}

function writeSessionKey(key: string) {
  try {
    window.localStorage.setItem(SESSION_KEY_STORAGE, key);
  } catch {
    /* private mode — the session simply will not survive a reload */
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const injectedWallets = useDiscoveredWallets();
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [connectorId, setConnectorId] = useState<ConnectorId | null>(null);
  const [connectorLabel, setConnectorLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<GenLayerClient<typeof CHAIN> | null>(null);
  const activeProvider = useRef<Eip1193Provider | null>(null);

  const disconnect = useCallback(() => {
    clientRef.current = null;
    activeProvider.current = null;
    setStatus("disconnected");
    setAddress(null);
    setConnectorId(null);
    setConnectorLabel(null);
    setError(null);
    try {
      window.localStorage.removeItem(LAST_CONNECTOR_STORAGE);
    } catch {
      /* ignore */
    }
  }, []);

  const connectSession = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      let key = readSessionKey();
      if (!key) {
        key = generatePrivateKey() as `0x${string}`;
        writeSessionKey(key);
      }
      const account = createAccount(key);
      clientRef.current = createClient({ chain: CHAIN, account }) as GenLayerClient<typeof CHAIN>;
      activeProvider.current = null;
      setAddress(account.address as `0x${string}`);
      setConnectorId("session");
      setConnectorLabel("Session key");
      setStatus("connected");
      window.localStorage.setItem(LAST_CONNECTOR_STORAGE, "session");
    } catch (err) {
      setStatus("error");
      setError(describeProviderError(err));
    }
  }, []);

  const connectInjected = useCallback(
    async (walletId?: string) => {
      setStatus("connecting");
      setError(null);
      try {
        const wallet =
          injectedWallets.find((entry) => entry.id === walletId) || injectedWallets[0];
        if (!wallet) throw new Error("No browser wallet detected.");

        const accounts = (await wallet.provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        const account = accounts?.[0];
        if (!account) throw new Error("The wallet returned no account.");

        await ensureNetwork(wallet.provider);

        clientRef.current = createClient({
          chain: CHAIN,
          account: account as `0x${string}`,
          provider: wallet.provider as never,
        }) as GenLayerClient<typeof CHAIN>;
        activeProvider.current = wallet.provider;

        setAddress(account as `0x${string}`);
        setConnectorId("injected");
        setConnectorLabel(wallet.name);
        setStatus("connected");
        window.localStorage.setItem(LAST_CONNECTOR_STORAGE, "injected");
      } catch (err) {
        setStatus("error");
        setError(describeProviderError(err));
      }
    },
    [injectedWallets],
  );

  // Follow the wallet: switching account in the extension switches it here too,
  // and locking the wallet disconnects rather than leaving a stale address that
  // can no longer sign.
  useEffect(() => {
    const provider = activeProvider.current;
    if (connectorId !== "injected" || !provider?.on) return;

    const onAccountsChanged = (...args: never[]) => {
      const next = (args[0] as unknown as string[] | undefined)?.[0];
      if (!next) {
        disconnect();
        return;
      }
      setAddress(next as `0x${string}`);
      clientRef.current = createClient({
        chain: CHAIN,
        account: next as `0x${string}`,
        provider: provider as never,
      }) as GenLayerClient<typeof CHAIN>;
    };

    provider.on("accountsChanged", onAccountsChanged);
    return () => provider.removeListener?.("accountsChanged", onAccountsChanged);
  }, [connectorId, address, disconnect]);

  // Restore a session key silently on reload. An injected wallet is never
  // reconnected without a click — that would pop a prompt nobody asked for.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(LAST_CONNECTOR_STORAGE) === "session" && readSessionKey()) {
        void connectSession();
      }
    } catch {
      /* ignore */
    }
  }, [connectSession]);

  const getClient = useCallback(() => {
    if (!clientRef.current) throw new Error("wallet not connected");
    return clientRef.current;
  }, []);

  const exportSessionKey = useCallback(
    () => (connectorId === "session" ? readSessionKey() : null),
    [connectorId],
  );

  const value = useMemo<WalletState>(
    () => ({
      status,
      address,
      connectorId,
      connectorLabel,
      error,
      injectedWallets,
      hasInjected: injectedWallets.length > 0,
      connectInjected,
      connectSession,
      disconnect,
      exportSessionKey,
      getClient,
    }),
    [
      status,
      address,
      connectorId,
      connectorLabel,
      error,
      injectedWallets,
      connectInjected,
      connectSession,
      disconnect,
      exportSessionKey,
      getClient,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside <WalletProvider>");
  return context;
}
