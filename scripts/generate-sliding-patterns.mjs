import { writeFileSync } from "node:fs";
import { patternBytes, patternIndex, patternSize, slidingNeighbors, slidingPatterns } from "../src/sliding-solver.js";

const stateBits = 24;
const stateMask = (1 << stateBits) - 1;
const tilesMask = (1 << 20) - 1;
const unseen = 255;

function buildPattern(group) {
  // Six nibbles encode the five ordered tile locations, then the blank.
  const distances = new Uint8Array(1 << stateBits).fill(unseen);
  const queue = new Uint32Array(1 << stateBits);
  let head = 0;
  let end = 0;
  const goal = group.reduce((state, tile, i) => state | ((tile - 1) << (4 * i)), 15 << 20);
  distances[goal] = 0;
  queue[end++] = goal;

  // A swap outside this group costs zero. A swap with a tracked tile costs one.
  while (head !== end) {
    const entry = queue[head];
    head = (head + 1) & stateMask;
    const state = entry & stateMask;
    const cost = entry >>> stateBits;
    if (distances[state] !== cost) continue;
    const blank = state >>> 20;
    const tiles = state & tilesMask;
    for (const to of slidingNeighbors[blank]) {
      let moved = tiles;
      let nextCost = cost;
      for (let shift = 0; shift < 20; shift += 4) {
        if (((tiles >>> shift) & 15) === to) {
          moved = tiles ^ ((blank ^ to) << shift);
          nextCost++;
          break;
        }
      }
      const next = moved | (to << 20);
      if (distances[next] <= nextCost) continue;
      distances[next] = nextCost;
      const queued = next | (nextCost << stateBits);
      if (nextCost === cost) {
        head = (head - 1) & stateMask;
        queue[head] = queued;
      } else {
        queue[end] = queued;
        end = (end + 1) & stateMask;
      }
      if (head === end) throw new Error("Pattern queue overflow");
    }
  }

  // Keep the best cost across blank locations, so the browser only needs 16P5 bytes.
  const table = new Uint8Array(patternSize).fill(unseen);
  for (let tiles = 0; tiles <= tilesMask; tiles++) {
    let best = unseen;
    for (let blank = 0; blank < 16; blank++) {
      const cost = distances[tiles | (blank << 20)];
      if (cost < best) best = cost;
    }
    if (best === unseen) continue;
    const index = patternIndex(tiles & 15, (tiles >>> 4) & 15, (tiles >>> 8) & 15,
      (tiles >>> 12) & 15, tiles >>> 16);
    table[index] = best;
  }
  if (table.includes(unseen)) throw new Error("Incomplete pattern database");
  return table;
}

const database = new Uint8Array(patternBytes);
for (const [index, group] of slidingPatterns.entries()) {
  database.set(buildPattern(group), index * patternSize);
  console.log("Built pattern", group.join(", "));
}
writeFileSync(new URL("../src/sliding-patterns.bin", import.meta.url), database);
