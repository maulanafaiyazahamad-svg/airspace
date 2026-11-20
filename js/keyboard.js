// Air keyboard. Two skins (hacker / clean), colour switch, aim-assist typing,
// fist to carry the keyboard, pinch on the text to carry the text.
import { hand, predicted, drawHand, keyClick, tick, buzz, view, tracker } from "./core.js";

const LAYERS = {
  abc: [["q","w","e","r","t","y","u","i","o","p"],["a","s","d","f","g","h","j","k","l"],["⇧","z","x","c","v","b","n","m","⌫"],["123","◐","space",".","◈","⏎"]],
  num: [["1","2","3","4","5","6","7","8","9","0"],["@","#","₹","&","-","+","(",")","/"],["*","\"","'",":",";","!","?","⌫"],["ABC","◐","space",",","◈","⏎"]],
};
const COLORS = {
  hacker: [["0,255,140", "GREEN"], ["95,230,255", "CYAN"], ["255,50,70", "RED"], ["255,200,80", "GOLD"], ["200,140,255", "VIOLET"]],
  clean: [["235,245,255", "WHITE"], ["95,230,255", "CYAN"], ["255,120,200", "PINK"], ["255,200,80", "GOLD"]],
};
const GLYPHS = "01<>/\\#$%&*+=?ABCDEF0123456789アカサタナハマヤラワ";
const rnd = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createKeyboard(root, fx) {
  const ctx = fx.getContext("2d");
  const kb = root.querySelector("#kb"), textEl = root.querySelector("#kbText"), stage = root.querySelector("#kbStage"), term = root.querySelector("#term");
  const nameEl = root.querySelector("#kbName"), rain = root.querySelector("#rain"), rctx = rain.getContext("2d"), hudR = root.querySelector("#hudR");
  const store = (k, v) => { try { localStorage.setItem("shahzad." + k, JSON.stringify(v)); } catch {} };
  const load = (k, d) => { try { const v = localStorage.getItem("shahzad." + k); return v == null ? d : JSON.parse(v); } catch { return d; } };

  let text = load("text2", ""), skin = load("skin", "hacker"), colorI = load("color", { hacker: 0, clean: 0 });
  let shift = /(^|[.!?]\s|\n)$/.test(text), layer = "abc", rects = [], hover = null, lock = null, lastPress = 0, holdT = 0, repT = 0, unsub = null;
  const parts = [], trail = [], cur = [0, 0], tgt = [0, 0];
  let curOn = false, decoding = null, drops = [], rainT = 0, hudT = 0, fistT = 0;
  // positions you placed things at (fist moves the keyboard, pinch on the text moves the text)
  const kbOff = load("kbOff", { x: 0, y: 0 }), kbShow = { ...kbOff }, tOff = load("tOff", { x: 0, y: 0 }), tShow = { ...tOff };
  let kbGrab = null, tGrab = null, kbB = { minX: 0, maxX: 0, minY: 0, maxY: 0 }, tB = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const rgb = () => COLORS[skin][colorI[skin] % COLORS[skin].length][0];

  function applySkin() {
    root.classList.toggle("skin-hacker", skin === "hacker"); root.classList.toggle("skin-clean", skin === "clean");
    root.style.setProperty("--holo", rgb());
  }
  function build() {
    kb.innerHTML = "";
    LAYERS[layer].forEach((row) => {
      const r = document.createElement("div"); r.className = "krow";
      row.forEach((k) => {
        const b = document.createElement("div"); b.className = "key"; b.dataset.k = k;
        if (k === "space") b.classList.add("wide");
        if (["⇧", "⌫", "⏎", "123", "ABC", "◐", "◈"].includes(k)) b.classList.add("mod");
        if (k === "◐") b.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" class="f"/></svg>';
        else if (k === "◈") b.innerHTML = '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 10h1M11 10h1M14 10h1M8 14h8"/></svg>';
        else b.textContent = k === "space" ? "" : k.length === 1 && layer === "abc" && shift ? k.toUpperCase() : k;
        if (k === "⇧" && shift) b.classList.add("on");
        r.appendChild(b);
      });
      kb.appendChild(r);
    });
    requestAnimationFrame(measure);
  }
  // key rectangles are stored as if the keyboard sat at offset (0,0)
  function measure() { rects = [...kb.querySelectorAll(".key")].map((el) => { const r = el.getBoundingClientRect(); return { el, x: r.left - kbShow.x, y: r.top - kbShow.y, w: r.width, h: r.height }; }); }
  function bounds() {
    stage.style.transform = "none"; term.style.transform = "none";
    const sr = kb.getBoundingClientRect(), tr = term.getBoundingClientRect();
    kbB = { minX: -sr.left + 4, maxX: view.W - sr.right - 4, minY: 64 - sr.top, maxY: 0 };
    tB = { minX: -tr.left + 4, maxX: view.W - tr.right - 4, minY: 60 - tr.top, maxY: view.H - tr.bottom - 8 };
    for (const [o, b] of [[kbOff, kbB], [tOff, tB]]) { o.x = clamp(o.x, b.minX, b.maxX); o.y = clamp(o.y, b.minY, b.maxY); }
    Object.assign(kbShow, kbOff); Object.assign(tShow, tOff); place();
  }
  function place() {
    stage.style.transform = `translate3d(${kbShow.x}px, ${kbShow.y}px, 0)`;
    kb.style.transform = `rotateX(20deg) rotateY(${(kbShow.x / view.W) * -14}deg)`;
    term.style.transform = `translate3d(${tShow.x}px, ${tShow.y}px, 0)`;
  }
  function relabel() {
    kb.querySelectorAll(".key").forEach((b) => {
      const k = b.dataset.k;
      if (k === "⇧") b.classList.toggle("on", shift);
      else if (k.length === 1 && layer === "abc" && /[a-z]/.test(k)) b.textContent = shift ? k.toUpperCase() : k;
    });
  }
  function render(decodeLast) {
    const shown = text.length > 80 ? text.slice(-80) : text;
    textEl.innerHTML = "";
    const pr = document.createElement("span"); pr.className = "pr"; pr.textContent = "›"; textEl.append(pr);
    if (!text) { const ph = document.createElement("span"); ph.className = "ph"; ph.textContent = "Hawa mein likho"; textEl.append(ph); }
    else {
      const body = document.createElement("span"); body.textContent = decodeLast ? shown.slice(0, -1) : shown; textEl.append(body);
      if (decodeLast) { const last = document.createElement("span"); last.className = "dec"; last.textContent = rnd(); textEl.append(last); decode(last, shown.slice(-1)); }
    }
    const c = document.createElement("i"); c.className = "caret"; textEl.append(c);
    store("text2", text);
  }
  function decode(el, ch) {
    clearInterval(decoding); let n = 0;
    decoding = setInterval(() => { if (++n > 4) { el.textContent = ch; el.className = ""; clearInterval(decoding); } else el.textContent = rnd(); }, 26);
  }
  function scrambleName() { nameEl.textContent = "SHAHZAD"; }

  function press(el) {
    const k = el.dataset.k; let typed = false;
    if (k === "⌫") text = text.slice(0, -1);
    else if (k === "⇧") shift = !shift;
    else if (k === "123" || k === "ABC") { layer = k === "123" ? "num" : "abc"; hover = lock = null; build(); }
    else if (k === "◐") { colorI[skin] = (colorI[skin] + 1) % COLORS[skin].length; store("color", colorI); applySkin(); }
    else if (k === "◈") { skin = skin === "hacker" ? "clean" : "hacker"; store("skin", skin); applySkin(); render(false); if (skin === "hacker") scrambleName(); }
    else if (k === "⏎") text += "\n";
    else if (k === "space") text += " ";
    else { const ch = layer === "abc" && shift ? k.toUpperCase() : k; text += ch; typed = true; fly(el, ch); }
    if (!["⇧", "123", "ABC", "◐", "◈"].includes(k)) shift = /(^|[.!?]\s|\n)$/.test(text);
    relabel(); if (k !== "◈") render(typed && skin === "hacker");
    el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
    const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2);
    keyClick(); buzz(7);
  }
  function fly(el, ch) {
    const r = el.getBoundingClientRect(), c = textEl.querySelector(".caret").getBoundingClientRect();
    const f = document.createElement("div"); f.className = "fly"; f.textContent = ch;
    f.style.left = r.left + r.width / 2 + "px"; f.style.top = r.top + r.height / 2 + "px"; root.appendChild(f);
    const dx = c.left - (r.left + r.width / 2), dy = c.top + c.height / 2 - (r.top + r.height / 2);
    f.animate([{ transform: "translate(-50%,-50%) scale(1.7)", opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.8)`, opacity: 0.1 }],
      { duration: 220, easing: "cubic-bezier(.3,.7,.2,1)" }).onfinish = () => f.remove();
  }
  function burst(x, y) {
    if (skin === "hacker") for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.283, s = 140 + Math.random() * 360;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 1, d: 0.35 + Math.random() * 0.4, g: Math.random() < 0.6 ? rnd() : null, r: 1 + Math.random() * 2 });
    }
    parts.push({ ring: true, x, y, life: 1, d: 0.3 });
  }
  function keyAt(x, y, sticky) {
    x -= kbShow.x; y -= kbShow.y;
    if (sticky) { const h = rects.find((q) => q.el === sticky); if (h && x > h.x - 10 && x < h.x + h.w + 10 && y > h.y - 10 && y < h.y + h.h + 10) return sticky; }
    let best = null, bd = 1e9;
    for (const q of rects) if (x > q.x - 5 && x < q.x + q.w + 5 && y > q.y - 5 && y < q.y + q.h + 5) {
      const dd = Math.hypot(x - (q.x + q.w / 2), y - (q.y + q.h / 2)); if (dd < bd) { bd = dd; best = q.el; }
    }
    return best;
  }
  function setHover(el) { if (el === hover) return; hover && hover.classList.remove("hover"); hover = el; el && el.classList.add("hover"); }
  function overTerm(x, y) { const r = term.getBoundingClientRect(); return x > r.left - 10 && x < r.right + 10 && y > r.top - 10 && y < r.bottom + 10; }

  function onHand(type, t) {
    if (type === "pinchdown" && !kbGrab) {
      const target = hover;
      if (target && t - lastPress > 110) { lastPress = t; holdT = t; repT = t; press(target); }
      else if (!target && overTerm(cur[0], cur[1])) { tGrab = { x: cur[0], y: cur[1], ox: tOff.x, oy: tOff.y }; term.classList.add("grab"); tick(900, 0.08); buzz(12); }
    }
    if (type === "pinchup" && tGrab) { tGrab = null; term.classList.remove("grab"); store("tOff", tOff); }
    if (type === "lost") { setHover(null); lock = null; curOn = false; endKbGrab(); if (tGrab) { tGrab = null; term.classList.remove("grab"); } }
  }
  function endKbGrab() { if (!kbGrab) return; kbGrab = null; kb.classList.remove("grab"); store("kbOff", kbOff); requestAnimationFrame(measure); }

  /* digital rain (hacker skin only) */
  function drawRain(now) {
    if (skin !== "hacker" || now - rainT < 50) return; rainT = now;
    const W = view.W, H = view.H;
    if (rain.width !== W) { rain.width = W; rain.height = H; drops = Array.from({ length: Math.ceil(W / 16) }, () => Math.random() * -H); }
    rctx.globalCompositeOperation = "destination-out"; rctx.fillStyle = "rgba(0,0,0,.12)"; rctx.fillRect(0, 0, W, H);
    rctx.globalCompositeOperation = "source-over"; rctx.font = "15px Geist Mono, monospace"; rctx.fillStyle = `rgba(${rgb()},.9)`;
    for (let i = 0; i < drops.length; i++) { rctx.fillText(rnd(), i * 16, drops[i]); drops[i] = drops[i] > H + Math.random() * 400 ? Math.random() * -200 : drops[i] + 16; }
  }

  let lastNow = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
    const W = view.W, H = view.H, d = view.dpr, col = rgb();
    if (fx.width !== Math.round(W * d)) { fx.width = Math.round(W * d); fx.height = Math.round(H * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
    drawRain(now);

    if (hand.present) {
      const P = predicted(now);
      tgt[0] = (P[4][0] + P[8][0]) / 2; tgt[1] = (P[4][1] + P[8][1]) / 2;
      if (!curOn) { cur[0] = tgt[0]; cur[1] = tgt[1]; curOn = true; }
      const k = 1 - Math.exp(-dt * 30); cur[0] += (tgt[0] - cur[0]) * k; cur[1] += (tgt[1] - cur[1]) * k;

      // fist held still for a moment = carry the keyboard like a toy
      const fist = hand.open < 1.18 || (kbGrab && hand.open < 1.5);
      if (fist && !hand.pinched) { if (!fistT) fistT = now; } else if (!kbGrab) fistT = 0;
      if (fist && !tGrab && (kbGrab || now - fistT > 380)) {
        if (!kbGrab) { kbGrab = { x: P[9][0], y: P[9][1], ox: kbOff.x, oy: kbOff.y }; kb.classList.add("grab"); setHover(null); lock = null; tick(500, 0.1); buzz(15); }
        kbOff.x = clamp(kbGrab.ox + (P[9][0] - kbGrab.x) * 1.35, kbB.minX, kbB.maxX);
        kbOff.y = clamp(kbGrab.oy + (P[9][1] - kbGrab.y) * 1.35, kbB.minY, kbB.maxY);
      } else endKbGrab();
      if (tGrab) {
        tOff.x = clamp(tGrab.ox + (cur[0] - tGrab.x) * 1.2, tB.minX, tB.maxX);
        tOff.y = clamp(tGrab.oy + (cur[1] - tGrab.y) * 1.2, tB.minY, tB.maxY);
      }
      if (!kbGrab && !tGrab && !hand.pinched) setHover(keyAt(cur[0], cur[1], hover));
      if (hand.pinched && hover && hover.dataset.k === "⌫" && now - holdT > 520 && now - repT > 75) { repT = now; press(hover); }
      trail.push([P[8][0], P[8][1], now]);
      drawHand(ctx, P, col, 0.8);
      // the ball sits exactly where the key is read from
      const x = cur[0], y = cur[1];
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const p = hand.pinch, R = 18 - p * 7;
      ctx.strokeStyle = `rgba(${col},.45)`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, R + 6, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = `rgba(${col},1)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R, -1.571, -1.571 + 6.283 * Math.max(0.05, p)); ctx.stroke();
      ctx.fillStyle = hand.pinched ? `rgba(${col},1)` : "rgba(255,255,255,.95)";
      ctx.beginPath(); ctx.arc(x, y, hand.pinched ? 7 : 3, 0, 6.283); ctx.fill();
      ctx.restore();
    } else endKbGrab();

    // glide placed things toward where the hand put them
    const g = 1 - Math.exp(-dt * 22);
    kbShow.x += (kbOff.x - kbShow.x) * g; kbShow.y += (kbOff.y - kbShow.y) * g;
    tShow.x += (tOff.x - tShow.x) * g; tShow.y += (tOff.y - tShow.y) * g;
    place();

    while (trail.length && now - trail[0][2] > 180) trail.shift();
    if (trail.length > 2) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      for (let i = 1; i < trail.length; i++) { const a = i / trail.length; ctx.strokeStyle = `rgba(${col},${a * 0.55})`; ctx.lineWidth = 1 + a * 5; ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke(); }
      ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.font = "14px Geist Mono, monospace"; ctx.textAlign = "center";
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life -= dt / q.d;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      if (q.ring) { ctx.strokeStyle = `rgba(${col},${q.life})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, (1 - q.life) * 44 + 8, 0, 6.283); ctx.stroke(); continue; }
      q.vx *= 0.9; q.vy = q.vy * 0.9 + 500 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.fillStyle = `rgba(${col},${q.life})`;
      if (q.g) ctx.fillText(q.g, q.x, q.y); else { ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.5 + q.life), 0, 6.283); ctx.fill(); }
    }
    ctx.restore();
  }

  kb.addEventListener("pointerdown", (e) => { const el = e.target.closest(".key"); if (el) { e.preventDefault(); press(el); } });
  addEventListener("resize", () => !root.hidden && setTimeout(() => { bounds(); measure(); }, 150));
  applySkin(); build(); render(false);
  return {
    enter() {
      root.hidden = false; applySkin(); place(); if (skin === "hacker") scrambleName();
      setTimeout(() => { bounds(); measure(); }, 80); setTimeout(() => { bounds(); measure(); }, 650);
      unsub = hand.on(onHand);
    },
    exit() { root.hidden = true; unsub && unsub(); setHover(null); lock = null; curOn = false; endKbGrab(); tGrab = null; ctx.clearRect(0, 0, fx.width, fx.height); },
    frame,
  };
}
