export function shuffled(values, random = Math.random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function neighbors(i, width) {
  const col = i % width;
  return [
    ...(i >= width ? [i - width] : []),
    ...(col + 1 < width ? [i + 1] : []),
    ...(i + width < width * width ? [i + width] : []),
    ...(col > 0 ? [i - 1] : [])
  ];
}

export function slideSolved(board) {
  return board.every((value, i) => value === (i + 1) % board.length);
}

export function slideTile(board, index, width = 4) {
  const blank = board.indexOf(0);
  if (!neighbors(blank, width).includes(index)) return board;
  const next = board.slice();
  [next[blank], next[index]] = [next[index], next[blank]];
  return next;
}

export function newSlidingBoard(random = Math.random) {
  let board = Array.from({ length: 16 }, (_, i) => (i + 1) % 16);
  let last = -1;
  for (let step = 0; step < 140; step++) {
    const blank = board.indexOf(0);
    const allowed = neighbors(blank, 4).filter((index) => index !== last);
    board = slideTile(board, allowed[Math.floor(random() * allowed.length)]);
    last = blank;
  }
  return slideSolved(board) ? slideTile(board, 14) : board;
}

const fullMask = 0b111111111;
const boxOf = (row, col) => Math.floor(row / 3) * 3 + Math.floor(col / 3);

export function countSudokuSolutions(initial, limit = 2) {
  const board = initial.slice();
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  if (board.length !== 81) return 0;
  for (let i = 0; i < 81; i++) {
    const digit = board[i];
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) return 0;
    if (!digit) continue;
    const r = Math.floor(i / 9), c = i % 9, b = boxOf(r, c);
    const mask = 1 << (digit - 1);
    if ((rows[r] | cols[c] | boxes[b]) & mask) return 0;
    rows[r] |= mask;
    cols[c] |= mask;
    boxes[b] |= mask;
  }
  let solutions = 0;
  function search() {
    let index = -1, options = 0, best = 10;
    for (let i = 0; i < 81; i++) {
      if (board[i]) continue;
      const r = Math.floor(i / 9), c = i % 9, b = boxOf(r, c);
      const available = fullMask & ~(rows[r] | cols[c] | boxes[b]);
      if (!available) return;
      let count = 0;
      for (let bits = available; bits; bits &= bits - 1) count++;
      if (count >= best) continue;
      index = i;
      options = available;
      best = count;
      if (count === 1) break;
    }
    if (index < 0) { solutions++; return; }
    const r = Math.floor(index / 9), c = index % 9, b = boxOf(r, c);
    while (options && solutions < limit) {
      const bit = options & -options;
      options ^= bit;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      board[index] = 1;
      search();
      board[index] = 0;
      rows[r] ^= bit;
      cols[c] ^= bit;
      boxes[b] ^= bit;
    }
  }
  search();
  return solutions;
}

export function newSudoku(random = Math.random) {
  const groups = [0, 1, 2];
  const order = () => shuffled(groups, random).flatMap((group) => shuffled(groups, random).map((offset) => group * 3 + offset));
  const rows = order(), cols = order();
  const digits = shuffled(Array.from({ length: 9 }, (_, i) => i + 1), random);
  const solution = rows.flatMap((r) => cols.map((c) => digits[(r * 3 + Math.floor(r / 3) + c) % 9]));
  const clues = solution.slice();
  let remaining = 81;
  for (const index of shuffled(Array.from({ length: 81 }, (_, i) => i), random)) {
    clues[index] = 0;
    if (countSudokuSolutions(clues) !== 1) clues[index] = solution[index];
    else if (--remaining === 35) break;
  }
  return { clues, solution };
}
