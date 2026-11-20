// Camera + hand tracking shared by every mode.
// Detection runs once per camera frame; rendering runs at screen refresh and
// predicts the hand forward from its filtered velocity, so motion feels instant.
import { FilesetResolver, HandLandmarker } from "../vendor/mediapipe/vision_bundle.mjs";

export const video = document.getElementById("cam");
export const view = { W: innerWidth, H: innerHeight, dpr: Math.min(devicePixelRatio || 1, 1.5), facing: "environment" };
addEventListener("resize", () => { view.W = innerWidth; view.H = innerHeight; });

/* ---------- camera ---------- */
let stream = null;
export async function startCamera(facing = view.facing) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } },
    });
  } catch (e) {
    if (e.name === "NotAllowedError") throw e;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing } });
  }
  view.facing = facing;
  video.srcObject = stream;
  video.classList.toggle("mirror", facing === "user");
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener("loadedmetadata", r, { once: true }));
  hand.reset();
}
export const cameraOn = () => !!stream;

/* ---------- tracker ---------- */
let landmarker = null, loading = null;
export const tracker = { ready: false, fps: 0, latency: 0 };
export function loadTracker(onProgress = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    const res = await fetch(new URL("../hand_landmarker.task", import.meta.url));
    if (!res.ok) throw new Error("model " + res.status);
    const total = +res.headers.get("content-length") || 7819105;
    const reader = res.body.getReader(); const parts = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress(Math.min(1, got / total) * 0.85); }
    const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
    const files = await FilesetResolver.forVisionTasks(new URL("../vendor/mediapipe/wasm", import.meta.url).href);
    const opts = (delegate) => ({
      baseOptions: { modelAssetBuffer: buf, delegate }, runningMode: "VIDEO", numHands: 1,
      minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { landmarker = await HandLandmarker.createFromOptions(files, opts("GPU")); }
    catch { landmarker = await HandLandmarker.createFromOptions(files, opts("CPU")); }
    onProgress(1);
    tracker.ready = true;
    schedule();
  })();
  return loading;
}

let lastTs = 0, lastVT = -1, frames = 0, fpsT = performance.now();
function schedule() {
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(detect);
  else requestAnimationFrame(() => (video.currentTime !== lastVT ? detect() : schedule()));
}
function detect() {
  lastVT = video.currentTime;
  if (landmarker && video.readyState >= 2 && video.videoWidth) {
    let ts = performance.now(); if (ts <= lastTs) ts = lastTs + 0.1; lastTs = ts;
    try {
      const res = landmarker.detectForVideo(video, ts);
      tracker.latency = tracker.latency * 0.9 + (performance.now() - ts) * 0.1;
      hand.update(res, ts);
    } catch (e) { /* skip a bad frame */ }
    frames++;
    if (ts - fpsT > 1000) { tracker.fps = Math.round((frames * 1000) / (ts - fpsT)); frames = 0; fpsT = ts; }
  }
  schedule();
}

/* ---------- filtering ---------- */
class OneEuro {
  constructor(minCut = 3.6, beta = 0.03, dCut = 1.2) { this.minCut = minCut; this.beta = beta; this.dCut = dCut; this.x = null; this.dx = 0; this.t = 0; }
  static a(cut, dt) { const tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); }
  f(x, t) {
    if (this.x == null) { this.x = x; this.t = t; this.dx = 0; return x; }
    const dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    const dx = (x - this.x) / dt; this.dx += OneEuro.a(this.dCut, dt) * (dx - this.dx);
    this.x += OneEuro.a(this.minCut + this.beta * Math.abs(this.dx), dt) * (x - this.x);
    return this.x;
  }
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export { dist };

function toScreen(lm) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = Math.max(view.W / vw, view.H / vh);
  let x = lm.x * vw * s + (view.W - vw * s) / 2;
  const y = lm.y * vh * s + (view.H - vh * s) / 2;
  if (view.facing === "user") x = view.W - x;
  return [x, y];
}

/* ---------- the hand ---------- */
const TIPS = [8, 12, 16, 20], MCPS = [5, 9, 13, 17];
export const hand = {
  present: false, seen: 0, detT: 0,
  pts: Array.from({ length: 21 }, () => [0, 0]),
  vel: Array.from({ length: 21 }, () => [0, 0]),
  fx: Array.from({ length: 21 }, () => [new OneEuro(), new OneEuro()]),
  ext: [false, false, false, false], thumbOut: false,
  pinch: 0, pinched: false, gesture: "none", _cand: "none", _candN: 0,
  palm: 1, listeners: new Set(),
  reset() { this.present = false; this.fx.forEach((p) => { p[0].x = null; p[1].x = null; }); this.pinched = false; this.gesture = "none"; },
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  update(res, t) {
    const lms = res.landmarks && res.landmarks[0];
    if (!lms) {
      if (this.present && t - this.seen > 260) { this.reset(); this.emit("lost", t); }
      return;
    }
    const first = !this.present;
    if (first) this.fx.forEach((p) => { p[0].x = null; p[1].x = null; });
    for (let i = 0; i < 21; i++) {
      const [x, y] = toScreen(lms[i]);
      const p = this.pts[i], f = this.fx[i];
      p[0] = f[0].f(x, t); p[1] = f[1].f(y, t);
      this.vel[i][0] = f[0].dx; this.vel[i][1] = f[1].dx;
    }
    this.present = true; this.seen = t; this.detT = t;
    const P = this.pts;
    this.palm = dist(P[0], P[9]) || 1;
    for (let k = 0; k < 4; k++) {
      const r = dist(P[0], P[TIPS[k]]) / (dist(P[0], P[MCPS[k]]) || 1);
      if (this.ext[k] && r < 1.38) this.ext[k] = false; else if (!this.ext[k] && r > 1.62) this.ext[k] = true;
    }
    const tr = dist(P[4], P[5]) / this.palm;
    if (this.thumbOut && tr < 0.42) this.thumbOut = false; else if (!this.thumbOut && tr > 0.58) this.thumbOut = true;
    const pr = dist(P[4], P[8]) / this.palm;
    this.pinch = Math.max(0, Math.min(1, (0.8 - pr) / (0.8 - 0.28)));
    const was = this.pinched;
    if (!this.pinched && pr < 0.27) this.pinched = true; else if (this.pinched && pr > 0.48) this.pinched = false;

    const e = this.ext, n = e.filter(Boolean).length;
    let g = "other";
    if (this.pinched) g = "pinch";
    else if (n === 4) g = "open";
    else if (n === 0 && !this.thumbOut) g = "fist";
    else if (e[0] && !e[1] && !e[2] && !e[3]) g = "point";
    if (g === this._cand) this._candN++; else { this._cand = g; this._candN = 1; }
    const prevG = this.gesture;
    if (this._candN >= 2 || g === "pinch") this.gesture = g;

    if (first) this.emit("found", t);
    if (this.pinched && !was) this.emit("pinchdown", t);
    if (!this.pinched && was) this.emit("pinchup", t);
    if (this.gesture !== prevG) this.emit("gesture", t, prevG);
    this.emit("frame", t);
  },
  emit(type, t, extra) { for (const fn of this.listeners) fn(type, t, extra); },
  // Position of landmark i right now, pushed forward along its velocity.
  at(i, now = performance.now(), out = [0, 0]) {
    const ahead = Math.min(0.07, Math.max(0, (now - this.detT) / 1000)) + 0.012;
    out[0] = this.pts[i][0] + this.vel[i][0] * ahead;
    out[1] = this.pts[i][1] + this.vel[i][1] * ahead;
    return out;
  },
  speed(i) { return Math.hypot(this.vel[i][0], this.vel[i][1]); },
};

/* ---------- drawing the hand ---------- */
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const tmp = Array.from({ length: 21 }, () => [0, 0]);
export function predicted(now) { for (let i = 0; i < 21; i++) hand.at(i, now, tmp[i]); return tmp; }
export function drawHand(ctx, P, rgb = "134,230,255", alpha = 1) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const [w, a] of [[9, 0.10], [4.5, 0.22], [1.8, 0.95]]) {
    ctx.strokeStyle = `rgba(${a === 0.95 ? "235,250,255" : rgb},${a * alpha})`; ctx.lineWidth = w;
    ctx.beginPath(); for (const [a1, b1] of BONES) { ctx.moveTo(P[a1][0], P[a1][1]); ctx.lineTo(P[b1][0], P[b1][1]); } ctx.stroke();
  }
  for (let i = 0; i < 21; i++) {
    const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
    ctx.fillStyle = `rgba(${rgb},${(tip ? 0.35 : 0.18) * alpha})`;
    ctx.beginPath(); ctx.arc(P[i][0], P[i][1], tip ? 9 : 5, 0, 6.283); ctx.fill();
    ctx.fillStyle = `rgba(240,252,255,${alpha})`;
    ctx.beginPath(); ctx.arc(P[i][0], P[i][1], tip ? 3.2 : 1.9, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

/* ---------- small shared effects ---------- */
let ac = null;
export function audio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch {} return ac; }
export function tick(freq = 2000, vol = 0.14, len = 0.06) {
  if (!ac) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = "triangle"; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + len);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + len + 0.02);
}
export function boom(vol = 0.5, len = 0.6) {
  if (!ac) return;
  const t = ac.currentTime, n = Math.floor(ac.sampleRate * len), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
  const s = ac.createBufferSource(); s.buffer = b;
  const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(140, t + len);
  const g = ac.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(ac.destination); s.start(t);
}
export function crunch(power = 1) {
  if (!ac) return;
  const t0 = ac.currentTime;
  boom(0.7 * power, 1.2);
  // metal shards: short bright pings at random pitches
  for (let k = 0; k < 9; k++) {
    const t = t0 + Math.random() * 0.22, o = ac.createOscillator(), g = ac.createGain();
    o.type = k % 2 ? "square" : "triangle"; o.frequency.setValueAtTime(400 + Math.random() * 2600, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * power, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08 + Math.random() * 0.2);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.35);
  }
  // crackle
  const n = Math.floor(ac.sampleRate * 0.35), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() < 0.08 ? (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5) : 0;
  const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800;
  const g = ac.createGain(); g.gain.value = 0.9 * power; s.connect(f).connect(g).connect(ac.destination); s.start(t0);
}
export function clink() { tick(2200 + Math.random() * 2500, 0.035, 0.05); }
export function rumble() {
  if (!ac) return { set() {}, stop() {} };
  const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
  o.type = "sawtooth"; o.frequency.value = 42; f.type = "lowpass"; f.frequency.value = 160; g.gain.value = 0;
  o.connect(f).connect(g).connect(ac.destination); o.start();
  return {
    set(k) { const t = ac.currentTime; g.gain.setTargetAtTime(0.32 * k, t, 0.05); o.frequency.setTargetAtTime(42 + 50 * k, t, 0.05); f.frequency.setTargetAtTime(160 + 500 * k, t, 0.05); },
    stop() { const t = ac.currentTime; g.gain.setTargetAtTime(0, t, 0.03); setTimeout(() => { try { o.stop(); } catch {} }, 300); },
  };
}
export function buzz(ms = 10) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }
