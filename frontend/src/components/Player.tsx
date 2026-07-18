"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { useLive } from "@/lib/useLive";
import { IconVolume, IconVolumeX } from "@/components/icons";

const SRC = "/aac/main/index.m3u8";

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const tick = () =>
      setT(new Date().toLocaleTimeString("ru-RU", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-sm tabular-nums">{t}</span>;
}

function TestCard() {
  return (
    <div className="testcard absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
      <p className="font-display text-xs font-semibold tracking-[0.3em] uppercase opacity-95">
        Эфир не идёт
      </p>
      <Clock />
      <p className="text-xs opacity-70">Страница оживёт сама - обновлять не нужно</p>
    </div>
  );
}

export default function Player() {
  const live = useLive();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // видео без controls: пауза может взяться только от браузера
    // (AbortError при старте, экономия фоновой вкладки) — всегда возобновляем
    const resume = () => {
      if (video.paused) video.play().catch(() => {});
    };
    // после фоновой паузы отстаём от эфира: прыгаем к live-краю и играем
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const h = hlsRef.current;
      const edge = h?.liveSyncPosition;
      if (typeof edge === "number" && edge - video.currentTime > 2) {
        video.currentTime = edge;
      }
      video.play().catch(() => {});
    };
    video.addEventListener("canplay", resume);
    document.addEventListener("visibilitychange", onVisible);

    if (live) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: true,
          liveDurationInfinity: true,
          maxLiveSyncPlaybackRate: 1.2,
        });
        hlsRef.current = hls;
        hls.loadSource(SRC);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = SRC;
        video.play().catch(() => {});
      }
    }
    return () => {
      video.removeEventListener("canplay", resume);
      document.removeEventListener("visibilitychange", onVisible);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [live]);

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-none bg-black sm:rounded-brand ${
        live ? "player-live" : "ring-1 ring-line"
      }`}
    >
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        autoPlay
        className={`h-full w-full ${live ? "" : "invisible"}`}
      />
      {live === false && <TestCard />}
      {live && (
        <button
          type="button"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            if (!next) videoRef.current?.play().catch(() => {});
          }}
          aria-label={muted ? "Включить звук" : "Выключить звук"}
          title={muted ? "Включить звук" : "Выключить звук"}
          className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-brand bg-black/60 text-white transition hover:bg-black/80"
        >
          {muted ? <IconVolumeX size={16} /> : <IconVolume size={16} />}
        </button>
      )}
      {live && (
        <span className="absolute top-2 left-3 flex h-8 items-center gap-1.5 font-display text-[10px] font-semibold tracking-[0.2em] text-white uppercase [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
          <span className="onair-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          Live
        </span>
      )}
    </div>
  );
}
