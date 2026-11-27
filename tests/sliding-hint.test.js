import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { slideSolved, slideTile } from "../src/games.js";
import { patternBytes, solveSlidingBoard } from "../src/sliding-solver.js";

const database = readFileSync(new URL("../src/sliding-patterns.bin", import.meta.url));
const goal = Array.from({ length: 16 }, (_, i) => (i + 1) % 16);

function verifyRoute(board, length) {
  const route = solveSlidingBoard(board, database);
  assert.equal(route.length, length);
  for (const tile of route) {
    const next = slideTile(board, board.indexOf(tile));
    assert.notEqual(next, board);
    board = next;
  }
  assert.ok(slideSolved(board));
}

test("华容道提示与广度优先搜索的最短距离一致", () => {
  assert.equal(database.length, patternBytes);
  const seen = new Set([goal.join(",")]);
  let frontier = [goal];
  for (let depth = 0; depth <= 8; depth++) {
    const next = [];
    for (const board of frontier) {
      verifyRoute(board, depth);
      for (let i = 0; i < board.length; i++) {
        const moved = slideTile(board, i);
        const key = moved.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(moved);
      }
    }
    frontier = next;
  }
});

test("华容道提示解出 18 步和公开的 64 步难局", () => {
  verifyRoute([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 13, 0], 18);
  // Korf #43 rotated to put the goal blank in the lower-right corner.
  // https://www.mdpi.com/2073-431X/12/1/11 (Table 4)
  const korf43 = [11, 15, 14, 13, 1, 9, 10, 4, 3, 6, 2, 12, 7, 5, 8, 0];
  verifyRoute(korf43.reverse().map(tile => tile ? 16 - tile : 0), 64);
});

test("华容道提示识别不可解和无效棋盘", () => {
  const impossible = [2, 1, ...goal.slice(2)];
  assert.equal(solveSlidingBoard(impossible, database), null);
  assert.throws(() => solveSlidingBoard(Array(16).fill(0), database), /Invalid sliding board/);
});
