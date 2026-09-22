"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
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
  const busy = wallet.status === "connecting";

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
          {wallet.injectedWallets.map((entry) => (
            <ConnectorRow
              key={entry.id}
              title={entry.name}
              icon={entry.icon}
              detail={`Signs on ${NETWORK_KEY}. The network is added on first connect.`}
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
            accent
            disabled={busy}
            onClick={() => void wallet.connectSession()}
          />

          {wallet.error ? (
            <p className="hint break" style={{ color: "var(--vermilion)" }}>
              {wallet.error}
            </p>
          ) : null}

          {!wallet.hasInjected ? (
            <p className="hint">
              No browser wallet detected. A session key works without one.
            </p>
          ) : null}

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
}: {
  title: string;
  detail: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
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
      <div className="row" style={{ gap: 9, marginBottom: 6 }}>
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
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--grey-dim)" }}>{detail}</div>
    </button>
  );
}
