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

/**
 * Why a wallet may not be usable here.
 *
 * Only one thing actually disqualifies a wallet: GenLayer transactions are
 * signed by the GenLayer **MetaMask snap**, so a wallet with no snap support
 * cannot sign them at all.
 *
 * Not being the browser's primary wallet is *not* a blocker, which took reading
 * genlayer-js to establish. Transaction signing goes through the provider handed
 * to `createClient`, so whichever wallet the user picks is the one that signs.
 * Only `connect()` — the step that installs the snap — reaches for
 * `window.ethereum`, and that is worked around below.
 */
export type WalletBlocker = null | "no-snaps" | "primary-locked";

type DiscoveredWallet = {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
  /** null once probed and usable; undefined while the probe is still running. */
  blocker?: WalletBlocker;
};

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
        return "The GenLayer network is not added to this wallet.";
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

/**
 * Probe rather than sniff. Several wallets set `isMetaMask: true` for
 * compatibility, so the flag proves nothing; asking for the snaps method does.
 * MetaMask answers `wallet_getSnaps` with `{}` before any snap is granted,
 * while a wallet without snap support rejects the method outright.
 */
async function probeBlocker(provider: Eip1193Provider): Promise<WalletBlocker> {
  try {
    await provider.request({ method: "wallet_getSnaps" });
    return null;
  } catch {
    return "no-snaps";
  }
}

/**
 * Point `window.ethereum` at `provider` for the duration of `run`, then restore.
 *
 * With several wallets installed they race for `window.ethereum` and an
 * arbitrary one wins. genlayer-js installs the GenLayer snap through that global
 * rather than through the provider it was handed, so without this the snap lands
 * in — or is refused by — whichever wallet happened to win the race, no matter
 * which one the user picked.
 *
 * Returns null if the global could not be swapped, which some wallets enforce by
 * defining it non-configurable.
 */
async function withPrimaryProvider<T>(
  provider: Eip1193Provider,
  run: () => Promise<T>,
): Promise<T | null> {
  const target = window as unknown as { ethereum?: Eip1193Provider };
  const original = target.ethereum;

  if (original === provider) return run();

  const assign = (value: Eip1193Provider | undefined) => {
    try {
      Object.defineProperty(window, "ethereum", {
        value,
        configurable: true,
        writable: true,
      });
      return target.ethereum === value;
    } catch {
      try {
        target.ethereum = value;
        return target.ethereum === value;
      } catch {
        return false;
      }
    }
  };

  if (!assign(provider)) return null;
  try {
    return await run();
  } finally {
    assign(original);
  }
}

export function blockerText(blocker: WalletBlocker | undefined, name: string): string {
  if (blocker === undefined) return "Checking what this wallet supports…";
  if (blocker === "no-snaps") {
    return `${name} cannot sign GenLayer transactions — they go through the GenLayer MetaMask snap, which ${name} does not support.`;
  }
  if (blocker === "primary-locked") {
    return `${name} supports snaps, but another extension is holding this browser's wallet slot and will not release it. Disable the other wallet, or continue with a session key.`;
  }
  return "Signs through the GenLayer snap.";
}

export type WalletState = {
  status: WalletStatus;
  address: `0x${string}` | null;
  connectorId: ConnectorId | null;
  connectorLabel: string | null;
  error: string | null;
  injectedWallets: DiscoveredWallet[];
  hasInjected: boolean;
  /** True once at least one discovered wallet has been probed and is usable. */
  hasUsableInjected: boolean;
  connectInjected: (walletId?: string) => Promise<void>;
  connectSession: () => Promise<void>;
  disconnect: () => void;
  exportSessionKey: () => string | null;
  /** Throws when nothing is connected — callers should gate on `status`. */
  getClient: () => GenLayerClient<typeof CHAIN>;
};

const WalletContext = createContext<WalletState | null>(null);

/**
 * EIP-6963 discovery, so Rabby/Frame/etc. are offered, not just MetaMask.
 *
 * Each wallet is probed as it announces itself rather than once on a timer:
 * wallets announce at their own pace, and a late one would otherwise sit in
 * "checking…" forever.
 */
function useDiscoveredWallets(): DiscoveredWallet[] {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = new Map<string, DiscoveredWallet>();
    let alive = true;

    const publish = () => {
      if (alive) setWallets([...seen.values()]);
    };

    const add = (wallet: DiscoveredWallet) => {
      if (seen.has(wallet.id)) return;
      seen.set(wallet.id, wallet);
      publish();
      // Read-only probe; it raises no wallet prompt.
      void probeBlocker(wallet.provider).then((blocker) => {
        const current = seen.get(wallet.id);
        if (!current) return;
        seen.set(wallet.id, { ...current, blocker });
        publish();
      });
    };

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { info?: { uuid?: string; name?: string; icon?: string }; provider?: Eip1193Provider }
        | undefined;
      if (!detail?.provider || !detail.info?.uuid) return;
      add({
        id: detail.info.uuid,
        name: detail.info.name || "Injected wallet",
        icon: detail.info.icon,
        provider: detail.provider,
      });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Fallback for wallets that never implemented EIP-6963. Deferred a tick so
    // a wallet that does announce wins the slot and keeps its real name.
    const legacyTimer = window.setTimeout(() => {
      const legacy = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
      if (legacy && seen.size === 0) {
        add({ id: "legacy", name: "Browser wallet", provider: legacy });
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

        // Re-probe at click time: the user may have installed or removed a
        // wallet since the page loaded.
        const blocker = await probeBlocker(wallet.provider);
        if (blocker) throw new Error(blockerText(blocker, wallet.name));

        const accounts = (await wallet.provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        const account = accounts?.[0];
        if (!account) throw new Error("The wallet returned no account.");

        const client = createClient({
          chain: CHAIN,
          account: account as `0x${string}`,
          provider: wallet.provider as never,
        }) as GenLayerClient<typeof CHAIN>;

        // Adds the GenLayer network and installs the snap — the one step that
        // reads `window.ethereum` instead of the provider above, so the global
        // is pointed at the chosen wallet just for this call. Expect prompts.
        const connected = await withPrimaryProvider(wallet.provider, () =>
          client.connect(NETWORK_KEY),
        );
        if (connected === null) {
          throw new Error(blockerText("primary-locked", wallet.name));
        }

        clientRef.current = client;
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
      hasUsableInjected: injectedWallets.some((entry) => entry.blocker === null),
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
