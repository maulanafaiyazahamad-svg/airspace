// VAJRA: your real hand disappears inside a hand of black stone with lightning running through it.
// Drawn on the GPU every frame from the 21 tracked points, so it bends and moves with every finger.
const cv = document.createElement("canvas");
cv.id = "skin";
cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:3;pointer-events:none";
document.body.insertBefore(cv, document.getElementById("fx"));
const gl = cv.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });

const FS = `#version 300 es
precision highp float;
uniform vec2 res; uniform vec2 P[21]; uniform float L, T, on, pw, heat, grow;
uniform vec2 O, U;   // hand frame: origin at the wrist, U points along the hand
out vec4 o;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
const mat2 M=mat2(1.6,1.2,-1.2,1.6);
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise(p);p=M*p;a*=.5;}return s;}
vec3 voro(vec2 p){vec2 n=floor(p),f=fract(p);float d1=8.,d2=8.,id=0.;
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j);vec2 r=g+vec2(hash(n+g),hash(n+g+17.3))-f;float d=dot(r,r);if(d<d1){d2=d1;d1=d;id=hash(n+g+3.1);}else if(d<d2)d2=d;}
 return vec3(sqrt(d1),sqrt(d2)-sqrt(d1),id);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float cap(vec2 p,vec2 a,vec2 b,float ra,float rb){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-3),0.,1.);return length(pa-ba*h)-mix(ra,rb,h);}
float poly(vec2 p){
 vec2 V[6]; V[0]=P[0];V[1]=P[1];V[2]=P[5];V[3]=P[9];V[4]=P[13];V[5]=P[17];
 float d=dot(p-V[0],p-V[0]),s=1.;vec2 vj=V[5];
 for(int i=0;i<6;i++){vec2 vi=V[i],e=vj-vi,w=p-vi,b=w-e*clamp(dot(w,e)/max(dot(e,e),1e-3),0.,1.);d=min(d,dot(b,b));
  bvec3 c=bvec3(p.y>=vi.y,p.y<vj.y,e.x*w.y>e.y*w.x);if(all(c)||all(not(c)))s*=-1.;vj=vi;}
 return s*sqrt(d);}
float hand(vec2 p){
 float k=L*grow;
 float d=poly(p)-.13*k;
 d=smin(d,cap(p,P[1],P[2],.16*k,.135*k),.05*L);
 d=smin(d,cap(p,P[2],P[3],.135*k,.12*k),.02*L);
 d=smin(d,cap(p,P[3],P[4],.12*k,.105*k),.02*L);
 for(int f=0;f<4;f++){int b=5+4*f;float s=f==3?.85:(f==2?.95:1.);
  d=smin(d,cap(p,P[b],P[b+1],.13*k*s,.12*k*s),.04*L);
  d=smin(d,cap(p,P[b+1],P[b+2],.12*k*s,.112*k*s),.012*L);
  d=smin(d,cap(p,P[b+2],P[b+3],.112*k*s,.1*k*s),.012*L);}
 vec2 dw=-U;
 d=smin(d,cap(p,P[0],P[0]+dw*2.8*L,.36*k,.44*k),.12*L);
 return d;}
void main(){
 vec2 p=vec2(gl_FragCoord.x,res.y-gl_FragCoord.y);
 float d=hand(p);
 if(d>L*1.1){o=vec4(0);return;}
 vec2 e=vec2(1.,0.);
 vec2 g=vec2(hand(p+e.xy)-hand(p-e.xy),hand(p+e.yx)-hand(p-e.yx))*.5;
 vec2 rel=p-O; vec2 q=vec2(dot(rel,vec2(-U.y,U.x)),-dot(rel,U))/L;   // pattern sticks to the hand
 float Tq=floor(T*22.)/22.;                                         // lightning flickers in steps
 // appear / vanish: the stone burns in and crumbles away along a noisy front
 float dn=fbm(q*2.2+7.), cut=on*1.3-dn-.05, a=smoothstep(1.,-1.,d)*smoothstep(0.,.04,cut);
 float front=exp(-abs(cut)*22.)*step(on,.99)*smoothstep(2.,-2.,d);
 float R=.11*L, x=clamp(-d/R,0.,1.), h=sqrt(x);
 vec3 N=normalize(vec3(g*(.6/max(h,.08))*(1.-x*.9),1.));
 vec3 Ld=normalize(vec3(-.4,-.7,.6)), Hh=normalize(Ld+vec3(0,0,1));
 float dif=max(dot(N,Ld),0.), fres=pow(1.-N.z,2.2), od=max(d,0.);
 vec3 bl=mix(vec3(.35,.62,1.),vec3(.8,.6,1.),heat), wh=vec3(.85,.93,1.);
 // obsidian
 vec3 col=vec3(.01,.013,.022)+vec3(.035,.05,.09)*dif*h+wh*pow(max(dot(N,Hh),0.),70.)*.8+bl*fres*1.1;
 // cracks with energy flowing through them
 vec3 vr=voro(q*3.6+fbm(q*2.5)*1.1);
 float arm=smoothstep(1.4,.1,q.y), cr=smoothstep(.045,.0,vr.y)*smoothstep(.25,.55,fbm(q*3.+11.))*arm, flow=.5+.5*sin(T*5.-q.y*7.+vr.z*6.28);
 col+=mix(bl,wh,flow*.35)*cr*(.3+.8*pw)*(.25+.9*flow)+bl*smoothstep(.2,.0,vr.y)*.1*pw*arm;
 // lightning inside the stone
 float r=1.-abs(fbm(q*1.5+vec2(Tq*1.7,Tq*.9)+fbm(q*2.2+Tq)*1.4)*2.-1.);
 col+=wh*(pow(r,90.)*3.+pow(r,30.)*.3)*(.45+.8*pw)*(.3+.7*arm);
 // white-hot fingertips
 float tip=0.; for(int f=0;f<5;f++) tip+=exp(-length(p-P[4+4*f])/(.07*L));
 col+=mix(bl,wh,.6)*tip*(.5+.8*pw);
 // live edge
 col+=mix(bl,wh,.5)*exp(-abs(d)/(.014*L))*(.7+.5*noise(vec2(Tq*40.,q.y*9.)));
 // outside: arcs crawling over the skin, corona
 float r2=1.-abs(fbm(q*1.3+vec2(4.1,-Tq*2.1)+fbm(q*1.7-Tq)*1.8)*2.-1.);
 float arc=(pow(r2,110.)*3.2+pow(r2,24.)*.25)*exp(-od/(.2*L))*step(.47,fbm(q*.9+vec2(Tq*.6,3.)));
 vec3 glow=wh*arc*(.6+.8*pw)+bl*(exp(-od/(.05*L))*.55+exp(-od/(.3*L))*(.08+.2*pw))+mix(bl,wh,.6)*tip*.8;
 glow+=vec3(1.,.85,.6)*front*1.5;
 col+=vec3(1.,.85,.6)*front*2.;
 col=1.-exp(-col*1.25); glow=1.-exp(-glow*1.25);
 o=vec4(col*a+glow*(1.-a)*on,a);
}`;
const VS = `#version 300 es
in vec2 v; void main(){gl_Position=vec4(v,0,1);}`;

let prog = null, u = {};
if (gl) {
  try {
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["res", "P", "L", "T", "on", "pw", "heat", "grow", "O", "U"]) u[n] = gl.getUniformLocation(prog, n);
  } catch (e) { console.warn("skin", e); prog = null; }
}
export const skinOK = () => !!prog;

const SCALE = 0.75;
const last = new Float32Array(42), pts = new Float32Array(42);
let vis = 0, has = false, lastT = performance.now(), dirty = false, lastL = 100, gr = 1.08;

// P: tracked points in screen pixels (or null when there is no hand). opts.pw: 0..1 strength, opts.heat: 0..1 charging
export function skin(P, now, opts = {}) {
  if (!prog) return false;
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (P) { for (let i = 0; i < 21; i++) { last[i * 2] = P[i][0]; last[i * 2 + 1] = P[i][1]; } has = true; }
  vis = P ? Math.min(1, vis + dt / 0.35) : Math.max(0, vis - dt / 0.45);
  const W = innerWidth, H = innerHeight, w = Math.round(W * SCALE), h = Math.round(H * SCALE);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  if (!has || vis <= 0) { if (dirty) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); dirty = false; } return true; }
  for (let i = 0; i < 42; i++) pts[i] = last[i] * SCALE;
  const ox = pts[0], oy = pts[1], dx = pts[18] - ox, dy = pts[19] - oy, Lp = Math.hypot(dx, dy) || 1;
  lastL = Lp;
  // grow a little more when the hand moves fast so the real hand never peeks out
  let sp = 0; if (P && opts.speed) sp = opts.speed;
  gr += (Math.min(1.35, 1.08 + sp * 0.00025) - gr) * Math.min(1, dt * 10);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  // only shade around the hand (and down the arm)
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < 21; i++) { x0 = Math.min(x0, pts[i * 2]); x1 = Math.max(x1, pts[i * 2]); y0 = Math.min(y0, pts[i * 2 + 1]); y1 = Math.max(y1, pts[i * 2 + 1]); }
  const ax = ox - (dx / Lp) * 2.8 * Lp, ay = oy - (dy / Lp) * 2.8 * Lp;
  x0 = Math.min(x0, ax); x1 = Math.max(x1, ax); y0 = Math.min(y0, ay); y1 = Math.max(y1, ay);
  const m = Lp * 1.15;
  const sx = Math.max(0, Math.floor(x0 - m)), sx1 = Math.min(w, Math.ceil(x1 + m)), syTop = Math.max(0, Math.floor(y0 - m)), syBot = Math.min(h, Math.ceil(y1 + m));
  if (sx1 <= sx || syBot <= syTop) return true;
  gl.enable(gl.SCISSOR_TEST); gl.scissor(sx, h - syBot, sx1 - sx, syBot - syTop);
  gl.uniform2f(u.res, w, h); gl.uniform2fv(u.P, pts); gl.uniform1f(u.L, Lp); gl.uniform1f(u.T, (now / 1000) % 1000);
  gl.uniform1f(u.on, vis); gl.uniform1f(u.pw, opts.pw ?? 0.5); gl.uniform1f(u.heat, opts.heat ?? 0); gl.uniform1f(u.grow, gr);
  gl.uniform2f(u.O, ox, oy); gl.uniform2f(u.U, dx / Lp, dy / Lp);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  dirty = true;
  return true;
}
export function skinClear() {
  vis = 0; has = false;
  if (prog) { gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); dirty = false; }
}
