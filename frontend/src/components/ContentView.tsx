"use client";

import { useEffect, useState } from "react";
import { onServerEvent } from "@/lib/events";

export default function ContentView() {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/content")
        .then((r) => r.json())
        .then((d) => setHtml(d.html ?? ""))
        .catch(() => {});
    load();
    return onServerEvent((e) => {
      if (e.type === "content") load();
    });
  }, []);

  if (html === null) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-7 w-2/5 animate-pulse rounded bg-panel-2" />
        <div className="h-4 w-full animate-pulse rounded bg-panel-2" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-panel-2" />
      </div>
    );
  }
  return (
    <article
      className="article prose prose-neutral dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
