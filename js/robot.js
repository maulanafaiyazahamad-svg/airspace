// Robot mode: an original armoured war-suit hovering in your room on boot thrusters.
// It never moves on its own. Three controls, all by hand:
//   1. pinch and drag      -> turn it
//   2. one finger on a part -> rip that part off
//   3. squeeze a fist, then open it -> blow the whole suit apart
import * as THREE from "three";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js";
import { hand, predicted, drawHand, view, boom, tick, buzz, crunch, clink, rumble } from "./core.js";

const FLOOR = -1.5;
const LINES = { head: "SIR UDA DIYA!", armL: "HAATH TOD DIYA!", armR: "HAATH TOD DIYA!", legL: "TAANG UKHAAD DI!", legR: "TAANG UKHAAD DI!", all: "CHUR CHUR!" };

export function createRobot(root, glCanvas, fx) {
  const ctx = fx.getContext("2d");
  const banner = root.querySelector("#rbBanner"), rebuildBtn = root.querySelector("#rbRebuild"), status = root.querySelector("#rbStatus");
  let renderer, scene, camera, rig, body, parts = {}, proxies = [], debris = [], tweens = [], flames = [], arcs = [];
  let sparks, flash, wave, glowMat, eyeMat, reactorLight, ring, inited = false, off = null, last = performance.now(), TOTAL = 1, intactCount = 0;
  let yawT = 0, pitchT = 0, drag = null, aim = null, charge = 0, cooldown = 0;
  let fistStart = 0, fistSeen = 0, squeeze = 0, squeezePeak = 0, rum = null, timeScale = 1, slowHold = 0, shake = 0, allGoneAt = 0, lastClink = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tv = new THREE.Vector3();

  /* ---------------- setup ---------------- */
  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x140f0c, 0.55));
    const key = new THREE.DirectionalLight(0xfff3e6, 2.6); key.position.set(2.5, 4, 5); scene.add(key);
    const rimC = new THREE.DirectionalLight(0x5fe6ff, 3.2); rimC.position.set(-4, 2.5, -3); scene.add(rimC);
    const rimR = new THREE.DirectionalLight(0xff4a3a, 1.6); rimR.position.set(4, 1, -4); scene.add(rimR);
    rig = new THREE.Group(); scene.add(rig);
    body = new THREE.Group(); body.position.y = 0.15; rig.add(body);
    buildSuit();
    buildFx();
    resize(); addEventListener("resize", resize);
    inited = true;
  }
  function resize() {
    if (!renderer) return;
    renderer.setSize(view.W, view.H, false);
    camera.aspect = view.W / view.H;
    camera.position.set(0, 0.25, camera.aspect < 0.62 ? 7.0 : 5.6); camera.lookAt(0, 0.12, 0);
    camera.updateProjectionMatrix();
  }

  /* ---------------- the suit ---------------- */
  const RB = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * 0.45));
  const CAP = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 18);
  const TAPER = (a, b, h, n = 20) => new THREE.CylinderGeometry(a, b, h, n);
  function buildSuit() {
    const base = {
      armor: new THREE.MeshStandardMaterial({ color: 0x20242b, metalness: 0.96, roughness: 0.2 }),
      plate: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 1, roughness: 0.16 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.8, roughness: 0.42 }),
    };
    glowMat = new THREE.MeshStandardMaterial({ color: 0x041218, emissive: 0x55e4ff, emissiveIntensity: 3.2 });
    eyeMat = new THREE.MeshStandardMaterial({ color: 0x200404, emissive: 0xff2a1a, emissiveIntensity: 5 });
    const part = (name, x, y, z) => {
      const g = new THREE.Group(); g.position.set(x, y, z);
      g.userData = { name, meshes: [], flames: [], broken: false,
        mats: { armor: base.armor.clone(), plate: base.plate.clone(), dark: base.dark.clone(), glow: glowMat, eye: eyeMat } };
      body.add(g); parts[name] = g; return g;
    };
    const add = (p, parent, geo, mk, x, y, z, rx = 0, ry = 0, rz = 0, sc) => {
      const m = new THREE.Mesh(geo, p.userData.mats[mk]);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz); if (sc) m.scale.set(...sc);
      parent.add(m); geo.computeBoundingSphere();
      m.userData = { part: p, r: geo.boundingSphere.radius * Math.max(...m.scale.toArray()), home: { parent, pos: m.position.clone(), quat: m.quaternion.clone(), scale: m.scale.clone() } };
      p.userData.meshes.push(m); return m;
    };
    const sub = (parent, x, y, z, rx = 0) => { const o = new THREE.Group(); o.position.set(x, y, z); o.rotation.x = rx; parent.add(o); return o; };

    // ---- torso
    const T = part("torso", 0, 0, 0);
    add(T, T, TAPER(0.2, 0.17, 0.2, 6), "armor", 0, -0.02, 0, 0, Math.PI / 6, 0, [1, 1, 0.75]);
    add(T, T, RB(0.14, 0.15, 0.06), "plate", 0, -0.06, 0.13, -0.15);
    add(T, T, TAPER(0.16, 0.19, 0.17), "dark", 0, 0.16, 0);
    for (const y of [0.13, 0.21, 0.29]) for (const s of [-1, 1]) add(T, T, RB(0.1, 0.065, 0.045, 0.015), "plate", s * 0.056, y, 0.15);
    add(T, T, TAPER(0.37, 0.24, 0.44, 6), "armor", 0, 0.56, 0, 0, Math.PI / 6, 0, [1, 1, 0.62]);
    for (const s of [-1, 1]) add(T, T, RB(0.25, 0.17, 0.07, 0.03), "plate", s * 0.14, 0.63, 0.19, 0, -s * 0.28, s * 0.08);
    const reactor = add(T, T, new THREE.CylinderGeometry(0.07, 0.07, 0.04, 6), "glow", 0, 0.54, 0.235, Math.PI / 2);
    add(T, T, new THREE.TorusGeometry(0.095, 0.017, 8, 6), "plate", 0, 0.54, 0.245, 0, 0, Math.PI / 6);
    add(T, T, TAPER(0.14, 0.2, 0.07), "dark", 0, 0.8, 0);
    add(T, T, RB(0.44, 0.36, 0.1, 0.04), "dark", 0, 0.56, -0.2);
    for (const s of [-1, 1]) {
      add(T, T, RB(0.022, 0.24, 0.02, 0.008), "glow", s * 0.09, 0.56, -0.26);
      add(T, T, RB(0.02, 0.18, 0.02, 0.008), "glow", s * 0.29, 0.5, 0.05, 0, 0, s * 0.15);
    }
    halo(reactor, 0.9, 0x6fe9ff);
    reactorLight = new THREE.PointLight(0x5fe6ff, 1.4, 2.4); reactorLight.position.set(0, 0.54, 0.5); T.add(reactorLight);

    // ---- head
    const H = part("head", 0, 0.86, 0);
    add(H, H, TAPER(0.065, 0.08, 0.1), "dark", 0, 0.03, 0);
    add(H, H, new THREE.SphereGeometry(0.15, 28, 20), "armor", 0, 0.22, 0, 0, 0, 0, [0.95, 1.12, 1.05]);
    add(H, H, RB(0.2, 0.21, 0.06, 0.04), "plate", 0, 0.2, 0.12);
    for (const s of [-1, 1]) {
      const eye = add(H, H, RB(0.068, 0.019, 0.012, 0.006), "eye", s * 0.047, 0.245, 0.152, 0, 0, -s * 0.2);
      halo(eye, 0.5, 0xff3322, 0.9);
      add(H, H, RB(0.03, 0.1, 0.12, 0.012), "plate", s * 0.13, 0.2, 0.05);
    }
    add(H, H, RB(0.15, 0.06, 0.05, 0.02), "dark", 0, 0.11, 0.125);
    add(H, H, RB(0.03, 0.06, 0.22, 0.012), "plate", 0, 0.37, 0);

    // ---- arms
    for (const s of [-1, 1]) {
      const A = part(s < 0 ? "armR" : "armL", s * 0.44, 0.72, 0);
      A.rotation.z = s * 0.12;
      add(A, A, new THREE.SphereGeometry(0.1, 20, 14), "dark", 0, 0, 0);
      add(A, A, new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), "plate", s * 0.03, 0.03, 0, 0, 0, -s * 0.35, [1, 0.8, 1.05]);
      add(A, A, CAP(0.075, 0.22), "armor", 0, -0.22, 0);
      add(A, A, RB(0.1, 0.16, 0.05, 0.02), "plate", 0, -0.22, 0.07);
      const el = sub(A, 0, -0.43, 0, -0.25);
      add(A, el, new THREE.SphereGeometry(0.07, 16, 12), "dark", 0, 0, 0);
      add(A, el, TAPER(0.09, 0.07, 0.3), "armor", 0, -0.18, 0);
      add(A, el, RB(0.17, 0.14, 0.18, 0.04), "plate", 0, -0.1, 0);
      add(A, el, RB(0.02, 0.16, 0.012, 0.006), "glow", 0, -0.2, 0.085);
      const hn = sub(el, 0, -0.38, 0);
      add(A, hn, RB(0.11, 0.12, 0.1, 0.03), "dark", 0, 0, 0);
      add(A, hn, RB(0.12, 0.04, 0.11, 0.015), "plate", 0, -0.05, 0);
      const pal = add(A, hn, new THREE.CylinderGeometry(0.032, 0.032, 0.012, 18), "glow", -s * 0.057, 0, 0, 0, 0, Math.PI / 2);
      halo(pal, 0.9, 0x6fe9ff, 0.5);
    }
    // ---- legs, hovering on boot thrusters
    for (const s of [-1, 1]) {
      const L = part(s < 0 ? "legR" : "legL", s * 0.13, -0.1, 0);
      add(L, L, new THREE.SphereGeometry(0.09, 18, 12), "dark", 0, 0, 0);
      add(L, L, CAP(0.1, 0.28), "armor", 0, -0.24, 0);
      add(L, L, RB(0.15, 0.22, 0.05, 0.02), "plate", 0, -0.22, 0.1);
      const kn = sub(L, 0, -0.48, 0);
      add(L, kn, new THREE.SphereGeometry(0.075, 16, 12), "dark", 0, 0, 0);
      add(L, kn, RB(0.12, 0.1, 0.07, 0.03), "plate", 0, 0, 0.08);
      add(L, kn, TAPER(0.085, 0.07, 0.36), "armor", 0, -0.22, 0);
      add(L, kn, RB(0.11, 0.26, 0.04, 0.02), "plate", 0, -0.2, 0.08);
      add(L, kn, RB(0.16, 0.12, 0.27, 0.04), "armor", 0, -0.44, 0.03);
      add(L, kn, RB(0.14, 0.06, 0.08, 0.02), "plate", 0, -0.47, 0.17);
      const noz = add(L, kn, TAPER(0.05, 0.065, 0.05), "dark", 0, -0.52, -0.01);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.42, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x9ff1ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      flame.rotation.x = Math.PI; flame.position.y = -0.23; noz.add(flame);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.24, 12, 1, true), flame.material.clone()); core.material.color.setHex(0xffffff);
      core.rotation.x = Math.PI; core.position.y = -0.14; noz.add(core);
      halo(noz, 1.1, 0x6fe9ff, 0.8);
      L.userData.flames.push(flame, core); flames.push(flame, core);
    }
    // hit zones: one generous invisible box per part, so a fingertip lands easily
    body.updateMatrixWorld(true);
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    for (const p of Object.values(parts)) {
      const box = new THREE.Box3();
      p.userData.meshes.forEach((m) => box.expandByObject(m));
      const size = box.getSize(new THREE.Vector3()).multiplyScalar(1.3), c = box.getCenter(new THREE.Vector3());
      const px = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, 0.3), Math.max(size.y, 0.3), Math.max(size.z, 0.3)), hidden);
      p.worldToLocal(c); px.position.copy(c); px.userData.part = p; p.add(px); p.userData.proxy = px; proxies.push(px);
    }
    TOTAL = intactCount = Object.values(parts).reduce((n, p) => n + p.userData.meshes.length, 0);
  }

  /* ---------------- effects ---------------- */
  let dotTex;
  function dot() {
    if (dotTex) return dotTex;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "#fff"); gr.addColorStop(0.25, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    dotTex = new THREE.CanvasTexture(c); dotTex.colorSpace = THREE.SRGBColorSpace; return dotTex;
  }
  function halo(mesh, size, color, op = 0.8) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: op }));
    s.scale.setScalar(size * 0.3); mesh.add(s);
  }
  const N = 900;
  const sp = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), col: new Float32Array(N * 3), base: new Float32Array(N * 3), life: new Float32Array(N), dur: new Float32Array(N), next: 0 };
  function buildFx() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sp.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(sp.col, 3));
    sparks = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, map: dot(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sparks.frustumCulled = false; scene.add(sparks);
    flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(), color: 0xfff0d8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    scene.add(flash);
    wave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 8, 64), new THREE.MeshBasicMaterial({ color: 0x9ff1ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(wave);
    // energy ring on the floor under the hovering suit
    ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 64), new THREE.MeshBasicMaterial({ map: ringTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = FLOOR + 0.004; scene.add(ring);
  }
  function ringTex() {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    gr.addColorStop(0, "rgba(95,230,255,0)"); gr.addColorStop(0.55, "rgba(95,230,255,.55)"); gr.addColorStop(1, "rgba(95,230,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); return t;
  }
  function emit(p, n, speed, palette, upBias = 1) {
    for (let k = 0; k < n; k++) {
      const i = sp.next; sp.next = (sp.next + 1) % N;
      sp.pos[i * 3] = p.x; sp.pos[i * 3 + 1] = p.y; sp.pos[i * 3 + 2] = p.z;
      const a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1), v = speed * (0.25 + Math.random());
      sp.vel[i * 3] = Math.sin(b) * Math.cos(a) * v; sp.vel[i * 3 + 1] = Math.cos(b) * v * 0.8 + upBias; sp.vel[i * 3 + 2] = Math.sin(b) * Math.sin(a) * v;
      sp.base.set(palette[(Math.random() * palette.length) | 0], i * 3); sp.life[i] = 1; sp.dur[i] = 0.4 + Math.random() * 1.0;
    }
  }
  const HOT = [[1, 0.6, 0.2], [1, 0.85, 0.5], [1, 0.4, 0.12], [0.5, 0.9, 1]], COLD = [[0.4, 0.9, 1], [0.8, 0.97, 1]];
  function updateSparks(dt) {
    for (let i = 0; i < N; i++) {
      if (sp.life[i] <= 0) { if (sp.col[i * 3] || sp.col[i * 3 + 1]) sp.col[i * 3] = sp.col[i * 3 + 1] = sp.col[i * 3 + 2] = 0; continue; }
      sp.life[i] -= dt / sp.dur[i]; sp.vel[i * 3 + 1] -= 8 * dt;
      for (let k = 0; k < 3; k++) { sp.vel[i * 3 + k] *= 1 - 1.3 * dt; sp.pos[i * 3 + k] += sp.vel[i * 3 + k] * dt; }
      if (sp.pos[i * 3 + 1] < FLOOR) { sp.pos[i * 3 + 1] = FLOOR; sp.vel[i * 3 + 1] *= -0.3; }
      const l = Math.max(0, sp.life[i]); for (let k = 0; k < 3; k++) sp.col[i * 3 + k] = sp.base[i * 3 + k] * l;
    }
    sparks.geometry.attributes.position.needsUpdate = true; sparks.geometry.attributes.color.needsUpdate = true;
  }
  let flashT = 0, waveT = 0;
  function flashAt(p, size) { flash.position.copy(p); flash.userData.size = size; flashT = 1; }
  function shock(p) { wave.position.copy(p); wave.rotation.set(Math.PI / 2, 0, 0); waveT = 1; }
  function arc(a) {
    const pts = []; for (let i = 0; i < 9; i++) pts.push(new THREE.Vector3());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xaaf4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const end = a.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.3) * 0.5));
    line.userData = { a: a.clone(), b: end, life: 1 }; line.frustumCulled = false; scene.add(line); arcs.push(line);
  }
  function updateArcs(rdt) {
    for (let i = arcs.length - 1; i >= 0; i--) {
      const l = arcs[i], u = l.userData; u.life -= rdt * 3.5;
      if (u.life <= 0) { scene.remove(l); l.geometry.dispose(); arcs.splice(i, 1); continue; }
      const pos = l.geometry.attributes.position;
      for (let k = 0; k < 9; k++) {
        tv.lerpVectors(u.a, u.b, k / 8);
        if (k > 0 && k < 8) tv.add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12));
        pos.setXYZ(k, tv.x, tv.y, tv.z);
      }
      pos.needsUpdate = true; l.material.opacity = u.life;
    }
  }

  /* ---------------- breaking ---------------- */
  const shardGeo = [new THREE.TetrahedronGeometry(0.05), new THREE.TetrahedronGeometry(0.03), new THREE.BoxGeometry(0.07, 0.03, 0.02), new THREE.OctahedronGeometry(0.035)];
  shardGeo.forEach((g) => g.computeBoundingSphere());
  function launch(m, origin, force) {
    scene.attach(m); m.getWorldPosition(tv);
    const dir = tv.clone().sub(origin); if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0.4, Math.random() - 0.5);
    const v = dir.normalize().multiplyScalar(force * (0.55 + Math.random() * 0.8));
    v.x += (Math.random() - 0.5) * 1.4; v.y += 1.4 + Math.random() * 2.8; v.z += (Math.random() - 0.15) * 1.6;
    debris.push({ o: m, v, w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(16), r: (m.userData.r || 0.05) * 0.55 });
  }
  function shards(p, n, origin, force) {
    const ms = p.userData.meshes, M = p.userData.mats;
    for (let k = 0; k < n; k++) {
      const g = shardGeo[(Math.random() * shardGeo.length) | 0];
      const s = new THREE.Mesh(g, Math.random() < 0.55 ? M.armor : Math.random() < 0.7 ? M.plate : glowMat);
      ms[(Math.random() * ms.length) | 0].getWorldPosition(s.position);
      s.position.x += (Math.random() - 0.5) * 0.12; s.position.y += (Math.random() - 0.5) * 0.12;
      scene.add(s);
      const v = s.position.clone().sub(origin).normalize().multiplyScalar(force * (0.6 + Math.random() * 1.2));
      v.y += 1 + Math.random() * 3.5; v.x += (Math.random() - 0.5) * 2.2; v.z += (Math.random() - 0.2) * 2.2;
      debris.push({ o: s, v, w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(24), r: g.boundingSphere.radius * 0.6, shard: true, age: 0 });
    }
  }
  function say(t) { banner.textContent = t; banner.classList.remove("show"); void banner.offsetWidth; banner.classList.add("show"); }
  function detach(p, origin, force, shardN) {
    p.userData.broken = true; glowPart(p, 0, 0);
    p.userData.flames.forEach((f) => (f.visible = false));
    shards(p, shardN, origin, force);
    [...p.userData.meshes].forEach((m) => launch(m, origin, force));
    intactCount -= p.userData.meshes.length;
  }
  function breakPart(p, at) {
    if (p.userData.broken) return;
    if (p.userData.name === "torso") return shatter(1);
    detach(p, at.clone().add(new THREE.Vector3(0, -0.1, -0.35)), 3.6, 30);
    emit(at, 220, 5.5, HOT); flashAt(at, 1.8); for (let k = 0; k < 4; k++) arc(at);
    shake = Math.max(shake, 0.1);
    crunch(0.55); buzz(55);
    say(LINES[p.userData.name]); rebuildBtn.hidden = false;
    if (!intactCount) allGoneAt = performance.now();
  }
  function shatter(power) {
    const left = Object.values(parts).filter((p) => !p.userData.broken); if (!left.length) return;
    const origin = new THREE.Vector3(0, 0.5, -0.25).applyMatrix4(body.matrixWorld);
    const force = 4.5 + 4 * power;
    for (const p of left) detach(p, origin, force, p.userData.name === "torso" ? 70 : 26);
    emit(origin, 700, 9, HOT, 1.5); flashAt(origin, 5); shock(origin); for (let k = 0; k < 10; k++) arc(origin);
    timeScale = 0.2; slowHold = 0.8; shake = 0.32;
    crunch(1.2);
    try { navigator.vibrate && navigator.vibrate([60, 40, 160]); } catch {}
    say(LINES.all); rebuildBtn.hidden = false; allGoneAt = performance.now();
  }
  function rebuild() {
    const now = performance.now();
    for (const p of Object.values(parts)) {
      if (!p.userData.broken) continue;
      p.userData.broken = false; p.userData.flames.forEach((f) => (f.visible = true));
      for (const m of p.userData.meshes) {
        const h = m.userData.home; h.parent.attach(m);
        tweens.push({ m, fp: m.position.clone(), fq: m.quaternion.clone(), fs: m.scale.clone(), h, t0: now + Math.random() * 420, dur: 620 + Math.random() * 320 });
      }
    }
    intactCount = TOTAL;
    debris = debris.filter((d) => { if (d.shard) { d.fade = 1; return true; } return false; });
    emit(new THREE.Vector3(0, 0.4, 0).applyMatrix4(body.matrixWorld), 200, 3, COLD, 0.5);
    allGoneAt = 0; rebuildBtn.hidden = true;
    tick(300, 0.18, 0.5); setTimeout(() => tick(620, 0.15, 0.4), 240); setTimeout(() => tick(1250, 0.12, 0.3), 480);
    say("WAR-SUIT ONLINE");
  }
  rebuildBtn.addEventListener("click", rebuild);
  function glowPart(p, k, hue) {
    for (const key of ["armor", "plate", "dark"]) { const m = p.userData.mats[key]; m.emissive.setHex(hue || 0xff3a10); m.emissiveIntensity = k; }
  }

  /* ---------------- frame ---------------- */
  function frame(now) {
    const rdt = Math.min(0.05, (now - last) / 1000); last = now;
    if (slowHold > 0) slowHold -= rdt; else timeScale += (1 - timeScale) * Math.min(1, rdt * 2.4);
    const dt = rdt * timeScale, t = now / 1000, W = view.W, H = view.H, d = view.dpr;
    if (fx.width !== Math.round(W * d)) { fx.width = Math.round(W * d); fx.height = Math.round(H * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);

    // read the hand
    const P = hand.present ? predicted(now) : null;
    const e = hand.ext, nExt = e.filter(Boolean).length;
    const fistNow = !!P && nExt === 0;
    const pinchNow = !!P && hand.pinched && !fistNow;
    const pointNow = !!P && e[0] && !e[1] && !pinchNow && !fistNow;
    const openNow = !!P && nExt >= 3 && !pinchNow;

    // 1) pinch + drag = turn. Stops exactly where you let go.
    if (pinchNow) {
      const x = (P[4][0] + P[8][0]) / 2, y = (P[4][1] + P[8][1]) / 2;
      if (!drag) drag = { x, y, yaw: yawT, pitch: pitchT };
      yawT = drag.yaw + ((x - drag.x) / W) * 3.8;
      pitchT = Math.max(-0.45, Math.min(0.45, drag.pitch + ((y - drag.y) / H) * 1.4));
    } else drag = null;
    rig.rotation.y += (yawT - rig.rotation.y) * Math.min(1, rdt * 18);
    rig.rotation.x += (pitchT - rig.rotation.x) * Math.min(1, rdt * 18);

    // 2) one finger on a part = rip it off
    let hovered = null, hitPt = null;
    cooldown -= rdt;
    if (pointNow && cooldown <= 0 && intactCount) {
      const live = proxies.filter((q) => !q.userData.part.userData.broken);
      for (const [ox, oy] of [[0, 0], [0, -18], [14, 8], [-14, 8]]) {
        ndc.set(((P[8][0] + ox) / W) * 2 - 1, -((P[8][1] + oy) / H) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(live, false)[0];
        if (hit) { hovered = hit.object.userData.part; hitPt = hit.point; break; }
      }
    }
    if (hovered !== aim) { if (aim && !aim.userData.broken) glowPart(aim, 0); aim = hovered; charge = 0; if (aim) tick(900, 0.05, 0.04); }
    if (aim) {
      charge += rdt / 0.22;
      glowPart(aim, 0.6 + 0.6 * Math.abs(Math.sin(t * 22)));
      if (charge >= 1 || hand.speed(8) > 1300) { const p = aim; aim = null; charge = 0; cooldown = 0.25; breakPart(p, hitPt); }
    }

    // 3) squeeze a fist, then open it = blow it apart
    if (fistNow && intactCount) {
      if (!fistStart) { fistStart = now; squeezePeak = 0; rum = rumble(); }
      fistSeen = now;
      squeeze = Math.min(1, (now - fistStart) / 650); squeezePeak = Math.max(squeezePeak, squeeze);
      if (Math.random() < squeeze * 0.5) buzz(12);
    } else if (fistStart) {
      if (openNow && squeezePeak > 0.2) { shatter(squeezePeak); fistStart = 0; }
      else if (now - fistSeen > 450) fistStart = 0;
      squeeze = Math.max(0, squeeze - rdt * 3);
    } else squeeze = Math.max(0, squeeze - rdt * 3);
    if (!fistStart && rum) { rum.stop(); rum = null; }
    if (rum) rum.set(squeeze);
    // squeeze look: the suit strains, glows red and trembles
    if (intactCount) for (const p of Object.values(parts)) {
      if (p.userData.broken || p === aim) continue;
      glowPart(p, squeeze * 1.4, 0xff2200);
      for (const m of p.userData.meshes) {
        const h = m.userData.home;
        if (squeeze > 0.01) m.position.set(h.pos.x + (Math.random() - 0.5) * 0.012 * squeeze, h.pos.y + (Math.random() - 0.5) * 0.012 * squeeze, h.pos.z + (Math.random() - 0.5) * 0.012 * squeeze);
        else if (!tweens.length) m.position.copy(h.pos);
      }
    }
    if (allGoneAt && now - allGoneAt > 5500) rebuild();

    // lights and thrusters (light only, the suit itself stays still)
    glowMat.emissiveIntensity = 2.8 + Math.sin(t * 5) * 0.3 + squeeze * 2;
    glowMat.emissive.setHex(squeeze > 0.4 ? 0xff5a3a : 0x55e4ff);
    reactorLight.intensity = parts.torso.userData.broken ? 0 : 1.3 + Math.sin(t * 5) * 0.2;
    for (const f of flames) { const k = 0.8 + Math.random() * 0.4; f.scale.set(1, k, 1); f.material.opacity = 0.55 + Math.random() * 0.35; }
    if (!parts.legL.userData.broken || !parts.legR.userData.broken) ring.material.opacity = 0.65 + Math.sin(t * 6) * 0.15; else ring.material.opacity *= 0.95;
    for (const n of ["legL", "legR"]) if (!parts[n].userData.broken && Math.random() < 0.6) {
      parts[n].userData.meshes.at(-1).getWorldPosition(tv); tv.y -= 0.3; emit(tv, 1, 0.4, COLD, -2.5);
    }

    // physics
    for (let i = debris.length - 1; i >= 0; i--) {
      const q = debris[i], o = q.o;
      if (q.fade !== undefined) { q.fade -= rdt * 3; o.scale.setScalar(Math.max(0.001, q.fade)); if (q.fade <= 0) { scene.remove(o); debris.splice(i, 1); } continue; }
      q.v.y -= 9.8 * dt; q.v.multiplyScalar(1 - 0.1 * dt);
      o.position.addScaledVector(q.v, dt);
      o.rotation.x += q.w.x * dt; o.rotation.y += q.w.y * dt; o.rotation.z += q.w.z * dt;
      if (o.position.y < FLOOR + q.r) {
        o.position.y = FLOOR + q.r;
        if (q.v.y < -2 && now - lastClink > 35) { clink(); lastClink = now; }
        if (q.v.y < 0) q.v.y *= -0.32;
        q.v.x *= 0.78; q.v.z *= 0.78; q.w.multiplyScalar(0.7);
      }
      if (o.position.z > 3.8) { o.position.z = 3.8; q.v.z *= -0.4; }
      if (q.shard && (q.age += rdt) > 6) q.fade = 1;
    }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i], k = Math.min(1, Math.max(0, (now - tw.t0) / tw.dur));
      const ease = k === 1 ? 1 : 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);
      tw.m.position.lerpVectors(tw.fp, tw.h.pos, ease); tw.m.quaternion.slerpQuaternions(tw.fq, tw.h.quat, Math.min(1, k * 1.15)); tw.m.scale.lerpVectors(tw.fs, tw.h.scale, k);
      if (k >= 1) tweens.splice(i, 1);
    }
    updateSparks(dt); updateArcs(rdt);
    if (flashT > 0) { flashT -= rdt * 3; flash.material.opacity = Math.max(0, flashT); flash.scale.setScalar(flash.userData.size * (1.5 - flashT * 0.7)); }
    if (waveT > 0) { waveT -= rdt * 1.6; wave.material.opacity = Math.max(0, waveT); wave.scale.setScalar(0.3 + (1 - waveT) * 4); }
    shake = shake * Math.pow(0.03, rdt) + squeeze * 0.012;
    camera.position.x = (Math.random() - 0.5) * shake; camera.position.y = 0.25 + (Math.random() - 0.5) * shake;
    renderer.render(scene, camera);

    // hand overlay
    if (P) {
      const col = fistNow ? "255,90,40" : aim ? "255,70,50" : "95,230,255";
      drawHand(ctx, P, col, 0.9);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      if (pointNow) {
        const x = P[8][0], y = P[8][1];
        ctx.strokeStyle = aim ? "rgba(255,80,50,1)" : "rgba(95,230,255,.85)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 20, 0, 6.283); ctx.stroke();
        for (let k = 0; k < 4; k++) { const a = k * 1.571; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26); ctx.lineTo(x + Math.cos(a) * 36, y + Math.sin(a) * 36); ctx.stroke(); }
        if (aim) { ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 20, -1.571, -1.571 + 6.283 * Math.min(1, charge)); ctx.stroke(); }
      }
      if (fistNow && intactCount) {
        const x = P[9][0], y = P[9][1];
        ctx.strokeStyle = `rgba(255,90,40,${0.4 + squeeze * 0.6})`; ctx.lineWidth = 3 + squeeze * 4;
        ctx.beginPath(); ctx.arc(x, y, 70 - squeeze * 30, 0, 6.283); ctx.stroke();
      }
      ctx.restore();
    }
    const msg = !P ? "Haath camera ke saamne laao"
      : fistNow ? (intactCount ? (squeeze < 1 ? "Daba ke rakho…" : "AB JHATKE SE HAATH KHOLO!") : "Neeche “Dobara jodo” dabao")
      : pinchNow ? "Ghuma rahe ho" : pointNow ? (aim ? "Tod raha hai…" : "Ungli robot ke hisse par rakho") : "";
    if (status._m !== msg) { status.textContent = msg; status._m = msg; }
  }

  return {
    enter() { if (!inited) init(); root.hidden = false; glCanvas.hidden = false; resize(); last = performance.now(); },
    exit() { root.hidden = true; glCanvas.hidden = true; if (rum) { rum.stop(); rum = null; } fistStart = 0; ctx.clearRect(0, 0, fx.width, fx.height); },
    frame,
    shatter: () => inited && shatter(1),
    rebuild: () => inited && rebuild(),
    breakPart: (n) => inited && breakPart(parts[n], new THREE.Vector3().setFromMatrixPosition(parts[n].matrixWorld)),
  };
}
