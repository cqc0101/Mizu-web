import { createPracticeCards } from "./practice.js";

const modeKey = "mizu-web:practice-mode";
const booksKey = "mizu-web:practice-books";
const byId = (id) => document.getElementById(id);

function savedMode() {
  try { return localStorage.getItem(modeKey) === "choice" ? "choice" : "self"; }
  catch { return "self"; }
}

export function setupPractice({ getBooks, activeId, readWords, loadWords }) {
  const dialog = byId("practice");
  const modeButtons = [...dialog.querySelectorAll("[data-mode]")];
  const empty = byId("practice-empty");
  const question = byId("practice-question");
  const progress = byId("practice-progress");
  const count = byId("practice-count");
  const word = byId("practice-word");
  const options = byId("practice-options");
  const feedback = byId("practice-feedback");
  const reveal = byId("practice-reveal");
  const forgot = byId("practice-forgot");
  const knew = byId("practice-knew");
  const next = byId("practice-next");
  const finish = byId("practice-finish");
  const result = byId("practice-result");
  const restart = byId("practice-restart");
  const picker = byId("practice-books");
  const pickerSummary = byId("practice-books-summary");
  const pickerOptions = byId("practice-book-options");
  const selectAll = byId("practice-select-all");
  const applyBooks = byId("practice-apply-books");
  const status = byId("practice-load");
  let mode = savedMode();
  const rounds = new Map();
  let available = [];
  let selection = new Set();
  let roundWords = [];
  let dirty = false;
  let loading = false;
  let loadError = "";
  let generation = 0;

  function startRound() {
    const round = { ...createPracticeCards(roundWords, mode), index: 0, score: 0, response: null };
    rounds.set(mode, round);
    return round;
  }

  function grade(correct) {
    const round = rounds.get(mode);
    round.score += Number(correct);
    round.index++;
    round.response = null;
    render();
    (question.hidden ? restart : word).focus();
  }

  function render() {
    for (const button of modeButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    }
    selectAll.checked = available.length > 0 && selection.size === available.length;
    selectAll.indeterminate = selection.size > 0 && !selectAll.checked;
    selectAll.disabled = loading;
    applyBooks.disabled = loading || selection.size === 0;
    for (const input of pickerOptions.querySelectorAll("input")) {
      input.checked = selection.has(input.value);
      input.disabled = loading;
    }
    pickerSummary.textContent = selection.size === 1
      ? "练习词本 · " + available.find(({ id }) => selection.has(id)).name
      : "练习词本 · " + selection.size + " 本";
    const message = loading ? "正在载入所选词本…" : loadError || (dirty ? "选择词本后，点击开始练习。" : "");
    status.textContent = message;
    status.hidden = !message;
    if (message) {
      empty.hidden = question.hidden = finish.hidden = true;
      return;
    }
    const round = rounds.get(mode) ?? startRound();
    const card = round.cards[round.index];
    const self = mode === "self";
    const answered = round.response !== null;
    empty.hidden = !round.reason;
    question.hidden = !card;
    finish.hidden = !!round.reason || !!card;
    if (round.reason) {
      empty.textContent = round.reason === "empty" ? "先添加带中文释义的单词，就能开始练习。"
        : "四选一需要至少四种不同的释义。可以切换到自测。";
      return;
    }
    if (!card) {
      result.textContent = (self ? "记得 " : "答对 ") + round.score + " / " + round.cards.length + " 题";
      return;
    }

    progress.max = round.cards.length;
    progress.value = round.index + 1;
    count.textContent = (round.index + 1) + " / " + round.cards.length;
    word.textContent = card.word;
    options.hidden = self;
    options.replaceChildren();
    for (const answer of card.options ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary practice-option";
      button.textContent = answer;
      button.disabled = answered;
      if (answered && answer === card.answer) button.dataset.answer = "correct";
      else if (answered && answer === round.response) button.dataset.answer = "incorrect";
      button.addEventListener("click", () => {
        if (round.response !== null) return;
        round.response = answer;
        render();
        next.focus();
      });
      options.append(button);
    }
    feedback.textContent = !answered ? "" : self ? card.answer
      : round.response === card.answer ? "答对了" : "正确释义是「" + card.answer + "」";
    reveal.hidden = !self || answered;
    forgot.hidden = knew.hidden = !self || !answered;
    next.hidden = self || !answered;
    next.textContent = round.index + 1 === round.cards.length ? "查看结果" : "下一题";
  }

  function updateSelection() {
    dirty = true;
    loadError = "";
    render();
  }
  selectAll.addEventListener("change", () => {
    selection = new Set(selectAll.checked ? available.map(({ id }) => id) : []);
    updateSelection();
  });
  pickerOptions.addEventListener("change", (event) => {
    const input = event.target;
    if (input.checked) selection.add(input.value);
    else selection.delete(input.value);
    updateSelection();
  });
  applyBooks.addEventListener("click", async () => {
    if (loading || selection.size === 0) return;
    const selected = available.filter(({ id }) => selection.has(id));
    const attempt = ++generation;
    loading = true;
    loadError = "";
    render();
    try {
      const lists = await Promise.all(selected.map(loadWords));
      if (attempt !== generation || !dialog.open) return;
      roundWords = lists.flat();
      dirty = false;
      rounds.clear();
      try { localStorage.setItem(booksKey, JSON.stringify([...selection])); } catch {}
      picker.open = false;
    } catch (error) {
      if (attempt === generation) loadError = error.message || "词本载入失败，请重试。";
    } finally {
      if (attempt === generation && dialog.open) {
        loading = false;
        render();
        if (!question.hidden) word.focus();
      }
    }
  });
  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      try { localStorage.setItem(modeKey, mode); } catch {}
      render();
    });
  }
  byId("practice-button").addEventListener("click", () => {
    available = getBooks();
    let saved = [];
    try {
      const stored = JSON.parse(localStorage.getItem(booksKey));
      if (Array.isArray(stored)) saved = stored;
    } catch {}
    selection = new Set(available.filter(({ id }) => saved.includes(id)).map(({ id }) => id));
    if (selection.size === 0) selection.add(activeId() ?? available[0].id);
    pickerOptions.replaceChildren(...available.map((book) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = book.id;
      label.append(input, book.name);
      return label;
    }));
    rounds.clear();
    const lists = available.filter(({ id }) => selection.has(id)).map(readWords);
    dirty = lists.some((list) => !list);
    roundWords = dirty ? [] : lists.flat();
    loadError = "";
    picker.open = dirty;
    render();
    dialog.showModal();
    if (!question.hidden) word.focus();
  });
  dialog.addEventListener("close", () => {
    generation++;
    loading = false;
  });
  reveal.addEventListener("click", () => {
    rounds.get(mode).response = true;
    render();
    knew.focus();
  });
  forgot.addEventListener("click", () => grade(false));
  knew.addEventListener("click", () => grade(true));
  next.addEventListener("click", () => {
    const round = rounds.get(mode);
    grade(round.response === round.cards[round.index].answer);
  });
  restart.addEventListener("click", () => {
    startRound();
    render();
    if (!question.hidden) word.focus();
  });
}
