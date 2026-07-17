"use client";

import { useEffect, useRef, useState } from "react";
import { useLive } from "@/lib/useLive";
import { IconSquare } from "@/components/icons";

type Source = "camera" | "screen" | "both";

const OUT_W = 1280;
const OUT_H = 720;
const FPS = 30;

type TrackProcessor = { readable: ReadableStream<VideoFrame> };
type TrackGenerator = MediaStreamTrack & { writable: WritableStream<VideoFrame> };
declare global {
  interface Window {
    MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => TrackProcessor;
    MediaStreamTrackGenerator?: new (init: { kind: "video" }) => TrackGenerator;
  }
}

const COMPOSITOR_WORKER = `
let screenFrame = null;

onmessage = async (e) => {
  const { screen, cam, out, w, h } = e.data;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { alpha: false });
  const writer = out.getWriter();

  (async () => {
    const r = screen.getReader();
    for (;;) {
      const { value, done } = await r.read();
      if (done) break;
      if (screenFrame) screenFrame.close();
      screenFrame = value;
    }
  })();

  const pw = Math.round(w * 0.24);
  const ph = Math.round((pw * 9) / 16);
  const px = w - pw - 20;
  const py = h - ph - 20;
  const pip = new Path2D();
  if (pip.roundRect) pip.roundRect(px, py, pw, ph, 15);
  else pip.rect(px, py, pw, ph);

  const r = cam.getReader();
  for (;;) {
    const { value: camFrame, done } = await r.read();
    if (done) break;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    if (screenFrame) {
      const sw = screenFrame.displayWidth, sh = screenFrame.displayHeight;
      const k = Math.min(w / sw, h / sh);
      ctx.drawImage(screenFrame, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
    }

    const cw = camFrame.displayWidth, ch = camFrame.displayHeight;
    const k = Math.max(pw / cw, ph / ch);
    ctx.save();
    ctx.clip(pip);
    ctx.drawImage(camFrame, px + (pw - cw * k) / 2, py + (ph - ch * k) / 2, cw * k, ch * k);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke(pip);

    const ts = camFrame.timestamp;
    camFrame.close();
    try {
      await writer.write(new VideoFrame(canvas, { timestamp: ts }));
    } catch {
      break;
    }
  }
};
`;

export default function Broadcaster({ token }: { token: string }) {
  const live = useLive();
  const [state, setState] = useState<"idle" | "starting" | "on" | "error">("idle");
  const [error, setError] = useState("");
  const [source, setSource] = useState<Source>("camera");
  const [micOn, setMicOn] = useState(true);

  const previewRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const resourceRef = useRef<string | null>(null);
  const modeRef = useRef<Source>("camera");

  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const bgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const hiddenVideo = (stream: MediaStream) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    void v.play().catch(() => {});
    return v;
  };

  const ensureCam = async () => {
    if (camStreamRef.current) return;
    const s = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    });
    camStreamRef.current = s;
  };

  const ensureScreen = async () => {
    if (screenStreamRef.current) return;
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { max: 1920 },
        height: { max: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: true,
    });
    screenStreamRef.current = s;
    s.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (screenStreamRef.current !== s) return;
      screenStreamRef.current = null;
      screenVideoRef.current = null;
      if (resourceRef.current) {
        void applyMode("camera").catch(() => void stop());
      }
    });
  };

  const releaseScreen = () => {
    const s = screenStreamRef.current;
    screenStreamRef.current = null;
    screenVideoRef.current = null;
    s?.getTracks().forEach((t) => t.stop());
  };

  const releaseCam = () => {
    const s = camStreamRef.current;
    camStreamRef.current = null;
    camVideoRef.current = null;
    s?.getTracks().forEach((t) => t.stop());
  };

  const drawFrame = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, OUT_W, OUT_H);

    const sv = screenVideoRef.current;
    if (sv && sv.videoWidth) {
      const k = Math.min(OUT_W / sv.videoWidth, OUT_H / sv.videoHeight);
      const dw = sv.videoWidth * k;
      const dh = sv.videoHeight * k;
      ctx.drawImage(sv, (OUT_W - dw) / 2, (OUT_H - dh) / 2, dw, dh);
    }

    const cv = camVideoRef.current;
    if (cv && cv.videoWidth) {
      const pw = Math.round(OUT_W * 0.24);
      const ph = Math.round((pw * 9) / 16);
      const px = OUT_W - pw - 20;
      const py = OUT_H - ph - 20;
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 15);
      else ctx.rect(px, py, pw, ph);
      ctx.clip();
      const k = Math.max(pw / cv.videoWidth, ph / cv.videoHeight);
      const dw = cv.videoWidth * k;
      const dh = cv.videoHeight * k;
      ctx.drawImage(cv, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 15);
      else ctx.rect(px, py, pw, ph);
      ctx.stroke();
    }
  };

  const startCompositor = () => {
    if (workerRef.current || rafRef.current !== null) return;
    const camTrack = camStreamRef.current?.getVideoTracks()[0];
    const screenTrack = screenStreamRef.current?.getVideoTracks()[0];

    if (
      camTrack &&
      screenTrack &&
      window.MediaStreamTrackProcessor &&
      window.MediaStreamTrackGenerator
    ) {
      const gen = new window.MediaStreamTrackGenerator({ kind: "video" });
      gen.contentHint = "motion";
      const screenProc = new window.MediaStreamTrackProcessor({ track: screenTrack });
      const camProc = new window.MediaStreamTrackProcessor({ track: camTrack });
      const worker = new Worker(
        URL.createObjectURL(new Blob([COMPOSITOR_WORKER], { type: "text/javascript" }))
      );
      worker.postMessage(
        {
          screen: screenProc.readable,
          cam: camProc.readable,
          out: gen.writable,
          w: OUT_W,
          h: OUT_H,
        },
        [screenProc.readable, camProc.readable, gen.writable] as unknown as Transferable[]
      );
      workerRef.current = worker;
      canvasStreamRef.current = new MediaStream([gen]);
      return;
    }

    if (!camVideoRef.current && camStreamRef.current) {
      camVideoRef.current = hiddenVideo(camStreamRef.current);
    }
    if (!screenVideoRef.current && screenStreamRef.current) {
      screenVideoRef.current = hiddenVideo(screenStreamRef.current);
    }
    if (!canvasRef.current) {
      const c = document.createElement("canvas");
      c.width = OUT_W;
      c.height = OUT_H;
      canvasRef.current = c;
      ctxRef.current = c.getContext("2d", { alpha: false, desynchronized: true })!;
      ctxRef.current.imageSmoothingQuality = "low";
      canvasStreamRef.current = c.captureStream(FPS);
      const track = canvasStreamRef.current.getVideoTracks()[0];
      if (track) track.contentHint = "motion";
    }
    const ctx = ctxRef.current!;
    let last = 0;
    const loop = (t: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (t - last < 1000 / FPS - 1) return;
      last = t;
      drawFrame(ctx);
    };
    rafRef.current = requestAnimationFrame(loop);
    bgTimerRef.current = setInterval(() => {
      if (document.hidden) drawFrame(ctx);
    }, 250);
  };

  const stopCompositor = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (bgTimerRef.current) clearInterval(bgTimerRef.current);
    bgTimerRef.current = null;
  };

  const videoTrackFor = (mode: Source): MediaStreamTrack | undefined => {
    if (mode === "camera") return camStreamRef.current?.getVideoTracks()[0];
    if (mode === "screen") return screenStreamRef.current?.getVideoTracks()[0];
    return canvasStreamRef.current?.getVideoTracks()[0];
  };

  const previewFor = (mode: Source): MediaStream | null => {
    if (mode === "camera") return camStreamRef.current;
    if (mode === "screen") return screenStreamRef.current;
    return canvasStreamRef.current;
  };

  const applyMode = async (next: Source) => {
    setError("");
    try {
      if (next === "camera") await ensureCam();
      else if (next === "screen") await ensureScreen();
      else {
        await ensureScreen();
        await ensureCam();
      }
    } catch {
      setError("Нет доступа к камере или экрану - источник не переключён.");
      return;
    }
    if (next === "both") startCompositor();
    else stopCompositor();
    if (next === "camera") releaseScreen();
    if (next === "screen") releaseCam();

    const track = videoTrackFor(next);
    const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
    if (sender && track) await sender.replaceTrack(track);
    if (previewRef.current) previewRef.current.srcObject = previewFor(next);
    modeRef.current = next;
    setSource(next);
  };

  const stop = async () => {
    const res = resourceRef.current;
    resourceRef.current = null;
    if (res) await fetch(res, { method: "DELETE" }).catch(() => {});
    pcRef.current?.close();
    pcRef.current = null;
    stopCompositor();
    releaseCam();
    releaseScreen();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    setState("idle");
  };

  useEffect(() => () => void stop(), []);

  const start = async () => {
    setState("starting");
    setError("");
    try {
      if (source === "camera") await ensureCam();
      else if (source === "screen") await ensureScreen();
      else {
        await ensureScreen();
        await ensureCam();
      }
      if (source === "both") startCompositor();
      modeRef.current = source;

      const videoTrack = videoTrackFor(source);
      if (!videoTrack) throw new Error("Нет видеопотока");

      const audioTracks: MediaStreamTrack[] = [];
      if (micOn) {
        const mic = await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .catch(() => null);
        if (mic) {
          micStreamRef.current = mic;
          audioTracks.push(...mic.getAudioTracks());
        }
      }
      const sysAudio = screenStreamRef.current?.getAudioTracks() ?? [];
      audioTracks.push(...sysAudio);

      let outAudio = audioTracks;
      if (audioTracks.length > 1) {
        const ac = new AudioContext();
        audioCtxRef.current = ac;
        void ac.resume().catch(() => {});
        const dest = ac.createMediaStreamDestination();
        for (const t of audioTracks) {
          ac.createMediaStreamSource(new MediaStream([t])).connect(dest);
        }
        outAudio = dest.stream.getAudioTracks();
      }

      const sendStream = new MediaStream([videoTrack, ...outAudio]);
      if (previewRef.current) previewRef.current.srcObject = previewFor(source);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      sendStream.getTracks().forEach((track) =>
        pc.addTransceiver(track, { direction: "sendonly", streams: [sendStream] })
      );
      for (const t of pc.getTransceivers()) {
        if (t.sender.track?.kind !== "video" || !t.setCodecPreferences) continue;
        const codecs = RTCRtpSender.getCapabilities("video")?.codecs ?? [];
        const h264 = codecs.filter((c) => /h264/i.test(c.mimeType));
        const preferred = h264.filter((c) => /42e01f/i.test(c.sdpFmtpLine ?? ""));
        const rest = codecs.filter((c) => !/h264/i.test(c.mimeType));
        if (h264.length) {
          t.setCodecPreferences([...(preferred.length ? preferred : h264), ...rest]);
        }
      }
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        const p = sender.getParameters();
        p.encodings = [{ maxBitrate: 4_500_000 }];
        p.degradationPreference = "maintain-framerate";
        await sender.setParameters(p);
      }

      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const check = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", check);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", check);
        setTimeout(resolve, 2000);
      });

      const res = await fetch(`/whip?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription!.sdp,
      });
      if (res.status !== 201) {
        throw new Error(`WHIP: HTTP ${res.status}`);
      }
      resourceRef.current = res.headers.get("Location");
      await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });

      pc.addEventListener("connectionstatechange", () => {
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          if (resourceRef.current) {
            setError("Связь с медиасервером потерялась.");
            void stop();
          }
        }
      });
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось начать эфир");
      await stop();
      setState("error");
    }
  };

  const broadcasting = state === "on";

  return (
    <div className="rounded-brand border border-line bg-panel p-4">
      <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        <div
          className={`relative aspect-video overflow-hidden rounded-brand bg-black ${
            broadcasting ? "player-live" : ""
          }`}
        >
          <video ref={previewRef} muted playsInline autoPlay className="h-full w-full" />
          {state === "idle" && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-white/60">
              Предпросмотр появится здесь
            </p>
          )}
          {broadcasting && (
            <span className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-0.5 font-display text-[9px] font-semibold tracking-[0.2em] text-white uppercase">
              <span className="onair-dot h-1.5 w-1.5 rounded-full bg-accent" />
              Идёт эфир
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-brand border border-line">
              {(
                [
                  ["camera", "Камера"],
                  ["screen", "Экран"],
                  ["both", "Экран + камера"],
                ] as const
              ).map(([s, label]) => (
                <button
                  key={s}
                  type="button"
                  disabled={state === "starting"}
                  onClick={() => (broadcasting ? void applyMode(s) : setSource(s))}
                  className={`px-3 py-1.5 text-sm transition ${
                    source === s
                      ? "bg-accent-soft text-accent"
                      : "text-muted hover:text-ink"
                  } disabled:opacity-50`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={micOn}
                disabled={broadcasting || state === "starting"}
                onChange={(e) => setMicOn(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Микрофон
            </label>
          </div>

          <p className="text-xs text-muted">
            Источник можно переключать прямо во время эфира. В режиме
            «Экран + камера» экран идёт основным, камера - окошком в правом
            нижнем углу.
          </p>

          <p className="text-sm text-muted">
            Статус на сайте:{" "}
            {live ? (
              <span className="font-medium text-accent">в эфире</span>
            ) : (
              <span>офлайн</span>
            )}
            {live && !broadcasting && " (поток идёт не из этой вкладки)"}
          </p>
          {error && <p className="text-sm text-accent">{error}</p>}

          <div className="mt-auto">
            {broadcasting ? (
              <button
                type="button"
                onClick={() => void stop()}
                className="flex items-center gap-2 rounded-brand bg-panel-2 px-5 py-2.5 font-medium text-ink transition hover:bg-line"
              >
                <IconSquare size={14} />
                Завершить эфир
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void start()}
                disabled={state === "starting"}
                className="flex items-center gap-2 rounded-brand bg-accent px-5 py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {state === "starting" ? (
                  "Подключение…"
                ) : (
                  <>
                    <span className="inline-block h-2 w-2 rounded-full bg-white" />
                    Начать эфир
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
