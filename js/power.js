// Shakti: powers you cast with your hand. The camera stays clean until you use one.
//   ✋ open palm            -> plasma orb charges in your palm
//   ✋ → ✊ → ✋             -> squeeze the orb, then hurl it: it flies into the room and explodes
//   ✊ held (no orb)         -> black hole; open the hand and it goes supernova
//   ☝️ one finger            -> write with light in the air
//   🤏 pinch                 -> pull an energy vortex into your fingers; let go and it bursts
//   ✌️ two fingers           -> lightning
//   🤘 index + little finger -> fire
//   🖖 three fingers         -> spinning energy shield
import { hand, predicted, drawHand, view, boom, tick, buzz, whoosh, blast } from "./core.js";

export function createPower(root, fx) {
  const ctx = fx.getContext("2d");
  let last = performance.now(), shake = 0, flash = 0;
  let orb = 0, orbX = 0, orbY = 0, squeeze = 0, gripping = false, orbReadyAt = 0, chargedSnd = false;
  let shots = [], blasts = [], sparks = [], smoke = [], flames = [], bolts = [], strokes = [], pen = null;
  let vortex = 0, vortexOn = false, vx = 0, vy = 0, motes = [];
  let streams = [], streaks = [], embers = [], punch = 0, charge = 0, skyT = 0;
  const cam = document.getElementById("cam");
  let hole = 0, holeT = 0, holeX = 0, holeY = 0, shield = 0, shX = 0, shY = 0, boltT = 0, fireT = 0;
  const HUE = 195;

  /* ---------- spawning ---------- */
  function burst(x, y, n, speed, hue, grav = 500, size = 2.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = speed * (0.25 + Math.random());
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, d: 0.5 + Math.random() * 0.9, h: hue + (Math.random() - 0.5) * 40, r: 0.8 + Math.random() * size, g: grav });
    }
  }
  // the screen glass breaks where the blast hits
  let cracks = [];
  function crack(x, y, power) {
    const lines = [], rings = [];
    const n = 12 + Math.round(power * 6);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * 6.283 + (Math.random() - 0.5) * 0.3, r = 0, px = x, py = y; const seg = [[px, py]];
      const len = 220 + Math.random() * 520 * power;
      while (r < len) { r += 18 + Math.random() * 34; a += (Math.random() - 0.5) * 0.35; px = x + Math.cos(a) * r; py = y + Math.sin(a) * r; seg.push([px, py]); }
      lines.push(seg);
    }
    for (let k = 1; k <= 3; k++) { const R = k * (55 + Math.random() * 25); const ring = []; for (let i = 0; i <= n; i++) { const a = (i / n) * 6.283; ring.push([x + Math.cos(a) * R * (0.8 + Math.random() * 0.4), y + Math.sin(a) * R * (0.8 + Math.random() * 0.4)]); } rings.push(ring); }
    cracks.push({ lines, rings, x, y, life: 1 });
  }
  function drawCracks(dt) {
    ctx.globalCompositeOperation = "source-over";
    for (let i = cracks.length - 1; i >= 0; i--) {
      const c = cracks[i]; c.life -= dt / 2.2; if (c.life <= 0) { cracks.splice(i, 1); continue; }
      const a = Math.min(1, c.life * 1.6);
      for (const [w, col] of [[3.2, `rgba(0,0,0,${0.45 * a})`], [1.2, `rgba(255,255,255,${0.85 * a})`]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "miter";
        for (const seg of [...c.lines, ...c.rings]) { ctx.beginPath(); ctx.moveTo(seg[0][0], seg[0][1]); for (const p of seg) ctx.lineTo(p[0], p[1]); ctx.stroke(); }
      }
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 60); g.addColorStop(0, `rgba(255,255,255,${0.7 * a})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, 60, 0, 6.283); ctx.fill();
    }
  }
  // the whole hand burns with living energy: flames climb every bone, arcs jump between the fingers
  const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
  let aura = [], arcT = 0;
  function powerHand(P, dt, now, heat) {
    // heat: 0 calm blue fire, 1 white-hot (fist charging)
    const n = 2 + Math.round(heat * 2);
    for (const [a, b] of BONES) for (let k = 0; k < n; k++) {
      const f = Math.random(), x = P[a][0] + (P[b][0] - P[a][0]) * f, y = P[a][1] + (P[b][1] - P[a][1]) * f;
      aura.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 60, vy: -80 - Math.random() * 160 * (1 + heat), life: 1, d: 0.22 + Math.random() * 0.28, r: 3 + Math.random() * 5 + heat * 4 });
    }
    if (aura.length > 1600) aura.splice(0, aura.length - 1600);
    for (let i = aura.length - 1; i >= 0; i--) {
      const q = aura[i]; q.life -= dt / q.d; if (q.life <= 0) { aura.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92;
      const l = q.life, r = q.r * (0.4 + l);
      const hue = heat > 0.4 ? 30 + l * 25 : 205 - l * 15, light = 50 + l * 40;
      ctx.fillStyle = `hsla(${hue},100%,${light}%,${0.55 * l})`; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.283); ctx.fill();
    }
    // a bright core along the bones
    ctx.lineCap = "round";
    for (const [w, al] of [[26, 0.08], [12, 0.25], [4, 0.9]]) {
      ctx.strokeStyle = heat > 0.4 ? `rgba(255,${200 - heat * 60},${140 - heat * 80},${al})` : `rgba(150,215,255,${al})`;
      ctx.lineWidth = w * (1 + heat * 0.6); ctx.beginPath();
      for (const [a, b] of BONES) { ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); } ctx.stroke();
    }
    // electricity jumping between fingertips and off the hand
    if (now - arcT > 55 - heat * 30) {
      arcT = now; const tips = [4, 8, 12, 16, 20];
      const a = tips[(Math.random() * 5) | 0], b = tips[(Math.random() * 5) | 0];
      if (a !== b) bolt(P[a][0], P[a][1], P[b][0], P[b][1], 0.7, 2);
      const t2 = tips[(Math.random() * 5) | 0], ang = Math.random() * 6.283;
      bolt(P[t2][0], P[t2][1], P[t2][0] + Math.cos(ang) * (60 + heat * 120), P[t2][1] + Math.sin(ang) * (60 + heat * 120), 0.6, 2);
    }
    // glow of the palm
    const px = (P[0][0] + P[9][0]) / 2, py = (P[0][1] + P[9][1]) / 2;
    const g = ctx.createRadialGradient(px, py, 0, px, py, 140 + heat * 90);
    g.addColorStop(0, heat > 0.4 ? `rgba(255,230,190,${0.35 + heat * 0.4})` : "rgba(140,210,255,.28)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 140 + heat * 90, 0, 6.283); ctx.fill();
  }

  function explode(x, y, power) {
    blasts.push({ x, y, r: 8, life: 1, p: power }, { x, y, r: 2, life: 1, p: power * 0.6, late: 0.12 });
    burst(x, y, 380 * power, 1300 * power, 30, 420, 3);
    burst(x, y, 160 * power, 700 * power, HUE, 200, 2);
    for (let i = 0; i < 26 * power; i++) { const a = Math.random() * 6.283, s = 60 + Math.random() * 220; smoke.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, r: 20 + Math.random() * 30, life: 1, d: 1.4 + Math.random() * 1.2 }); }
    blasts.push({ x, y, r: 4, life: 1, p: power * 1.4, late: 0.06, hue: 0 }, { x, y, r: 4, life: 1, p: power * 1.2, late: 0.2, hue: 190 });
    streaks.push({ x, y, life: 1, w: 900 * power });
    for (let i = 0; i < 120 * power; i++) embers.push({ x: x + (Math.random() - 0.5) * 300, y: y - Math.random() * 200, vx: (Math.random() - 0.5) * 200, vy: -200 - Math.random() * 500, life: 1, d: 1.6 + Math.random() * 1.6 });
    shake = 44 * power; flash = 1.3; punch = 0.12 * power;
    blast(Math.min(1.8, 1.2 * power)); crack(x, y, power);
    try { navigator.vibrate && navigator.vibrate([50, 30, 160]); } catch {}
  }
  function bolt(x0, y0, x1, y1, w = 1, depth = 0) {
    const pts = [[x0, y0]], n = 12;
    for (let i = 1; i < n; i++) { const f = i / n, j = 70 * Math.sin(f * Math.PI) + 8; pts.push([x0 + (x1 - x0) * f + (Math.random() - 0.5) * j, y0 + (y1 - y0) * f + (Math.random() - 0.5) * j]); }
    pts.push([x1, y1]); bolts.push({ pts, life: 1, w });
    if (depth < 2 && Math.random() < 0.7) { const k = pts[(3 + Math.random() * 7) | 0]; bolt(k[0], k[1], k[0] + (Math.random() - 0.5) * 260, k[1] + (Math.random() - 0.5) * 260, w * 0.6, depth + 1); }
  }
  function glow(x, y, r, stops) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, 6.283); ctx.fill();
  }

  /* ---------- frame ---------- */
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const W = view.W, H = view.H, d = view.dpr;
    if (fx.width !== Math.round(W * d)) { fx.width = Math.round(W * d); fx.height = Math.round(H * d); }
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake; shake *= Math.pow(0.02, dt);
    punch *= Math.pow(0.004, dt);
    cam.style.transform = `${cam.classList.contains("mirror") ? "scaleX(-1) " : ""}translate(${sx * 0.8}px, ${sy * 0.8}px) scale(${1 + punch})`;
    const fl = Math.max(0, flash);
    cam.style.filter = fl > 0.01 || charge > 0.01 ? `brightness(${1 + fl * 1.6 + charge * 0.25}) saturate(${1 - fl * 0.5}) contrast(${1 + fl * 0.3})` : "";
    ctx.setTransform(d, 0, 0, d, sx * d, sy * d); ctx.clearRect(-60, -60, W + 120, H + 120);

    const P = hand.present ? predicted(now) : null;
    const sign = P ? (hand.pinched && hand.sign !== "fist" ? "pinch" : hand.sign) : "none";
    const palmX = P ? (P[0][0] + P[5][0] + P[9][0] + P[13][0] + P[17][0]) / 5 : W / 2;
    const palmY = P ? (P[0][1] + P[5][1] + P[9][1] + P[13][1] + P[17][1]) / 5 : H / 2;

    /* ✋ orb: charge, ✊ squeeze, ✋ hurl */
    if (sign === "open") { orb = Math.min(1, orb + dt / 0.45); orbReadyAt = now; if (orb >= 1 && !chargedSnd) { chargedSnd = true; } }
    charge = sign === "open" ? Math.min(1, charge + dt * 2) : Math.max(0, charge - dt * 3);
    // power is drawn in from every edge of the screen into the open hand
    if (sign === "open") for (let k = 0; k < 10; k++) {
      const side = Math.random() * 4, ex = side < 1 ? 0 : side < 2 ? W : Math.random() * W, ey = side < 2 ? Math.random() * H : side < 3 ? 0 : H;
      streams.push({ x: ex, y: ey, life: 1 });
    }
    if (P) { orbX += (palmX - orbX) * Math.min(1, dt * 28); orbY += (palmY - 55 - orbY) * Math.min(1, dt * 28); }
    if (sign === "fist" && orb > 0.35 && (gripping || now - orbReadyAt < 1600)) {
      if (!gripping) { gripping = true; tick(260, 0.25); buzz(20); }
      squeeze = Math.min(1, squeeze + dt / 0.3);
    } else if (gripping) {
      gripping = false;
      if (squeeze > 0.35 && (sign === "open" || !P)) {
        const tx = W * 0.5 + (orbX - W * 0.5) * 0.35, ty = H * 0.3;
        shots.push({ x: orbX, y: orbY, x0: orbX, y0: orbY, tx, ty, t: 0, p: 0.7 + orb * 0.5 }); whoosh(0.45, 0.35);
        orb = 0; chargedSnd = false;
      }
      squeeze = 0;
    }
    if (!P) orb = 0; else if (sign !== "open" && !gripping) orb = Math.max(0, orb - dt * 1.4);
    if (orb < 0.5) chargedSnd = false;

    /* ✊ with no orb: black hole */
    if (sign === "fist" && !gripping && orb < 0.35) { if (!holeT) holeT = now; hole = Math.min(1, Math.max(0, (now - holeT - 350) / 700)); holeX = palmX; holeY = palmY; }
    else { if (hole > 0.5 && (sign === "open" || !P)) explode(holeX, holeY, 1.6); holeT = 0; hole = Math.max(0, hole - dt * 4); }
    if (hole > 0.05 && Math.random() < hole) { const a = Math.random() * 6.283, r = 160 + Math.random() * 120; motes.push({ x: holeX + Math.cos(a) * r, y: holeY + Math.sin(a) * r, life: 1, h: 25 }); }

    /* ☝️ light pen */
    if (sign === "point") {
      const x = P[8][0], y = P[8][1];
      if (!pen) { pen = { pts: [], t: now, h: (now / 40) % 360 }; strokes.push(pen); }
      const lp = pen.pts[pen.pts.length - 1];
      if (!lp) pen.pts.push([x, y]); else if (Math.hypot(x - lp[0], y - lp[1]) > 2.5) pen.pts.push([lp[0] + (x - lp[0]) * 0.6, lp[1] + (y - lp[1]) * 0.6]);
      pen.t = now;
    } else pen = null;
    strokes = strokes.filter((s) => now - s.t < 9000);

    /* ✌️ lightning */
    if (sign === "v" && now - boltT > 65) {
      boltT = now;
      for (const tip of [8, 12]) {
        const a = Math.atan2(P[tip][1] - P[tip - 3][1], P[tip][0] - P[tip - 3][0]) + (Math.random() - 0.5) * 0.7, L = 280 + Math.random() * 380;
        bolt(P[tip][0], P[tip][1], P[tip][0] + Math.cos(a) * L, P[tip][1] + Math.sin(a) * L, 1.4);
      }
      if (Math.random() < 0.5) tick(5000 + Math.random() * 2500, 0.1, 0.05);
      // and lightning comes down from above into the fingers
      if (now - skyT > 420) {
        skyT = now; const tx = (P[8][0] + P[12][0]) / 2, ty = (P[8][1] + P[12][1]) / 2;
        bolt(tx + (Math.random() - 0.5) * 200, -20, tx, ty, 2.6); bolt(tx + (Math.random() - 0.5) * 260, -20, tx, ty, 1.6);
        flash = Math.max(flash, 0.45); shake = Math.max(shake, 10); blast(0.35); buzz(25);
        burst(tx, ty, 60, 500, 210, 300, 2);
      }
    }

    /* 🤘 fire */
    if (sign === "rock") {
      for (const [tip, base] of [[8, 5], [20, 17]]) {
        let dx = P[tip][0] - P[base][0], dy = P[tip][1] - P[base][1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        for (let k = 0; k < 9; k++) {
          const s = 520 + Math.random() * 520, a = (Math.random() - 0.5) * 0.4, c = Math.cos(a), si = Math.sin(a);
          flames.push({ x: P[tip][0], y: P[tip][1], vx: (dx * c - dy * si) * s, vy: (dx * si + dy * c) * s, life: 1, d: 0.32 + Math.random() * 0.32, r: 3 + Math.random() * 4 });
        }
      }
      if (now - fireT > 200) { fireT = now; tick(700 + Math.random() * 300, 0.16, 0.2); }
      if (Math.random() < 0.3) smoke.push({ x: P[8][0], y: P[8][1] - 60, vx: (Math.random() - 0.5) * 40, vy: -80, r: 14, life: 1, d: 1.2 });
    }

    /* 🖖 shield */
    shield += ((sign === "three" ? 1 : 0) - shield) * Math.min(1, dt * 9);
    if (sign === "three") { shX = palmX; shY = palmY - 30; }

    /* 🤏 vortex */
    const px = P ? (P[4][0] + P[8][0]) / 2 : vx, py = P ? (P[4][1] + P[8][1]) / 2 : vy;
    if (sign === "pinch") {
      if (!vortexOn) { vortexOn = true; whoosh(0.3, 0.6); }
      vx = px; vy = py; vortex = Math.min(1, vortex + dt / 0.8);
      for (let k = 0; k < 6; k++) { const a = Math.random() * 6.283, r = 140 + Math.random() * 180; motes.push({ x: vx + Math.cos(a) * r, y: vy + Math.sin(a) * r, life: 1, h: HUE }); }
    } else if (vortexOn) {
      vortexOn = false;
      if (vortex > 0.3) { burst(vx, vy, 260 * vortex, 900, HUE, 200, 2.5); blasts.push({ x: vx, y: vy, r: 6, life: 1, p: 0.5 }); boom(0.35, 0.5); whoosh(0.3, 0.3); }
      motes = motes.filter((m) => m.h !== HUE); vortex = 0;
    }

    /* ---------- draw ---------- */
    ctx.globalCompositeOperation = "lighter";
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i], cx = m.h === HUE ? vx : holeX, cy = m.h === HUE ? vy : holeY;
      const dx = cx - m.x, dy = cy - m.y, dd = Math.hypot(dx, dy) || 1;
      const sp = 380 + (1 - Math.min(1, dd / 300)) * 900;
      m.x += (dx / dd) * sp * dt + (-dy / dd) * sp * 0.8 * dt; m.y += (dy / dd) * sp * dt + (dx / dd) * sp * 0.8 * dt;
      if (dd < 12 || (m.h !== HUE && hole < 0.05) || motes.length > 700) { motes.splice(i, 1); continue; }
      const a = Math.min(1, 1.4 - dd / 300);
      ctx.strokeStyle = m.h === HUE ? `rgba(140,230,255,${a})` : `rgba(255,170,90,${a})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - (dx / dd) * 10, m.y - (dy / dd) * 10); ctx.stroke();
    }
    if (vortex > 0.02) {
      glow(vx, vy, 30 + vortex * 60, [[0, `rgba(255,255,255,${0.9 * vortex})`], [0.25, `rgba(140,230,255,${0.6 * vortex})`], [1, "rgba(60,160,255,0)"]]);
      ctx.strokeStyle = `rgba(160,235,255,${0.7 * vortex})`; ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(vx, vy, 22 + k * 14, 8 + k * 5, now / (300 + k * 120) * (k % 2 ? -1 : 1), 0, 6.283); ctx.stroke(); }
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const s of strokes) {
      if (s.pts.length < 2) continue;
      const a = Math.max(0, 1 - Math.max(0, now - s.t - 6000) / 3000);
      for (const [w, al, l] of [[22, 0.1, 55], [10, 0.3, 60], [3, 1, 94]]) {
        ctx.strokeStyle = `hsla(${s.h},100%,${l}%,${al * a})`; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(s.pts[0][0], s.pts[0][1]); for (const p of s.pts) ctx.lineTo(p[0], p[1]); ctx.stroke();
      }
    }
    if (sign === "point") glow(P[8][0], P[8][1], 26, [[0, "rgba(255,255,255,.95)"], [0.4, `hsla(${(now / 40) % 360},100%,65%,.6)`], [1, "rgba(0,0,0,0)"]]);
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.life -= dt * 9; if (b.life <= 0) { bolts.splice(i, 1); continue; }
      for (const [w, al, c] of [[12, 0.16, "120,180,255"], [4, 0.55, "180,220,255"], [1.4, 1, "255,255,255"]]) {
        ctx.strokeStyle = `rgba(${c},${al * b.life})`; ctx.lineWidth = w * b.w;
        ctx.beginPath(); ctx.moveTo(b.pts[0][0], b.pts[0][1]); for (const p of b.pts) ctx.lineTo(p[0], p[1]); ctx.stroke();
      }
    }
    for (let i = flames.length - 1; i >= 0; i--) {
      const q = flames[i]; q.life -= dt / q.d; if (q.life <= 0) { flames.splice(i, 1); continue; }
      q.vx *= Math.pow(0.07, dt); q.vy = q.vy * Math.pow(0.07, dt) - 300 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      const r = q.r * (1 + (1 - q.life) * 4);
      glow(q.x, q.y, r * 2, [[0, `hsla(${45 * q.life},100%,${55 + q.life * 35}%,${0.5 * q.life})`], [1, "rgba(255,60,0,0)"]]);
    }
    if (shield > 0.03) {
      ctx.save(); ctx.translate(shX, shY);
      glow(0, 0, 150 * shield, [[0, `rgba(110,220,255,${0.22 * shield})`], [0.7, `rgba(110,220,255,${0.08 * shield})`], [1, "rgba(110,220,255,0)"]]);
      for (let k = 0; k < 3; k++) {
        const R = (64 + k * 30) * shield, rot = now / (900 - k * 250) * (k % 2 ? -1 : 1);
        ctx.strokeStyle = `rgba(130,230,255,${0.85 * shield})`; ctx.lineWidth = k === 0 ? 3 : 1.6;
        ctx.beginPath(); for (let j = 0; j <= 6; j++) { const a = rot + (j * Math.PI) / 3; j ? ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R) : ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); } ctx.stroke();
        for (let j = 0; j < 36; j++) { const a = -rot * 1.4 + (j * Math.PI) / 18, r2 = R + (j % 3 ? 9 : 16); ctx.beginPath(); ctx.moveTo(Math.cos(a) * (R + 5), Math.sin(a) * (R + 5)); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); ctx.stroke(); }
      }
      ctx.restore();
    }
    if (hole > 0.02) {
      const R = 16 + hole * 34;
      glow(holeX, holeY, R * 3.2, [[0.28, `rgba(255,190,110,${0.95 * hole})`], [0.45, `rgba(255,100,40,${0.45 * hole})`], [1, "rgba(255,60,20,0)"]]);
      ctx.strokeStyle = `rgba(255,225,190,${hole})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(holeX, holeY, R * 2.4, R * 0.5, -0.35, 0, 6.283); ctx.stroke();
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(holeX, holeY, R, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      shake = Math.max(shake, hole * 2.5);
    }
    if (orb > 0.02) {
      const s = squeeze, R = (20 + orb * 40) * (1 - s * 0.45), j = s * 7;
      const x = orbX + (Math.random() - 0.5) * j, y = orbY + (Math.random() - 0.5) * j;
      const c1 = s > 0.3 ? "255,170,90" : "120,215,255", c2 = s > 0.3 ? "255,90,30" : "40,140,255";
      glow(x, y, R * 4, [[0, `rgba(${c1},${0.35 * orb})`], [1, `rgba(${c2},0)`]]);
      glow(x, y, R * 1.6, [[0, `rgba(255,255,255,${orb})`], [0.35, `rgba(${c1},${0.85 * orb})`], [1, `rgba(${c2},0)`]]);
      ctx.strokeStyle = `rgba(${c1},${0.8 * orb})`; ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(x, y, R * (1.3 + k * 0.25), R * (0.45 + k * 0.1), now / (260 + k * 90) + k, 0, 6.283); ctx.stroke(); }
      if (P && Math.random() < 0.6) { const tip = [4, 8, 12, 16, 20][(Math.random() * 5) | 0]; bolt(x, y, P[tip][0], P[tip][1], 0.6, 2); }
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const q = shots[i]; q.t += dt / 0.34; const k = Math.min(1, q.t), e = k * k;
      q.x = q.x0 + (q.tx - q.x0) * e; q.y = q.y0 + (q.ty - q.y0) * e - Math.sin(k * Math.PI) * 40;
      const R = 50 * (1 - k * 0.65);
      glow(q.x, q.y, R * 2.5, [[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,190,120,.9)"], [1, "rgba(255,90,30,0)"]]);
      burst(q.x, q.y, 6, 120, 30, 0, 2);
      if (k >= 1) { explode(q.tx, q.ty, q.p); shots.splice(i, 1); }
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i]; if (b.late > 0) { b.late -= dt; continue; }
      b.life -= dt * 1.5; b.r += dt * 1500 * b.p; if (b.life <= 0) { blasts.splice(i, 1); continue; }
      ctx.strokeStyle = b.hue === 0 ? `rgba(255,90,70,${b.life})` : b.hue === 190 ? `rgba(110,220,255,${b.life})` : `rgba(255,220,170,${b.life})`;
      ctx.lineWidth = 8 * b.life + 1; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.stroke();
      if (b.life > 0.7) glow(b.x, b.y, b.r * 0.8, [[0, `rgba(255,255,230,${(b.life - 0.7) * 3})`], [0.5, `rgba(255,150,60,${(b.life - 0.7) * 2})`], [1, "rgba(255,80,20,0)"]]);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const q = sparks[i]; q.life -= dt / q.d; if (q.life <= 0) { sparks.splice(i, 1); continue; }
      q.vx *= Math.pow(0.12, dt); q.vy = q.vy * Math.pow(0.12, dt) + q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.strokeStyle = `hsla(${q.h},100%,${60 + q.life * 35}%,${q.life})`; ctx.lineWidth = q.r;
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.02, q.y - q.vy * 0.02); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    for (let i = smoke.length - 1; i >= 0; i--) {
      const q = smoke[i]; q.life -= dt / q.d; if (q.life <= 0) { smoke.splice(i, 1); continue; }
      q.vx *= Math.pow(0.3, dt); q.vy = q.vy * Math.pow(0.3, dt) - 30 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.r += 40 * dt;
      glow(q.x, q.y, q.r, [[0, `rgba(40,36,34,${0.35 * q.life})`], [1, "rgba(40,36,34,0)"]]);
    }
    ctx.globalCompositeOperation = "lighter";
    for (let i = streams.length - 1; i >= 0; i--) {
      const q = streams[i], tx = orbX, ty = orbY, dx = tx - q.x, dy = ty - q.y, dd = Math.hypot(dx, dy) || 1, sp = 1400 + (1 - q.life) * 1800;
      q.life -= dt * 1.4; if (q.life <= 0 || dd < 30) { streams.splice(i, 1); continue; }
      const nx = q.x + (dx / dd) * sp * dt, ny = q.y + (dy / dd) * sp * dt;
      ctx.strokeStyle = `rgba(150,215,255,${0.7 * (1 - q.life * 0.5)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(nx, ny); ctx.stroke(); q.x = nx; q.y = ny;
    }
    for (let i = streaks.length - 1; i >= 0; i--) {
      const q = streaks[i]; q.life -= dt * 1.8; if (q.life <= 0) { streaks.splice(i, 1); continue; }
      const g = ctx.createLinearGradient(q.x - q.w, q.y, q.x + q.w, q.y);
      g.addColorStop(0, "rgba(255,200,140,0)"); g.addColorStop(0.5, `rgba(255,250,235,${q.life})`); g.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = g; ctx.fillRect(q.x - q.w, q.y - 3 - q.life * 5, q.w * 2, 6 + q.life * 10);
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const q = embers[i]; q.life -= dt / q.d; if (q.life <= 0) { embers.splice(i, 1); continue; }
      q.vx *= Math.pow(0.4, dt); q.vy = q.vy * Math.pow(0.5, dt) + 260 * dt; q.x += q.vx * dt + Math.sin(q.life * 20) * 0.6; q.y += q.vy * dt;
      ctx.fillStyle = `hsla(${25 + q.life * 20},100%,${55 + q.life * 30}%,${q.life})`; ctx.fillRect(q.x, q.y, 2.5, 2.5);
    }
    if (P) { ctx.globalCompositeOperation = "lighter"; powerHand(P, dt, now, gripping ? 0.4 + squeeze * 0.6 : hole > 0.1 ? 0.8 : 0); ctx.globalCompositeOperation = "source-over"; }
    else aura.length = 0;
    if (flash > 0) { ctx.fillStyle = `rgba(255,245,230,${flash * 0.75})`; ctx.fillRect(-60, -60, W + 120, H + 120); flash -= dt * 3; }
    drawCracks(dt);
  }

  return {
    enter() { root.hidden = false; last = performance.now(); },
    exit() { root.hidden = true; cam.style.transform = ""; cam.style.filter = ""; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, fx.width, fx.height); motes = []; },
    frame,
    demoBlast: () => explode(view.W / 2, view.H / 2, 1),
  };
}
