"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CommentT, onServerEvent } from "@/lib/events";
import { IconSend } from "@/components/icons";

const NAME_KEY = "lm_name";

function subscribeStoredName(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
const readStoredName = () => localStorage.getItem(NAME_KEY) ?? "";
const readStoredNameOnServer = () => "";

function timeOf(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function useComments() {
  const [comments, setComments] = useState<CommentT[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/comments")
      .then((r) => r.json())
      .then((list: CommentT[]) => alive && setComments(list.reverse()))
      .catch(() => {});
    const off = onServerEvent((e) => {
      if (e.type === "comment") {
        setComments((c) =>
          c.some((x) => x.id === e.comment.id) ? c : [...c, e.comment].slice(-300)
        );
      }
      if (e.type === "comment_deleted") {
        setComments((c) => c.filter((x) => x.id !== e.id));
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  return comments;
}

function useChatForm(onSent?: () => void) {
  const storedName = useSyncExternalStore(
    subscribeStoredName,
    readStoredName,
    readStoredNameOnServer,
  );
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? storedName;

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [askName, setAskName] = useState(false);

  const doSend = async (sendName: string, t: string) => {
    setBusy(true);
    setNote("");
    localStorage.setItem(NAME_KEY, sendName);
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sendName, text: t }),
    }).catch(() => null);
    if (res?.ok) {
      setText("");
      onSent?.();
    } else if (res?.status === 429) {
      setNote("Не так быстро - раз в пару секунд.");
    } else {
      setNote("Не отправилось. Попробуйте ещё раз.");
    }
    setBusy(false);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    if (!name.trim()) {
      setAskName(true);
      return;
    }
    await doSend(name.trim(), t);
  };

  const confirmName = (n: string) => {
    const nn = n.trim();
    if (!nn) return;
    setAskName(false);
    setTypedName(nn);
    localStorage.setItem(NAME_KEY, nn);
    const t = text.trim();
    if (t) void doSend(nn, t);
  };

  return {
    name,
    setName: setTypedName,
    text,
    setText,
    busy,
    note,
    submit,
    askName,
    closeAsk: () => setAskName(false),
    confirmName,
  };
}

function NamePrompt({
  onConfirm,
  onClose,
}: {
  onConfirm: (name: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(value);
        }}
        className="w-full max-w-xs space-y-3 rounded-brand border border-line bg-panel p-4"
      >
        <p className="text-sm font-medium">Как вас подписать в чате?</p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ваше имя"
          maxLength={40}
          autoFocus
          className="h-10 w-full rounded-brand bg-panel-2 px-3.5 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/50"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex-1 rounded-brand bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          >
            Отправить
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-brand px-3 py-2 text-sm text-muted transition hover:bg-panel-2"
          >
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}

const OVERLAY_TTL = 10_000;
const OVERLAY_FADE = 1_500;

type Floating = { comment: CommentT; fading: boolean };

export function ChatOverlay({ className = "" }: { className?: string }) {
  const [visible, setVisible] = useState<Floating[]>([]);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
      }, ms);
      timers.add(timer);
    };

    const off = onServerEvent((e) => {
      if (e.type === "comment_deleted") {
        setVisible((v) => v.filter((x) => x.comment.id !== e.id));
        return;
      }
      if (e.type !== "comment") return;

      const { comment } = e;
      setVisible((v) =>
        v.some((x) => x.comment.id === comment.id)
          ? v
          : [...v, { comment, fading: false }].slice(-4),
      );
      later(OVERLAY_TTL - OVERLAY_FADE, () =>
        setVisible((v) =>
          v.map((x) =>
            x.comment.id === comment.id ? { ...x, fading: true } : x,
          ),
        ),
      );
      later(OVERLAY_TTL, () =>
        setVisible((v) => v.filter((x) => x.comment.id !== comment.id)),
      );
    });

    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  if (visible.length === 0) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-3 pt-12 pb-3 sm:px-4 ${className}`}
      aria-hidden
    >
      {visible.map(({ comment, fading }) => (
        <p
          key={comment.id}
          className={`chat-overlay-msg max-w-[85%] break-words text-[13px] leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] ${
            fading ? "chat-overlay-msg-fading" : ""
          }`}
        >
          <span className="mr-1.5 font-semibold text-white/75">
            {comment.name}
          </span>
          {comment.text}
        </p>
      ))}
    </div>
  );
}

export function MobileChatBar({ className = "" }: { className?: string }) {
  const { text, setText, busy, note, submit, askName, closeAsk, confirmName } =
    useChatForm();
  return (
    <div className={className}>
      {askName && <NamePrompt onConfirm={confirmName} onClose={closeAsk} />}
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Написать в чат…"
          maxLength={500}
          className="h-11 min-w-0 flex-1 rounded-brand bg-panel-2 px-4 text-base outline-none transition-shadow placeholder:text-muted focus:ring-2 focus:ring-accent/50"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="Отправить"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-brand bg-accent text-white transition hover:opacity-90 active:scale-95 disabled:opacity-35"
        >
          <IconSend size={17} className="-translate-x-px translate-y-px" />
        </button>
      </form>
      {note && <p className="mt-1.5 px-1 text-xs text-accent">{note}</p>}
    </div>
  );
}

export default function Comments({ className = "" }: { className?: string }) {
  const comments = useComments();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const {
    name,
    setName,
    text,
    setText,
    busy,
    note,
    submit,
    askName,
    closeAsk,
    confirmName,
  } = useChatForm(() => {
    stickToBottom.current = true;
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [comments]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  return (
    <section
      className={`min-h-0 flex-col rounded-brand border border-line bg-panel ${className}`}
      aria-label="Комментарии"
    >
      <h2 className="border-b border-line px-4 py-3 font-display text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
        Чат эфира
      </h2>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="chat-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {comments.length === 0 && (
          <p className="pt-6 text-center text-sm text-muted">
            Пока тихо. Напишите первым!
          </p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="text-sm leading-snug">
            <span className="font-medium">{c.name}</span>
            <span className="ml-2 font-mono text-[10px] text-muted">
              {timeOf(c.created_at)}
            </span>
            <p className="mt-0.5 break-words whitespace-pre-wrap text-ink/90">
              {c.text}
            </p>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-2 border-t border-line p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя"
          maxLength={40}
          className="h-9 w-full rounded-brand bg-panel-2 px-3.5 text-sm outline-none transition-shadow placeholder:text-muted focus:ring-2 focus:ring-accent/50"
        />
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Написать в чат…"
            maxLength={500}
            className="h-10 min-w-0 flex-1 rounded-brand bg-panel-2 px-3.5 text-sm outline-none transition-shadow placeholder:text-muted focus:ring-2 focus:ring-accent/50"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Отправить"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-brand bg-accent text-white transition hover:opacity-90 active:scale-95 disabled:opacity-35"
          >
            <IconSend size={16} className="-translate-x-px translate-y-px" />
          </button>
        </div>
        {note && <p className="text-xs text-accent">{note}</p>}
      </form>
      {askName && <NamePrompt onConfirm={confirmName} onClose={closeAsk} />}
    </section>
  );
}
