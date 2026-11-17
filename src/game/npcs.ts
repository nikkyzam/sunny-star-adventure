/**
 * npcs.ts — friendly villagers to talk to. Each one is a kid model with their own outfit and a
 * name tag; walk up and press F (or the Talk button) and they say their next line.
 * Lines are fixed, friendly text from the level data — there is no free-text chat anywhere.
 */

import * as THREE from "three";
import { Player } from "./player";
import { lookOf, safeHat, safeLook } from "./profile";
import { makeTextSprite, disposeSprite } from "./social";
import { adultKindFor, peopleReady, robeFor } from "./people";
import type { NpcDef } from "./world";

const TALK_RADIUS = 2.6;

interface Npc {
  def: NpcDef;
  p: Player;
  tag: THREE.Sprite;
  nextLine: number;
  met: boolean;
  /** Knocked flat on their back (Goliath, once David's stone has flown). */
  fallen?: boolean;
}

function makeVillager(def: NpcDef): { p: Player; tag: THREE.Sprite } {
  // villagers get a mix of hair, glasses and clothes from their other choices
  const p = new Player({ ...lookOf(safeLook({
    body: (def.outfit + def.skin + def.hat) % 2,
    outfit: def.outfit, skin: def.skin, hair: def.outfit + def.hat, hairColor: def.skin * 2 + def.outfit,
    glasses: (def.outfit + def.skin) % 3 === 0 ? 1 : 0, clothes: def.hat + def.skin,
  })), adult: peopleReady() ? adultKindFor(def.name) : null, robe: robeFor(def.name) });
  // in Bible-times clothes: kings and the Wise Men wear crowns, everyone else their head cloth
  const robe = robeFor(def.name);
  p.setHat(robe && peopleReady() ? (robe.head === "crown" ? 1 : 0) : safeHat(def.hat));
  p.pos.set(def.x, def.y, def.z);
  p.facing = 0;
  if (def.scale) p.group.scale.setScalar(def.scale);
  // job givers wear a briefcase on their name tag
  const tag = makeTextSprite(def.job ? `💼 ${def.name}` : def.name, { bg: def.job ? "rgba(41,98,255,0.92)" : "rgba(255,169,77,0.92)", fg: "#ffffff", size: 44, height: 0.4 });
  tag.position.y = 2.3;
  p.group.add(tag);
  return { p, tag };
}

export class Npcs {
  readonly group = new THREE.Group();
  items: Npc[] = [];

  build(defs: NpcDef[]): void {
    this.clear();
    this.items = defs.map((def) => ({ def, ...makeVillager(def), nextLine: 0, met: false }));
    for (const n of this.items) this.group.add(n.p.group);
  }

  /** New models for the same villagers (e.g. once the human models have loaded): who has been
   *  met, what they say next and any job pointing at them all stay. */
  refreshLooks(): void {
    const kept = this.items;
    this.clear();
    for (const n of kept) {
      const facing = n.p.facing;
      Object.assign(n, makeVillager(n.def));
      n.p.facing = facing;
      this.group.add(n.p.group);
    }
    this.items = kept;
  }

  private clear(): void {
    for (const n of this.items) disposeSprite(n.tag);
    // free the cartoon kids' meshes (human models share their geometry, so skip those)
    const free = (o: THREE.Object3D) => {
      if (o.userData.shared) return;
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      for (const c of o.children) free(c);
    };
    free(this.group);
    this.group.clear();
  }

  get metCount(): number {
    return this.items.reduce((n, i) => n + (i.met ? 1 : 0), 0);
  }

  /** The villager within reach of pos, or null. */
  nearest(pos: THREE.Vector3): Npc | null {
    let best: Npc | null = null;
    let bestD = TALK_RADIUS * TALK_RADIUS;
    for (const n of this.items) {
      const d2 = n.p.pos.distanceToSquared(pos);
      if (d2 < bestD) { bestD = d2; best = n; }
    }
    return best;
  }

  /** Lay a villager flat on their back, or stand them up again. */
  setFallen(name: string, fallen: boolean): void {
    const n = this.items.find((i) => i.def.name === name);
    if (n) n.fallen = fallen;
  }

  /** Villagers are solid: nudge a kid who walks into one back out. */
  pushOut(pos: THREE.Vector3): void {
    for (const n of this.items) {
      const dx = pos.x - n.p.pos.x, dz = pos.z - n.p.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= 0.75 * 0.75 || Math.abs(pos.y - n.p.pos.y) > 1.6) continue;
      const d = Math.sqrt(d2) || 0.001;
      pos.x = n.p.pos.x + (dx / d) * 0.75;
      pos.z = n.p.pos.z + (dz / d) * 0.75;
    }
  }

  /** Say the next line. Returns the line and whether this is the first time they've met. */
  talk(n: Npc): { name: string; text: string; firstTime: boolean } {
    const text = n.def.lines[n.nextLine % n.def.lines.length];
    n.nextLine++;
    const firstTime = !n.met;
    n.met = true;
    n.p.dance();
    return { name: n.def.name, text, firstTime };
  }

  /** Idle animation; villagers turn to face a kid who comes close. */
  update(dt: number, look: THREE.Vector3): void {
    for (const n of this.items) {
      const dx = look.x - n.p.pos.x, dz = look.z - n.p.pos.z;
      const d2 = dx * dx + dz * dz;
      n.p.near = d2 < 45 * 45; // far-away villagers animate less often
      n.p.group.visible = d2 < 70 * 70; // and very far ones (a speck on screen) aren't drawn at all
      if (!n.p.group.visible) continue;
      if (dx * dx + dz * dz < 64) {
        let d = Math.atan2(dx, dz) - n.p.facing;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        n.p.facing += d * Math.min(1, dt * 5);
        n.p.group.rotation.y = n.p.facing;
      }
      // look the kid in the face when they come close
      if (d2 < 36 && !n.fallen) n.p.lookTarget = (n.p.lookTarget ?? new THREE.Vector3()).set(look.x, look.y + 1.35, look.z);
      else n.p.lookTarget = null;
      n.p.applyRemote(dt, n.def.x, n.def.y, n.def.z, 0, 0, 0, true, false, false, n.p.facing, false);
      if (n.def.scale) n.p.group.scale.setScalar(n.def.scale); // (the kid model resets its own size each frame)
      const lean = n.fallen ? -Math.PI / 2 : 0;
      n.p.group.rotation.x += (lean - n.p.group.rotation.x) * Math.min(1, dt * 4);
    }
  }
}
