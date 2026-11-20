// Robot mode: a 3D mech floating in your room. Steer it with your hand,
// point at a part to rip it off, burst your fist open to blow it apart.
import * as THREE from "three";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js";
import { hand, predicted, drawHand, view, boom, tick, buzz } from "./core.js";

const FLOOR = -1.16;
const NAMES = { head: "SIR UDA DIYA!", armL: "HAATH TOD DIYA!", armR: "HAATH TOD DIYA!", legL: "TAANG TOD DI!", legR: "TAANG TOD DI!", all: "CHUR CHUR!" };

export function createRobot(root, glCanvas, fx) {
  const ctx = fx.getContext("2d");
  const banner = root.querySelector("#rbBanner"), rebuildBtn = root.querySelector("#rbRebuild"), status = root.querySelector("#rbStatus");
  let renderer, scene, camera, rig, body, parts = {}, intact = [], debris = [], tweens = [];
  let sparks, flash, shadow, glowMat, coreLight, ray = new THREE.Raycaster();
  let inited = false, off = null, last = performance.now(), TOTAL = 1;
  let yaw = 0, yawVel = 0, follow = 0, followP = 0, lean = 0, drag = null, headYaw = 0, headPitch = 0;
  let aim = null, charge = 0, cooldown = 0, fistT = 0, timeScale = 1, slowHold = 0, shake = 0, allBrokenAt = 0, recoil = 0;
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), ndc = new THREE.Vector2();

  /* ---------- setup ---------- */
  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 0.12, 6.2); camera.lookAt(0, 0.05, 0);

    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a1410, 0.7));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(3, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x66e8ff, 2.4); rim.position.set(-4, 2, -3); scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xff8a3c, 1.4); rim2.position.set(4, 1, -4); scene.add(rim2);

    rig = new THREE.Group(); scene.add(rig);
    body = new THREE.Group(); rig.add(body);
    buildRobot(); TOTAL = intact.length;
    buildFx();
    resize();
    addEventListener("resize", resize);
    inited = true;
  }
  function resize() {
    if (!renderer) return;
    renderer.setSize(view.W, view.H, false);
    camera.aspect = view.W / view.H;
    camera.position.z = view.W / view.H < 0.62 ? 6.4 : 5.2;
    camera.updateProjectionMatrix();
  }

  /* ---------- the robot (original design: graphite armour, copper trim, cyan core) ---------- */
  const RB = (w, h, d, r = 0.035) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * 0.45));
  function buildRobot() {
    const base = {
      armor: new THREE.MeshStandardMaterial({ color: 0x343a43, metalness: 0.92, roughness: 0.27 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xc9611d, metalness: 0.88, roughness: 0.3 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x121418, metalness: 0.7, roughness: 0.48 }),
    };
    glowMat = new THREE.MeshStandardMaterial({ color: 0x0a1a20, emissive: 0x66e8ff, emissiveIntensity: 2.6, roughness: 0.4 });
    const part = (name, x, y, z) => {
      const g = new THREE.Group(); g.position.set(x, y, z);
      g.userData = { name, meshes: [], broken: false, home: g.position.clone(),
        mats: { armor: base.armor.clone(), accent: base.accent.clone(), dark: base.dark.clone(), glow: glowMat } };
      body.add(g); parts[name] = g; return g;
    };
    const add = (p, parent, geo, mk, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, p.userData.mats[mk]);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m);
      geo.computeBoundingSphere();
      m.userData = { part: p, r: geo.boundingSphere.radius, home: { parent, pos: m.position.clone(), quat: m.quaternion.clone() } };
      p.userData.meshes.push(m); intact.push(m); return m;
    };
    const sub = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };

    // torso
    const T = part("torso", 0, 0, 0);
    add(T, T, RB(0.44, 0.2, 0.28), "armor", 0, -0.02, 0);
    add(T, T, RB(0.47, 0.06, 0.3, 0.02), "dark", 0, 0.1, 0);
    add(T, T, RB(0.34, 0.07, 0.22, 0.02), "armor", 0, 0.18, 0);
    add(T, T, RB(0.32, 0.07, 0.21, 0.02), "dark", 0, 0.26, 0);
    add(T, T, RB(0.36, 0.07, 0.23, 0.02), "armor", 0, 0.34, 0);
    add(T, T, RB(0.66, 0.42, 0.36, 0.07), "armor", 0, 0.58, 0);
    add(T, T, RB(0.27, 0.22, 0.06, 0.03), "accent", -0.16, 0.63, 0.17, 0, 0.14, 0);
    add(T, T, RB(0.27, 0.22, 0.06, 0.03), "accent", 0.16, 0.63, 0.17, 0, -0.14, 0);
    const core = add(T, T, new THREE.CylinderGeometry(0.075, 0.075, 0.05, 28), "glow", 0, 0.52, 0.19, Math.PI / 2);
    add(T, T, new THREE.TorusGeometry(0.1, 0.02, 10, 32), "accent", 0, 0.52, 0.2);
    add(T, T, RB(0.4, 0.08, 0.26, 0.03), "dark", 0, 0.82, 0);
    add(T, T, RB(0.44, 0.34, 0.12, 0.04), "dark", 0, 0.58, -0.22);
    add(T, T, RB(0.06, 0.2, 0.03, 0.01), "glow", -0.1, 0.58, -0.29);
    add(T, T, RB(0.06, 0.2, 0.03, 0.01), "glow", 0.1, 0.58, -0.29);
    halo(core, 0.75, 0x7fe9ff);
    coreLight = new THREE.PointLight(0x66e8ff, 1.2, 2.2); coreLight.position.set(0, 0.52, 0.45); T.add(coreLight);

    // head
    const Hd = part("head", 0, 0.86, 0);
    add(Hd, Hd, new THREE.CylinderGeometry(0.07, 0.085, 0.12, 18), "dark", 0, 0.04, 0);
    add(Hd, Hd, RB(0.28, 0.3, 0.3, 0.09), "armor", 0, 0.23, 0);
    add(Hd, Hd, RB(0.22, 0.17, 0.05, 0.03), "accent", 0, 0.2, 0.15);
    const visor = add(Hd, Hd, RB(0.2, 0.045, 0.02, 0.01), "glow", 0, 0.26, 0.176);
    add(Hd, Hd, RB(0.16, 0.06, 0.05, 0.02), "dark", 0, 0.1, 0.13);
    add(Hd, Hd, RB(0.04, 0.1, 0.25, 0.015), "accent", 0, 0.4, -0.01);
    add(Hd, Hd, new THREE.CylinderGeometry(0.055, 0.055, 0.04, 18), "dark", -0.155, 0.22, 0, 0, 0, Math.PI / 2);
    add(Hd, Hd, new THREE.CylinderGeometry(0.055, 0.055, 0.04, 18), "dark", 0.155, 0.22, 0, 0, 0, Math.PI / 2);
    halo(visor, 1.6, 0x7fe9ff, 0.5);

    // arms
    for (const s of [-1, 1]) {
      const A = part(s < 0 ? "armR" : "armL", s * 0.44, 0.72, 0);
      A.rotation.z = s * 0.1;
      add(A, A, RB(0.27, 0.14, 0.31, 0.05), "accent", s * 0.04, 0.07, 0, 0, 0, -s * 0.25);
      add(A, A, new THREE.SphereGeometry(0.11, 20, 14), "dark", 0, 0, 0);
      add(A, A, RB(0.15, 0.34, 0.16, 0.04), "armor", 0, -0.23, 0);
      const el = sub(A, 0, -0.43, 0); el.rotation.x = -0.28; A.userData.elbow = el;
      add(A, el, new THREE.SphereGeometry(0.075, 16, 12), "dark", 0, 0, 0);
      add(A, el, RB(0.16, 0.32, 0.17, 0.04), "armor", 0, -0.2, 0);
      add(A, el, RB(0.175, 0.12, 0.185, 0.03), "accent", 0, -0.13, 0);
      const hn = sub(el, 0, -0.41, 0);
      add(A, hn, RB(0.13, 0.12, 0.07, 0.025), "dark", 0, -0.01, 0);
      const rep = add(A, hn, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), "glow", -s * 0.04, -0.01, 0, 0, 0, Math.PI / 2);
      halo(rep, 1.8, 0x7fe9ff, 0.35);
      for (let f = 0; f < 4; f++) add(A, hn, RB(0.026, 0.085, 0.032, 0.01), "armor", -0.045 + f * 0.03, -0.12, 0.005);
      add(A, hn, RB(0.026, 0.06, 0.032, 0.01), "armor", s * 0.075, -0.05, 0.02, 0, 0, s * 0.5);
    }
    // legs
    for (const s of [-1, 1]) {
      const L = part(s < 0 ? "legR" : "legL", s * 0.14, -0.12, 0);
      add(L, L, new THREE.SphereGeometry(0.09, 18, 12), "dark", 0, 0, 0);
      add(L, L, RB(0.19, 0.42, 0.21, 0.05), "armor", 0, -0.25, 0);
      add(L, L, RB(0.2, 0.18, 0.06, 0.03), "accent", 0, -0.2, 0.11);
      const kn = sub(L, 0, -0.5, 0);
      add(L, kn, new THREE.SphereGeometry(0.08, 16, 12), "dark", 0, 0, 0);
      add(L, kn, RB(0.14, 0.1, 0.08, 0.03), "accent", 0, 0, 0.09);
      add(L, kn, RB(0.17, 0.42, 0.19, 0.05), "armor", 0, -0.25, 0);
      add(L, kn, RB(0.04, 0.28, 0.02, 0.01), "glow", 0, -0.24, 0.1);
      add(L, kn, RB(0.19, 0.08, 0.32, 0.03), "dark", 0, -0.5, 0.05);
      add(L, kn, RB(0.17, 0.05, 0.1, 0.02), "accent", 0, -0.5, 0.22);
    }
  }

  /* ---------- effects ---------- */
  let dotTex;
  function makeDot() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function halo(mesh, size, color, op = 0.8) {
    dotTex = dotTex || makeDot();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: op }));
    s.scale.setScalar(size * 0.3); mesh.add(s);
  }
  const N = 700;
  const sp = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), col: new Float32Array(N * 3), base: new Float32Array(N * 3), life: new Float32Array(N), dur: new Float32Array(N), next: 0 };
  function buildFx() {
    dotTex = dotTex || makeDot();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sp.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(sp.col, 3));
    sparks = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.07, map: dotTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sparks.frustumCulled = false; scene.add(sparks);
    flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffe2b8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    scene.add(flash);
    const sc = document.createElement("canvas"); sc.width = sc.height = 128;
    const g2 = sc.getContext("2d"), gr = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,.75)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = FLOOR + 0.003; shadow.scale.set(1, 0.55, 1); scene.add(shadow);
  }
  function sparkBurst(p, n, speed = 5, hot = true) {
    for (let k = 0; k < n; k++) {
      const i = sp.next; sp.next = (sp.next + 1) % N;
      sp.pos[i * 3] = p.x; sp.pos[i * 3 + 1] = p.y; sp.pos[i * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), v = speed * (0.3 + Math.random());
      sp.vel[i * 3] = Math.sin(b) * Math.cos(a) * v; sp.vel[i * 3 + 1] = Math.abs(Math.cos(b)) * v * 0.9 + 1; sp.vel[i * 3 + 2] = Math.sin(b) * Math.sin(a) * v;
      const c = hot ? (Math.random() < 0.7 ? [1, 0.55 + Math.random() * 0.3, 0.15] : [0.5, 0.9, 1]) : [0.45, 0.9, 1];
      sp.base.set(c, i * 3); sp.life[i] = 1; sp.dur[i] = 0.5 + Math.random() * 0.9;
    }
  }
  function updateSparks(dt) {
    for (let i = 0; i < N; i++) {
      if (sp.life[i] <= 0) { sp.col[i * 3] = sp.col[i * 3 + 1] = sp.col[i * 3 + 2] = 0; continue; }
      sp.life[i] -= dt / sp.dur[i];
      sp.vel[i * 3 + 1] -= 9 * dt;
      for (let k = 0; k < 3; k++) { sp.vel[i * 3 + k] *= 1 - 1.2 * dt; sp.pos[i * 3 + k] += sp.vel[i * 3 + k] * dt; }
      if (sp.pos[i * 3 + 1] < FLOOR) { sp.pos[i * 3 + 1] = FLOOR; sp.vel[i * 3 + 1] *= -0.3; }
      const l = Math.max(0, sp.life[i]);
      for (let k = 0; k < 3; k++) sp.col[i * 3 + k] = sp.base[i * 3 + k] * l;
    }
    sparks.geometry.attributes.position.needsUpdate = true; sparks.geometry.attributes.color.needsUpdate = true;
  }
  let flashT = 0;
  function flashAt(p, size) { flash.position.copy(p); flash.userData.size = size; flashT = 1; }

  /* ---------- breaking ---------- */
  const shardGeo = [new THREE.TetrahedronGeometry(0.05), new THREE.TetrahedronGeometry(0.032), new THREE.BoxGeometry(0.07, 0.035, 0.02), new THREE.OctahedronGeometry(0.035)];
  shardGeo.forEach((g) => g.computeBoundingSphere());
  function launch(m, origin, force) {
    scene.attach(m);
    m.getWorldPosition(tmpV);
    const dir = tmpV.clone().sub(origin); if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0.5, Math.random() - 0.5);
    dir.normalize();
    const v = dir.multiplyScalar(force * (0.55 + Math.random() * 0.8));
    v.x += (Math.random() - 0.5) * 1.2; v.y += 1.6 + Math.random() * 2.6; v.z += (Math.random() - 0.2) * 1.4;
    const w = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
    debris.push({ o: m, v, w, r: (m.userData.r || 0.05) * 0.55, shard: false });
  }
  function shards(p, count, origin, force) {
    const ms = p.userData.meshes;
    for (let k = 0; k < count; k++) {
      const src = ms[(Math.random() * ms.length) | 0];
      const mat = Math.random() < 0.65 ? p.userData.mats.armor : Math.random() < 0.6 ? p.userData.mats.accent : glowMat;
      const g = shardGeo[(Math.random() * shardGeo.length) | 0];
      const s = new THREE.Mesh(g, mat); src.getWorldPosition(s.position);
      s.position.x += (Math.random() - 0.5) * 0.15; s.position.y += (Math.random() - 0.5) * 0.15;
      s.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      scene.add(s);
      const dir = s.position.clone().sub(origin).normalize();
      const v = dir.multiplyScalar(force * (0.6 + Math.random() * 1.1)); v.y += 1 + Math.random() * 3.5;
      v.x += (Math.random() - 0.5) * 2; v.z += (Math.random() - 0.3) * 2;
      debris.push({ o: s, v, w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(22), r: g.boundingSphere.radius * 0.6, shard: true, age: 0 });
    }
  }
  function say(text) {
    banner.textContent = text;
    banner.classList.remove("show"); void banner.offsetWidth; banner.classList.add("show");
  }
  function breakPart(p, at) {
    if (p.userData.broken) return;
    if (p.userData.name === "torso") return shatterAll(at);
    p.userData.broken = true; setHighlight(p, 0);
    intact = intact.filter((m) => m.userData.part !== p);
    shards(p, 26, at, 3.2);
    [...p.userData.meshes].forEach((m) => launch(m, at.clone().add(new THREE.Vector3(0, -0.15, -0.3)), 3.4));
    sparkBurst(at, 160, 5); flashAt(at, 1.6);
    shake = Math.max(shake, 0.09); recoil = p.userData.name.endsWith("R") ? -0.35 : p.userData.name.endsWith("L") ? 0.35 : 0;
    boom(0.45, 0.55); tick(180, 0.3, 0.25); buzz(45);
    say(NAMES[p.userData.name]);
    rebuildBtn.hidden = false;
    if (!intact.length) allBrokenAt = performance.now();
  }
  function shatterAll(at = new THREE.Vector3(0, 0.4, 0)) {
    const left = Object.values(parts).filter((p) => !p.userData.broken);
    if (!left.length) return;
    const origin = new THREE.Vector3(0, 0.35, -0.2).applyMatrix4(rig.matrixWorld);
    for (const p of left) {
      p.userData.broken = true; setHighlight(p, 0);
      shards(p, p.userData.name === "torso" ? 60 : 24, origin, 5);
      [...p.userData.meshes].forEach((m) => launch(m, origin, 5.2));
    }
    intact = [];
    sparkBurst(origin, 520, 8); flashAt(origin, 4.2);
    timeScale = 0.22; slowHold = 0.75; shake = 0.28;
    boom(0.9, 1.3); tick(90, 0.35, 0.6);
    try { navigator.vibrate && navigator.vibrate([40, 30, 120]); } catch {}
    say(NAMES.all);
    rebuildBtn.hidden = false;
    allBrokenAt = performance.now();
  }
  function rebuild() {
    const now = performance.now();
    for (const p of Object.values(parts)) {
      if (!p.userData.broken) continue;
      p.userData.broken = false;
      p.userData.meshes.forEach((m, i) => {
        const h = m.userData.home; h.parent.attach(m);
        tweens.push({ m, fp: m.position.clone(), fq: m.quaternion.clone(), tp: h.pos, tq: h.quat, t0: now + Math.random() * 380, dur: 650 + Math.random() * 300 });
        intact.push(m);
      });
    }
    debris = debris.filter((d) => { if (d.shard) { d.fade = 1; return true; } return false; });
    sparkBurst(new THREE.Vector3(0, 0.3, 0).applyMatrix4(rig.matrixWorld), 160, 3, false);
    allBrokenAt = 0; rebuildBtn.hidden = true;
    tick(300, 0.18, 0.5); setTimeout(() => tick(600, 0.15, 0.4), 260); setTimeout(() => tick(1200, 0.12, 0.3), 520);
    say("DOBARA TAIYAAR");
  }
  rebuildBtn.addEventListener("click", rebuild);

  function setHighlight(p, k) {
    const m = p.userData.mats;
    for (const key of ["armor", "accent", "dark"]) { m[key].emissive.setHex(0xff3a10); m[key].emissiveIntensity = k; }
  }

  /* ---------- hand events ---------- */
  function onHand(type, t, prev) {
    if (type === "gesture") {
      if (hand.gesture === "fist") fistT = t;
      if (hand.gesture === "open" && prev === "fist" && t - fistT < 750 && intact.length) shatterAll();
    }
    if (type === "pinchdown") { const P = predicted(t); drag = { x: P[8][0], yaw0: yaw }; yawVel = 0; }
    if (type === "pinchup" || type === "lost") { if (drag) yawVel = (hand.vel[8][0] / view.W) * 4.2; drag = null; }
  }

  /* ---------- per-frame ---------- */
  function frame(now) {
    const rdt = Math.min(0.05, (now - last) / 1000); last = now;
    if (slowHold > 0) slowHold -= rdt; else timeScale += (1 - timeScale) * Math.min(1, rdt * 2.2);
    const dt = rdt * timeScale, t = now / 1000;
    const W = view.W, H = view.H, d = view.dpr;
    if (fx.width !== Math.round(W * d)) { fx.width = Math.round(W * d); fx.height = Math.round(H * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);

    let P = null, hovered = null, hitPoint = null;
    if (hand.present) {
      P = predicted(now);
      const g = hand.gesture;
      if (g === "open") {
        const cx = (P[0][0] + P[5][0] + P[9][0] + P[13][0] + P[17][0]) / 5, cy = (P[0][1] + P[5][1] + P[9][1] + P[13][1] + P[17][1]) / 5;
        follow = (cx / W - 0.5) * 1.9; followP = (cy / H - 0.5) * 0.5;
        lean += ((-hand.vel[9][0] / W) * 0.25 - lean) * 0.1;
      } else { follow *= 0.97; followP *= 0.95; lean *= 0.9; }
      if (drag) yaw = drag.yaw0 + ((P[8][0] - drag.x) / W) * 4.2;
      // look at the hand
      headYaw += (((P[9][0] / W) - 0.5) * 1.1 - headYaw) * 0.08; headPitch += (((P[9][1] / H) - 0.5) * 0.6 - headPitch) * 0.08;
      if (g === "point" && cooldown <= 0) {
        ndc.set((P[8][0] / W) * 2 - 1, -(P[8][1] / H) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(intact, false)[0];
        if (hit) { hovered = hit.object.userData.part; hitPoint = hit.point; }
      }
    } else { follow *= 0.97; followP *= 0.95; lean *= 0.9; headYaw *= 0.97; headPitch *= 0.97; }

    if (!drag) { yaw += yawVel * dt; yawVel *= Math.pow(0.35, dt); }
    cooldown -= rdt;
    // aiming + charge
    if (hovered !== aim) { if (aim) setHighlight(aim, 0); aim = hovered; charge = 0; }
    if (aim) {
      charge += rdt / 0.5;
      setHighlight(aim, 0.35 + 0.5 * Math.abs(Math.sin(t * 14)) * Math.min(1, charge + 0.3));
      const flick = hand.speed(8) > 1700;
      if (charge >= 1 || flick) { const p = aim; aim = null; charge = 0; cooldown = 0.35; breakPart(p, hitPoint); }
    }
    // fist hold to rebuild
    let rebuildCharge = 0;
    if (hand.present && hand.gesture === "fist" && !intact.length) {
      rebuildCharge = Math.min(1, (now - fistT) / 1100);
      if (rebuildCharge >= 1) rebuild();
    }
    if (allBrokenAt && now - allBrokenAt > 6000) rebuild();

    // robot pose
    const intactAll = intact.length > 0;
    rig.rotation.y += (yaw + follow - rig.rotation.y) * Math.min(1, rdt * 7);
    rig.rotation.x += (followP * 0.4 - rig.rotation.x) * Math.min(1, rdt * 5);
    recoil *= Math.pow(0.02, rdt);
    rig.rotation.z += (lean + recoil * 0.4 - rig.rotation.z) * Math.min(1, rdt * 8);
    rig.position.y = Math.sin(t * 1.3) * 0.035;
    const T = parts.torso, Hd = parts.head;
    if (!T.userData.broken) T.position.y = Math.sin(t * 2.1) * 0.01;
    if (!Hd.userData.broken) { Hd.rotation.y = headYaw + Math.sin(t * 0.6) * 0.07; Hd.rotation.x = headPitch * 0.6; Hd.position.y = 0.86 + T.position.y; }
    for (const [n, s] of [["armL", 1], ["armR", -1]]) {
      const A = parts[n]; if (A.userData.broken) continue;
      const wave = hand.present && hand.gesture === "open" ? Math.sin(t * 6 + s) * 0.25 : Math.sin(t * 1.4 + s) * 0.07;
      A.rotation.x = wave; A.rotation.z = s * (0.1 + (hand.present ? Math.abs(lean) * 0.6 : 0));
      A.userData.elbow.rotation.x = -0.28 - (hand.present && hand.gesture === "open" ? 0.4 + Math.sin(t * 6) * 0.2 : 0);
    }
    glowMat.emissiveIntensity = 2.3 + Math.sin(t * 4) * 0.4;
    coreLight.intensity = parts.torso.userData.broken ? 0 : 1.1 + Math.sin(t * 4) * 0.3;
    shadow.material.opacity = 0.2 + 0.8 * (intact.length / TOTAL);

    // physics
    for (let i = debris.length - 1; i >= 0; i--) {
      const q = debris[i], o = q.o;
      if (q.fade !== undefined) { q.fade -= rdt * 3; o.scale.setScalar(Math.max(0.001, q.fade)); if (q.fade <= 0) { scene.remove(o); debris.splice(i, 1); } continue; }
      q.v.y -= 9.8 * dt; q.v.multiplyScalar(1 - 0.12 * dt);
      o.position.addScaledVector(q.v, dt);
      o.rotation.x += q.w.x * dt; o.rotation.y += q.w.y * dt; o.rotation.z += q.w.z * dt;
      if (o.position.y < FLOOR + q.r) {
        o.position.y = FLOOR + q.r;
        if (q.v.y < 0) q.v.y *= -0.3;
        q.v.x *= 0.8; q.v.z *= 0.8; q.w.multiplyScalar(0.72);
      }
      if (o.position.z > 3.6) { o.position.z = 3.6; q.v.z *= -0.4; }
      if (q.shard) { q.age += rdt; if (q.age > 5) { q.fade = 1; } }
    }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i], k = Math.min(1, Math.max(0, (now - tw.t0) / tw.dur));
      const e = k === 1 ? 1 : 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      tw.m.position.lerpVectors(tw.fp, tw.tp, e); tw.m.quaternion.slerpQuaternions(tw.fq, tw.tq, Math.min(1, k * 1.15));
      if (k >= 1) tweens.splice(i, 1);
    }
    updateSparks(dt);
    if (flashT > 0) { flashT -= rdt * 3.2; flash.material.opacity = Math.max(0, flashT); flash.scale.setScalar(flash.userData.size * (1.4 - flashT * 0.6)); }
    shake *= Math.pow(0.04, rdt);
    camera.position.x = (Math.random() - 0.5) * shake; camera.position.y = 0.12 + (Math.random() - 0.5) * shake;
    renderer.render(scene, camera);

    // hand + aim overlay
    if (P) {
      drawHand(ctx, P, aim ? "255,120,60" : "134,230,255", 0.85);
      if (hand.gesture === "point") {
        const x = P[8][0], y = P[8][1];
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = aim ? "rgba(255,110,50,1)" : "rgba(134,230,255,.8)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 22, 0, 6.283); ctx.stroke();
        for (let k = 0; k < 4; k++) { const a = k * 1.571 + t; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 28, y + Math.sin(a) * 28); ctx.lineTo(x + Math.cos(a) * 36, y + Math.sin(a) * 36); ctx.stroke(); }
        if (aim) { ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 22, -1.571, -1.571 + 6.283 * Math.min(1, charge)); ctx.stroke(); }
        ctx.restore();
      }
      if (rebuildCharge > 0) {
        const x = P[9][0], y = P[9][1];
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "rgba(134,230,255,1)"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(x, y, 46, -1.571, -1.571 + 6.283 * rebuildCharge); ctx.stroke(); ctx.restore();
      }
    }
    const g = hand.present ? hand.gesture : "none";
    const msg = !hand.present ? "Haath camera ke saamne laao" : g === "open" ? "✋ Robot tumhare saath naach raha hai" : g === "point" ? (aim ? "👉 Nishana laga! Ruko ya jhatka do" : "👉 Robot ke kisi hisse par ungli rakho") :
      g === "pinch" ? "🤏 Ghuma rahe ho" : g === "fist" ? (intactAll ? "✊ Ab jhatke se poora haath kholo!" : "✊ Pakde raho = dobara jodo") : "";
    if (status._m !== msg) { status.textContent = msg; status._m = msg; }
  }

  return {
    enter() { if (!inited) init(); root.hidden = false; glCanvas.hidden = false; resize(); off = hand.on(onHand); last = performance.now(); },
    exit() { root.hidden = true; glCanvas.hidden = true; off && off(); ctx.clearRect(0, 0, fx.width, fx.height); },
    frame,
    shatter: () => inited && shatterAll(),
    rebuild: () => inited && rebuild(),
    breakPart: (n) => inited && breakPart(parts[n], new THREE.Vector3().setFromMatrixPosition(parts[n].matrixWorld)),
  };
}
