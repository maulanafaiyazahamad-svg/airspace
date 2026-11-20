// Air keyboard: a hologram keyboard you type on with a pinch.
import { hand, predicted, drawHand, tick, buzz, view } from "./core.js";

const LAYERS = {
  abc: [["q","w","e","r","t","y","u","i","o","p"],["a","s","d","f","g","h","j","k","l"],["⇧","z","x","c","v","b","n","m","⌫"],["123","◐","space",".","⏎"]],
  num: [["1","2","3","4","5","6","7","8","9","0"],["@","#","₹","&","-","+","(",")","/"],["*","\"","'",":",";","!","?","⌫"],["ABC","◐","space",",","⏎"]],
};
const HUES = [["134,230,255", "Cyan"], ["255,120,220", "Pink"], ["255,200,90", "Gold"], ["120,255,170", "Green"], ["190,150,255", "Violet"]];

export function createKeyboard(root, fx) {
  const ctx = fx.getContext("2d");
  const kb = root.querySelector("#kb"), textEl = root.querySelector("#kbText"), hint = root.querySelector("#kbHint");
  let text = "", shift = true, layer = "abc", hueI = 0, rects = [], hover = null, lastPress = 0, holdT = 0, repT = 0, typedOnce = false;
  let off = null;
  const parts = [], trail = [];
  const rgb = () => HUES[hueI][0];

  try { text = localStorage.getItem("shahzad.text") || ""; } catch {}
  shift = /(^|[.!?]\s|\n)$/.test(text);

  function build() {
    kb.innerHTML = "";
    LAYERS[layer].forEach((row) => {
      const r = document.createElement("div"); r.className = "krow";
      row.forEach((k) => {
        const b = document.createElement("div"); b.className = "key"; b.dataset.k = k;
        if (k === "space") b.classList.add("wide");
        if (["⇧", "⌫", "⏎", "123", "ABC", "◐"].includes(k)) b.classList.add("mod");
        b.textContent = k === "space" ? "" : k.length === 1 && layer === "abc" && shift ? k.toUpperCase() : k;
        if (k === "⇧" && shift) b.classList.add("on");
        r.appendChild(b);
      });
      kb.appendChild(r);
    });
    requestAnimationFrame(measure);
  }
  function measure() {
    rects = [...kb.querySelectorAll(".key")].map((el) => { const r = el.getBoundingClientRect(); return { el, x: r.left, y: r.top, w: r.width, h: r.height }; });
  }
  function relabel() {
    kb.querySelectorAll(".key").forEach((b) => {
      const k = b.dataset.k;
      if (k === "⇧") b.classList.toggle("on", shift);
      else if (k.length === 1 && layer === "abc" && /[a-z]/.test(k)) b.textContent = shift ? k.toUpperCase() : k;
    });
  }
  function render() {
    textEl.innerHTML = "";
    const shown = text.length > 90 ? "…" + text.slice(-90) : text;
    const s = document.createElement("span");
    if (!text) { s.className = "ph"; s.textContent = "Hawa mein likho"; } else s.textContent = shown;
    const c = document.createElement("i"); c.className = "caret";
    textEl.append(s, c);
    try { localStorage.setItem("shahzad.text", text); } catch {}
  }

  function press(el) {
    const k = el.dataset.k;
    if (k === "⌫") text = text.slice(0, -1);
    else if (k === "⇧") shift = !shift;
    else if (k === "123" || k === "ABC") { layer = k === "123" ? "num" : "abc"; hover = null; build(); }
    else if (k === "◐") { hueI = (hueI + 1) % HUES.length; root.style.setProperty("--holo", rgb()); document.documentElement.style.setProperty("--holo", rgb()); }
    else if (k === "⏎") text += "\n";
    else if (k === "space") text += " ";
    else { const ch = layer === "abc" && shift ? k.toUpperCase() : k; text += ch; fly(el, ch); }
    if (!["⇧", "123", "ABC", "◐"].includes(k)) shift = /(^|[.!?]\s|\n)$/.test(text);
    relabel(); render();
    el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, k === "space" ? 26 : 16);
    tick(1500 + Math.random() * 900, 0.13, 0.05); buzz(9);
    if (!typedOnce) { typedOnce = true; hint.classList.add("gone"); }
  }
  function fly(el, ch) {
    const r = el.getBoundingClientRect(), c = textEl.querySelector(".caret").getBoundingClientRect();
    const f = document.createElement("div"); f.className = "fly"; f.textContent = ch;
    f.style.left = r.left + r.width / 2 + "px"; f.style.top = r.top + r.height / 2 + "px";
    root.appendChild(f);
    const dx = c.left - (r.left + r.width / 2), dy = c.top + c.height / 2 - (r.top + r.height / 2);
    f.animate([{ transform: "translate(-50%,-50%) scale(1.6)", opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.9)`, opacity: 0.2 }],
      { duration: 280, easing: "cubic-bezier(.3,.7,.2,1)" }).onfinish = () => f.remove();
  }
  function burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 380;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 1, d: 0.35 + Math.random() * 0.35, r: 1 + Math.random() * 2.2 });
    }
    parts.push({ ring: true, x, y, life: 1, d: 0.35 });
  }

  function hit(x, y) {
    if (hover) { const h = rects.find((q) => q.el === hover); if (h && x > h.x - 7 && x < h.x + h.w + 7 && y > h.y - 7 && y < h.y + h.h + 7) return hover; }
    for (const q of rects) if (x > q.x - 3 && x < q.x + q.w + 3 && y > q.y - 3 && y < q.y + q.h + 3) return q.el;
    return null;
  }
  function setHover(el) { if (el === hover) return; hover && hover.classList.remove("hover"); hover = el; el && el.classList.add("hover"); }

  function onHand(type, t) {
    if (type === "pinchdown" && hover && t - lastPress > 140) { lastPress = t; holdT = t; repT = t; press(hover); }
    if (type === "lost") setHover(null);
  }
  const cur = [0, 0];
  let lastNow = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
    const W = view.W, H = view.H, d = view.dpr;
    if (fx.width !== Math.round(W * d)) { fx.width = Math.round(W * d); fx.height = Math.round(H * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
    const col = rgb();
    if (hand.present) {
      const P = predicted(now);
      cur[0] = (P[4][0] + P[8][0]) / 2; cur[1] = (P[4][1] + P[8][1]) / 2;
      if (!hand.pinched) setHover(hit(cur[0], cur[1]));
      // hold backspace to keep deleting
      if (hand.pinched && hover && hover.dataset.k === "⌫" && now - holdT > 550 && now - repT > 80) { repT = now; press(hover); }
      trail.push([P[8][0], P[8][1], now]);
      drawHand(ctx, P, col, 0.9);
      // cursor
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const p = hand.pinch, R = 17 - p * 5;
      ctx.strokeStyle = `rgba(${col},.35)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cur[0], cur[1], R, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = `rgba(${col},1)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cur[0], cur[1], R, -1.571, -1.571 + 6.283 * Math.max(0.04, p)); ctx.stroke();
      ctx.fillStyle = hand.pinched ? `rgba(${col},1)` : "rgba(255,255,255,.95)";
      ctx.beginPath(); ctx.arc(cur[0], cur[1], hand.pinched ? 7 : 3, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    while (trail.length && now - trail[0][2] > 220) trail.shift();
    if (trail.length > 2) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      for (let i = 1; i < trail.length; i++) {
        const a = i / trail.length;
        ctx.strokeStyle = `rgba(${col},${a * 0.55})`; ctx.lineWidth = 1 + a * 5;
        ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke();
      }
      ctx.restore();
    }
    // sparks
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life -= dt / q.d;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      if (q.ring) { ctx.strokeStyle = `rgba(${col},${q.life})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, (1 - q.life) * 46 + 6, 0, 6.283); ctx.stroke(); continue; }
      q.vx *= 0.9; q.vy = q.vy * 0.9 + 600 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.fillStyle = `rgba(${col},${q.life})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.5 + q.life), 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  // finger taps work too
  kb.addEventListener("pointerdown", (e) => { const el = e.target.closest(".key"); if (el) { e.preventDefault(); press(el); } });
  addEventListener("resize", () => !root.hidden && setTimeout(measure, 120));

  build(); render();
  return {
    enter() { root.hidden = false; hint.classList.toggle("gone", typedOnce); setTimeout(measure, 60); setTimeout(measure, 700); off = hand.on(onHand); },
    exit() { root.hidden = true; off && off(); setHover(null); ctx.clearRect(0, 0, fx.width, fx.height); },
    frame,
  };
}
