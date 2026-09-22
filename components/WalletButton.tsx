"use client";

import { useEffect, useState } from "react";
import { blockerText, useWallet, type WalletBlocker } from "@/lib/wallet";
import { shortAddress, NETWORK_KEY, IS_GASLESS } from "@/lib/chain";

export function WalletButton() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (wallet.status === "connected") setOpen(false);
  }, [wallet.status]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (wallet.status === "connected") {
    return (
      <button
        className="btn btn-sm"
        onClick={wallet.disconnect}
        title={`${wallet.connectorLabel} · click to disconnect`}
        style={{ marginLeft: 8 }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--jade)",
            flex: "none",
          }}
        />
        {shortAddress(wallet.address)}
      </button>
    );
  }

  return (
    <>
      <button
        className="btn btn-sm btn-accent"
        onClick={() => setOpen(true)}
        style={{ marginLeft: 8 }}
        disabled={wallet.status === "connecting"}
      >
        {wallet.status === "connecting" ? <span className="spin" /> : null}
        {wallet.status === "connecting" ? "Connecting" : "Connect"}
      </button>
      {open ? <WalletModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function WalletModal({ onClose }: { onClose: () => void }) {
  const wallet = useWallet();
  const [showBlocked, setShowBlocked] = useState(false);
  const busy = wallet.status === "connecting";

  const usable = wallet.injectedWallets.filter((entry) => entry.blocker === null);
  const blocked = wallet.injectedWallets.filter(
    (entry) => entry.blocker !== null && entry.blocker !== undefined,
  );
  const pending = wallet.injectedWallets.filter((entry) => entry.blocker === undefined);

  return (
    <div
      className="modal-veil"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Connect a wallet"
    >
      <div className="modal ticks" onClick={(event) => event.stopPropagation()}>
        <div
          className="spread panel-pad"
          style={{ borderBottom: "1px solid var(--line)", paddingBlock: 16 }}
        >
          <span className="hud-b">Connect</span>
          <button className="hud" onClick={onClose} aria-label="Close">
            ESC ✕
          </button>
        </div>

        <div className="panel-pad stack">
          {usable.map((entry) => (
            <ConnectorRow
              key={entry.id}
              title={entry.name}
              icon={entry.icon}
              detail={blockerText(entry.blocker, entry.name)}
              blocker={entry.blocker}
              disabled={busy}
              onClick={() => void wallet.connectInjected(entry.id)}
            />
          ))}

          <ConnectorRow
            title="Session key"
            detail={
              IS_GASLESS
                ? `Generated in this browser. ${NETWORK_KEY} is gasless, so it can write immediately.`
                : "Generated in this browser. Needs funding on a metered network."
            }
            blocker={null}
            accent
            disabled={busy}
            onClick={() => void wallet.connectSession()}
          />

          {wallet.error ? (
            <p className="hint break" style={{ color: "var(--vermilion)" }}>
              {wallet.error}
            </p>
          ) : null}

          {/* A wall of red rows helps nobody. The wallets that cannot sign are
              collapsed behind one line, openable for the reason why. */}
          {blocked.length ? (
            <div>
              <button
                className="hud"
                onClick={() => setShowBlocked((value) => !value)}
                style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}
              >
                <span>{showBlocked ? "−" : "+"}</span>
                <span>
                  {blocked.length} wallet{blocked.length === 1 ? "" : "s"} cannot sign GenLayer
                  transactions
                </span>
              </button>
              {showBlocked ? (
                <div className="stack" style={{ marginTop: 12 }}>
                  {blocked.map((entry) => (
                    <ConnectorRow
                      key={entry.id}
                      title={entry.name}
                      icon={entry.icon}
                      detail={blockerText(entry.blocker, entry.name)}
                      blocker={entry.blocker}
                      disabled
                      onClick={() => {}}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {pending.length ? (
            <p className="hint">Checking {pending.length} more wallet…</p>
          ) : null}

          {!wallet.injectedWallets.length ? (
            <p className="hint">No browser wallet detected in this extension-free window.</p>
          ) : null}

          <p className="hint">
            GenLayer transactions are signed by the GenLayer <strong>MetaMask
            snap</strong>, so MetaMask is the only browser wallet that can sign
            them today. A session key works everywhere and needs no install.
          </p>

          <p className="hint">
            A session key lives in this browser&rsquo;s local storage and is meant
            for trying the registry on a test network. Do not put anything of
            value behind it.
          </p>
        </div>
      </div>
    </div>
  );
}

function ConnectorRow({
  title,
  detail,
  icon,
  onClick,
  disabled,
  accent,
  blocker,
}: {
  title: string;
  detail: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  blocker: WalletBlocker | undefined;
}) {
  const unavailable = blocker !== null && blocker !== undefined;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="panel"
      style={{
        textAlign: "left",
        padding: "16px 18px",
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        borderColor: accent ? "rgba(229,72,44,0.4)" : undefined,
      }}
    >
      <div className="spread" style={{ marginBottom: 6, gap: 10 }}>
        <span className="row" style={{ gap: 9 }}>
          {icon ? (
            // Wallet-supplied data URI; no optimizer, no remote fetch.
            <img src={icon} alt="" width={16} height={16} style={{ borderRadius: 3 }} />
          ) : null}
          <span
            className="mono"
            style={{
              fontSize: 12.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: accent ? "var(--vermilion)" : "var(--paper)",
            }}
          >
            {title}
          </span>
        </span>
        {unavailable ? <span className="chip tone-muted">Unavailable</span> : null}
        {blocker === undefined ? <span className="spin tone-muted" /> : null}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--grey-dim)" }}>{detail}</div>
    </button>
  );
}
