/**
 * npcs.ts — friendly villagers to talk to. Each one is a kid model with their own outfit and a
 * name tag; walk up and press F (or the Talk button) and they say their next line.
 * Lines are fixed, friendly text from the level data — there is no free-text chat anywhere.
 */

import * as THREE from "three";
import { Player } from "./player";
import { lookOf, safeHat, safeOutfit, safeSkin } from "./profile";
import { makeTextSprite, disposeSprite } from "./social";
import type { NpcDef } from "./world";

const TALK_RADIUS = 2.6;

interface Npc {
  def: NpcDef;
  p: Player;
  tag: THREE.Sprite;
  nextLine: number;
  met: boolean;
}

export class Npcs {
  readonly group = new THREE.Group();
  items: Npc[] = [];

  build(defs: NpcDef[]): void {
    for (const n of this.items) disposeSprite(n.tag);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.group.clear();
    this.items = defs.map((def) => {
      const p = new Player(lookOf(safeOutfit(def.outfit), safeSkin(def.skin)));
      p.setHat(safeHat(def.hat));
      p.pos.set(def.x, def.y, def.z);
      p.facing = 0;
      const tag = makeTextSprite(def.name, { bg: "rgba(255,169,77,0.92)", fg: "#ffffff", size: 44, height: 0.4 });
      tag.position.y = 2.3;
      p.group.add(tag);
      this.group.add(p.group);
      return { def, p, tag, nextLine: 0, met: false };
    });
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
      if (dx * dx + dz * dz < 64) {
        let d = Math.atan2(dx, dz) - n.p.facing;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        n.p.facing += d * Math.min(1, dt * 5);
        n.p.group.rotation.y = n.p.facing;
      }
      n.p.applyRemote(dt, n.def.x, n.def.y, n.def.z, 0, 0, 0, true, false, false, n.p.facing, false);
    }
  }
}
