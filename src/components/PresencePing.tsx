"use client";

import { useEffect } from "react";

/** Pings while the workspace tab is visible so login-duration stays accurate. */
export default function PresencePing() {
  useEffect(() => {
    const ping = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetch("/api/auth/presence", { method: "POST", keepalive: true }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, 120_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);
  return null;
}
