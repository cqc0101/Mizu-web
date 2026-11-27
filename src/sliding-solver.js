export const slidingPatterns = [
  [1, 2, 5, 6, 9],
  [3, 4, 7, 8, 12],
  [10, 11, 13, 14, 15],
];

export const patternSize = 16 * 15 * 14 * 13 * 12;
export const patternBytes = patternSize * slidingPatterns.length;

const popcount = new Uint8Array(1 << 16);
for (let mask = 1; mask < popcount.length; mask++) {
  popcount[mask] = popcount[mask >> 1] + (mask & 1);
}

export function patternIndex(a, b, c, d, e) {
  let used = 1 << a;
  let rank = a * 15 + b - popcount[used & ((1 << b) - 1)];
  used |= 1 << b;
  rank = rank * 14 + c - popcount[used & ((1 << c) - 1)];
  used |= 1 << c;
  rank = rank * 13 + d - popcount[used & ((1 << d) - 1)];
  used |= 1 << d;
  return rank * 12 + e - popcount[used & ((1 << e) - 1)];
}

export const slidingNeighbors = Array.from({ length: 16 }, (_, i) => {
  const adjacent = [];
  if (i >= 4) adjacent.push(i - 4);
  if (i % 4 !== 0) adjacent.push(i - 1);
  if (i % 4 !== 3) adjacent.push(i + 1);
  if (i < 12) adjacent.push(i + 4);
  return adjacent;
});

const transpose = Array.from({ length: 16 }, (_, i) => (i % 4) * 4 + (i >> 2));
const mirroredTiles = slidingPatterns.map(group => group.map(tile => transpose[tile - 1] + 1));
const identity = Array.from({ length: 16 }, (_, i) => i);

function groupByTile(groups) {
  const indices = new Uint8Array(16);
  groups.forEach((group, i) => {
    for (const tile of group) indices[tile] = i;
  });
  return indices;
}

const directGroupByTile = groupByTile(slidingPatterns);
const mirrorGroupByTile = groupByTile(mirroredTiles);

function patternCost(positions, groups, transform, database, i) {
  const group = groups[i];
  const index = patternIndex(
    transform[positions[group[0]]], transform[positions[group[1]]], transform[positions[group[2]]],
    transform[positions[group[3]]], transform[positions[group[4]]],
  );
  return database[i * patternSize + index];
}

export function solveSlidingBoard(board, database) {
  if (board.length !== 16 || new Set(board).size !== 16 ||
      !board.every(value => Number.isInteger(value) && value >= 0 && value < 16)) {
    throw new Error("Invalid sliding board");
  }
  if (database.length !== patternBytes) throw new Error("Invalid pattern database");

  const cells = Uint8Array.from(board);
  const positions = new Uint8Array(16);
  let inversions = 0;
  for (let i = 0; i < cells.length; i++) {
    positions[cells[i]] = i;
    if (!cells[i]) continue;
    for (let j = 0; j < i; j++) {
      if (cells[j] > cells[i]) inversions++;
    }
  }
  const blank = positions[0];
  if ((inversions + (blank >> 2)) % 2 !== 1) return null;

  const route = [];
  const parity = ((blank >> 2) + blank % 4) & 1;
  const directCosts = slidingPatterns.map((_, i) => patternCost(positions, slidingPatterns, identity, database, i));
  const mirrorCosts = mirroredTiles.map((_, i) => patternCost(positions, mirroredTiles, transpose, database, i));
  const directStart = directCosts.reduce((sum, cost) => sum + cost, 0);
  const mirrorStart = mirrorCosts.reduce((sum, cost) => sum + cost, 0);
  let bound = Math.max(directStart, mirrorStart);
  bound += (bound ^ parity) & 1;

  function search(depth, empty, previous, directTotal, mirrorTotal) {
    // Zero means all pattern tiles are at their goals.
    if (directTotal === 0) {
      route.length = depth;
      return true;
    }
    const remaining = bound - depth - 1;

    const adjacent = slidingNeighbors[empty];
    for (let i = 0; i < adjacent.length; i++) {
      const from = adjacent[i];
      if (from === previous) continue;
      const tile = cells[from];
      const directGroup = directGroupByTile[tile];
      const oldDirect = directCosts[directGroup];
      positions[tile] = empty;

      // Only the moved tile's group changes in each partition.
      const newDirect = patternCost(positions, slidingPatterns, identity, database, directGroup);
      const direct = directTotal - oldDirect + newDirect;
      if (direct <= remaining) {
        const mirrorGroup = mirrorGroupByTile[tile];
        const oldMirror = mirrorCosts[mirrorGroup];
        const newMirror = patternCost(positions, mirroredTiles, transpose, database, mirrorGroup);
        const mirror = mirrorTotal - oldMirror + newMirror;
        if (mirror <= remaining) {
          directCosts[directGroup] = newDirect;
          mirrorCosts[mirrorGroup] = newMirror;
          cells[empty] = tile;
          cells[from] = 0;
          route[depth] = tile;
          if (search(depth + 1, from, empty, direct, mirror)) return true;
          cells[empty] = 0;
          cells[from] = tile;
          directCosts[directGroup] = oldDirect;
          mirrorCosts[mirrorGroup] = oldMirror;
        }
      }
      positions[tile] = from;
    }
    return false;
  }

  // Every move flips the blank's checkerboard color. Skip impossible depths.
  for (;; bound += 2) {
    route.length = 0;
    if (search(0, blank, -1, directStart, mirrorStart)) return route;
  }
}
