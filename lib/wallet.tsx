"use client";

/**
 * Wallet adapter.
 *
 * Two connectors sit behind one interface:
 *
 *   injected  — MetaMask (or any EIP-6963 wallet) signing through the GenLayer
 *               snap. This is the real path: keys stay in the user's wallet.
 *   session   — a keypair generated in the browser and kept in localStorage.
 *               StudioNet is gasless, so a session key can write immediately
 *               with no install, no faucet and no seed phrase. It is a demo
 *               convenience and the UI says so plainly.
 *
 * Everything downstream only ever asks for `getClient()`, so pages do not care
 * which connector is live.
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
import { CHAIN, NETWORK_KEY } from "./chain";

export type ConnectorId = "injected" | "session";
export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

const SESSION_KEY_STORAGE = "firsts.session-key.v1";
const LAST_CONNECTOR_STORAGE = "firsts.connector.v1";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

type DiscoveredWallet = {
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

/** EIP-6963 discovery, so Rabby/Frame/etc. are offered, not just MetaMask. */
function useDiscoveredWallets(): DiscoveredWallet[] {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = new Map<string, DiscoveredWallet>();

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { info?: { uuid?: string; name?: string; icon?: string }; provider?: Eip1193Provider }
        | undefined;
      if (!detail?.provider || !detail.info?.uuid) return;
      seen.set(detail.info.uuid, {
        id: detail.info.uuid,
        name: detail.info.name || "Injected wallet",
        icon: detail.info.icon,
        provider: detail.provider,
      });
      setWallets([...seen.values()]);
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Fallback for wallets that never implemented EIP-6963.
    const legacy = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
    if (legacy && seen.size === 0) {
      seen.set("legacy", { id: "legacy", name: "Browser wallet", provider: legacy });
      setWallets([...seen.values()]);
    }

    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
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

  const disconnect = useCallback(() => {
    clientRef.current = null;
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
      setAddress(account.address as `0x${string}`);
      setConnectorId("session");
      setConnectorLabel("Session key");
      setStatus("connected");
      window.localStorage.setItem(LAST_CONNECTOR_STORAGE, "session");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "could not create a session key");
    }
  }, []);

  const connectInjected = useCallback(
    async (walletId?: string) => {
      setStatus("connecting");
      setError(null);
      try {
        const wallet =
          injectedWallets.find((entry) => entry.id === walletId) || injectedWallets[0];
        if (!wallet) throw new Error("no browser wallet detected");

        const accounts = (await wallet.provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        const account = accounts?.[0];
        if (!account) throw new Error("wallet returned no account");

        const client = createClient({
          chain: CHAIN,
          account: account as `0x${string}`,
          provider: wallet.provider as never,
        }) as GenLayerClient<typeof CHAIN>;

        // GenLayer transactions are signed through the GenLayer snap; this is
        // the step that installs/unlocks it and will surface a wallet prompt.
        await client.connect(NETWORK_KEY);

        clientRef.current = client;
        setAddress(account as `0x${string}`);
        setConnectorId("injected");
        setConnectorLabel(wallet.name);
        setStatus("connected");
        window.localStorage.setItem(LAST_CONNECTOR_STORAGE, "injected");
      } catch (err) {
        setStatus("error");
        const message = err instanceof Error ? err.message : String(err);
        setError(
          /snap/i.test(message)
            ? "This wallet could not load the GenLayer snap. Use MetaMask with snap support, or continue with a session key."
            : message,
        );
      }
    },
    [injectedWallets],
  );

  // Restore a session key silently on reload. An injected wallet is never
  // reconnected without a click — that would pop a prompt the user did not ask for.
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
