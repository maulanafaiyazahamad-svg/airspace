import { view, startCamera, cameraOn, loadTracker, tracker, audio } from "./core.js";
import { createKeyboard } from "./keyboard.js";
import { createRobot } from "./robot.js";
import { createPower } from "./power.js";
import { VERSION } from "./version.js";

const $ = (s) => document.querySelector(s);
const fx = $("#fx");
const modes = { kb: createKeyboard($("#kbMode"), fx), robot: createRobot($("#rbMode"), $("#gl"), fx), power: createPower($("#pwMode"), fx) };
let active = null;
window.shahzad = modes;

/* camera choice on the home screen */
view.facing = "environment";   // always start on the back camera; the flip button switches for this session only
function paintCam() { document.querySelectorAll("[data-cam]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cam === view.facing)); }
document.querySelectorAll("[data-cam]").forEach((b) => b.addEventListener("click", async () => {
  view.facing = b.dataset.cam; paintCam();
  try { localStorage.setItem("shahzad.cam", view.facing); } catch {}
  if (cameraOn()) try { await startCamera(view.facing); } catch {}
}));
paintCam();

async function go(name) {
  audio();
  const err = $("#err"); err.hidden = true;
  if (!cameraOn()) {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: "NoCam" });
      await startCamera(view.facing);
    } catch (e) {
      err.hidden = false;
      err.textContent = e.name === "NotAllowedError"
        ? "Camera ki permission nahi mili. Phone ki Settings → Apps → Shahzad → Permissions mein Camera ko Allow karo."
        : "Camera start nahi hua. Koi aur app camera use kar raha ho to use band karke dobara try karo.";
      return;
    }
  }
  try { navigator.wakeLock?.request("screen").catch(() => {}); } catch {}
  document.body.classList.remove("at-home");
  $("#home").hidden = true; $("#bar").hidden = false;
  active?.exit(); active = modes[name]; active.enter();
  if (!tracker.ready && !window.__demo) {
    const box = $("#loading"), bar = $("#loadBar"); box.hidden = false;
    loadTracker((f) => { bar.style.width = Math.round(f * 100) + "%"; })
      .then(() => { box.classList.add("done"); setTimeout(() => (box.hidden = true), 500); })
      .catch(() => { $("#loadMsg").textContent = "Haath pehchanne wala system load nahi hua. App band karke dobara kholo."; });
  }
}
let pendingUpdate = false;
function home() {
  if (pendingUpdate) { location.replace(location.pathname + "?u=" + Date.now()); return; }
  active?.exit(); active = null;
  document.body.classList.add("at-home");
  $("#home").hidden = false; $("#bar").hidden = true;
}
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
$("#back").addEventListener("click", home);
$("#flip").addEventListener("click", async () => {
  view.facing = view.facing === "user" ? "environment" : "user"; paintCam();
  try { localStorage.setItem("shahzad.cam", view.facing); await startCamera(view.facing); } catch {}
});
// Android back button inside the app returns to the home screen
addEventListener("popstate", () => { if (active) home(); });
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => history.pushState({ m: 1 }, "")));

$("#ver").textContent = "Version " + VERSION + (window.ShahzadNative ? " · " + window.ShahzadNative.source() : "");
$("#refresh").addEventListener("click", () => { location.replace(location.pathname + "?u=" + Date.now()); });
// Fully automatic updates: check for a newer version every 30 seconds and reload on our own.
setInterval(async () => {
  try {
    const r = await fetch("js/version.js?t=" + Date.now(), { cache: "no-store" });
    const m = (await r.text()).match(/VERSION = "([^"]+)"/);
    if (m && m[1] !== VERSION) { if (active) pendingUpdate = true; else location.replace(location.pathname + "?u=" + Date.now()); }
  } catch {}
}, 30000);

/* ---------- home background: a slow drifting network of light ---------- */
const hb = $("#homeBg"), hctx = hb.getContext("2d");
const nodes = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.02, vy: (Math.random() - 0.5) * 0.02 }));
let hbLast = performance.now();
function drawHome(now) {
  const dt = Math.min(0.05, (now - hbLast) / 1000); hbLast = now;
  const W = innerWidth, H = innerHeight;
  if (hb.width !== W) { hb.width = W; hb.height = H; }
  hctx.clearRect(0, 0, W, H);
  for (const n of nodes) { n.x = (n.x + n.vx * dt + 1) % 1; n.y = (n.y + n.vy * dt + 1) % 1; }
  hctx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j], dx = (a.x - b.x) * W, dy = (a.y - b.y) * H, dd = Math.hypot(dx, dy);
    if (dd < 130) { hctx.strokeStyle = `rgba(95,230,255,${(1 - dd / 130) * 0.25})`; hctx.beginPath(); hctx.moveTo(a.x * W, a.y * H); hctx.lineTo(b.x * W, b.y * H); hctx.stroke(); }
  }
  hctx.fillStyle = "rgba(160,240,255,.8)";
  for (const n of nodes) { hctx.beginPath(); hctx.arc(n.x * W, n.y * H, 1.6, 0, 6.283); hctx.fill(); }
}

/* ---------- opening: the name assembles out of code ---------- */
(function splash() {
  const el = $("#splash"), name = $("#spName"), cv = $("#splashRain"), c = cv.getContext("2d");
  if (/[?&]u=/.test(location.search)) { el.classList.add("done"); return; }
  const G = "01<>/#$%&*+=ABCDEFアカサタナハマヤラワ", r = () => G[(Math.random() * G.length) | 0];
  cv.width = innerWidth; cv.height = innerHeight; const drops = Array.from({ length: Math.ceil(innerWidth / 14) }, () => Math.random() * -innerHeight);
  const rain = setInterval(() => {
    c.fillStyle = "rgba(0,0,0,.14)"; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = "#00ff8c"; c.font = "14px Geist Mono, monospace";
    drops.forEach((y, i) => { c.fillText(r(), i * 14, y); drops[i] = y > cv.height + Math.random() * 300 ? 0 : y + 14; });
  }, 40);
  name.textContent = "SHAHZAD";
  setTimeout(() => { el.classList.add("slam"); try { navigator.vibrate && navigator.vibrate(60); } catch {} }, 450);
  setTimeout(end, 2600);
  function end() { el.classList.add("done"); setTimeout(() => clearInterval(rain), 700); }
})();

const lamp = $("#lamp");
function loop(now) {
  if (active) active.frame(now); else drawHome(now);
  const st = !tracker.ready ? "wait" : window.__hand.present ? "on" : "off";
  if (lamp.dataset.s !== st) lamp.dataset.s = st;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
