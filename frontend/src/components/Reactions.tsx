"use client";

import { useEffect, useRef, useState } from "react";
import { EMOJI, onServerEvent } from "@/lib/events";

type Floater = {
  key: number;
  emoji: string;
  left: number;
  drift: number;
  dur: number;
  size: number;
};

let keySeq = 1;

export function FloatingReactions() {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const queue = useRef<string[]>([]);

  useEffect(() => {
    const off = onServerEvent((e) => {
      if (e.type === "react" && queue.current.length < 400) {
        queue.current.push(e.emoji);
      }
    });
    const tick = setInterval(() => {
      const q = queue.current;
      if (q.length === 0) return;
      const batch = q.length > 30 ? 5 : q.length > 12 ? 3 : q.length > 4 ? 2 : 1;
      const speedUp = Math.min(q.length / 25, 1);
      const spawned: Floater[] = q.splice(0, batch).map((emoji) => ({
        key: keySeq++,
        emoji,
        left: 86 + Math.random() * 4,
        drift: -(20 + Math.random() * 80),
        dur: 3.4 - speedUp * 1.2 - Math.random() * 0.5,
        size: 22 + Math.random() * 14,
      }));
      setFloaters((f) => [...f.slice(-80), ...spawned]);
    }, 150);
    return () => {
      off();
      clearInterval(tick);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-none sm:rounded-brand">
      {floaters.map((f) => (
        <span
          key={f.key}
          className="float-emoji"
          style={
            {
              left: `${f.left}%`,
              fontSize: f.size,
              "--drift": `${f.drift}px`,
              "--dur": `${f.dur}s`,
            } as React.CSSProperties
          }
          onAnimationEnd={() =>
            setFloaters((fl) => fl.filter((x) => x.key !== f.key))
          }
        >
          {f.emoji}
        </span>
      ))}
    </div>
  );
}

export function ReactionDock() {
  const [pressed, setPressed] = useState<string | null>(null);

  const send = (emoji: string) => {
    setPressed(emoji);
    setTimeout(() => setPressed(null), 260);
    fetch("/api/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    }).catch(() => {});
  };

  return (
    <div className="-mx-2 flex items-center gap-0.5">
      {EMOJI.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => send(e)}
          aria-label={`Реакция ${e}`}
          className={`flex h-10 w-10 items-center justify-center rounded-brand text-xl transition hover:-translate-y-0.5 hover:bg-accent-soft active:translate-y-0 sm:text-lg ${
            pressed === e ? "react-pop" : ""
          }`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
