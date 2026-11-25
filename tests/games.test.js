import test from "node:test";
import assert from "node:assert/strict";
import { countSudokuSolutions, newSlidingBoard, newSudoku, slideSolved, slideTile } from "../src/games.js";
import { dailyPoem } from "../src/poetry.js";

function randomFor(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

test("华容道打乱后可解且未完成，点击只移动相邻数字", () => {
  for (let i = 0; i < 80; i++) {
    const board = newSlidingBoard(randomFor(i));
    assert.equal(new Set(board).size, 16);
    assert.equal(slideSolved(board), false);
    const tiles = board.filter(Boolean);
    const inversions = tiles.reduce((sum, value, index) => sum + tiles.slice(index + 1).filter((other) => value > other).length, 0);
    assert.equal((inversions + 4 - Math.floor(board.indexOf(0) / 4)) % 2, 1);
    assert.strictEqual(slideTile(board, board.indexOf(0)), board);
  }
  const almost = Array.from({ length: 16 }, (_, i) => (i + 1) % 16);
  assert.ok(slideSolved(slideTile(slideTile(almost, 14), 15)));
});

test("生成的数独有唯一解且各组数字满足规则", () => {
  for (let i = 0; i < 16; i++) {
    const { clues, solution } = newSudoku(randomFor(i));
    assert.equal(countSudokuSolutions(clues), 1);
    assert.equal(countSudokuSolutions(solution), 1);
    assert.ok(clues.every((v, j) => !v || v === solution[j]) && clues.filter(Boolean).length < 42);
  }
  assert.equal(countSudokuSolutions(Array(81).fill(1)), 0);
  assert.equal(countSudokuSolutions(Array(81).fill(0)), 2);
});

test("每日诗词按当地日期轮换，全文包含对应诗句", () => {
  const titles = new Set();
  for (let day = 1; day <= 30; day++) {
    const morning = dailyPoem(new Date(2026, 10, day, 1));
    assert.deepEqual(morning, dailyPoem(new Date(2026, 10, day, 23)));
    assert.ok(morning.full.includes(morning.line) && morning.full.split("\n").length >= 2);
    assert.ok(morning.dynasty && morning.poet);
    titles.add(morning.title);
  }
  assert.equal(titles.size, 30);
});
