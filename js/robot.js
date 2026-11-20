// Robot mode: an original armoured war-suit hovering in your room on boot thrusters.
// It only moves when your hand tells it to. Powers:
//   pinch on empty air + drag     -> turn it
//   pinch on a part                -> rip the part off and carry it; let go with a flick -> throw it
//   one finger on a part           -> break it off
//   two fingers (V) aimed at it    -> laser: the part heats up and blows
//   open hand -> fist -> open      -> lock on, crush, burst into pieces (never misses)
// Everything rebuilds by itself a few seconds later.
import * as THREE from "three";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js";
import { hand, predicted, drawHand, view, boom, tick, buzz, crunch, clink, rumble, audio, blast } from "./core.js";

const FLOOR = -1.5, CAM_Y = 0;
const FIST_IN = 1.32, FIST_OUT = 1.55;   // hand.open thresholds (3D finger reach ratio)

export function createRobot(root, glCanvas, fx) {
  const ctx = fx.getContext("2d");
  const blast = root.querySelector("#rbBlast");
  let renderer, scene, camera, rig, body, parts = {}, proxies = [], debris = [], tweens = [], flames = [], arcs = [];
  let sparks, flash, wave, glowMat, eyeMat, reactorLight, ring, inited = false, last = performance.now(), TOTAL = 1, intactCount = 0;
  let yawT = 0, pitchT = 0, drag = null, carry = null, aim = null, charge = 0, cooldown = 0, wasPinch = false;
  let openSince = 0, armedAt = 0, pointN = 0, vN = 0, dentT = 0, move = null, imageSuit = false, ready = true;
  const posT = { x: 0, y: 0 };
  // phone orientation, so the suit stays put in the room while the phone moves
  const gyro = { on: false, a0: 0, b0: 0, yaw: 0, pitch: 0, ty: 0, tp: 0 };
  addEventListener("deviceorientation", (e) => {
    if (e.alpha == null) return;
    if (!gyro.on) { gyro.on = true; gyro.a0 = e.alpha; gyro.b0 = e.beta; }
    let da = e.alpha - gyro.a0; da = ((da + 540) % 360) - 180;
    const sgn = view.facing === "user" ? -1 : 1;
    gyro.ty = THREE.MathUtils.degToRad(da) * sgn; gyro.tp = THREE.MathUtils.degToRad(e.beta - gyro.b0) * sgn;
  });
  // match the suit's lighting to the room the camera sees
  const probe = document.createElement("canvas"); probe.width = probe.height = 8; const pctx = probe.getContext("2d", { willReadFrequently: true });
  let probeT = 0, hemi = null, keyL = null;
  function senseRoom(now) {
    if (now - probeT < 500 || !hemi) return; probeT = now;
    const v = document.getElementById("cam"); if (!v.videoWidth) return;
    try {
      pctx.drawImage(v, 0, 0, 8, 8); const d = pctx.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4; r /= n * 255; g /= n * 255; b /= n * 255; const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      hemi.color.setRGB(0.6 + r * 0.5, 0.6 + g * 0.5, 0.6 + b * 0.5); hemi.intensity = 0.3 + lum * 1.1;
      keyL.intensity = 1.6 + lum * 1.8; renderer.toneMappingExposure = 0.85 + lum * 0.55;
    } catch {}
  }
  let grip = 0, gripOn = false, gripSeen = 0, lostAt = 0, rum = null, laserSnd = null;
  let timeScale = 1, slowHold = 0, shake = 0, lastBreak = 0, lastClink = 0, punch = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  const strike = { armL: 0, armR: 0 };

  /* ---------------- setup ---------------- */
  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    hemi = new THREE.HemisphereLight(0xd6e6ff, 0x140f0c, 0.55); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff3e6, 2.6); key.position.set(2.5, 4, 5); scene.add(key); keyL = key;
    const rimC = new THREE.DirectionalLight(0x5fe6ff, 3.2); rimC.position.set(-4, 2.5, -3); scene.add(rimC);
    const rimR = new THREE.DirectionalLight(0xff4a3a, 1.6); rimR.position.set(4, 1, -4); scene.add(rimR);
    rig = new THREE.Group(); scene.add(rig);
    body = new THREE.Group(); rig.add(body);
    buildImageSuit();
    buildFx();
    resize(); addEventListener("resize", resize);
    inited = true;
  }
  function resize() {
    if (!renderer) return;
    renderer.setSize(view.W, view.H, false);
    camera.aspect = view.W / view.H;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max((3.0 / 0.76) / 2 / tan, (2.25 / 0.92) / (2 * tan * camera.aspect));
    camera.position.set(0, CAM_Y, dist); camera.rotation.set(0, 0, 0); camera.rotation.order = "YXZ";
    camera.updateProjectionMatrix();
  }

  /* ---------------- the suit (original design) ---------------- */
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
      g.userData = { name, meshes: [], flames: [], broken: false, heat: 0, home: { pos: g.position.clone(), rot: g.rotation.clone() },
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

    // A heavy, broad-shouldered siege suit: thick plating, a single slit visor, piston legs.
    // torso
    const T = part("torso", 0, 0, 0);
    add(T, T, RB(0.5, 0.24, 0.34, 0.06), "armor", 0, -0.02, 0);
    add(T, T, RB(0.2, 0.18, 0.08, 0.03), "plate", 0, -0.06, 0.17, -0.12);
    add(T, T, TAPER(0.2, 0.24, 0.2), "dark", 0, 0.18, 0);
    for (const y of [0.14, 0.24]) for (const s of [-1, 1]) add(T, T, RB(0.14, 0.085, 0.06, 0.02), "plate", s * 0.08, y, 0.19);
    add(T, T, RB(0.86, 0.52, 0.48, 0.1), "armor", 0, 0.6, 0);
    add(T, T, RB(0.6, 0.3, 0.1, 0.04), "plate", 0, 0.66, 0.24);
    for (const s of [-1, 1]) add(T, T, RB(0.12, 0.34, 0.1, 0.03), "plate", s * 0.36, 0.58, 0.22, 0, -s * 0.35, 0);
    const reactor = add(T, T, new THREE.CylinderGeometry(0.085, 0.085, 0.05, 6), "glow", 0, 0.6, 0.3, Math.PI / 2);
    add(T, T, new THREE.TorusGeometry(0.115, 0.022, 8, 6), "dark", 0, 0.6, 0.305, 0, 0, Math.PI / 6);
    add(T, T, RB(0.34, 0.1, 0.32, 0.03), "dark", 0, 0.9, 0);
    add(T, T, RB(0.62, 0.46, 0.16, 0.05), "dark", 0, 0.6, -0.3);
    for (const s of [-1, 1]) {
      add(T, T, TAPER(0.06, 0.07, 0.36, 12), "dark", s * 0.16, 0.66, -0.42);
      add(T, T, RB(0.03, 0.3, 0.02, 0.01), "glow", s * 0.16, 0.66, -0.495);
      add(T, T, RB(0.025, 0.2, 0.02, 0.01), "glow", s * 0.42, 0.52, 0.12, 0, 0, s * 0.12);
    }
    halo(reactor, 1.1, 0x6fe9ff);
    reactorLight = new THREE.PointLight(0x5fe6ff, 1.6, 2.6); reactorLight.position.set(0, 0.6, 0.6); T.add(reactorLight);

    // head: low armoured helm with one slit visor, sunk between the shoulders
    const H = part("head", 0, 0.95, 0);
    add(H, H, TAPER(0.09, 0.11, 0.08), "dark", 0, 0.02, 0);
    add(H, H, RB(0.3, 0.26, 0.32, 0.1), "armor", 0, 0.17, 0);
    add(H, H, RB(0.26, 0.12, 0.08, 0.03), "plate", 0, 0.1, 0.15);
    const visor = add(H, H, RB(0.24, 0.035, 0.02, 0.01), "eye", 0, 0.2, 0.162);
    halo(visor, 1.4, 0xff3322, 0.85);
    add(H, H, RB(0.34, 0.05, 0.3, 0.02), "plate", 0, 0.3, -0.01);
    for (const s of [-1, 1]) add(H, H, RB(0.05, 0.16, 0.2, 0.02), "dark", s * 0.17, 0.16, 0);

    // arms: huge shoulder blocks, thick forearms, heavy fists
    for (const s of [-1, 1]) {
      const A = part(s < 0 ? "armR" : "armL", s * 0.58, 0.76, 0);
      A.rotation.z = s * 0.1; A.userData.home.rot = A.rotation.clone();
      add(A, A, new THREE.SphereGeometry(0.14, 22, 16), "dark", 0, 0, 0);
      add(A, A, RB(0.36, 0.26, 0.44, 0.1), "armor", s * 0.06, 0.08, 0, 0, 0, -s * 0.18);
      add(A, A, RB(0.3, 0.06, 0.4, 0.02), "plate", s * 0.07, 0.23, 0, 0, 0, -s * 0.18);
      add(A, A, RB(0.04, 0.16, 0.3, 0.01), "glow", s * 0.24, 0.06, 0, 0, 0, -s * 0.18);
      add(A, A, CAP(0.105, 0.22), "armor", 0, -0.27, 0);
      add(A, A, RB(0.15, 0.2, 0.06, 0.03), "plate", 0, -0.26, 0.09);
      const el = sub(A, 0, -0.5, 0, -0.22); A.userData.elbow = el;
      add(A, el, new THREE.SphereGeometry(0.1, 18, 12), "dark", 0, 0, 0);
      add(A, el, RB(0.25, 0.36, 0.26, 0.07), "armor", 0, -0.2, 0);
      add(A, el, RB(0.27, 0.1, 0.28, 0.03), "plate", 0, -0.08, 0);
      add(A, el, RB(0.03, 0.22, 0.015, 0.008), "glow", 0, -0.22, 0.135);
      const hn = sub(el, 0, -0.45, 0);
      add(A, hn, RB(0.2, 0.17, 0.18, 0.05), "dark", 0, 0, 0);
      add(A, hn, RB(0.21, 0.06, 0.19, 0.02), "plate", 0, -0.075, 0);
      const pal = add(A, hn, new THREE.CylinderGeometry(0.045, 0.045, 0.015, 18), "glow", -s * 0.102, 0, 0, 0, 0, Math.PI / 2);
      halo(pal, 1.1, 0x6fe9ff, 0.5);
      A.userData.palm = pal;
    }
    // legs: thick thighs, piston shins, heavy boots with thrusters
    for (const s of [-1, 1]) {
      const L = part(s < 0 ? "legR" : "legL", s * 0.17, -0.12, 0);
      add(L, L, new THREE.SphereGeometry(0.12, 18, 12), "dark", 0, 0, 0);
      add(L, L, RB(0.24, 0.4, 0.28, 0.07), "armor", 0, -0.25, 0);
      add(L, L, RB(0.2, 0.26, 0.06, 0.03), "plate", 0, -0.22, 0.14);
      const kn = sub(L, 0, -0.5, 0);
      add(L, kn, new THREE.SphereGeometry(0.1, 16, 12), "dark", 0, 0, 0);
      add(L, kn, RB(0.18, 0.14, 0.1, 0.04), "plate", 0, 0, 0.11);
      add(L, kn, RB(0.22, 0.4, 0.26, 0.07), "armor", 0, -0.24, 0);
      add(L, kn, TAPER(0.03, 0.03, 0.3, 10), "plate", 0.06 * s, -0.22, -0.15);
      add(L, kn, RB(0.04, 0.26, 0.015, 0.008), "glow", 0, -0.22, 0.135);
      add(L, kn, RB(0.26, 0.14, 0.38, 0.05), "armor", 0, -0.48, 0.05);
      add(L, kn, RB(0.24, 0.07, 0.12, 0.03), "plate", 0, -0.51, 0.22);
      const noz = add(L, kn, TAPER(0.07, 0.09, 0.06), "dark", 0, -0.57, -0.01);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.5, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x9ff1ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      flame.rotation.x = Math.PI; flame.position.y = -0.28; noz.add(flame);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3, 12, 1, true), flame.material.clone()); core.material.color.setHex(0xffffff);
      core.rotation.x = Math.PI; core.position.y = -0.17; noz.add(core);
      halo(noz, 1.4, 0x6fe9ff, 0.8);
      L.userData.flames.push(flame, core); flames.push(flame, core); L.userData.nozzle = noz;
    }
    // generous invisible hit zones, one per part
    body.updateMatrixWorld(true);
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    for (const p of Object.values(parts)) {
      const box = new THREE.Box3(); p.userData.meshes.forEach((m) => box.expandByObject(m));
      const size = box.getSize(new THREE.Vector3()).multiplyScalar(1.35), c = box.getCenter(new THREE.Vector3());
      const px = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, 0.34), Math.max(size.y, 0.34), Math.max(size.z, 0.34)), hidden);
      p.worldToLocal(c); px.position.copy(c); px.userData.part = p; p.add(px); proxies.push(px);
    }
    TOTAL = intactCount = Object.values(parts).reduce((n, p) => n + p.userData.meshes.length, 0);
  }

  /* ---------------- your robot, built from your own picture ---------------- */
  function buildImageSuit() {
    imageSuit = true; ready = false;
    glowMat = new THREE.MeshStandardMaterial({ color: 0x041218, emissive: 0x55e4ff, emissiveIntensity: 3 });
    eyeMat = glowMat;
    reactorLight = new THREE.PointLight(0x5fe6ff, 0, 1); scene.add(reactorLight);
    const base = new URL("../assets/robot/", import.meta.url);
    fetch(new URL("parts.json", base)).then((r) => r.json()).then(async (meta) => {
      const HEIGHT = 3.0, s = HEIGHT / meta.H, loader = new THREE.TextureLoader();
      const names = ["torso", "legR", "legL", "armR", "armL", "head"];
      await Promise.all(names.map((n, i) => new Promise((res) => {
        const q = meta.parts[n];
        loader.load(new URL(n + ".png", base).href, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
          const front = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.06, side: THREE.DoubleSide });
          const back = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.06, color: 0x1a1d22, side: THREE.DoubleSide });
          const g = new THREE.Group(); g.position.set((q.x + q.w / 2 - meta.W / 2) * s, (meta.H / 2 - (q.y + q.h / 2)) * s, i * 0.004);
          g.userData = { name: n, image: true, meshes: [], flames: [], broken: false, heat: 0, home: { pos: g.position.clone(), rot: g.rotation.clone() },
            mats: { armor: front, plate: front, dark: front, glow: glowMat, eye: eyeMat }, tex, w: q.w * s, h: q.h * s };
          body.add(g); parts[n] = g;
          const geo = new THREE.PlaneGeometry(q.w * s, q.h * s); geo.computeBoundingSphere();
          const m = new THREE.Mesh(geo, front);
          // a dark copy just behind gives the flat picture some body when it turns or flies
          g.add(m);
          m.userData = { part: g, r: geo.boundingSphere.radius, home: { parent: g, pos: m.position.clone(), quat: m.quaternion.clone(), scale: m.scale.clone() } };
          g.userData.meshes.push(m);
          // which tiles of the picture are solid, for the shatter
          const c = document.createElement("canvas"), img = tex.image, cols = 7, rows = Math.max(4, Math.round(7 * q.h / q.w));
          c.width = img.width; c.height = img.height; const cx = c.getContext("2d"); cx.drawImage(img, 0, 0);
          const data = cx.getImageData(0, 0, c.width, c.height).data, cells = [];
          for (let ry = 0; ry < rows; ry++) for (let rx = 0; rx < cols; rx++) {
            const x0 = Math.floor(rx * c.width / cols), y0 = Math.floor(ry * c.height / rows), x1 = Math.floor((rx + 1) * c.width / cols), y1 = Math.floor((ry + 1) * c.height / rows);
            let solid = 0, n2 = 0; for (let yy = y0; yy < y1; yy += 4) for (let xx = x0; xx < x1; xx += 4) { n2++; if (data[(yy * c.width + xx) * 4 + 3] > 40) solid++; }
            if (solid / n2 > 0.25) cells.push([rx / cols, ry / rows, 1 / cols, 1 / rows]);
          }
          g.userData.cells = cells;
          res();
        });
      })));
      body.updateMatrixWorld(true);
      const hidden = new THREE.MeshBasicMaterial({ visible: false });
      for (const p of Object.values(parts)) {
        const px = new THREE.Mesh(new THREE.BoxGeometry(p.userData.w * 0.9, p.userData.h * 0.9, 0.4), hidden);
        px.userData.part = p; p.add(px); proxies.push(px);
      }
      TOTAL = intactCount = Object.values(parts).reduce((n, p) => n + p.userData.meshes.length, 0);
      ready = true;
    });
  }
  // fragments cut from the part's own picture, so it shatters into pieces of itself
  function tiles(p, n, origin, force, all = false) {
    const u = p.userData, cells = u.cells || [], list = all ? cells : cells.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(n, 14));
    const m0 = u.meshes[0]; m0.updateMatrixWorld(true);
    for (const [cx, cy, cw, ch] of list) {
      const w = u.w * cw, h = u.h * ch, geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, cx + uv.getX(i) * cw, 1 - (cy + (1 - uv.getY(i)) * ch));
      geo.computeBoundingSphere();
      const t = new THREE.Mesh(geo, u.mats.armor);
      t.position.set(-u.w / 2 + (cx + cw / 2) * u.w, u.h / 2 - (cy + ch / 2) * u.h, 0.01);
      t.position.applyMatrix4(m0.matrixWorld); t.quaternion.setFromRotationMatrix(m0.matrixWorld);
      scene.add(t);
      const v = t.position.clone().sub(origin).normalize().multiplyScalar(force * (0.5 + Math.random() * 1.1));
      v.y += 1 + Math.random() * 3; v.x += (Math.random() - 0.5) * 2; v.z += 0.5 + Math.random() * 2.2;
      debris.push({ o: t, v, w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14), r: Math.max(w, h) * 0.35, shard: true, age: 0, burn: 0 });
    }
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
  const N = 1400;
  const sp = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), col: new Float32Array(N * 3), base: new Float32Array(N * 3), life: new Float32Array(N), dur: new Float32Array(N), grav: new Float32Array(N), next: 0 };
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
    const c = document.createElement("canvas"); c.width = c.height = 256; const g2 = c.getContext("2d");
    const gr = g2.createRadialGradient(128, 128, 60, 128, 128, 128);
    gr.addColorStop(0, "rgba(95,230,255,0)"); gr.addColorStop(0.55, "rgba(95,230,255,.55)"); gr.addColorStop(1, "rgba(95,230,255,0)");
    g2.fillStyle = gr; g2.fillRect(0, 0, 256, 256);
    ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 64), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = FLOOR + 0.004; scene.add(ring);
  }
  const HOT = [[1, 0.6, 0.2], [1, 0.85, 0.5], [1, 0.4, 0.12], [0.5, 0.9, 1]], COLD = [[0.4, 0.9, 1], [0.8, 0.97, 1]], FIRE = [[1, 0.45, 0.08], [1, 0.7, 0.2], [1, 0.25, 0.05]];
  function emit(p, n, speed, palette, upBias = 1, grav = 8, dur = 1) {
    for (let k = 0; k < n; k++) {
      const i = sp.next; sp.next = (sp.next + 1) % N;
      sp.pos[i * 3] = p.x; sp.pos[i * 3 + 1] = p.y; sp.pos[i * 3 + 2] = p.z;
      const a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1), v = speed * (0.25 + Math.random());
      sp.vel[i * 3] = Math.sin(b) * Math.cos(a) * v; sp.vel[i * 3 + 1] = Math.cos(b) * v * 0.8 + upBias; sp.vel[i * 3 + 2] = Math.sin(b) * Math.sin(a) * v;
      sp.base.set(palette[(Math.random() * palette.length) | 0], i * 3); sp.life[i] = 1; sp.dur[i] = (0.4 + Math.random() * 1.0) * dur; sp.grav[i] = grav;
    }
  }
  function updateSparks(dt) {
    for (let i = 0; i < N; i++) {
      if (sp.life[i] <= 0) { if (sp.col[i * 3] || sp.col[i * 3 + 1]) sp.col[i * 3] = sp.col[i * 3 + 1] = sp.col[i * 3 + 2] = 0; continue; }
      sp.life[i] -= dt / sp.dur[i]; sp.vel[i * 3 + 1] -= sp.grav[i] * dt;
      for (let k = 0; k < 3; k++) { sp.vel[i * 3 + k] *= 1 - 1.3 * dt; sp.pos[i * 3 + k] += sp.vel[i * 3 + k] * dt; }
      if (sp.pos[i * 3 + 1] < FLOOR) { sp.pos[i * 3 + 1] = FLOOR; sp.vel[i * 3 + 1] *= -0.3; }
      const l = Math.max(0, sp.life[i]); for (let k = 0; k < 3; k++) sp.col[i * 3 + k] = sp.base[i * 3 + k] * l;
    }
    sparks.geometry.attributes.position.needsUpdate = true; sparks.geometry.attributes.color.needsUpdate = true;
  }
  let flashT = 0, waveT = 0;
  function flashAt(p, size) { flash.position.copy(p); flash.userData.size = size; flashT = 1; }
  function shock(p) { wave.position.copy(p); wave.rotation.set(Math.PI / 2, 0, 0); waveT = 1; }
  function screenFlash(color, a = 0.6) { blast.style.background = color; blast.animate([{ opacity: a }, { opacity: 0 }], { duration: 380, easing: "ease-out" }); }
  function arc(a, spread = 0.7) {
    const pts = []; for (let i = 0; i < 9; i++) pts.push(new THREE.Vector3());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xaaf4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.userData = { a: a.clone(), b: a.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.3) * spread * 0.7)), life: 1 };
    line.frustumCulled = false; scene.add(line); arcs.push(line);
  }
  function updateArcs(rdt) {
    for (let i = arcs.length - 1; i >= 0; i--) {
      const l = arcs[i], u = l.userData; u.life -= rdt * 3.5;
      if (u.life <= 0) { scene.remove(l); l.geometry.dispose(); arcs.splice(i, 1); continue; }
      const pos = l.geometry.attributes.position;
      for (let k = 0; k < 9; k++) {
        tv.lerpVectors(u.a, u.b, k / 8);
        if (k > 0 && k < 8) { tv.x += (Math.random() - 0.5) * 0.12; tv.y += (Math.random() - 0.5) * 0.12; tv.z += (Math.random() - 0.5) * 0.12; }
        pos.setXYZ(k, tv.x, tv.y, tv.z);
      }
      pos.needsUpdate = true; l.material.opacity = u.life;
    }
  }
  function toScreen(v, out) { tv2.copy(v).project(camera); out[0] = (tv2.x * 0.5 + 0.5) * view.W; out[1] = (-tv2.y * 0.5 + 0.5) * view.H; return out; }

  /* ---------------- breaking ---------------- */
  const shardGeo = [new THREE.TetrahedronGeometry(0.05), new THREE.TetrahedronGeometry(0.03), new THREE.BoxGeometry(0.07, 0.03, 0.02), new THREE.OctahedronGeometry(0.035)];
  shardGeo.forEach((g) => g.computeBoundingSphere());
  function addDebris(m, v, burn) {
    debris.push({ o: m, v, w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(16), r: (m.userData.r || 0.05) * 0.55, burn: burn ? 2 + Math.random() * 2.5 : 0 });
  }
  function launch(m, origin, force, burn) {
    scene.attach(m); m.getWorldPosition(tv);
    const dir = tv.clone().sub(origin); if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0.4, Math.random() - 0.5);
    const v = dir.normalize().multiplyScalar(force * (0.55 + Math.random() * 0.8));
    v.x += (Math.random() - 0.5) * 1.4; v.y += 1.4 + Math.random() * 2.8; v.z += (Math.random() - 0.15) * 1.6;
    addDebris(m, v, burn && Math.random() < 0.45);
  }
  function shards(p, n, origin, force) {
    if (p.userData.image) return tiles(p, n, origin, force);
    const ms = p.userData.meshes, M = p.userData.mats;
    for (let k = 0; k < n; k++) {
      const g = shardGeo[(Math.random() * shardGeo.length) | 0];
      const s = new THREE.Mesh(g, Math.random() < 0.55 ? M.armor : Math.random() < 0.7 ? M.plate : glowMat);
      ms[(Math.random() * ms.length) | 0].getWorldPosition(s.position);
      s.position.x += (Math.random() - 0.5) * 0.12; s.position.y += (Math.random() - 0.5) * 0.12;
      scene.add(s);
      const v = s.position.clone().sub(origin).normalize().multiplyScalar(force * (0.6 + Math.random() * 1.2));
      v.y += 1 + Math.random() * 3.5; v.x += (Math.random() - 0.5) * 2.2; v.z += (Math.random() - 0.2) * 2.2;
      debris.push({ o: s, v, w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(24), r: g.boundingSphere.radius * 0.6, shard: true, age: 0, burn: 0 });
    }
  }
  function markBroken(p) {
    p.userData.broken = true; p.userData.heat = 0; glowPart(p, 0);
    p.userData.flames.forEach((f) => (f.visible = false));
    intactCount -= p.userData.meshes.length;
    lastBreak = performance.now();
  }
  function breakPart(p, at, burn = false) {
    if (p.userData.broken) return;
    if (p.userData.name === "torso") return;   // the core only goes down with the fist burst
    markBroken(p);
    shards(p, 30, at, 3.6);
    const origin = at.clone().add(new THREE.Vector3(0, -0.1, -0.35));
    [...p.userData.meshes].forEach((m) => launch(m, origin, 3.6, burn));
    emit(at, 240, 5.5, HOT); if (burn) emit(at, 120, 2, FIRE, 1.5, -1.5, 1.4);
    flashAt(at, 1.8); for (let k = 0; k < 4; k++) arc(at);
    shake = Math.max(shake, 0.1); blast(0.45); buzz(55);
    hitBack();
  }
  // the suit answers a hit by raising a remaining arm and firing its palm at you
  function hitBack() { return;
    const arms = ["armL", "armR"].filter((n) => !parts[n].userData.broken);
    if (!arms.length || !intactCount || Math.random() < 0.35) return;
    const n = arms[(Math.random() * arms.length) | 0]; strike[n] = performance.now() + 120;
  }
  function shatter(power, at) {
    const left = Object.values(parts).filter((p) => !p.userData.broken); if (!left.length) return;
    const origin = at ? at.clone() : new THREE.Vector3(0, 0.5, -0.25).applyMatrix4(body.matrixWorld);
    const force = 5 + 4.5 * power;
    for (const p of left) {
      markBroken(p);
      if (p.userData.image) { tiles(p, 999, origin, force, true); p.userData.meshes.forEach((m) => { m.visible = false; }); }
      else { shards(p, p.userData.name === "torso" ? 80 : 30, origin, force); [...p.userData.meshes].forEach((m) => launch(m, origin, force, true)); }
    }
    emit(origin, 900, 9.5, HOT, 1.5); emit(origin, 200, 2.5, FIRE, 1.6, -1.2, 1.6);
    flashAt(origin, 5.5); shock(origin); for (let k = 0; k < 12; k++) arc(origin, 1.2);
    screenFlash("radial-gradient(circle at 50% 45%, #fff, rgba(255,170,90,.6) 40%, transparent 75%)", 0.85);
    timeScale = 0.18; slowHold = 0.85; shake = 0.4;
    blast(1.3);
    try { navigator.vibrate && navigator.vibrate([70, 40, 200]); } catch {}
  }
  function rebuild() {
    const now = performance.now();
    if (carry) dropCarry(new THREE.Vector3());
    for (const p of Object.values(parts)) {
      if (!p.userData.broken) continue;
      p.userData.broken = false; p.userData.flames.forEach((f) => (f.visible = true));
      for (const m of p.userData.meshes) {
        m.visible = true;
        const h = m.userData.home; if (m.parent === h.parent && m.position.distanceToSquared(h.pos) < 1e-6) { m.position.copy(h.pos).add(new THREE.Vector3((Math.random() - 0.5) * 3, -2 - Math.random(), 1)); }
        h.parent.attach(m);
        tweens.push({ m, fp: m.position.clone(), fq: m.quaternion.clone(), fs: m.scale.clone(), h, t0: now + Math.random() * 380, dur: 560 + Math.random() * 300 });
      }
    }
    intactCount = TOTAL;
    debris = debris.filter((d) => { if (d.shard) { d.fade = 1; return true; } return false; });
    emit(new THREE.Vector3(0, 0.4, 0).applyMatrix4(body.matrixWorld), 260, 3, COLD, 0.5);
    for (let k = 0; k < 6; k++) arc(new THREE.Vector3(0, 0.4, 0).applyMatrix4(body.matrixWorld), 1.4);
  }
  function glowPart(p, k, hue) {
    if (p.userData.image) {
      const m = p.userData.mats.armor, f = Math.min(1, k * 0.45), warm = hue === 0xff7a20;
      m.color.setRGB(1 + f * 0.8, 1 - f * (warm ? 0.3 : 0.55), 1 - f * 0.7); return;
    }
    for (const key of ["armor", "plate", "dark"]) { const m = p.userData.mats[key]; m.emissive.setHex(hue || 0xff3a10); m.emissiveIntensity = k; }
  }

  /* ---------------- grabbing a part ---------------- */
  function startCarry(p, hitPoint, sx, sy) {
    markBroken(p);
    const g = new THREE.Group(); g.position.copy(hitPoint); scene.add(g);
    [...p.userData.meshes].forEach((m) => g.attach(m));
    const depth = camera.position.distanceTo(hitPoint);
    carry = { g, part: p, depth, vel: new THREE.Vector3(), prev: hitPoint.clone(), spin: 0 };
    emit(hitPoint, 200, 4.5, HOT); for (let k = 0; k < 5; k++) arc(hitPoint); flashAt(hitPoint, 1.3);
    blast(0.35); buzz(40); shake = Math.max(shake, 0.08);
    hitBack();
  }
  function moveCarry(sx, sy, rdt) {
    ndc.set((sx / view.W) * 2 - 1, -(sy / view.H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const target = ray.ray.at(carry.depth, tv);
    carry.g.position.lerp(target, Math.min(1, rdt * 22));
    const v = carry.g.position.clone().sub(carry.prev).divideScalar(Math.max(rdt, 1e-3));
    carry.vel.lerp(v, 0.35); carry.prev.copy(carry.g.position);
    carry.g.rotation.y += rdt * 1.5; carry.g.rotation.z = Math.sin(performance.now() / 120) * 0.08;
    if (Math.random() < 0.5) emit(carry.g.position, 2, 1.2, HOT, -0.5);
  }
  function dropCarry(vel) {
    const c = carry; carry = null;
    const speed = vel.length();
    [...c.g.children].forEach((m) => {
      scene.attach(m);
      const v = vel.clone().multiplyScalar(1.15).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.8, (Math.random() - 0.5) * 0.8));
      addDebris(m, v, speed > 3);
      debris[debris.length - 1].thrown = speed > 3;
    });
    scene.remove(c.g);
    if (speed > 3) buzz(20);
  }

  /* ---------------- frame ---------------- */
  const pScr = [0, 0], cScr = [0, 0];
  function frame(now) {
    const rdt = Math.min(0.05, (now - last) / 1000); last = now;
    if (slowHold > 0) slowHold -= rdt; else timeScale += (1 - timeScale) * Math.min(1, rdt * 2.4);
    const dt = rdt * timeScale, t = now / 1000, W = view.W, H = view.H, d = view.dpr;
    if (fx.width !== Math.round(W * d)) { fx.width = Math.round(W * d); fx.height = Math.round(H * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!ready) return;   // the picture parts are still loading

    const P = hand.present ? predicted(now) : null;
    const e = hand.ext, o = hand.open;
    const nExt = e.filter(Boolean).length;
    // read the hand by its closest sign, so a pointing finger is never mistaken for a fist
    const sg = P ? hand.sign : "none";
    const fistNow = !!P && (sg === "fist" || (gripOn && sg !== "open" && o < FIST_OUT));
    const pinchNow = !!P && hand.pinched && !fistNow;
    // a gesture has to hold for a few frames before it acts, so passing shapes do nothing
    pointN = sg === "point" && !pinchNow ? pointN + 1 : 0;
    vN = sg === "v" && !pinchNow ? vN + 1 : 0;
    const pointNow = pointN > 4, vNow = vN > 4;
    // step 1 of the burst: a clearly open hand arms it
    if (sg === "open") { if (!openSince) openSince = now; if (now - openSince > 180) armedAt = now; } else openSince = 0;
    cooldown -= rdt;

    /* --- open, fist, open: lock on, crush, burst. Never aims, never misses. --- */
    if (P) lostAt = 0; else if (!lostAt) lostAt = now;
    if (fistNow && intactCount && !carry && (gripOn || now - armedAt < 1500)) {
      if (!gripOn) { gripOn = true; grip = 0; }
      gripSeen = now; grip = Math.min(1, grip + rdt / 0.42);
      if (Math.random() < grip * 0.6) buzz(14);
    } else if (gripOn) {
      const reopened = P && sg === "open";
      const vanished = !P && now - lostAt > 60 && grip > 0.6;   // a fast flick can blur the hand out of view
      if ((reopened || vanished) && grip > 0.35) { gripOn = false; armedAt = 0; shatter(Math.max(0.6, grip)); grip = 0; }
      else if (now - gripSeen > 700) { gripOn = false; }
    }
    if (!gripOn) grip = Math.max(0, grip - rdt * 4);
    if (!gripOn && rum) { rum.stop(); rum = null; }
    if (rum) rum.set(grip);

    /* --- pinch: grab a part, or turn the suit --- */
    if (pinchNow && !wasPinch) {
      const x = (P[4][0] + P[8][0]) / 2, y = (P[4][1] + P[8][1]) / 2;
      const hit = pick(x, y);
      if (hit && hit.part.userData.name === "torso") move = { x, y, px: posT.x, py: posT.y };
      else if (hit) startCarry(hit.part, hit.point, x, y);
      else drag = { x, y, yaw: yawT, pitch: pitchT };
    }
    if (pinchNow) {
      const x = (P[4][0] + P[8][0]) / 2, y = (P[4][1] + P[8][1]) / 2;
      if (carry) moveCarry(x, y, rdt);
      else if (move) {
        const k = (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H;   // metres per pixel at the suit
        const hx = (camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * camera.aspect * 0.6;
        posT.x = Math.max(-hx, Math.min(hx, move.px + (x - move.x) * k));
        posT.y = Math.max(-1.2, Math.min(1.2, move.py - (y - move.y) * k));
      }
      else if (drag) { const lim = imageSuit ? 0.6 : 99; yawT = Math.max(-lim, Math.min(lim, drag.yaw + ((x - drag.x) / W) * 3.8)); pitchT = Math.max(-0.3, Math.min(0.3, drag.pitch + ((y - drag.y) / H) * 1.4)); }
    } else {
      if (carry) dropCarry(carry.vel);
      drag = null; move = null;
    }
    wasPinch = pinchNow;
    rig.position.x += (posT.x - rig.position.x) * Math.min(1, rdt * 16);
    rig.position.y += (posT.y - rig.position.y) * Math.min(1, rdt * 16);
    ring.position.set(rig.position.x, FLOOR + 0.004 + rig.position.y, 0);
    rig.rotation.y += (yawT - rig.rotation.y) * Math.min(1, rdt * 18);
    rig.rotation.x += (pitchT - rig.rotation.x) * Math.min(1, rdt * 18);

    /* --- one finger: break --- */
    let hovered = null, hitPt = null;
    if (pointNow && cooldown <= 0 && intactCount) {
      for (const [ox, oy] of [[0, 0], [0, -18], [14, 8], [-14, 8]]) { const h = pick(P[8][0] + ox, P[8][1] + oy); if (h) { hovered = h.part; hitPt = h.point; break; } }
    }
    if (hovered !== aim) { if (aim && !aim.userData.broken) glowPart(aim, 0); aim = hovered; charge = 0; }
    if (aim && aim.userData.name === "torso") {
      // the chest is too strong for a finger: it sparks and rings, nothing comes off
      if (now - dentT > 350) { dentT = now; emit(hitPt, 40, 2.5, HOT, 0.8); shake = Math.max(shake, 0.03); }
      glowPart(aim, 0.3);
    } else if (aim) {
      charge += rdt / 0.25; glowPart(aim, 0.6 + 0.6 * Math.abs(Math.sin(t * 22)));
      if (charge >= 1) { const p = aim; aim = null; charge = 0; cooldown = 0.22; breakPart(p, hitPt); }
    }

    /* --- two fingers (V): laser --- */
    let beam = null;
    if (vNow) {
      const fx0 = (P[8][0] + P[12][0]) / 2, fy0 = (P[8][1] + P[12][1]) / 2;
      let dx = fx0 - (P[5][0] + P[9][0]) / 2, dy = fy0 - (P[5][1] + P[9][1]) / 2; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      beam = { x0: fx0, y0: fy0, x1: fx0 + dx * Math.max(W, H), y1: fy0 + dy * Math.max(W, H), hit: null };
      if (intactCount) for (let s = 10; s < 900; s += 14) {
        const h = pick(fx0 + dx * s, fy0 + dy * s);
        if (h) { beam.x1 = fx0 + dx * s; beam.y1 = fy0 + dy * s; beam.hit = h; break; }
      }
      if (!laserSnd) laserSnd = laser();
      if (beam.hit) {
        const p = beam.hit.part; p.userData.heat = Math.min(p.userData.name === "torso" ? 0.8 : 9, p.userData.heat + rdt / 0.55);
        glowPart(p, 0.5 + p.userData.heat * 2.5, 0xff7a20);
        if (Math.random() < 0.9) emit(beam.hit.point, 5, 2.5, HOT, 1);
        if (Math.random() < 0.4) emit(beam.hit.point, 2, 0.6, FIRE, 0.6, -1.5, 1.2);
        if (p.userData.heat >= 1) breakPart(p, beam.hit.point, true);
      }
      laserSnd.set(beam.hit ? 1 : 0.5);
    } else if (laserSnd) { laserSnd.stop(); laserSnd = null; }
    for (const p of Object.values(parts)) if (!p.userData.broken && p !== aim && (!beam || !beam.hit || beam.hit.part !== p)) {
      if (p.userData.heat > 0) { p.userData.heat = Math.max(0, p.userData.heat - rdt * 0.6); }
      glowPart(p, grip * 1.5 + p.userData.heat * 2, grip > p.userData.heat ? 0xff2200 : 0xff7a20);
    }

    // crushing look: the suit squashes and trembles inside your grip
    const sq = grip;
    body.scale.set(1 - sq * 0.08, 1 - sq * 0.12, 1 - sq * 0.08);
    body.position.x = sq ? (Math.random() - 0.5) * 0.03 * sq : 0;
    body.position.y = sq ? (Math.random() - 0.5) * 0.02 * sq : 0;

    // auto rebuild a few seconds after the last break
    if (intactCount < TOTAL && !carry && !gripOn && now - lastBreak > 3600) rebuild();

    // the suit fires back (arm raise, palm blast, back to pose)
    for (const n of ["armL", "armR"]) {
      const A = parts[n]; if (A.userData.broken) { strike[n] = 0; continue; }
      let k = 0; const s0 = strike[n];
      if (s0) { const e2 = (now - s0) / 1000; k = e2 < 0 ? 0 : e2 < 0.18 ? e2 / 0.18 : e2 < 0.55 ? 1 : e2 < 0.85 ? 1 - (e2 - 0.55) / 0.3 : 0;
        if (e2 >= 0.32 && !A.userData.fired) { A.userData.fired = true; fireBack(A); }
        if (e2 > 0.85) { strike[n] = 0; A.userData.fired = false; } }
      if (A.userData.elbow) { A.rotation.x = -1.45 * k; A.userData.elbow.rotation.x = -0.25 + 0.25 * k; }
    }

    // raw power crawling over the armour, plasma held in both palms
    if (intactCount && Math.random() < rdt * 1.5) {
      const live = Object.values(parts).filter((p) => !p.userData.broken);
      const p = live[(Math.random() * live.length) | 0], m = p.userData.meshes[(Math.random() * p.userData.meshes.length) | 0];
      m.getWorldPosition(tv); arc(tv, 0.35);
    }
    for (const n of ["armL", "armR"]) if (!parts[n].userData.broken && parts[n].userData.palm && Math.random() < 0.5) { parts[n].userData.palm.getWorldPosition(tv); emit(tv, 1, 0.5, COLD, 0.3, -0.5, 0.6); }
    // light and thrusters only; the suit itself holds still
    glowMat.emissiveIntensity = 2.8 + Math.sin(t * 5) * 0.3 + grip * 2;
    glowMat.emissive.setHex(grip > 0.4 ? 0xff5a3a : 0x55e4ff);
    reactorLight.intensity = parts.torso.userData.broken ? 0 : 1.3 + Math.sin(t * 5) * 0.2;
    for (const f of flames) { const k = 0.8 + Math.random() * 0.4; f.scale.set(1, k, 1); f.material.opacity = 0.55 + Math.random() * 0.35; }
    const legsUp = !parts.legL.userData.broken || !parts.legR.userData.broken;
    ring.material.opacity = imageSuit ? 0 : legsUp ? 0.65 + Math.sin(t * 6) * 0.15 : ring.material.opacity * 0.95;
    for (const n of ["legL", "legR"]) if (!parts[n].userData.broken && parts[n].userData.nozzle && Math.random() < 0.6) { parts[n].userData.nozzle.getWorldPosition(tv); tv.y -= 0.3; emit(tv, 1, 0.4, COLD, -2.5); }

    // physics
    for (let i = debris.length - 1; i >= 0; i--) {
      const q = debris[i], ob = q.o;
      if (q.fade !== undefined) { q.fade -= rdt * 3; ob.scale.setScalar(Math.max(0.001, q.fade)); if (q.fade <= 0) { scene.remove(ob); debris.splice(i, 1); } continue; }
      q.v.y -= 9.8 * dt; q.v.multiplyScalar(1 - 0.1 * dt);
      ob.position.addScaledVector(q.v, dt);
      ob.rotation.x += q.w.x * dt; ob.rotation.y += q.w.y * dt; ob.rotation.z += q.w.z * dt;
      if (ob.position.y < FLOOR + q.r) {
        ob.position.y = FLOOR + q.r;
        if (q.thrown && q.v.y < -2.5) { q.thrown = false; emit(ob.position, 120, 4, HOT, 1.2); flashAt(ob.position, 1.2); blast(0.35); shake = Math.max(shake, 0.12); q.burn = 3; }
        if (q.v.y < 0) q.v.y *= -0.32;
        q.v.x *= 0.78; q.v.z *= 0.78; q.w.multiplyScalar(0.7);
      }
      if (ob.position.z > 3.6) { ob.position.z = 3.6; q.v.z *= -0.4; }
      if (Math.abs(ob.position.x) > 4) { ob.position.x = Math.sign(ob.position.x) * 4; q.v.x *= -0.4; }
      if (q.burn > 0) { q.burn -= rdt; if (Math.random() < 0.7) emit(ob.position, 1, 0.3, FIRE, 0.8, -1.8, 0.9); }
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
    if (waveT > 0) { waveT -= rdt * 1.6; wave.material.opacity = Math.max(0, waveT); wave.scale.setScalar(0.3 + (1 - waveT) * 4.5); }
    shake = shake * Math.pow(0.03, rdt) + grip * 0.014;
    camera.rotation.set(0, 0, 0);
    camera.position.x = (Math.random() - 0.5) * shake; camera.position.y = CAM_Y + (Math.random() - 0.5) * shake;
    senseRoom(now);
    if (ready) renderer.render(scene, camera);

    // overlay: your hand, the laser, the grip tendrils
    if (P) {
      const col = gripOn ? "255,90,40" : beam ? "255,60,60" : aim || carry ? "255,110,60" : "95,230,255";
      drawHand(ctx, P, col, 0.9);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      if (beam) {
        const flick = 0.75 + Math.random() * 0.25;
        for (const [w, a, c] of [[16, 0.15, "255,40,40"], [7, 0.45, "255,80,60"], [2.5, 1, "255,235,225"]]) {
          ctx.strokeStyle = `rgba(${c},${a * flick})`; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(beam.x0, beam.y0); ctx.lineTo(beam.x1, beam.y1); ctx.stroke();
        }
        if (beam.hit) { ctx.fillStyle = "rgba(255,200,160,.9)"; ctx.beginPath(); ctx.arc(beam.x1, beam.y1, 10 + Math.random() * 8, 0, 6.283); ctx.fill(); }
      }
      if (pointNow && aim) { ctx.strokeStyle = "rgba(255,80,50,1)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(P[8][0], P[8][1], 20, -1.571, -1.571 + 6.283 * Math.min(1, charge)); ctx.stroke(); }
      if (gripOn && intactCount) {
        toScreen(new THREE.Vector3(0, 0.45, 0).applyMatrix4(body.matrixWorld), cScr);
        const x0 = P[9][0], y0 = P[9][1];
        for (let k = 0; k < 4; k++) {
          ctx.strokeStyle = `rgba(255,${90 + k * 30},40,${0.35 + grip * 0.6})`; ctx.lineWidth = 1.5 + grip * 2.5;
          ctx.beginPath(); ctx.moveTo(x0, y0);
          for (let s = 1; s <= 8; s++) { const f = s / 8; ctx.lineTo(x0 + (cScr[0] - x0) * f + (Math.random() - 0.5) * 34 * (1 - Math.abs(f - 0.5) * 2 + 0.2), y0 + (cScr[1] - y0) * f + (Math.random() - 0.5) * 34 * (1 - Math.abs(f - 0.5) * 2 + 0.2)); }
          ctx.stroke();
        }
        ctx.strokeStyle = `rgba(255,90,40,${0.5 + grip * 0.5})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cScr[0], cScr[1], 150 - grip * 80, 0, 6.283); ctx.stroke();
      }
      ctx.restore();
    }
  }
  function pick(x, y) {
    ndc.set((x / view.W) * 2 - 1, -(y / view.H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const live = proxies.filter((q) => !q.userData.part.userData.broken);
    const h = ray.intersectObjects(live, false)[0];
    return h ? { part: h.object.userData.part, point: h.point } : null;
  }
  function fireBack(A) {
    A.userData.palm.getWorldPosition(tv);
    flashAt(tv, 2.2); emit(tv, 140, 3.5, COLD, 0.6);
    screenFlash("radial-gradient(circle at 50% 50%, rgba(160,240,255,.95), rgba(95,230,255,.35) 45%, transparent 80%)", 0.7);
    shake = Math.max(shake, 0.16); buzz(35);
  }
  function laser() {
    return { set() {}, stop() {} };   // no droning sound; the hit itself is heard
    const ac = audio(); if (!ac) return { set() {}, stop() {} };
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = 220; o2.type = "square"; o2.frequency.value = 223; f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 2; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g).connect(ac.destination); o.start(); o2.start();
    return { set(k) { const t2 = ac.currentTime; g.gain.setTargetAtTime(0.08 * k, t2, 0.03); f.frequency.setTargetAtTime(900 + 1400 * k + Math.random() * 300, t2, 0.02); },
      stop() { const t2 = ac.currentTime; g.gain.setTargetAtTime(0, t2, 0.03); setTimeout(() => { try { o.stop(); o2.stop(); } catch {} }, 250); } };
  }

  return {
    enter() { if (!inited) init(); root.hidden = false; glCanvas.hidden = false; gyro.on = false; gyro.ty = gyro.tp = gyro.yaw = gyro.pitch = 0; resize(); last = performance.now(); },
    exit() { root.hidden = true; glCanvas.hidden = true; if (rum) { rum.stop(); rum = null; } if (laserSnd) { laserSnd.stop(); laserSnd = null; } gripOn = false; ctx.clearRect(0, 0, fx.width, fx.height); },
    frame,
    shatter: () => inited && shatter(1),
    screenOf: (n) => { const p = parts[n]; if (!p || !ready) return [view.W / 2, view.H / 2]; p.updateMatrixWorld(true); const px = proxies.find((q) => q.userData.part === p); const v = new THREE.Vector3(); px.getWorldPosition(v); v.project(camera); return [(v.x * 0.5 + 0.5) * view.W, (-v.y * 0.5 + 0.5) * view.H]; },
    rebuild: () => inited && rebuild(),
    breakPart: (n) => inited && breakPart(parts[n], new THREE.Vector3().setFromMatrixPosition(parts[n].matrixWorld)),
  };
}
