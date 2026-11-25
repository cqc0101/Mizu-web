import { createPracticeCards, practiceWordKey } from "./practice.js";

const modeKey = "mizu-web:practice-mode";
const booksKey = "mizu-web:practice-books";
const limitKey = "mizu-web:practice-limit";
const byId = (id) => document.getElementById(id);

function stored(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

function readJson(key, fallback) {
  try { return JSON.parse(stored(key, "null")) ?? fallback; }
  catch { return fallback; }
}

function save(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch { return false; }
}

function loadMistakes(key) {
  const rows = readJson(key, []);
  if (!Array.isArray(rows)) return new Map();
  return new Map(rows.filter((row) => typeof row?.word === "string" && row.word.trim() &&
    typeof row.answer === "string" && row.answer.trim() && Number.isSafeInteger(row.misses) && row.misses > 0)
    .map((row) => [practiceWordKey(row.word), row]));
}

export function setupPractice({ getBooks, activeId, loadWords, library }) {
  const page = byId("practice");
  const home = [document.querySelector(".wordbook-topbar"), byId("wordbook-home")];
  const opener = byId("practice-button");
  const title = byId("practice-title");
  const homeTitle = document.title;
  const practiceTab = byId("practice-tab");
  const mistakeTab = byId("practice-mistakes-tab");
  const setup = byId("practice-setup");
  const question = byId("practice-question");
  const finish = byId("practice-finish");
  const mistakePanel = byId("practice-mistakes");
  const picker = byId("practice-book-options");
  const selectAll = byId("practice-select-all");
  const start = byId("practice-apply-books");
  const modeButtons = [...setup.querySelectorAll("[data-mode]")];
  const size = byId("practice-round-size");
  const unlimited = byId("practice-unlimited");
  const status = byId("practice-load");
  const progress = byId("practice-progress");
  const count = byId("practice-count");
  const word = byId("practice-word");
  const options = byId("practice-options");
  const feedback = byId("practice-feedback");
  const reveal = byId("practice-reveal");
  const forgot = byId("practice-forgot");
  const knew = byId("practice-knew");
  const next = byId("practice-next");
  const result = byId("practice-result");
  const restart = byId("practice-restart");
  const review = byId("practice-review");
  const mistakeList = byId("practice-mistakes-list");
  const mistakeError = byId("practice-mistake-error");

  let mode = stored(modeKey, "self") === "choice" ? "choice" : "self";
  const preferences = readJson(limitKey, {});
  if (Number.isInteger(preferences.size) && preferences.size >= 1 && preferences.size <= Number(size.max))
    size.value = String(preferences.size);
  unlimited.checked = preferences.unlimited === true;

  let homeScroll = 0;
  let available = [];
  let availableKey = "";
  let selection = new Set();
  let loading = false;
  let message = "";
  let generation = 0;
  let round = null;
  let view = "practice";
  let scope;
  let mistakesKey;
  let mistakes = new Map();

  function renderSetup() {
    for (const button of modeButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
      button.disabled = loading;
    }
    selectAll.checked = available.length > 0 && selection.size === available.length;
    selectAll.indeterminate = selection.size > 0 && !selectAll.checked;
    selectAll.disabled = loading;
    for (const input of picker.querySelectorAll("input")) {
      input.checked = selection.has(input.value);
      input.disabled = loading;
    }
    size.disabled = unlimited.checked || loading;
    unlimited.disabled = loading;
    start.disabled = loading || selection.size === 0;
    status.textContent = loading ? "正在载入所选词本…" : message;
    status.hidden = !status.textContent;
  }

  function renderMistakes() {
    byId("practice-mistake-count").textContent = mistakes.size ? mistakes.size + " 个错词" : "还没有错词";
    review.disabled = mistakes.size === 0;
    const rows = [...mistakes].reverse().map(([key, entry]) => {
      const row = document.createElement("li");
      const text = document.createElement("div");
      const term = document.createElement("strong");
      const meaning = document.createElement("p");
      const remove = document.createElement("button");
      term.lang = "en";
      term.textContent = entry.word;
      meaning.textContent = entry.answer + " · 错 " + entry.misses + " 次";
      remove.type = "button";
      remove.className = "text-button";
      remove.textContent = "移除";
      remove.setAttribute("aria-label", "移除错词 " + entry.word);
      remove.addEventListener("click", () => {
        updateMistakes((current) => current.delete(key));
        renderMistakes();
        (mistakes.size ? review : mistakeTab).focus();
      });
      text.append(term, meaning);
      row.append(text, remove);
      return row;
    });
    mistakeList.replaceChildren(...rows);
  }

  function updateMistakes(update) {
    const current = mistakeError.hidden ? loadMistakes(mistakesKey) : new Map(mistakes);
    update(current);
    mistakes = current;
    mistakeError.hidden = save(mistakesKey, JSON.stringify([...current.values()]));
    mistakeError.textContent = "浏览器暂时无法保存错词，本页仍可复习。";
  }

  function recordAnswer(card, correct) {
    round.answered++;
    round.score += Number(correct);
    if (correct) return;
    const key = practiceWordKey(card.word);
    updateMistakes((current) => {
      const misses = (current.get(key)?.misses ?? 0) + 1;
      current.delete(key);
      current.set(key, { word: card.word, answer: card.answer, misses });
    });
  }

  function renderQuestion() {
    const card = round.cards[round.index];
    const self = round.mode === "self";
    const answered = round.response !== null;
    progress.hidden = round.limit === Infinity;
    progress.max = round.cards.length;
    progress.value = round.index + 1;
    const questionNumber = round.answered + (self || !answered ? 1 : 0);
    count.textContent = round.limit === Infinity ? "第 " + questionNumber + " 题"
      : (round.index + 1) + " / " + round.cards.length;
    word.textContent = card.word;
    options.hidden = self;
    options.replaceChildren(...(card.options ?? []).map((answer) => {
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
        recordAnswer(card, answer === card.answer);
        renderQuestion();
        next.focus();
      });
      return button;
    }));
    feedback.textContent = !answered ? "" : self ? card.answer
      : round.response === card.answer ? "答对了" : "正确释义是「" + card.answer + "」";
    reveal.hidden = !self || answered;
    forgot.hidden = knew.hidden = !self || !answered;
    next.hidden = self || !answered;
    next.textContent = round.limit !== Infinity && round.index + 1 === round.cards.length ? "查看结果" : "下一题";
  }

  function show() {
    const reviewingBook = view === "mistakes";
    practiceTab.setAttribute("aria-pressed", String(!reviewingBook));
    mistakeTab.setAttribute("aria-pressed", String(reviewingBook));
    setup.hidden = reviewingBook || !!round;
    question.hidden = reviewingBook || !round || round.complete;
    finish.hidden = reviewingBook || !round?.complete;
    mistakePanel.hidden = !reviewingBook;
    if (reviewingBook) renderMistakes();
    else if (!finish.hidden) result.textContent = (round.mode === "self" ? "记得 " : "答对 ") + round.score + " / " + round.answered + " 题";
    else if (!question.hidden) renderQuestion();
    else renderSetup();
  }

  function startRound(words, roundMode, limit) {
    const { cards, reason } = createPracticeCards(words, roundMode, Math.random, { limit });
    if (reason) {
      message = reason === "empty" ? "所选词本暂无带中文释义的词条。" : "四选一至少需要四种不同的释义，可切换为自测。";
      round = null;
      view = "practice";
      show();
      return false;
    }
    round = { words, mode: roundMode, limit, cards, index: 0, score: 0, answered: 0, response: null, complete: false };
    view = "practice";
    show();
    word.focus();
    return true;
  }

  function endRound() {
    round.complete = true;
    show();
    restart.focus();
  }

  function advance() {
    const previousWord = round.cards[round.index].word;
    round.index++;
    round.response = null;
    if (round.index === round.cards.length) {
      if (round.limit !== Infinity) {
        endRound();
        return;
      }
      round.cards = createPracticeCards(round.words, round.mode, Math.random, { limit: Infinity, previousWord }).cards;
      round.index = 0;
    }
    renderQuestion();
    word.focus();
  }

  function refresh() {
    if (page.hidden) return;
    const nextScope = library();
    if (nextScope !== scope) {
      scope = nextScope;
      mistakesKey = "mizu-web:practice-mistakes:" + scope;
      mistakes = loadMistakes(mistakesKey);
      mistakeError.hidden = true;
      round = null;
      generation++;
      loading = false;
      message = "";
      selection.clear();
      availableKey = "";
    }
    const books = getBooks();
    const key = JSON.stringify(books.map(({ id, name }) => [id, name]));
    if (key === availableKey) return;
    const firstLoad = !availableKey;
    availableKey = key;
    available = books;
    const saved = firstLoad ? readJson(booksKey, []) : [...selection];
    selection = new Set(available.filter(({ id }) => Array.isArray(saved) && saved.includes(id)).map(({ id }) => id));
    if (firstLoad && !selection.size) selection.add(activeId() ?? available[0].id);
    picker.replaceChildren(...available.map(({ id, name }) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      const text = document.createElement("span");
      input.type = "checkbox";
      input.value = id;
      text.textContent = name;
      label.append(input, text);
      return label;
    }));
    if (round && view === "practice") return;
    show();
  }

  function syncRoute() {
    const showPractice = location.hash === "#practice";
    if (showPractice === !page.hidden) return;
    if (showPractice) homeScroll = window.scrollY;
    page.hidden = !showPractice;
    for (const element of home) element.hidden = showPractice;
    document.title = showPractice ? "Mizu · 单词练习" : homeTitle;
    if (showPractice) {
      scope = undefined;
      view = "practice";
      refresh();
      title.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else {
      generation++;
      loading = false;
      opener.focus({ preventScroll: true });
      window.scrollTo(0, homeScroll);
    }
  }

  opener.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState({ practiceFromHome: true }, "", "#practice");
    syncRoute();
  });
  byId("practice-back").addEventListener("click", (event) => {
    event.preventDefault();
    if (history.state?.practiceFromHome) history.back();
    else {
      history.replaceState(null, "", location.pathname + location.search);
      syncRoute();
    }
  });
  window.addEventListener("popstate", syncRoute);
  window.addEventListener("hashchange", syncRoute);
  window.addEventListener("storage", (event) => {
    if (page.hidden || (event.key !== mistakesKey && event.key !== null) || !mistakeError.hidden) return;
    mistakes = loadMistakes(mistakesKey);
    if (!mistakePanel.hidden) renderMistakes();
  });
  practiceTab.addEventListener("click", () => { view = "practice"; show(); });
  mistakeTab.addEventListener("click", () => { view = "mistakes"; show(); });

  for (const button of modeButtons) button.addEventListener("click", () => {
    mode = button.dataset.mode;
    save(modeKey, mode);
    message = "";
    renderSetup();
  });
  selectAll.addEventListener("change", () => {
    selection = new Set(selectAll.checked ? available.map(({ id }) => id) : []);
    message = "";
    renderSetup();
  });
  picker.addEventListener("change", (event) => {
    const input = event.target;
    if (input.checked) selection.add(input.value);
    else selection.delete(input.value);
    message = "";
    renderSetup();
  });
  const limit = () => unlimited.checked ? Infinity : size.valueAsNumber;
  function saveLimit() {
    const amount = size.valueAsNumber;
    save(limitKey, JSON.stringify({ unlimited: unlimited.checked, size: size.validity.valid && Number.isInteger(amount) ? amount : 10 }));
    renderSetup();
  }
  unlimited.addEventListener("change", saveLimit);
  size.addEventListener("change", saveLimit);
  setup.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (loading || !selection.size) return;
    const wanted = available.filter(({ id }) => selection.has(id));
    const count = limit();
    const attempt = ++generation;
    loading = true;
    message = "";
    renderSetup();
    try {
      const lists = await Promise.all(wanted.map(loadWords));
      if (attempt !== generation) return;
      save(booksKey, JSON.stringify(wanted.map(({ id }) => id)));
      if (view === "practice") startRound(lists.flat(), mode, count);
    } catch (error) {
      if (attempt === generation) message = error.message || "词本载入失败，请重试。";
    } finally {
      if (attempt === generation) {
        loading = false;
        renderSetup();
      }
    }
  });

  reveal.addEventListener("click", () => {
    round.response = true;
    renderQuestion();
    knew.focus();
  });
  forgot.addEventListener("click", () => { recordAnswer(round.cards[round.index], false); advance(); });
  knew.addEventListener("click", () => { recordAnswer(round.cards[round.index], true); advance(); });
  next.addEventListener("click", advance);
  byId("practice-end").addEventListener("click", endRound);
  byId("practice-reconfigure").addEventListener("click", () => { round = null; message = ""; show(); start.focus(); });
  restart.addEventListener("click", () => startRound(round.words, round.mode, round.limit));
  review.addEventListener("click", () => {
    generation++;
    loading = false;
    if (!unlimited.checked && !size.validity.valid) {
      view = "practice";
      round = null;
      show();
      size.reportValidity();
      return;
    }
    const words = [...mistakes.values()].map(({ word, answer }) => ({ Word: word, Meaning: answer }));
    startRound(words, "self", limit());
  });
  syncRoute();
  return refresh;
}
