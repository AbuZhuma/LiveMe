"use client";

export type ServerEvent =
  | { type: "comment"; comment: CommentT }
  | { type: "comment_deleted"; id: number }
  | { type: "react"; emoji: string }
  | { type: "live"; is_live: boolean }
  | { type: "content" };

export type CommentT = {
  id: number;
  name: string;
  text: string;
  created_at: number;
};

type Handler = (e: ServerEvent) => void;

const handlers = new Set<Handler>();
let es: EventSource | null = null;

function ensure() {
  if (es || typeof window === "undefined") return;
  es = new EventSource("/api/events");
  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data) as ServerEvent;
      handlers.forEach((h) => h(data));
    } catch {
    }
  };
  es.onerror = () => {
    es?.close();
    es = null;
    setTimeout(ensure, 2000);
  };
}

export function onServerEvent(h: Handler): () => void {
  ensure();
  handlers.add(h);
  return () => {
    handlers.delete(h);
  };
}

export const EMOJI = ["❤️", "🔥", "👏", "😂", "😮", "👍"] as const;
