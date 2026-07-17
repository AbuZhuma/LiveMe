"use client";

import { useEffect, useState } from "react";
import { onServerEvent } from "./events";

export function useLive(): boolean | null {
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/stream")
      .then((r) => r.json())
      .then((d) => alive && setLive(!!d.is_live))
      .catch(() => alive && setLive(false));
    const off = onServerEvent((e) => {
      if (e.type === "live") setLive(e.is_live);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  return live;
}
