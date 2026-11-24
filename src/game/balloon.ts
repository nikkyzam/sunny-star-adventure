/**
 * balloon.ts — a hot-air balloon on a grassy launch field. It waits on the ground, tugging gently
 * at its ropes, with the burner puffing now and then. A kid who climbs in (E) stands in the basket:
 * the burner roars, it rises slowly, drifts in a big quiet loop over the island with the wind, and
 * sinks back down onto the field. Drawn in code: a striped envelope (a lathe, so it bulges like a
 * real one), ropes, a woven wicker basket and a flickering flame.
 *
 * world.ts makes one for a level with a `balloon` field; boot.ts handles getting in and out.
 */

import * as THREE from "three";

const V = new THREE.Vector3();

type State = "parked" | "flight";

/** Where the rider stands, in the balloon's own space (basket floor; the basket sits on y 0). */
const FLOOR = new THREE.Vector3(0, 0.12, 0);
/** Envelope: how high its middle is above the basket floor, and how wide it gets. */
const ENV_Y = 6.4, ENV_R = 3.1;

let stripeTex: THREE.CanvasTexture | null = null;
function stripes(): THREE.CanvasTexture {
  if (stripeTex) return stripeTex;
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d")!;
  // twelve panels round the balloon (gores), in a rainbow of warm colours, with a band round the middle
  const cols = ["#ff5f6d", "#ffd23f", "#3fa7ff", "#ffffff", "#ff9f43", "#7bd46b"];
  const n = 12, w = c.width / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i % cols.length];
    g.fillRect(i * w, 0, w + 1, c.height);
  }
  // seams between panels
  g.fillStyle = "rgba(0,0,0,0.18)";
  for (let i = 0; i < n; i++) g.fillRect(i * w - 1, 0, 2, c.height);
  // the band, with little white stars on it (for the game's stars)
  g.fillStyle = "#4b3cbf";
  g.fillRect(0, c.height * 0.52, c.width, c.height * 0.09);
  g.fillStyle = "#fff6c8";
  for (let i = 0; i < n; i++) {
    const cx = i * w + w / 2, cy = c.height * 0.565, r = 7;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.fill();
  }
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.anisotropy = 4;
  return stripeTex;
}

let wickerTex: THREE.CanvasTexture | null = null;
function wicker(): THREE.CanvasTexture {
  if (wickerTex) return wickerTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#a8763e";
  g.fillRect(0, 0, 128, 128);
  // over-and-under weave: rows of short rounded strands, each row offset
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * 16 + (row % 2) * 8, y = row * 8;
      const grad = g.createLinearGradient(x, y, x, y + 8);
      grad.addColorStop(0, "#d6a466");
      grad.addColorStop(0.5, "#c08a4b");
      grad.addColorStop(1, "#7d5426");
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x + 6, y + 4, 6.5, 3.4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  wickerTex = new THREE.CanvasTexture(c);
  wickerTex.colorSpace = THREE.SRGBColorSpace;
  wickerTex.wrapS = wickerTex.wrapT = THREE.RepeatWrapping;
  return wickerTex;
}

export class Balloon {
  readonly group = new THREE.Group();
  state: State = "parked";
  /** How fast it's drifting (m/s), for the camera and tests. */
  speed = 0;

  private readonly craft = new THREE.Group();   // everything that flies (basket, ropes, envelope)
  private readonly envelope: THREE.Mesh;
  private readonly flame: THREE.Mesh;
  private readonly glow: THREE.PointLight;
  private readonly owned: { dispose(): void }[] = [];
  private curve: THREE.CatmullRomCurve3 | null = null;
  private len = 0;
  private s = 0;
  private hurryUp = false;
  private burn = 0;        // 0 … 1: how hard the burner is going (the flame and the roar)
  private puffT = 3;
  private spin = 0;
  /** Set true for a frame when the burner starts a long burn (boot plays the whoosh). */
  roared = false;

  constructor(readonly base: THREE.Vector3, private readonly route: THREE.Vector3[]) {
    this.group.position.copy(base);
    this.group.add(this.craft);

    // ── the envelope: a lathe that bulges out and narrows to a throat over the basket ──
    const prof: THREE.Vector2[] = [];
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const t = i / N; // 0 throat (bottom) … 1 crown (top)
      const a = THREE.MathUtils.lerp(-Math.PI * 0.62, Math.PI / 2, t);
      // a sphere above, pulled into a cone below for the classic teardrop
      let r = Math.cos(a) * ENV_R, y = Math.sin(a) * ENV_R;
      if (a < 0) {
        const k = -a / (Math.PI * 0.62);
        r = THREE.MathUtils.lerp(Math.cos(a) * ENV_R, 0.55, k * k);
        y = Math.sin(a) * ENV_R * (1 + k * 0.45);
      }
      prof.push(new THREE.Vector2(Math.max(0.001, i === N ? 0.001 : r), y));
    }
    const envGeo = new THREE.LatheGeometry(prof, 48);
    const envMat = new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.65, side: THREE.DoubleSide });
    this.owned.push(envGeo, envMat);
    this.envelope = new THREE.Mesh(envGeo, envMat);
    this.envelope.position.y = ENV_Y;
    this.envelope.castShadow = true;
    this.craft.add(this.envelope);
    const throatY = ENV_Y + prof[0].y;

    // ── the basket: woven sides, a padded leather rim, a floor ──
    const bw = 1.25, bh = 1.0;
    const wTex = wicker().clone();
    wTex.needsUpdate = true;
    wTex.repeat.set(2.5, 2);
    const wickerMat = new THREE.MeshStandardMaterial({ map: wTex, roughness: 0.95 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.6 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.8 });
    this.owned.push(wTex, wickerMat, rimMat, ropeMat, metal);
    const side = new THREE.PlaneGeometry(bw, bh);
    this.owned.push(side);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      for (const inner of [false, true]) {
        const m = new THREE.Mesh(side, wickerMat);
        m.position.set(Math.sin(a) * (bw / 2 - (inner ? 0.05 : 0)), bh / 2, Math.cos(a) * (bw / 2 - (inner ? 0.05 : 0)));
        m.rotation.y = a + (inner ? Math.PI : 0);
        m.castShadow = !inner;
        this.craft.add(m);
      }
    }
    const floorGeo = new THREE.BoxGeometry(bw, 0.1, bw);
    this.owned.push(floorGeo);
    const floor = new THREE.Mesh(floorGeo, wickerMat);
    floor.position.y = 0.05;
    this.craft.add(floor);
    const rimGeo = new THREE.TorusGeometry(bw * 0.707, 0.06, 6, 4);
    this.owned.push(rimGeo);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.set(Math.PI / 2, 0, Math.PI / 4);
    rim.scale.set(1, 1, 1);
    rim.position.y = bh;
    this.craft.add(rim);

    // ── ropes from the basket corners up to the envelope's load ring, and the burner frame ──
    const ring = new THREE.Vector3(0, throatY, 0);
    const burnerY = bh + 1.15;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const corner = new THREE.Vector3(Math.sin(a) * bw * 0.68, bh, Math.cos(a) * bw * 0.68);
      // rope to the throat of the envelope
      const top = new THREE.Vector3(Math.sin(a) * 0.62, ring.y + 0.05, Math.cos(a) * 0.62);
      this.craft.add(this.rod(corner, top, 0.018, ropeMat));
      // steel struts up to the burner
      const b = new THREE.Vector3(Math.sin(a) * 0.32, burnerY, Math.cos(a) * 0.32);
      this.craft.add(this.rod(corner, b, 0.025, metal));
    }
    // the burner: a coil and a nozzle
    const coilGeo = new THREE.TorusGeometry(0.24, 0.05, 6, 16);
    const nozGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.28, 10);
    this.owned.push(coilGeo, nozGeo);
    const coil = new THREE.Mesh(coilGeo, metal);
    coil.rotation.x = Math.PI / 2;
    coil.position.y = burnerY;
    this.craft.add(coil);
    const noz = new THREE.Mesh(nozGeo, metal);
    noz.position.y = burnerY + 0.06;
    this.craft.add(noz);
    // the flame: a soft cone of light, glowing up into the envelope
    const flameGeo = new THREE.ConeGeometry(0.2, 1.1, 10, 1, true);
    flameGeo.translate(0, 0.55, 0);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.owned.push(flameGeo, flameMat);
    this.flame = new THREE.Mesh(flameGeo, flameMat);
    this.flame.position.y = burnerY + 0.2;
    this.flame.userData.hideInPhoto = false;
    this.craft.add(this.flame);
    this.glow = new THREE.PointLight(0xffa040, 0, 7, 1.6);
    this.glow.position.y = burnerY + 1.2;
    this.craft.add(this.glow);

    // ── on the field: a little sign-free launch mat and two sandbags on ropes ──
    const matGeo = new THREE.CircleGeometry(2.2, 28);
    const matMat = new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 1 });
    const bagGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const bagMat = new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 1 });
    this.owned.push(matGeo, matMat, bagGeo, bagMat);
    const mat = new THREE.Mesh(matGeo, matMat);
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.02;
    mat.receiveShadow = true;
    this.group.add(mat);
    for (const sx of [-1, 1]) {
      const bag = new THREE.Mesh(bagGeo, bagMat);
      bag.scale.set(1, 0.75, 1);
      bag.position.set(sx * 1.6, 0.16, 0.9);
      bag.castShadow = true;
      this.group.add(bag);
    }
  }

  private rod(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material): THREE.Mesh {
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(r, r, len, 5);
    this.owned.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(V.set(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }

  /** Close enough to climb in (only while it's waiting on the field). */
  canBoard(p: THREE.Vector3, reach = 2.4): boolean {
    return this.state === "parked" && Math.hypot(p.x - this.base.x, p.z - this.base.z) < reach && Math.abs(p.y - this.base.y) < 1.5;
  }

  /** Where the rider's feet go (the basket floor, in the world). */
  seat(out: THREE.Vector3): THREE.Vector3 {
    this.craft.updateMatrixWorld();
    return out.copy(FLOOR).applyMatrix4(this.craft.matrixWorld);
  }

  /** Off you hop: beside the basket on the field. */
  dropOff(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.base.x + 1.9, this.base.y + 0.1, this.base.z + 0.6);
  }

  /** Up, round the island with the wind, and back down onto the field. */
  startFlight(): void {
    const b = this.base;
    const pts = [b.clone(), b.clone().add(V.set(0, 4, 0)), b.clone().add(V.set(2, 12, -3)), ...this.route,
      b.clone().add(V.set(-3, 10, 4)), b.clone().add(V.set(0, 3, 0)), b.clone()];
    this.curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    this.len = this.curve.getLength();
    this.s = 0;
    this.hurryUp = false;
    this.state = "flight";
    this.burn = 1;
    this.roared = true;
  }

  /** "Let's go down": it drifts home faster. */
  hurry(): void {
    this.hurryUp = true;
  }

  /** How far through the flight (0–1). */
  progress(): number {
    return this.curve ? this.s / this.len : 0;
  }

  update(t: number, dt: number): void {
    this.roared = false;
    if (this.curve) {
      const left = this.len - this.s;
      // balloons are slow: a gentle start, a slow cruise, and a soft touchdown
      const ease = Math.min(1, 0.25 + this.s / 12) * Math.min(1, 0.12 + left / 14);
      this.speed = 4.2 * ease * (this.hurryUp ? 2.4 : 1);
      this.s = Math.min(this.len, this.s + this.speed * dt);
      const u = this.s / this.len;
      // only the balloon and basket fly: the launch mat and sandbags stay on the field
      this.curve.getPointAt(u, this.craft.position).sub(this.base);
      const climb = this.curve.getTangentAt(Math.min(u, 0.999), V).y;
      // the burner roars while climbing and in short bursts at cruise height
      const want = climb > 0.15 ? 1 : Math.sin(t * 0.9) > 0.75 ? 0.8 : 0;
      if (want > 0.5 && this.burn < 0.3) this.roared = true;
      this.burn += (want - this.burn) * Math.min(1, dt * 5);
      // a balloon turns slowly as it drifts
      this.spin += dt * 0.06;
      if (this.s >= this.len) {
        this.curve = null;
        this.state = "parked";
        this.speed = 0;
        this.craft.position.set(0, 0, 0);
      }
    } else {
      // waiting: a gentle sway at the ropes, and a puff of the burner now and then to keep warm
      this.puffT -= dt;
      if (this.puffT < 0) { this.puffT = 5 + Math.random() * 5; this.burn = 0.8; }
      this.burn = Math.max(0, this.burn - dt * 1.4);
      this.spin += (0 - this.spin) * Math.min(1, dt * 0.5);
    }
    this.craft.rotation.y = this.spin;
    // the envelope breathes and leans with the air; the basket swings a touch under it
    const sway = this.state === "parked" ? 0.025 : 0.04;
    this.craft.rotation.z = Math.sin(t * 0.7) * sway;
    this.craft.rotation.x = Math.sin(t * 0.53 + 1) * sway * 0.8;
    this.envelope.scale.set(1 + Math.sin(t * 1.3) * 0.008, 1, 1 + Math.cos(t * 1.1) * 0.008);
    // the flame flickers with the burn
    const f = this.burn;
    this.flame.visible = f > 0.03;
    this.flame.scale.set(0.6 + f * 0.5, (0.3 + f * 1.1) * (0.85 + Math.random() * 0.3), 0.6 + f * 0.5);
    (this.flame.material as THREE.MeshBasicMaterial).opacity = 0.5 + f * 0.4;
    this.glow.intensity = f * 6;
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.group.removeFromParent();
  }
}
