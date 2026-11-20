// Air keyboard, hacker edition: a terminal floating in your room, a hologram keyboard,
// digital rain behind it. Type with a pinch.
import { hand, predicted, drawHand, tick, buzz, view, tracker } from "./core.js";

const LAYERS = {
  abc: [["q","w","e","r","t","y","u","i","o","p"],["a","s","d","f","g","h","j","k","l"],["⇧","z","x","c","v","b","n","m","⌫"],["123","◐","space",".","⏎"]],
  num: [["1","2","3","4","5","6","7","8","9","0"],["@","#","₹","&","-","+","(",")","/"],["*","\"","'",":",";","!","?","⌫"],["ABC","◐","space",",","⏎"]],
};
const THEMES = [["0,255,140", "HACKER"], ["95,230,255", "CYAN"], ["255,60,70", "RED ALERT"], ["255,200,80", "GOLD"], ["200,140,255", "VIOLET"]];
const GLYPHS = "01<>/\\#$%&*+=?ABCDEF0123456789アカサタナハマヤラワ";
const rnd = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

export function createKeyboard(root, fx) {
  const ctx = fx.getContext("2d");
  const kb = root.querySelector("#kb"), textEl = root.querySelector("#kbText"), hint = root.querySelector("#kbHint");
  const rain = root.querySelector("#rain"), rctx = rain.getContext("2d"), hudR = root.querySelector("#hudR"), hudL = root.querySelector("#hudL");
  let text = "", shift = true, layer = "abc", theme = 0, rects = [], hover = null, lastPress = 0, holdT = 0, repT = 0, typedOnce = false, off = null;
  const parts = [], trail = [], cur = [0, 0], tgt = [0, 0]; let curOn = false, decoding = null, drops = [], rainT = 0, hudT = 0;
  const rgb = () => THEMES[theme][0];

  try { text = localStorage.getItem("shahzad.text") || ""; theme = +(localStorage.getItem("shahzad.theme") || 0) % THEMES.length; } catch {}
  shift = /(^|[.!?]\s|\n)$/.test(text);

  function applyTheme() {
    root.style.setProperty("--holo", rgb());
    try { localStorage.setItem("shahzad.theme", theme); } catch {}
  }
  function build() {
    kb.innerHTML = "";
    LAYERS[layer].forEach((row) => {
      const r = document.createElement("div"); r.className = "krow";
      row.forEach((k) => {
        const b = document.createElement("div"); b.className = "key"; b.dataset.k = k;
        if (k === "space") b.classList.add("wide");
        if (["⇧", "⌫", "⏎", "123", "ABC", "◐"].includes(k)) b.classList.add("mod");
        b.textContent = k === "space" ? "SPACE" : k.length === 1 && layer === "abc" && shift ? k.toUpperCase() : k;
        if (k === "⇧" && shift) b.classList.add("on");
        r.appendChild(b);
      });
      kb.appendChild(r);
    });
    requestAnimationFrame(measure);
  }
  function measure() { rects = [...kb.querySelectorAll(".key")].map((el) => { const r = el.getBoundingClientRect(); return { el, x: r.left, y: r.top, w: r.width, h: r.height }; }); }
  function relabel() {
    kb.querySelectorAll(".key").forEach((b) => {
      const k = b.dataset.k;
      if (k === "⇧") b.classList.toggle("on", shift);
      else if (k.length === 1 && layer === "abc" && /[a-z]/.test(k)) b.textContent = shift ? k.toUpperCase() : k;
    });
  }
  function render(decodeLast) {
    const shown = text.length > 70 ? text.slice(-70) : text;
    textEl.innerHTML = "";
    const pr = document.createElement("span"); pr.className = "pr"; pr.textContent = "$ ";
    textEl.append(pr);
    if (!text) { const ph = document.createElement("span"); ph.className = "ph"; ph.textContent = "hawa mein type karo"; textEl.append(ph); }
    else {
      const body = document.createElement("span"); body.textContent = decodeLast ? shown.slice(0, -1) : shown; textEl.append(body);
      if (decodeLast) { const last = document.createElement("span"); last.className = "dec"; last.textContent = rnd(); textEl.append(last); decode(last, shown.slice(-1)); }
    }
    const c = document.createElement("i"); c.className = "caret"; textEl.append(c);
    try { localStorage.setItem("shahzad.text", text); } catch {}
  }
  function decode(el, ch) {
    clearInterval(decoding); let n = 0;
    decoding = setInterval(() => { if (++n > 5) { el.textContent = ch; el.className = "ok"; clearInterval(decoding); } else el.textContent = rnd(); }, 28);
  }

  function press(el) {
    const k = el.dataset.k; let typed = false;
    if (k === "⌫") text = text.slice(0, -1);
    else if (k === "⇧") shift = !shift;
    else if (k === "123" || k === "ABC") { layer = k === "123" ? "num" : "abc"; hover = null; build(); }
    else if (k === "◐") { theme = (theme + 1) % THEMES.length; applyTheme(); hudL.textContent = "THEME // " + THEMES[theme][1]; }
    else if (k === "⏎") text += "\n";
    else if (k === "space") text += " ";
    else { const ch = layer === "abc" && shift ? k.toUpperCase() : k; text += ch; typed = true; fly(el, ch); }
    if (!["⇧", "123", "ABC", "◐"].includes(k)) shift = /(^|[.!?]\s|\n)$/.test(text);
    relabel(); render(typed);
    el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
    tick(1700 + Math.random() * 900, 0.12, 0.045); buzz(8);
    if (!typedOnce) { typedOnce = true; hint.classList.add("gone"); }
  }
  function fly(el, ch) {
    const r = el.getBoundingClientRect(), c = textEl.querySelector(".caret").getBoundingClientRect();
    const f = document.createElement("div"); f.className = "fly"; f.textContent = ch;
    f.style.left = r.left + r.width / 2 + "px"; f.style.top = r.top + r.height / 2 + "px"; root.appendChild(f);
    const dx = c.left - (r.left + r.width / 2), dy = c.top + c.height / 2 - (r.top + r.height / 2);
    f.animate([{ transform: "translate(-50%,-50%) scale(1.7)", opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.8)`, opacity: 0.15 }],
      { duration: 240, easing: "cubic-bezier(.3,.7,.2,1)" }).onfinish = () => f.remove();
  }
  function burst(x, y) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.283, s = 140 + Math.random() * 360;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 1, d: 0.35 + Math.random() * 0.4, g: Math.random() < 0.6 ? rnd() : null, r: 1 + Math.random() * 2 });
    }
    parts.push({ ring: true, x, y, life: 1, d: 0.32 });
  }
  function hit(x, y) {
    if (hover) { const h = rects.find((q) => q.el === hover); if (h && x > h.x - 8 && x < h.x + h.w + 8 && y > h.y - 8 && y < h.y + h.h + 8) return hover; }
    let best = null, bd = 1e9;
    for (const q of rects) {
      if (x > q.x - 4 && x < q.x + q.w + 4 && y > q.y - 4 && y < q.y + q.h + 4) {
        const dd = Math.hypot(x - (q.x + q.w / 2), y - (q.y + q.h / 2)); if (dd < bd) { bd = dd; best = q.el; }
      }
    }
    return best;
  }
  function setHover(el) { if (el === hover) return; hover && hover.classList.remove("hover"); hover = el; el && el.classList.add("hover"); if (el) tick(3200, 0.02, 0.02); }
  function onHand(type, t) {
    if (type === "pinchdown" && hover && t - lastPress > 130) { lastPress = t; holdT = t; repT = t; press(hover); }
    if (type === "lost") { setHover(null); curOn = false; }
  }

  /* digital rain behind everything, drawn at ~20fps with a fading trail */
  function drawRain(now) {
    if (now - rainT < 50) return; rainT = now;
    const d = 1, W = view.W, H = view.H;
    if (rain.width !== W) { rain.width = W; rain.height = H; drops = Array.from({ length: Math.ceil(W / 16) }, () => Math.random() * -H); }
    rctx.setTransform(d, 0, 0, d, 0, 0);
    rctx.fillStyle = "rgba(0,0,0,.12)"; rctx.globalCompositeOperation = "destination-out"; rctx.fillRect(0, 0, W, H);
    rctx.globalCompositeOperation = "source-over"; rctx.font = "15px Geist Mono, monospace";
    for (let i = 0; i < drops.length; i++) {
      const x = i * 16, y = drops[i];
      rctx.fillStyle = `rgba(${rgb()},.9)`; rctx.fillText(rnd(), x, y);
      drops[i] = y > H + Math.random() * 400 ? Math.random() * -200 : y + 16;
    }
  }

  let lastNow = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
    const W = view.W, H = view.H, d = view.dpr, col = rgb();
    if (fx.width !== Math.round(W * d)) { fx.width = Math.round(W * d); fx.height = Math.round(H * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
    drawRain(now);
    if (now - hudT > 500) { hudT = now; hudR.textContent = `TRK ${tracker.fps || "--"} FPS · ${tracker.latency ? tracker.latency.toFixed(0) : "--"} MS`; }

    if (hand.present) {
      const P = predicted(now);
      tgt[0] = (P[4][0] + P[8][0]) / 2; tgt[1] = (P[4][1] + P[8][1]) / 2;
      if (!curOn) { cur[0] = tgt[0]; cur[1] = tgt[1]; curOn = true; }
      const k = 1 - Math.exp(-dt * 34); cur[0] += (tgt[0] - cur[0]) * k; cur[1] += (tgt[1] - cur[1]) * k;
      if (!hand.pinched) setHover(hit(cur[0], cur[1]));
      if (hand.pinched && hover && hover.dataset.k === "⌫" && now - holdT > 520 && now - repT > 75) { repT = now; press(hover); }
      trail.push([P[8][0], P[8][1], now]);
      drawHand(ctx, P, col, 0.85);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const p = hand.pinch, R = 18 - p * 6, x = cur[0], y = cur[1];
      ctx.strokeStyle = `rgba(${col},.4)`; ctx.lineWidth = 1.5;
      ctx.strokeRect(x - R - 6, y - R - 6, (R + 6) * 2, (R + 6) * 2);
      ctx.strokeStyle = `rgba(${col},1)`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, R, -1.571, -1.571 + 6.283 * Math.max(0.05, p)); ctx.stroke();
      ctx.fillStyle = hand.pinched ? `rgba(${col},1)` : "rgba(255,255,255,.95)";
      ctx.beginPath(); ctx.arc(x, y, hand.pinched ? 7 : 3, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    while (trail.length && now - trail[0][2] > 200) trail.shift();
    if (trail.length > 2) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      for (let i = 1; i < trail.length; i++) { const a = i / trail.length; ctx.strokeStyle = `rgba(${col},${a * 0.6})`; ctx.lineWidth = 1 + a * 5; ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke(); }
      ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.font = "14px Geist Mono, monospace"; ctx.textAlign = "center";
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life -= dt / q.d;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      if (q.ring) { ctx.strokeStyle = `rgba(${col},${q.life})`; ctx.lineWidth = 2; ctx.strokeRect(q.x - (1 - q.life) * 40 - 8, q.y - (1 - q.life) * 40 - 8, ((1 - q.life) * 40 + 8) * 2, ((1 - q.life) * 40 + 8) * 2); continue; }
      q.vx *= 0.9; q.vy = q.vy * 0.9 + 500 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.fillStyle = `rgba(${col},${q.life})`;
      if (q.g) ctx.fillText(q.g, q.x, q.y); else { ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.5 + q.life), 0, 6.283); ctx.fill(); }
    }
    ctx.restore();
  }

  kb.addEventListener("pointerdown", (e) => { const el = e.target.closest(".key"); if (el) { e.preventDefault(); press(el); } });
  addEventListener("resize", () => !root.hidden && setTimeout(measure, 120));
  applyTheme(); build(); render(false);
  return {
    enter() { root.hidden = false; hint.classList.toggle("gone", typedOnce); setTimeout(measure, 60); setTimeout(measure, 800); off = hand.on(onHand); },
    exit() { root.hidden = true; off && off(); setHover(null); curOn = false; ctx.clearRect(0, 0, fx.width, fx.height); },
    frame,
  };
}
