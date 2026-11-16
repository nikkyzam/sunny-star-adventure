/**
 * env.ts — the world's models: trees, plants, flowers, grass, rocks (Quaternius "Stylized Nature
 * MegaKit") and building wall panels, roofs and street props ("Downtown City MegaKit"), both CC0,
 * packed by scripts/build-world.mjs into public/models/nature.glb and city.glb.
 *
 * Placer collects where each model goes, then build() turns every model part into one
 * InstancedMesh, so a forest of a hundred trees costs a handful of draw calls.
 *
 * Until (or unless) the files load, world.ts draws its own code-built trees and buildings.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** The part's transform inside its model. */
  matrix: THREE.Matrix4;
}

let models: Map<string, Part[]> | null = null;
let loading: Promise<boolean> | null = null;

export function envReady(): boolean {
  return models !== null;
}

/** Start loading the world models (once). Resolves true when they can be used. */
export function loadEnvKit(): Promise<boolean> {
  if (loading) return loading;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const base = `${import.meta.env.BASE_URL}models/`;
  loading = Promise.all([loader.loadAsync(`${base}nature.glb`), loader.loadAsync(`${base}city.glb`)]).then((files) => {
    const map = new Map<string, Part[]>();
    for (const gltf of files) {
      gltf.scene.updateMatrixWorld(true);
      for (const holder of gltf.scene.children) {
        const inv = holder.matrixWorld.clone().invert();
        const parts: Part[] = [];
        holder.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            const std = m as THREE.MeshStandardMaterial;
            // leaves, grass and flower cards are cut-outs
            if (std.map && /Leaf|Leaves|Grass|Flower|Fern|Clover|Plant/i.test(m.name)) {
              std.alphaTest = 0.5;
              std.side = THREE.DoubleSide;
              std.transparent = false;
            }
          }
          parts.push({ geometry: o.geometry, material: o.material as THREE.Material, matrix: inv.clone().multiply(o.matrixWorld) });
        });
        map.set(holder.name, parts);
      }
    }
    models = map;
    return true;
  }, (err) => {
    console.warn("world models unavailable, using code-built scenery", err);
    return false;
  });
  return loading;
}

/** The (grey) brick texture from the city kit, for walls built in code; null until the kit loads. */
export function brickTexture(): THREE.Texture | null {
  if (!models) return null;
  for (const parts of models.values()) {
    for (const p of parts) {
      const m = p.material as THREE.MeshStandardMaterial;
      if (/Brick/i.test(m.name) && m.map) {
        m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
        return m.map;
      }
    }
  }
  return null;
}

export function hasModel(name: string): boolean {
  return models?.has(name) ?? false;
}

export interface PlaceOpts {
  /** Uniform scale, or [x, y, z]. */
  scale?: number | [number, number, number];
  rotY?: number;
  /** Multiplied over materials whose name matches `tintOnly` (all parts when tintOnly is unset). */
  tint?: number;
  tintOnly?: RegExp;
  shadow?: boolean;
}

interface Item { matrix: THREE.Matrix4; color: THREE.Color | null; shadow: boolean; cell: string }

/** Instances are batched per 40 m square, so batches off-screen are skipped by frustum culling. */
const CELL = 40;

const WHITE = new THREE.Color(1, 1, 1);

export class Placer {
  private items = new Map<string, { opts: Item[]; tintOnly?: RegExp }>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  add(name: string, x: number, y: number, z: number, o: PlaceOpts = {}): void {
    if (!models?.has(name)) return;
    const sc = o.scale ?? 1;
    if (typeof sc === "number") this.s.set(sc, sc, sc);
    else this.s.set(sc[0], sc[1], sc[2]);
    this.q.setFromAxisAngle(this.up, o.rotY ?? 0);
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, this.s);
    let e = this.items.get(name);
    if (!e) this.items.set(name, (e = { opts: [], tintOnly: o.tintOnly }));
    const cell = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    e.opts.push({ matrix, color: o.tint !== undefined ? new THREE.Color(o.tint) : null, shadow: o.shadow ?? true, cell });
  }

  /** One InstancedMesh per model part and 40 m square. */
  build(): THREE.Group {
    const g = new THREE.Group();
    for (const [name, e] of this.items) {
      const cells = new Map<string, Item[]>();
      for (const it of e.opts) {
        const list = cells.get(it.cell);
        if (list) list.push(it); else cells.set(it.cell, [it]);
      }
      for (const items of cells.values()) {
        for (const part of models!.get(name)!) {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, items.length);
          const tintThis = !e.tintOnly || e.tintOnly.test(part.material.name);
          let anyColor = false;
          items.forEach((it, i) => {
            this.m.multiplyMatrices(it.matrix, part.matrix);
            mesh.setMatrixAt(i, this.m);
            if (tintThis && it.color) anyColor = true;
          });
          if (anyColor) items.forEach((it, i) => mesh.setColorAt(i, tintThis && it.color ? it.color : WHITE));
          mesh.castShadow = items[0].shadow;
          mesh.receiveShadow = true;
          mesh.computeBoundingSphere();
          g.add(mesh);
        }
      }
    }
    return g;
  }
}
