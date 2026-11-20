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
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
const SIGNS = [["open", [1, 1, 1, 1]], ["fist", [0, 0, 0, 0]], ["point", [1, 0, 0, 0]], ["v", [1, 1, 0, 0]], ["rock", [1, 0, 0, 1]], ["three", [1, 1, 1, 0]]];
export const hand = window.__hand = {
  present: false, seen: 0, detT: 0,
  pts: Array.from({ length: 21 }, () => [0, 0]),
  vel: Array.from({ length: 21 }, () => [0, 0]),
  fx: Array.from({ length: 21 }, () => [new OneEuro(), new OneEuro()]),
  ext: [false, false, false, false], ratio: [2, 2, 2, 2], open: 2, thumbOut: false, sign: "other", _signCand: "", _signN: 0,
  pinch: 0, pinched: false, gesture: "none", _cand: "none", _candN: 0,
  palm: 1, listeners: new Set(),
  reset() { this.sign = "other"; this.present = false; this.fx.forEach((p) => { p[0].x = null; p[1].x = null; }); this.pinched = false; this.gesture = "none"; },
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
    // Shape is read in 3D (metres), so a fist or open hand reads the same from any angle.
    const wl = res.worldLandmarks && res.worldLandmarks[0];
    const G = wl ? wl.map((q) => [q.x, q.y, q.z]) : P.map((q) => [q[0], q[1], 0]);
    const palm3 = dist3(G[0], G[9]) || 1;
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const r = dist3(G[0], G[TIPS[k]]) / (dist3(G[0], G[MCPS[k]]) || 1);
      this.ratio[k] = r; sum += r;
      if (this.ext[k] && r < 1.38) this.ext[k] = false; else if (!this.ext[k] && r > 1.6) this.ext[k] = true;
    }
    this.open = sum / 4;
    // Which hand sign is this closest to? Score every sign and keep the best match,
    // so a slightly bent finger still reads as the sign you meant.
    const ex = this.ratio.map((r) => Math.max(0, Math.min(1, (r - 1.18) / 0.55)));
    let best = "other", bs = 1.6;
    for (const [name, tpl] of SIGNS) { let sc = 0; for (let k = 0; k < 4; k++) sc += Math.abs(ex[k] - tpl[k]); if (sc < bs) { bs = sc; best = name; } }
    if (best === this._signCand) this._signN++; else { this._signCand = best; this._signN = 1; }
    if (this._signN >= 2) this.sign = best;
    const tr = dist3(G[4], G[5]) / palm3;
    if (this.thumbOut && tr < 0.42) this.thumbOut = false; else if (!this.thumbOut && tr > 0.58) this.thumbOut = true;
    const pr = dist3(G[4], G[8]) / palm3;
    this.pinch = Math.max(0, Math.min(1, (0.8 - pr) / (0.8 - 0.28)));
    const was = this.pinched;
    if (!this.pinched && pr < 0.28) this.pinched = true; else if (this.pinched && pr > 0.5) this.pinched = false;
    this.finish(t, first, was);
  },
  finish(t, first, was) {
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
  // Demo driver: feed a scripted hand pose through exactly the same path as the camera.
  inject(pose, t = performance.now()) {
    if (!pose) { if (this.present) { this.reset(); this.emit("lost", t); } return; }
    const first = !this.present, was = this.pinched;
    for (let i = 0; i < 21; i++) {
      const prev = this.pts[i], nx = pose.pts[i][0], ny = pose.pts[i][1], dt = Math.max(1e-3, (t - this.detT) / 1000);
      this.vel[i][0] = first ? 0 : (nx - prev[0]) / dt; this.vel[i][1] = first ? 0 : (ny - prev[1]) / dt;
      prev[0] = nx; prev[1] = ny;
    }
    this.present = true; this.seen = t; this.detT = t;
    this.palm = dist(this.pts[0], this.pts[9]) || 1;
    this.ext = pose.ext.slice(); this.open = pose.open; this.thumbOut = !!pose.thumbOut; this.sign = pose.sign || "other";
    this.pinch = pose.pinch; this.pinched = pose.pinched;
    this.finish(t, first, was);
  },
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
/* ---------- sound: physical-sounding, built from noise and metal resonances ---------- */
let ac = null, master = null, noiseBuf = null;
export function audio() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createDynamicsCompressor(); master.threshold.value = -10; master.ratio.value = 6; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === "suspended") ac.resume();
  } catch {}
  return ac;
}
function noise(t, len, type, freq, q, vol, attack = 0.002) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (q) f.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + len + 0.05);
  return f;
}
function ping(t, freq, len, vol) {
  // a struck metal plate: a few inharmonic partials that die away
  for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]]) {
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = freq * m;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * a, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + len / m ** 0.4);
    o.connect(g).connect(master); o.start(t); o.stop(t + len + 0.05);
  }
}
function thump(t, from, to, len, vol) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine";
  o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + len);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(master); o.start(t); o.stop(t + len + 0.05);
}
/** Key press: a soft mechanical click. */
export function keyClick() {
  if (!ac) return; const t = ac.currentTime;
  noise(t, 0.018, "bandpass", 3800 + Math.random() * 600, 1.2, 0.35);
  noise(t + 0.004, 0.04, "lowpass", 700, 0, 0.25);
}
/** Small UI confirmation (switch, grab). */
export function tick(freq = 2000, vol = 0.14, len = 0.06) {
  if (!ac) return; const t = ac.currentTime;
  noise(t, Math.min(0.05, len), "bandpass", Math.min(6000, freq * 1.5), 2, vol * 1.6);
}
export function boom(vol = 0.5, len = 0.6) {
  if (!ac) return; const t = ac.currentTime;
  thump(t, 110, 32, len * 0.9, vol * 1.3);
  const f = noise(t, len, "lowpass", 2600, 0, vol); f.frequency.exponentialRampToValueAtTime(120, t + len);
}
/** Armour tearing apart: impact, metal plates, falling grit. */
export function crunch(power = 1) {
  if (!ac) return; const t = ac.currentTime;
  boom(0.65 * power, 0.9 + power * 0.5);
  noise(t, 0.12, "highpass", 2500, 0, 0.5 * power);
  for (let k = 0; k < 4 + power * 6; k++) ping(t + Math.random() * 0.25, 500 + Math.random() * 1800, 0.25 + Math.random() * 0.4, 0.05 * power);
  for (let k = 0; k < 10 * power; k++) noise(t + 0.15 + Math.random() * 0.8, 0.02, "bandpass", 3000 + Math.random() * 4000, 3, 0.15);
}
/** The big one: a single crushing detonation that ends cleanly. */
export function blast(power = 1) {
  if (!ac) return; const t = ac.currentTime;
  thump(t, 150, 28, 1.0, 1.0 * power);
  thump(t + 0.01, 70, 22, 0.8, 0.9 * power);
  const f = noise(t, 0.9, "lowpass", 5000, 0, 0.9 * power, 0.001); f.frequency.exponentialRampToValueAtTime(90, t + 0.9);
  noise(t, 0.09, "highpass", 2200, 0, 0.8 * power, 0.001);
  for (let k = 0; k < 5; k++) ping(t + Math.random() * 0.06, 300 + Math.random() * 900, 0.35, 0.06 * power);
}
/** A piece landing on the floor. */
export function clink() { if (!ac) return; ping(ac.currentTime, 900 + Math.random() * 1600, 0.25, 0.04); }
/** Straining metal while you squeeze. */
export function rumble() {
  if (!ac) return { set() {}, stop() {} };
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 180; f.Q.value = 4;
  const g = ac.createGain(); g.gain.value = 0;
  s.connect(f).connect(g).connect(master); s.start();
  return {
    set(k) { const t = ac.currentTime; g.gain.setTargetAtTime(0.9 * k, t, 0.05); f.frequency.setTargetAtTime(120 + 420 * k + Math.random() * 60, t, 0.04); },
    stop() { const t = ac.currentTime; g.gain.setTargetAtTime(0, t, 0.03); setTimeout(() => { try { s.stop(); } catch {} }, 300); },
  };
}
/** A continuous energy hiss (laser, energy ball). */
export function hum() {
  if (!ac) return { set() {}, stop() {} };
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1200; f.Q.value = 6;
  const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = 95; const og = ac.createGain(); og.gain.value = 0;
  const g = ac.createGain(); g.gain.value = 0;
  s.connect(f).connect(g).connect(master); o.connect(og).connect(master); s.start(); o.start();
  return {
    set(k) { const t = ac.currentTime; g.gain.setTargetAtTime(0.35 * k, t, 0.04); og.gain.setTargetAtTime(0.12 * k, t, 0.04); f.frequency.setTargetAtTime(900 + 900 * k + Math.random() * 200, t, 0.03); },
    stop() { const t = ac.currentTime; g.gain.setTargetAtTime(0, t, 0.03); og.gain.setTargetAtTime(0, t, 0.03); setTimeout(() => { try { s.stop(); o.stop(); } catch {} }, 300); },
  };
}
/** Whoosh of something flying past. */
export function whoosh(vol = 0.4, len = 0.5) {
  if (!ac) return; const t = ac.currentTime;
  const f = noise(t, len, "bandpass", 400, 1.5, vol, len * 0.4); f.frequency.exponentialRampToValueAtTime(2400, t + len * 0.5); f.frequency.exponentialRampToValueAtTime(600, t + len);
}
export function buzz(ms = 10) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }
