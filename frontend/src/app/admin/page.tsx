"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Broadcaster from "@/components/admin/Broadcaster";
import { useComments } from "@/components/Comments";

const Editor = dynamic(() => import("@/components/admin/Editor"), { ssr: false });

function Login({ onOk }: { onOk: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      const { token } = await res.json();
      onOk(token);
    } else {
      setError(res?.status === 401 ? "Неверный пароль" : "Что-то пошло не так");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-20 w-full max-w-sm px-4">
      <h1 className="mb-1 font-display text-lg font-semibold">Кабинет</h1>
      <p className="mb-6 text-sm text-muted">
        Отсюда включается эфир и редактируется страница.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          autoFocus
          className="w-full rounded-brand border border-line bg-panel px-4 py-3 outline-none focus:border-accent"
        />
        {error && <p className="text-sm text-accent">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-brand bg-accent px-4 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Проверяю…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

function Moderation() {
  const comments = useComments();
  const del = (id: number) =>
    fetch(`/api/comments/${id}`, { method: "DELETE" }).catch(() => {});
  return (
    <div className="rounded-brand border border-line bg-panel">
      <div className="chat-scroll max-h-80 space-y-2 overflow-y-auto p-4">
        {comments.length === 0 && (
          <p className="text-sm text-muted">Комментариев ещё нет.</p>
        )}
        {[...comments].reverse().map((c) => (
          <div key={c.id} className="flex items-start gap-3 text-sm">
            <div className="min-w-0 flex-1">
              <span className="font-medium">{c.name}</span>
              <p className="break-words text-ink/85">{c.text}</p>
            </div>
            <button
              type="button"
              onClick={() => del(c.id)}
              title="Удалить комментарий"
              className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-accent-soft hover:text-accent"
            >
              Удалить
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-[11px] font-semibold tracking-[0.25em] text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.admin && d.token) setToken(d.token);
      })
      .finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/content")
      .then((r) => r.json())
      .then((d) => setContent(d.html ?? ""));
  }, [token]);

  if (!checked) return null;
  if (!token) return <Login onOk={setToken} />;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold">Кабинет</h1>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" });
            location.reload();
          }}
          className="rounded-brand px-3 py-1.5 text-sm text-muted transition hover:bg-panel-2 hover:text-ink"
        >
          Выйти
        </button>
      </div>

      <Section title="Эфир">
        <Broadcaster token={token} />
      </Section>

      <Section title="Страница под эфиром">
        {content !== null ? (
          <Editor initial={content} />
        ) : (
          <div className="h-40 animate-pulse rounded-brand bg-panel-2" />
        )}
      </Section>

      <Section title="Комментарии">
        <Moderation />
      </Section>
    </div>
  );
}
