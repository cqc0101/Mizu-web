import "./style.css";
import "./games.css";
import { newSlidingBoard, newSudoku, shuffled, slideSolved, slideTile } from "./games.js";

const byId = (id) => document.getElementById(id);
const title = byId("game-title"), note = byId("game-note"), stage = byId("game-stage");
const status = byId("game-status"), actions = byId("game-actions");
const tabs = [...document.querySelectorAll("[data-game]")];
let lifecycle;

try {
  const theme = JSON.parse(localStorage.getItem("mizu-web:display"))?.theme;
  if (["light", "dark", "navy", "pink", "lavender"].includes(theme)) document.documentElement.dataset.theme = theme;
} catch {}

function button(text, onClick, className = "secondary") {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

function grid(className, label) {
  const board = document.createElement("div");
  board.className = "game-grid " + className;
  board.setAttribute("role", "group");
  board.setAttribute("aria-label", label);
  stage.append(board);
  return board;
}

function mountSliding(signal) {
  note.textContent = "把空格相邻的数字移进去，将 1 到 15 从左上到右下排好。";
  const puzzle = grid("sliding-grid", "数字华容道棋盘");
  let board, moves, solved;
  let worker, calculating = false, hintEnabled = false, hintFailed = false;
  let route = [], retryTimer;
  const hintButton = button("最优提示", () => {
    if (hintEnabled) stopHint();
    else {
      hintEnabled = true;
      hintFailed = false;
      requestHint();
    }
    draw();
  });

  const tiles = Array.from({ length: 16 }, (_, i) => button("", () => {
    if (solved) return;
    const next = slideTile(board, i);
    if (next === board) return;
    const followingHint = board[i] === route[0];
    board = next;
    moves++;
    solved = slideSolved(board);
    hintFailed = false;
    if (solved) stopHint();
    else if (hintEnabled) {
      if (followingHint) route.shift();
      else {
        route = [];
        stopCalculation();
        // Wait briefly for a series of moves to settle before starting a new search.
        calculating = true;
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          requestHint();
          draw();
        }, 120);
      }
    }
    draw();
  }, "game-tile"));
  puzzle.append(...tiles);

  function stopCalculation() {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    } else if (calculating) {
      worker?.terminate();
      worker = undefined;
    }
    calculating = false;
  }

  function stopHint() {
    stopCalculation();
    hintEnabled = false;
    hintFailed = false;
    route = [];
  }

  function requestHint() {
    calculating = true;
    try {
      worker ??= new Worker(new URL("./sliding-hint-worker.js", import.meta.url), { type: "module" });
      const current = worker;
      current.onmessage = ({ data }) => {
        if (current !== worker || !calculating) return;
        if (!data?.length) {
          failHint();
          return;
        }
        calculating = false;
        route = data;
        draw();
      };
      current.onerror = () => {
        if (current === worker) failHint();
      };
      current.postMessage(board);
    } catch {
      failHint();
    }
  }

  function failHint() {
    stopHint();
    hintFailed = true;
    draw();
  }

  function draw() {
    tiles.forEach((tile, i) => {
      const value = board[i];
      tile.textContent = value ? String(value) : "";
      const hinted = value === route[0];
      tile.setAttribute("aria-label", value ? (hinted ? "建议移动数字 " : "数字 ") + value : "空格");
      tile.dataset.blank = String(!value);
      tile.toggleAttribute("data-hint", hinted);
      tile.disabled = !value || solved;
    });
    const progress = solved ? "完成 · " + moves + " 步" : moves + " 步";
    const message = calculating ? " · 正在计算最短路线…" : hintFailed ? " · 提示加载失败，请重试" : "";
    if (status.textContent !== progress + message) status.textContent = progress + message;
    hintButton.textContent = calculating ? "取消计算" : hintEnabled ? "关闭提示" : "最优提示";
    hintButton.disabled = solved;
  }

  function restart() {
    stopHint();
    board = newSlidingBoard();
    moves = 0;
    solved = false;
    draw();
  }
  actions.append(hintButton, button("新棋盘", restart));
  signal.addEventListener("abort", () => {
    stopHint();
    worker?.terminate();
  }, { once: true });
  restart();
}

function mountSchulte(signal) {
  note.textContent = "按从 1 到 25 的顺序点击。点错不会前进。";
  const puzzle = grid("schulte-grid", "舒尔特方块棋盘");
  puzzle.hidden = true;
  let timer, started = 0, expected = 1, mistakes = 0;
  function tick() {
    status.textContent = "下一个 " + expected + " · " + ((performance.now() - started) / 1000).toFixed(1) + " 秒";
  }
  function begin() {
    clearInterval(timer);
    expected = 1;
    mistakes = 0;
    puzzle.hidden = false;
    start.textContent = "重新开始";
    puzzle.replaceChildren(...shuffled(Array.from({ length: 25 }, (_, i) => i + 1)).map((value) => {
      const tile = button(String(value), () => {
        if (value !== expected) {
          mistakes++;
          tile.animate([{ opacity: .35 }, { opacity: 1 }], {
            duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180
          });
          return;
        }
        tile.dataset.done = "true";
        tile.disabled = true;
        if (++expected <= 25) { tick(); return; }
        clearInterval(timer);
        status.textContent = "完成 · " + ((performance.now() - started) / 1000).toFixed(2) + " 秒 · 点错 " + mistakes + " 次";
      }, "game-tile");
      return tile;
    }));
    started = performance.now();
    tick();
    timer = setInterval(tick, 100);
  }
  const start = button("开始", begin, "primary");
  actions.append(start);
  signal.addEventListener("abort", () => clearInterval(timer), { once: true });
}

function mountSudoku() {
  note.textContent = "在空格填入 1 到 9，每行、每列和每个九宫格中的数字不能重复。";
  const puzzle = grid("sudoku-grid", "数独棋盘");
  let current, values, inputs, complete;
  function renderConflicts() {
    const conflicts = new Set();
    for (let i = 0; i < 81; i++) {
      const value = values[i];
      if (!value) continue;
      const r = Math.floor(i / 9), c = i % 9;
      for (let j = i + 1; j < 81; j++) {
        if (values[j] !== value) continue;
        const otherRow = Math.floor(j / 9), otherCol = j % 9;
        if (r === otherRow || c === otherCol ||
          Math.floor(r / 3) === Math.floor(otherRow / 3) && Math.floor(c / 3) === Math.floor(otherCol / 3)) {
          conflicts.add(i);
          conflicts.add(j);
        }
      }
    }
    inputs.forEach((input, i) => input.setAttribute("aria-invalid", String(conflicts.has(i))));
    return conflicts.size > 0;
  }
  function check() {
    if (complete) return;
    if (renderConflicts()) { status.textContent = "有重复数字，请检查标出的格子。"; return; }
    const missing = values.filter((value) => !value).length;
    if (missing) { status.textContent = "还剩 " + missing + " 格"; return; }
    if (!values.every((value, i) => value === current.solution[i])) {
      status.textContent = "还有数字需要调整。";
      return;
    }
    complete = true;
    status.textContent = "数独完成";
    inputs.forEach((input) => { input.readOnly = true; });
  }
  function restart() {
    current = newSudoku();
    values = current.clues.slice();
    complete = false;
    inputs = values.map((value, i) => {
      const field = document.createElement("input");
      field.type = "text";
      field.inputMode = "numeric";
      field.autocomplete = "off";
      field.spellcheck = false;
      field.maxLength = 1;
      field.className = "sudoku-cell";
      field.value = value ? String(value) : "";
      field.readOnly = !!value;
      field.dataset.given = String(!!value);
      field.setAttribute("aria-label", "第 " + (Math.floor(i / 9) + 1) + " 行第 " + (i % 9 + 1) + " 列");
      if (value) field.tabIndex = -1;
      field.addEventListener("focus", () => { if (!field.readOnly) field.select(); });
      field.addEventListener("input", () => {
        field.value = field.value.replace(/[^1-9]/g, "").slice(-1);
        values[i] = Number(field.value);
        renderConflicts();
        status.textContent = "";
        if (values.every(Boolean)) check();
      });
      return field;
    });
    puzzle.replaceChildren(...inputs);
    status.textContent = "";
  }
  actions.append(button("新题", restart), button("检查", check));
  restart();
}

function mountReaction(signal) {
  note.textContent = "点击测试区开始，等它变绿后尽快点击。";
  let phase = "idle", timer, frame, greenAt;
  function stop() { clearTimeout(timer); cancelAnimationFrame(frame); greenAt = undefined; }
  function paint(next, text) {
    phase = next;
    area.dataset.phase = next;
    area.textContent = text;
  }
  function press(event) {
    if (phase === "waiting" || phase === "go" && greenAt === undefined) {
      stop();
      paint("early", "点早了 · 再试一次");
      return;
    }
    if (phase === "go") {
      const time = event.timeStamp >= greenAt && event.timeStamp <= performance.now() ? event.timeStamp : performance.now();
      const result = Math.round(time - greenAt);
      stop();
      paint("result", result + " ms");
      status.textContent = "再次点击可以重测。";
      return;
    }
    status.textContent = "";
    paint("waiting", "等待变绿");
    timer = setTimeout(() => {
      paint("go", "点击");
      frame = requestAnimationFrame(() => { greenAt = performance.now(); });
    }, 1400 + Math.random() * 2800);
  }
  const area = document.createElement("button");
  area.type = "button";
  area.className = "reaction-area";
  paint("idle", "点击开始");
  area.addEventListener("pointerdown", (event) => { if (event.isPrimary && event.button === 0) press(event); });
  area.addEventListener("click", (event) => { if (event.detail === 0) press(event); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (phase === "waiting" || phase === "go")) {
      stop();
      paint("idle", "点击重新开始");
    }
  }, { signal });
  signal.addEventListener("abort", stop, { once: true });
  stage.append(area);
}

const mounts = { slide: mountSliding, schulte: mountSchulte, sudoku: mountSudoku, reaction: mountReaction };
function choose(id) {
  if (!Object.hasOwn(mounts, id)) id = "slide";
  lifecycle?.abort();
  lifecycle = new AbortController();
  for (const tab of tabs) tab.setAttribute("aria-pressed", String(tab.dataset.game === id));
  title.textContent = tabs.find((tab) => tab.dataset.game === id).textContent;
  status.textContent = note.textContent = "";
  stage.replaceChildren();
  actions.replaceChildren();
  history.replaceState(null, "", "#" + id);
  mounts[id](lifecycle.signal);
}

for (const tab of tabs) tab.addEventListener("click", () => choose(tab.dataset.game));
window.addEventListener("pagehide", () => lifecycle?.abort());
window.addEventListener("pageshow", (event) => { if (event.persisted) choose(location.hash.slice(1)); });
choose(location.hash.slice(1));
