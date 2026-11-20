// Shakti: energy you hold in your hand.
//   open palm          -> a plasma orb grows in your palm
//   palm, fist, open   -> throw the orb: it bursts in a shockwave
//   one finger         -> paint light in the air (it hangs there, then fades)
//   pinch              -> pull every spark in the room into a swirling ball; let go and it scatters
//   two fingers (V)    -> lightning from your fingertips
import { hand, predicted, drawHand, view, boom, hum, tick, buzz, whoosh } from "./core.js";

export function createPower(root, fx) {
  const ctx = fx.getContext("2d");
  const N = 1100;
  const dust = Array.from({ length: N }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, vx: 0, vy: 0, s: 0.6 + Math.random() * 1.6, h: Math.random() }));
  let strokes = [], cur = null, orb = 0, orbX = 0, orbY = 0, squeeze = 0, fistOn = false, armed = 0, openSince = 0;
  let blasts = [], sparks = [], bolts = [], boltT = 0, humSnd = null, shake = 0, flash = 0, hue = 190, swarmOn = false, pointN = 0, vN = 0;
  let last = performance.now(), rockN = 0, threeN = 0, flames = [], fireT = 0, shield = 0, shX = 0, shY = 0, hole = 0, holeT = 0, holeX = 0, holeY = 0;

  function blast(x, y, power) {
    blasts.push({ x, y, r: 10, life: 1, p: power });
    for (let i = 0; i < 260 * power; i++) {
      const a = Math.random() * 6.283, s = 300 + Math.random() * 1300 * power;
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, d: 0.6 + Math.random() * 0.9, h: hue + Math.random() * 40 - 20, r: 1 + Math.random() * 2.5 });
    }
    for (const q of dust) { const dx = q.x - x, dy = q.y - y, d = Math.hypot(dx, dy) || 1, f = (1600 * power) / (1 + d / 120); q.vx += (dx / d) * f; q.vy += (dy / d) * f; }
    shake = 18 * power; flash = 0.9; boom(0.8 * power, 1.2); whoosh(0.35, 0.45);
    try { navigator.vibrate && navigator.vibrate([40, 30, 120]); } catch {}
  }
  function bolt(x0, y0, x1, y1, depth = 0) {
    const pts = [[x0, y0]]; const n = 10;
    for (let i = 1; i < n; i++) { const f = i / n, j = 60 * (1 - Math.abs(f - 0.5) * 2) + 10; pts.push([x0 + (x1 - x0) * f + (Math.random() - 0.5) * j, y0 + (y1 - y0) * f + (Math.random() - 0.5) * j]); }
    pts.push([x1, y1]); bolts.push({ pts, life: 1 });
    if (depth < 1 && Math.random() < 0.6) { const k = pts[(3 + Math.random() * 5) | 0]; bolt(k[0], k[1], k[0] + (Math.random() - 0.5) * 300, k[1] + (Math.random() - 0.5) * 300, depth + 1); }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const W = view.W, H = view.H, d = view.dpr;
    if (fx.width !== Math.round(W * d)) { fx.width = Math.round(W * d); fx.height = Math.round(H * d); }
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake; shake *= Math.pow(0.02, dt);
    ctx.setTransform(d, 0, 0, d, sx * d, sy * d); ctx.clearRect(-50, -50, W + 100, H + 100);
    hue = (hue + dt * 20) % 360;

    const P = hand.present ? predicted(now) : null;
    const e = hand.ext, nExt = e.filter(Boolean).length, o = hand.open;
    const fist = !!P && (o < 1.32 || (fistOn && o < 1.55));
    const pinch = !!P && hand.pinched && !fist;
    pointN = P && e[0] && !e[1] && !e[2] && !pinch && !fist ? pointN + 1 : 0;
    vN = P && e[0] && e[1] && !e[2] && !e[3] && !pinch && !fist ? vN + 1 : 0;
    rockN = P && e[0] && !e[1] && !e[2] && e[3] && !pinch && !fist ? rockN + 1 : 0;
    threeN = P && e[0] && e[1] && e[2] && !e[3] && !pinch && !fist ? threeN + 1 : 0;
    const point = pointN > 3, vsign = vN > 3, rock = rockN > 3, three = threeN > 3, open = !!P && nExt === 4 && o > 1.65;
    const palmX = P ? (P[0][0] + P[5][0] + P[9][0] + P[13][0] + P[17][0]) / 5 : 0, palmY = P ? (P[0][1] + P[5][1] + P[9][1] + P[13][1] + P[17][1]) / 5 : 0;

    // orb: grows on an open palm, squeezes in a fist, flies on release
    if (open) { if (!openSince) openSince = now; orb = Math.min(1, orb + dt / 0.8); armed = now; } else openSince = 0;
    if (P) { orbX += (palmX - orbX) * Math.min(1, dt * 25); orbY += (palmY - 40 - orbY) * Math.min(1, dt * 25); }
    if (fist && orb > 0.3 && now - armed < 1500) { if (!fistOn) { fistOn = true; tick(300, 0.2); } squeeze = Math.min(1, squeeze + dt / 0.35); }
    else if (fistOn) { fistOn = false; if ((!P || o > 1.55) && squeeze > 0.4) { blast(orbX, orbY, 0.6 + orb * 0.6); orb = 0; } squeeze = 0; }
    // black hole: hold a fist with no orb; open it and the hole goes supernova
    if (fist && !fistOn && orb < 0.3) { if (!holeT) holeT = now; hole = Math.min(1, Math.max(0, (now - holeT - 450) / 900)); holeX = palmX; holeY = palmY; }
    else { if (hole > 0.6 && (!P || o > 1.55)) { blast(holeX, holeY, 1.7); flash = 1; } holeT = 0; hole = Math.max(0, hole - dt * 3); }
    if (!P || (!open && !fistOn)) orb = Math.max(0, orb - dt * 0.6);
    if (orb >= 1 && !humSnd) { humSnd = true; whoosh(0.25, 0.6); } else if (orb < 0.5) humSnd = null;

    // light painting
    if (point) {
      const x = P[8][0], y = P[8][1];
      if (!cur) { cur = { pts: [], h: hue, t: now }; strokes.push(cur); }
      const lp = cur.pts[cur.pts.length - 1];
      if (!lp || Math.hypot(x - lp[0], y - lp[1]) > 3) cur.pts.push([x, y]);
      cur.t = now;
    } else cur = null;
    strokes = strokes.filter((s) => now - s.t < 7000);

    // lightning
    if (vsign && now - boltT > 70) {
      boltT = now;
      for (const tip of [8, 12]) { const a = Math.atan2(P[tip][1] - P[tip - 3][1], P[tip][0] - P[tip - 3][0]) + (Math.random() - 0.5) * 0.9; bolt(P[tip][0], P[tip][1], P[tip][0] + Math.cos(a) * (250 + Math.random() * 350), P[tip][1] + Math.sin(a) * (250 + Math.random() * 350)); }
      tick(4500 + Math.random() * 2000, 0.06); if (Math.random() < 0.3) buzz(8);
    }

    // fire from the fingertips (index + little finger up)
    if (rock) {
      for (const [tip, base] of [[8, 5], [20, 17]]) {
        let dx = P[tip][0] - P[base][0], dy = P[tip][1] - P[base][1]; const L2 = Math.hypot(dx, dy) || 1; dx /= L2; dy /= L2;
        for (let k = 0; k < 7; k++) {
          const sp = 500 + Math.random() * 500, a = (Math.random() - 0.5) * 0.45, c = Math.cos(a), si = Math.sin(a);
          flames.push({ x: P[tip][0], y: P[tip][1], vx: (dx * c - dy * si) * sp, vy: (dx * si + dy * c) * sp, life: 1, d: 0.35 + Math.random() * 0.35, r: 3 + Math.random() * 4 });
        }
      }
      if (now - fireT > 220) { fireT = now; tick(900 + Math.random() * 300, 0.12, 0.2); }
    }
    // energy shield (three fingers up)
    shield += ((three ? 1 : 0) - shield) * Math.min(1, dt * 8);
    if (three) { shX = palmX; shY = palmY - 30; }

    // swarm
    const px = P ? (P[4][0] + P[8][0]) / 2 : 0, py = P ? (P[4][1] + P[8][1]) / 2 : 0;
    if (pinch && !swarmOn) { swarmOn = true; whoosh(0.25, 0.6); }
    if (!pinch && swarmOn) { swarmOn = false; for (const q of dust) { const dx = q.x - px, dy = q.y - py, dd = Math.hypot(dx, dy) || 1; if (dd < 200) { q.vx += (dx / dd) * 900; q.vy += (dy / dd) * 900; } } whoosh(0.3, 0.4); }

    // dust
    ctx.globalCompositeOperation = "lighter";
    for (const q of dust) {
      if (swarmOn) { const dx = px - q.x, dy = py - q.y, dd = Math.hypot(dx, dy) || 1; q.vx += (dx / dd) * 2600 * dt + (-dy / dd) * 1900 * dt; q.vy += (dy / dd) * 2600 * dt + (dx / dd) * 1900 * dt; }
      else if (hole > 0.05) { const dx = holeX - q.x, dy = holeY - q.y, dd = Math.hypot(dx, dy) || 1; q.vx += ((dx / dd) * 3200 + (-dy / dd) * 2600) * hole * dt; q.vy += ((dy / dd) * 3200 + (dx / dd) * 2600) * hole * dt; }
      else if (shield > 0.3) { const dx = q.x - shX, dy = q.y - shY, dd = Math.hypot(dx, dy); if (dd < 150) { q.vx += (dx / (dd || 1)) * 4000 * dt; q.vy += (dy / (dd || 1)) * 4000 * dt; } }
      else if (P) { const dx = q.x - palmX, dy = q.y - palmY, dd = Math.hypot(dx, dy); if (dd < 140) { q.vx += (dx / (dd || 1)) * 900 * dt; q.vy += (dy / (dd || 1)) * 900 * dt; } }
      q.vx *= Math.pow(swarmOn ? 0.2 : 0.35, dt); q.vy *= Math.pow(swarmOn ? 0.2 : 0.35, dt);
      q.vy += (Math.sin(now / 1400 + q.h * 9) * 6 - 3) * dt;
      q.x += q.vx * dt; q.y += q.vy * dt - 6 * dt;
      if (q.x < -10) q.x += W + 20; if (q.x > W + 10) q.x -= W + 20; if (q.y < -10) q.y += H + 20; if (q.y > H + 10) q.y -= H + 20;
      const sp = Math.min(1, Math.hypot(q.vx, q.vy) / 600);
      ctx.fillStyle = `hsla(${hue + q.h * 60},100%,${60 + sp * 30}%,${0.25 + sp * 0.6})`;
      ctx.fillRect(q.x, q.y, q.s + sp * 2, q.s + sp * 2);
    }
    // strokes
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const s of strokes) {
      if (s.pts.length < 2) continue;
      const age = (now - s.t) / 7000, a = 1 - age;
      for (const [w, al, l] of [[18, 0.12, 55], [8, 0.35, 60], [2.5, 1, 92]]) {
        ctx.strokeStyle = `hsla(${s.h},100%,${l}%,${al * a})`; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(s.pts[0][0], s.pts[0][1]); for (const p of s.pts) ctx.lineTo(p[0], p[1]); ctx.stroke();
      }
    }
    // bolts
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.life -= dt * 8; if (b.life <= 0) { bolts.splice(i, 1); continue; }
      for (const [w, al, c] of [[10, 0.18, "150,200,255"], [3, 0.6, "190,225,255"], [1.2, 1, "255,255,255"]]) {
        ctx.strokeStyle = `rgba(${c},${al * b.life})`; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(b.pts[0][0], b.pts[0][1]); for (const p of b.pts) ctx.lineTo(p[0], p[1]); ctx.stroke();
      }
    }
    // flames
    for (let i = flames.length - 1; i >= 0; i--) {
      const q = flames[i]; q.life -= dt / q.d; if (q.life <= 0) { flames.splice(i, 1); continue; }
      q.vx *= Math.pow(0.08, dt); q.vy = q.vy * Math.pow(0.08, dt) - 260 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      const r = q.r * (1 + (1 - q.life) * 3);
      ctx.fillStyle = `hsla(${15 + q.life * 30},100%,${45 + q.life * 40}%,${q.life * 0.55})`; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.283); ctx.fill();
    }
    // shield
    if (shield > 0.03) {
      ctx.save(); ctx.translate(shX, shY);
      for (let k = 0; k < 3; k++) {
        const R = (60 + k * 28) * shield, rot = now / (900 - k * 250) * (k % 2 ? -1 : 1);
        ctx.strokeStyle = `rgba(110,220,255,${0.75 * shield})`; ctx.lineWidth = k === 0 ? 3 : 1.5;
        ctx.beginPath(); for (let j = 0; j <= 6; j++) { const a = rot + (j * Math.PI) / 3; j ? ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R) : ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); } ctx.stroke();
        for (let j = 0; j < 24; j++) { const a = -rot * 1.5 + (j * Math.PI) / 12; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (R + 6), Math.sin(a) * (R + 6)); ctx.lineTo(Math.cos(a) * (R + (j % 3 ? 10 : 16)), Math.sin(a) * (R + (j % 3 ? 10 : 16))); ctx.stroke(); }
      }
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 130 * shield); g.addColorStop(0, `rgba(110,220,255,${0.25 * shield})`); g.addColorStop(1, "rgba(110,220,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 130 * shield, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    // black hole
    if (hole > 0.02) {
      const R = 18 + hole * 30;
      const ring = ctx.createRadialGradient(holeX, holeY, R * 0.9, holeX, holeY, R * 3);
      ring.addColorStop(0, `rgba(255,170,80,${0.9 * hole})`); ring.addColorStop(0.3, `rgba(255,90,40,${0.4 * hole})`); ring.addColorStop(1, "rgba(255,60,20,0)");
      ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(holeX, holeY, R * 3, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(holeX, holeY, R, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255,220,180,${hole})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(holeX, holeY, R * 2.2, R * 0.55, now / 900, 0, 6.283); ctx.stroke();
      shake = Math.max(shake, hole * 3);
    }
    // orb
    if (orb > 0.02) {
      const R = 26 + orb * 46 - squeeze * 22 + Math.sin(now / 60) * 2, jx = (Math.random() - 0.5) * squeeze * 8, jy = (Math.random() - 0.5) * squeeze * 8;
      const x = orbX + jx, y = orbY + jy, h = squeeze > 0.3 ? 20 : hue;
      for (const [r, a] of [[R * 3.2, 0.12], [R * 1.8, 0.3], [R, 0.85]]) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `hsla(${h},100%,92%,${a * orb})`); g.addColorStop(0.4, `hsla(${h},100%,60%,${a * 0.7 * orb})`); g.addColorStop(1, `hsla(${h},100%,50%,0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      }
      if (P && Math.random() < 0.5) { const tip = [4, 8, 12, 16, 20][(Math.random() * 5) | 0]; bolt(x, y, P[tip][0], P[tip][1], 1); }
      for (let k = 0; k < 3; k++) { const a = now / 300 + k * 2.1; ctx.fillStyle = `hsla(${h},100%,85%,${orb})`; ctx.beginPath(); ctx.arc(x + Math.cos(a) * R * 1.4, y + Math.sin(a * 1.3) * R * 0.6, 3, 0, 6.283); ctx.fill(); }
    }
    // blasts + sparks
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i]; b.life -= dt * 1.4; b.r += dt * 1400 * b.p; if (b.life <= 0) { blasts.splice(i, 1); continue; }
      ctx.strokeStyle = `hsla(${hue},100%,75%,${b.life})`; ctx.lineWidth = 6 * b.life + 1; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${b.life * 0.6})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.7, 0, 6.283); ctx.stroke();
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const q = sparks[i]; q.life -= dt / q.d; if (q.life <= 0) { sparks.splice(i, 1); continue; }
      q.vx *= Math.pow(0.15, dt); q.vy = q.vy * Math.pow(0.15, dt) + 300 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.fillStyle = `hsla(${q.h},100%,${60 + q.life * 35}%,${q.life})`; ctx.fillRect(q.x, q.y, q.r, q.r);
    }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`; ctx.fillRect(-50, -50, W + 100, H + 100); flash -= dt * 3; }
    ctx.globalCompositeOperation = "source-over";
    if (P) drawHand(ctx, P, fistOn ? "255,120,60" : vsign ? "180,210,255" : "95,230,255", 0.55);
  }

  return {
    enter() { root.hidden = false; last = performance.now(); },
    exit() { root.hidden = true; humSnd = null; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, fx.width, fx.height); },
    frame,
    demoBlast: () => blast(view.W / 2, view.H / 2, 1),
  };
}
