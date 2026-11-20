// Screen shatter: the picture on the phone (camera, robot and effects together) breaks into
// glass shards that crack, hang for a moment, then fall away and reveal the live room again.
const cv = document.createElement("canvas");
cv.id = "glass";
cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:6;pointer-events:none";
document.body.appendChild(cv);
const ctx = cv.getContext("2d");
const snap = document.createElement("canvas"), sctx = snap.getContext("2d");
let shards = [], t0 = 0, running = false, W = 0, H = 0, ox = 0, oy = 0;

function grab() {
  W = innerWidth; H = innerHeight;
  const d = Math.min(devicePixelRatio || 1, 1.5);
  snap.width = cv.width = Math.round(W * d); snap.height = cv.height = Math.round(H * d);
  sctx.setTransform(d, 0, 0, d, 0, 0); ctx.setTransform(d, 0, 0, d, 0, 0);
  const v = document.getElementById("cam");
  if (v && v.videoWidth) {
    const s = Math.max(W / v.videoWidth, H / v.videoHeight), w = v.videoWidth * s, h = v.videoHeight * s;
    sctx.save();
    if (v.classList.contains("mirror")) { sctx.translate(W, 0); sctx.scale(-1, 1); }
    sctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h); sctx.restore();
  } else { sctx.fillStyle = "#000"; sctx.fillRect(0, 0, W, H); }
  for (const id of ["gl", "fx"]) { const c = document.getElementById(id); if (c && !c.hidden && c.width) sctx.drawImage(c, 0, 0, W, H); }
}

export function shatterScreen(x, y, power = 1) {
  grab(); ox = x; oy = y;
  shards = [];
  const n = 16, rings = [0, 50, 120, 220, 360, 560, 820, 1300];
  const ang = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.25);
  const jit = rings.map((r) => ang.map(() => r * (0.85 + Math.random() * 0.3)));
  const P = (ri, ai) => { const a = ang[(ai + n) % n], r = jit[ri][(ai + n) % n]; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; };
  for (let ri = 0; ri < rings.length - 1; ri++) for (let ai = 0; ai < n; ai++) {
    const pts = ri === 0 ? [[x, y], P(1, ai), P(1, ai + 1)] : [P(ri, ai), P(ri, ai + 1), P(ri + 1, ai + 1), P(ri + 1, ai)];
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (cx < -200 || cx > W + 200 || cy < -200 || cy > H + 200) continue;
    const dx = cx - x, dy = cy - y, dd = Math.hypot(dx, dy) || 1, sp = (260 + Math.random() * 520) * power / (1 + dd / 600);
    shards.push({ pts, cx, cy, x: 0, y: 0, vx: (dx / dd) * sp, vy: (dy / dd) * sp - 120 * power, r: 0, vr: (Math.random() - 0.5) * 7, delay: 0.16 + ri * 0.05 + Math.random() * 0.08, z: 1 });
  }
  t0 = performance.now();
  if (!running) { running = true; requestAnimationFrame(tick); }
}

function tick(now) {
  const t = (now - t0) / 1000;
  ctx.clearRect(0, 0, W, H);
  let alive = 0;
  for (const s of shards) {
    const k = Math.max(0, t - s.delay);
    s.x = s.vx * k; s.y = s.vy * k + 0.5 * 2600 * k * k; s.r = s.vr * k; s.z = 1 - Math.min(0.35, k * 0.25);
    if (s.cy + s.y > H + 300 && k > 0) continue;
    alive++;
    ctx.save();
    ctx.translate(s.cx + s.x, s.cy + s.y); ctx.rotate(s.r); ctx.scale(s.z, s.z); ctx.translate(-s.cx, -s.cy);
    ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.save(); ctx.clip(); ctx.drawImage(snap, 0, 0, W, H);
    // a glint on each pane of glass
    const g = ctx.createLinearGradient(s.cx - 60, s.cy - 60, s.cx + 60, s.cy + 60);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, `rgba(255,255,255,${0.12 + Math.min(0.3, k)})`); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.restore();
  }
  // hot core where it hit
  if (t < 0.4) { const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 160); g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - t / 0.4)})`); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.fillRect(ox - 160, oy - 160, 320, 320); }
  if (alive && t < 3) requestAnimationFrame(tick); else { running = false; ctx.clearRect(0, 0, W, H); shards = []; }
}
