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
          <ConnectorRow
            title="Browser wallet"
            detail={
              wallet.hasInjected
                ? `${wallet.injectedWallets[0]?.name} · signs through the GenLayer snap`
                : "No injected wallet detected in this browser"
            }
            disabled={!wallet.hasInjected || wallet.status === "connecting"}
            onClick={() => void wallet.connectInjected()}
          />

          <ConnectorRow
            title="Session key"
            detail={
              IS_GASLESS
                ? `Generated in this browser. ${NETWORK_KEY} is gasless, so it can write immediately.`
                : "Generated in this browser. Needs funding on a metered network."
            }
            accent
            disabled={wallet.status === "connecting"}
            onClick={() => void wallet.connectSession()}
          />

          {wallet.error ? (
            <p className="hint" style={{ color: "var(--vermilion)" }}>
              {wallet.error}
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
  onClick,
  disabled,
  accent,
}: {
  title: string;
  detail: string;
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
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        borderColor: accent ? "rgba(229,72,44,0.4)" : undefined,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 12.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: accent ? "var(--vermilion)" : "var(--paper)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--grey-dim)" }}>{detail}</div>
    </button>
  );
}
