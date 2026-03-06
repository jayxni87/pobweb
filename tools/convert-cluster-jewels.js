/**
 * Convert PathOfBuilding/src/Data/ClusterJewels.lua → js/data/cluster-jewels.json
 *
 * Uses the existing parseLuaTable parser, then post-processes the orbitOffsets
 * section to convert 0-indexed numeric-key objects into proper arrays.
 */
import { parseLuaTable } from './convert-lua-data.js';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const INPUT = join(ROOT, 'PathOfBuilding', 'src', 'Data', 'ClusterJewels.lua');
const OUTPUT = join(ROOT, 'js', 'data', 'cluster-jewels.json');

const lua = readFileSync(INPUT, 'utf-8');
const data = parseLuaTable(lua);

// Post-process orbitOffsets: convert { "0": 3, "1": 5, "2": 5 } → [3, 5, 5]
// The Lua source uses [0], [1], [2] keys (0-indexed), which the parser emits
// as an object with string-number keys. Convert each to a dense array.
for (const [groupId, offsets] of Object.entries(data.orbitOffsets)) {
  const keys = Object.keys(offsets).map(Number).sort((a, b) => a - b);
  const arr = [];
  for (const k of keys) {
    arr[k] = offsets[k];
  }
  data.orbitOffsets[groupId] = arr;
}

// Validate
const jewelNames = Object.keys(data.jewels);
console.log(`Jewel types: ${jewelNames.length} (${jewelNames.join(', ')})`);
for (const name of jewelNames) {
  const j = data.jewels[name];
  const skillCount = Object.keys(j.skills).length;
  console.log(`  ${name}: ${skillCount} skills, sizeIndex=${j.sizeIndex}, nodes=${j.minNodes}-${j.maxNodes}`);
}
console.log(`notableSortOrder entries: ${Object.keys(data.notableSortOrder).length}`);
console.log(`keystones: ${data.keystones.length} (${data.keystones.join(', ')})`);
console.log(`orbitOffsets entries: ${Object.keys(data.orbitOffsets).length}`);

// Spot-check a few values
const sampleOffset = data.orbitOffsets['43989'];
if (!Array.isArray(sampleOffset)) {
  throw new Error(`orbitOffsets['43989'] should be an array, got: ${typeof sampleOffset}`);
}
console.log(`  sample orbitOffset[43989]: [${sampleOffset}]`);

if (jewelNames.length !== 3) throw new Error(`Expected 3 jewel types, got ${jewelNames.length}`);
if (Object.keys(data.notableSortOrder).length < 200) throw new Error('Too few notableSortOrder entries');
if (Object.keys(data.orbitOffsets).length < 30) throw new Error('Too few orbitOffset entries');
if (data.keystones.length < 5) throw new Error('Too few keystones');

// Write output
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(data, null, 2));

const inKB = (statSync(INPUT).size / 1024).toFixed(0);
const outKB = (statSync(OUTPUT).size / 1024).toFixed(0);
console.log(`\nWrote ${OUTPUT} (${inKB}KB → ${outKB}KB)`);
