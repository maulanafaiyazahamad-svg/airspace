import { view, startCamera, cameraOn, loadTracker, tracker, audio } from "./core.js";
import { createKeyboard } from "./keyboard.js";
import { createRobot } from "./robot.js";
import { VERSION } from "./version.js";

const $ = (s) => document.querySelector(s);
const fx = $("#fx");
const modes = { kb: createKeyboard($("#kbMode"), fx), robot: createRobot($("#rbMode"), $("#gl"), fx) };
let active = null;
window.shahzad = modes;

/* camera choice on the home screen */
try { view.facing = localStorage.getItem("shahzad.cam") || "environment"; } catch {}
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
  if (!tracker.ready) {
    const box = $("#loading"), bar = $("#loadBar"); box.hidden = false;
    loadTracker((f) => { bar.style.width = Math.round(f * 100) + "%"; })
      .then(() => { box.classList.add("done"); setTimeout(() => (box.hidden = true), 500); })
      .catch(() => { $("#loadMsg").textContent = "Haath pehchanne wala system load nahi hua. App band karke dobara kholo."; });
  }
}
function home() {
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

$("#ver").textContent = "Version " + VERSION;
$("#refresh").addEventListener("click", () => { location.replace(location.pathname + "?u=" + Date.now()); });

function loop(now) { active?.frame(now); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
