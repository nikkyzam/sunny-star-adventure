/**
 * build-characters.mjs — turns the Quaternius "Universal Base Characters" + "Universal Animation
 * Library" (CC0, free Standard versions) into small GLB files the game loads from public/models/.
 *
 *   node scripts/build-characters.mjs <folder with body/ hair/ anim/ extracted from the zips>
 *
 * What it does: drops the 2048px textures to 1024 (body) / 512 (hair) WebP, removes the roughness
 * maps (a constant is used instead), keeps only the kid-friendly animations, and strips the
 * animation file's mannequin mesh. Re-run it if the source packs are updated.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, textureCompress, resample, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2];
if (!SRC) { console.error("usage: node scripts/build-characters.mjs <extracted folder>"); process.exit(1); }
const OUT = join(fileURLToPath(new URL("../", import.meta.url)), "public/models");
mkdirSync(OUT, { recursive: true });

// animations that suit a kids' game (no weapons, fighting or falling over)
const KEEP_ANIMS = new Set([
  "Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Jump_Start", "Jump_Loop", "Jump_Land",
  "Dance_Loop", "Driving_Loop", "Sitting_Idle_Loop", "Swim_Fwd_Loop", "Swim_Idle_Loop",
  "Idle_Talking_Loop", "Interact", "Roll", "PickUp_Table",
]);

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ sharp, "meshopt.encoder": MeshoptEncoder });
const FINGER = /^(index|middle|pinky|ring|thumb)_/;

async function write(doc, name) {
  const out = join(OUT, name);
  await io.write(out, doc);
  console.log(`${name.padEnd(28)} ${(statSync(out).size / 1024).toFixed(0)} KB`);
}

async function slim(doc, maxSize) {
  for (const m of doc.getRoot().listMaterials()) {
    const t = m.getMetallicRoughnessTexture();
    if (t) {
      m.setMetallicRoughnessTexture(null);
      m.setRoughnessFactor(0.65);
      m.setMetallicFactor(0);
    }
  }
  await doc.transform(
    prune(),
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [maxSize, maxSize], quality: 82 }),
  );
  // (no quantization: the game reads body positions and normals to fit clothes over them)
}

// bodies
for (const [file, name] of [["Superhero_Female_FullBody.gltf", "body_female.glb"], ["Superhero_Male_FullBody.gltf", "body_male.glb"]]) {
  const doc = await io.read(join(SRC, "body", file));
  await slim(doc, 1024);
  await write(doc, name);
}

// hairstyles (rigged to the head bone of the same skeleton)
for (const h of ["Hair_SimpleParted", "Hair_Long", "Hair_Buns", "Hair_Buzzed", "Hair_BuzzedFemale", "Hair_Beard"]) {
  const doc = await io.read(join(SRC, "hair", `${h}.gltf`));
  await slim(doc, 512);
  await write(doc, `${h.toLowerCase().replace("hair_", "hair_")}.glb`);
}

// animations: only the clips we use, no mesh
{
  const doc = await io.read(join(SRC, "anim", "UAL1_Standard.glb"));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    if (!KEEP_ANIMS.has(a.getName())) { a.dispose(); continue; }
    // finger motion is most of the data and barely visible at game size: hands stay relaxed
    for (const c of a.listChannels()) {
      if (FINGER.test(c.getTargetNode()?.getName() ?? "")) { c.getSampler()?.dispose(); c.dispose(); }
    }
  }
  for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); }
  for (const n of root.listNodes()) if (n.getSkin()) n.setSkin(null);
  await doc.transform(prune({ keepLeaves: true }), resample({ tolerance: 0.002 }), dedup(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  await write(doc, "anims.glb");
}
