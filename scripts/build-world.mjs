/**
 * build-world.mjs — packs the chosen models from Quaternius' "Stylized Nature MegaKit" and
 * "Downtown City MegaKit" (CC0, free Standard versions) into public/models/nature.glb and
 * public/models/city.glb. Each model becomes one top-level node named after it; textures are
 * shared, shrunk and converted to WebP; geometry is meshopt-compressed.
 *
 *   node scripts/build-world.mjs <folder with nature/ and city/ extracted from the zips>
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { mergeDocuments, prune, dedup, textureCompress, meshopt, unpartition } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2];
if (!SRC) { console.error("usage: node scripts/build-world.mjs <extracted folder>"); process.exit(1); }
const OUT = join(fileURLToPath(new URL("../", import.meta.url)), "public/models");
mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ sharp, "meshopt.encoder": MeshoptEncoder });

const NATURE = [
  "CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_4", "CommonTree_5",
  "Pine_1", "Pine_2", "Pine_3", "Pine_4", "Pine_5",
  "Bush_Common", "Bush_Common_Flowers", "Fern_1", "Plant_1", "Plant_7", "Clover_1",
  "Flower_3_Group", "Flower_4_Group", "Grass_Common_Short", "Grass_Common_Tall", "Grass_Wispy_Tall",
  "Mushroom_Common", "Rock_Medium_1", "Rock_Medium_2", "Rock_Medium_3", "Pebble_Round_1", "Pebble_Round_2",
];
const CITY = [
  "Brick_Plain_3", "Brick_Window_Trim_Single", "Brick_Window_Square_Single", "Brick_Window_Trim",
  "Brick_TopTrim", "Brick_CornerColumn_Center", "Metal_FirstFloor_Window", "Metal_FirstFloor_Wall",
  "DoorFrame_Wooden", "Door_2", "Cornice_Trim_Center", "Roof_4x4",
  "Prop_Planter_Single", "Prop_Bollard", "Sidewalk_Planter",
];

async function pack(dir, names, outName, texSize) {
  const doc = await io.read(join(SRC, dir, `${names[0]}.gltf`));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const wrap = (sc, name) => {
    const holder = doc.createNode(name);
    for (const child of sc.listChildren()) { sc.removeChild(child); holder.addChild(child); }
    scene.addChild(holder);
  };
  wrap(scene, names[0]);
  for (const name of names.slice(1)) {
    const src = await io.read(join(SRC, dir, `${name}.gltf`));
    const map = mergeDocuments(doc, src);
    const srcScene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
    const merged = map.get(srcScene);
    wrap(merged, name);
    merged.dispose();
  }
  // drop occlusion/roughness/metal maps: a constant roughness reads the same at game size
  for (const m of root.listMaterials()) {
    m.setMetallicRoughnessTexture(null);
    m.setOcclusionTexture(null);
    m.setMetallicFactor(0);
    m.setRoughnessFactor(Math.max(0.55, m.getRoughnessFactor()));
  }
  await doc.transform(
    unpartition(),
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [texSize, texSize], quality: 80 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const out = join(OUT, outName);
  await io.write(out, doc);
  console.log(`${outName.padEnd(14)} ${(statSync(out).size / 1024).toFixed(0)} KB, ${scene.listChildren().length} models`);
}

await pack("nature", NATURE, "nature.glb", 512);
await pack("city", CITY, "city.glb", 512);
