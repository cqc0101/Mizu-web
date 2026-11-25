import "./style.css";
import { changeWords, parseFirebaseConfig, readWords, wordLimit } from "./words.js";
import { setupPractice } from "./practice-ui.js";
import { changeBooks, encodeBooks, personalBook, readBooks } from "./books.js";
import { examBooks, getExamWords, loadExamWords } from "./wordpacks.js";
import { setupBookMenu } from "./book-menu.js";
import { setupPoetry } from "./poetry.js";

const byId = (id) => document.getElementById(id);
const prefKey = "mizu-web:display";
const localKey = "mizu-web:words";
const configKey = "mizu-web:firebase";
const keepLoginKey = "mizu-web:firebase-keep-login";
const localBooksKey = "mizu-web:custom-books";
const bookDisplayKey = "mizu-web:book-display";
const pageSize = 50;
const themes = { light: "雾白", dark: "墨绿", navy: "深蓝", pink: "浅粉", lavender: "浅紫" };
const themeColors = { light: "#eaf0e9", dark: "#1b2520", navy: "#142033", pink: "#f4e7ed", lavender: "#ebe6f6" };

function getSaved(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function readJson(key) {
  try { return JSON.parse(getSaved(key)); } catch { return null; }
}
function remember(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

let localLoadError = "";
function loadLocalWords() {
  try {
    localLoadError = "";
    const words = readJson(localKey);
    return words === null && getSaved(localKey) === null ? [] : readWords(words);
  } catch {
    localLoadError = "本机词条格式异常，原数据已保留。";
    return [];
  }
}
let localBooksError = "";
function loadLocalBooks() {
  try {
    localBooksError = "";
    const stored = getSaved(localBooksKey);
    return stored === null ? [] : readBooks(JSON.parse(stored));
  } catch {
    localBooksError = "本机自建词本格式异常，原数据已保留。";
    return [];
  }
}
const bounded = (value, min, max, fallback) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const savedDisplay = readJson(prefKey) ?? {};
const display = {
  theme: Object.hasOwn(themes, savedDisplay.theme) ? savedDisplay.theme : "light",
  hideEnglish: savedDisplay.hideEnglish === true,
  hideMeaning: savedDisplay.hideMeaning === true,
  englishSize: bounded(savedDisplay.englishSize, 16, 38, 24),
  meaningSize: bounded(savedDisplay.meaningSize, 14, 34, 17),
  weight: bounded(savedDisplay.weight, 400, 700, 500),
  pageMode: ["buttons", "swipe", "scroll"].includes(savedDisplay.pageMode) ? savedDisplay.pageMode : "buttons"
};

const settings = byId("settings");
const editor = byId("editor");
const remove = byId("remove");
const add = byId("add-word");
const search = byId("search");
const list = byId("word-list");
const rows = byId("rows");
const configInput = byId("firebase-config");
const configFile = byId("firebase-config-file");
const configImport = byId("import-firebase-config");
const configExport = byId("export-firebase-config");
const keepLogin = byId("firebase-keep-login");
const cloudForm = byId("cloud-form");
const cloudLogin = byId("cloud-login");
const signIn = byId("sign-in");
const emailInput = byId("email");
const passwordInput = byId("password");
let savedKeepLogin = readJson(keepLoginKey) === true;
keepLogin.checked = savedKeepLogin;
let localWords = loadLocalWords();
let localBooks = loadLocalBooks();
const bookDisplay = readJson(bookDisplayKey) ?? {};
let chosenBookId = typeof bookDisplay.active === "string" ? bookDisplay.active : personalBook.id;
const hiddenBooks = new Set(Array.isArray(bookDisplay.hidden) ? bookDisplay.hidden.filter((id) => typeof id === "string") : []);
const bookMenu = setupBookMenu((id) => {
  chosenBookId = id;
  resetPagination();
  search.value = "";
  saveBookDisplay();
  render();
});
const bookVisibility = byId("book-visibility");
let renderedBooks = "";
let pageIndex = 0;
let loadedPages = 1;
let matchingCount = 0;
let drawnRows;
const sentinel = byId("scroll-sentinel");
const notebook = list.closest(".notebook");
const pageModes = [...document.querySelectorAll('input[name="page-mode"]')];
const examRequests = new Map();
let connection;
let selectedConfig;
let cloud = null;
let refreshPractice;
let connecting = false;
let working = false;
let editing;
let deleting;

function icon(name) {
  const namespace = "http://www.w3.org/2000/svg";
  const element = document.createElementNS(namespace, "svg");
  const use = document.createElementNS(namespace, "use");
  element.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#icon-" + name);
  element.append(use);
  return element;
}

for (const [id, label] of Object.entries(themes)) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-option";
  button.dataset.themeId = id;
  const swatch = document.createElement("span");
  swatch.className = "swatch " + id;
  swatch.setAttribute("aria-hidden", "true");
  button.append(swatch, label);
  button.addEventListener("click", () => {
    display.theme = id;
    saveDisplay();
  });
  byId("themes").append(button);
}

function applyDisplay() {
  const root = document.documentElement;
  root.dataset.theme = display.theme;
  document.querySelector('meta[name="theme-color"]').content = themeColors[display.theme];
  root.style.setProperty("--english-size", display.englishSize + "px");
  root.style.setProperty("--meaning-size", display.meaningSize + "px");
  root.style.setProperty("--word-weight", display.weight);
  for (const button of byId("themes").children) {
    button.setAttribute("aria-pressed", String(button.dataset.themeId === display.theme));
  }
  list.classList.toggle("hide-english", display.hideEnglish);
  list.classList.toggle("hide-meaning", display.hideMeaning);
  list.dataset.pageMode = notebook.dataset.pageMode = display.pageMode;
  for (const input of pageModes) input.checked = input.value === display.pageMode;
  byId("hide-english").checked = display.hideEnglish;
  byId("hide-meaning").checked = display.hideMeaning;
  byId("visibility-note").hidden = !display.hideEnglish || !display.hideMeaning;
  for (const [id, value, unit] of [
    ["english-size", display.englishSize, " px"], ["meaning-size", display.meaningSize, " px"], ["word-weight", display.weight, ""]
  ]) {
    byId(id).value = value;
    byId(id + "-value").value = value + unit;
  }
}

function saveDisplay() {
  applyDisplay();
  remember(prefKey, display);
}

byId("hide-english").addEventListener("change", (event) => {
  display.hideEnglish = event.target.checked;
  saveDisplay();
  render();
});
byId("hide-meaning").addEventListener("change", (event) => {
  display.hideMeaning = event.target.checked;
  saveDisplay();
  render();
});
for (const [id, key] of [["english-size", "englishSize"], ["meaning-size", "meaningSize"], ["word-weight", "weight"]]) {
  byId(id).addEventListener("input", (event) => {
    display[key] = event.target.valueAsNumber;
    saveDisplay();
  });
}
for (const input of pageModes) input.addEventListener("change", () => {
  if (!input.checked) return;
  display.pageMode = input.value;
  resetPagination();
  saveDisplay();
  render();
});

function feedback(id, message = "") {
  const target = byId(id);
  target.textContent = message;
  target.hidden = !message;
}

function describeError(error) {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/user-not-found":
    case "auth/wrong-password": return "登录失败，请检查该 Firebase 项目的邮箱和密码。";
    case "auth/user-disabled": return "这个 Firebase 账号已被停用。";
    case "auth/operation-not-allowed": return "请在 Firebase Authentication 中启用电子邮件和密码登录。";
    case "auth/invalid-api-key":
    case "auth/app-not-authorized": return "Firebase 配置或 API Key 来源限制有误。";
    case "auth/too-many-requests": return "请求过于频繁，请稍后重试。";
    case "auth/network-request-failed":
    case "unavailable": return "暂时无法连接 Firebase，请检查网络后重试。";
    case "permission-denied": return "Firestore 拒绝访问，请检查数据库规则和登录账号。";
    case "unauthenticated": return "Firebase 会话已失效，请重新登录。";
    case "not-found":
    case "failed-precondition": return "请检查该项目的默认 Cloud Firestore 是否已启用。";
    default: return error?.code ? "Firebase 操作失败，请检查项目配置或稍后重试。"
      : error?.message || "操作失败，请重试。";
  }
}

const personalWords = () => cloud?.words ?? localWords;
const customBooks = () => cloud?.books ?? localBooks;
const books = () => [personalBook, ...examBooks, ...customBooks().map(({ id, name }) => ({ id, name, kind: "custom" }))];
const visibleBooks = () => books().filter(({ id }) => !hiddenBooks.has(id));
const activeBook = () => {
  const visible = visibleBooks();
  return visible.find(({ id }) => id === chosenBookId) ?? visible[0];
};
const bookWords = (book) => {
  if (!book) return [];
  if (book.kind === "exam") return getExamWords(book.id);
  if (book.kind === "personal") return personalWords();
  return customBooks().find(({ id }) => id === book.id)?.words ?? [];
};
const library = () => cloud ? cloud.project + "/" + cloud.uid : "local";
const canWriteCustom = () => !connecting && !working && (cloud ? cloud.booksReady : !localBooksError);
const canWrite = (book = activeBook()) => book?.kind === "custom" ? canWriteCustom()
  : book?.kind === "personal" && !connecting && !working && (cloud ? cloud.ready : !localLoadError);

function saveBookDisplay() {
  remember(bookDisplayKey, { active: chosenBookId, hidden: [...hiddenBooks] });
}

function loadSelectedExam(book) {
  if (book?.kind !== "exam" || getExamWords(book.id) || examRequests.has(book.id)) return;
  examRequests.set(book.id, { loading: true });
  void loadExamWords(book).then(() => examRequests.delete(book.id))
    .catch((error) => examRequests.set(book.id, { error })).finally(render);
}

function renderBookControls(active) {
  const all = books();
  const signature = JSON.stringify(all.map(({ id, name }) => [id, name, hiddenBooks.has(id)]));
  if (renderedBooks !== signature) {
    renderedBooks = signature;
    const focusedId = document.activeElement?.dataset.bookId;
    bookVisibility.replaceChildren(...all.map((book) => {
      const label = document.createElement("label");
      label.className = "setting-row book-visibility-row";
      const name = document.createElement("span");
      name.textContent = book.name;
      if (book.kind === "exam") {
        const detail = document.createElement("small");
        detail.textContent = " · " + book.count.toLocaleString("zh-CN") + " 词";
        name.append(detail);
      }
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.className = "toggle";
      toggle.dataset.bookId = book.id;
      toggle.checked = !hiddenBooks.has(book.id);
      toggle.setAttribute("aria-label", "显示" + book.name);
      label.append(name, toggle);
      return label;
    }));
    if (focusedId) [...bookVisibility.querySelectorAll("input")].find((input) => input.dataset.bookId === focusedId)?.focus();
  }
  bookMenu.update(all.filter(({ id }) => !hiddenBooks.has(id)), active);
  byId("create-book").disabled = !canWriteCustom();
  feedback("books-sync-message", cloud?.booksError?.code === "permission-denied"
    ? "让自建词本参与云端同步，请发布新版 Firestore 安全规则，再重新登录。"
    : cloud?.booksError ? describeError(cloud.booksError)
      : cloud && !cloud.booksReady ? "正在读取云端自建词本…" : cloud ? "" : localBooksError);
}

function wordRow(entry, book) {
  const row = document.createElement("li");
  row.className = "word-row word-grid";
  const english = document.createElement("span");
  english.className = "english-col";
  english.lang = "en";
  english.textContent = entry.Word;
  const meaning = document.createElement("span");
  meaning.className = "meaning-col" + (entry.Meaning ? "" : " muted");
  meaning.textContent = entry.Meaning || "—";
  row.append(english, meaning);
  if (book.kind === "exam") return row;
  const actions = document.createElement("span");
  actions.className = "row-actions";
  for (const [id, name, glyph, open] of [
    ["edit", "编辑词条", "pencil", openEditor], ["delete", "删除词条", "trash", openRemove]
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button";
    button.dataset.action = id;
    button.title = name;
    button.setAttribute("aria-label", name + " " + entry.Word);
    button.disabled = !canWrite(book);
    button.append(icon(glyph));
    button.addEventListener("click", () => open(entry));
    actions.append(button);
  }
  row.addEventListener("contextmenu", (event) => {
    if (!canWrite() || event.target.closest("button")) return;
    event.preventDefault();
    openEditor(entry);
  });
  row.append(actions);
  return row;
}

function render() {
  const terms = search.value.trim().toLowerCase();
  byId("search-button").dataset.filtered = String(!!terms);
  const book = activeBook();
  loadSelectedExam(book);
  renderBookControls(book);
  const words = bookWords(book) ?? [];
  const exam = book?.kind === "exam";
  const packRequest = exam ? examRequests.get(book.id) : null;
  const waiting = book && (exam ? !getExamWords(book.id) : cloud &&
    !(book.kind === "personal" ? cloud.ready : cloud.booksReady));
  list.classList.toggle("read-only", !!exam);
  const allHidden = display.hideEnglish && display.hideMeaning;
  const matches = allHidden ? [] : terms ? words.filter((entry) =>
    entry.Word.toLowerCase().includes(terms) || entry.Meaning.toLowerCase().includes(terms)) : words;
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  matchingCount = matches.length;
  const infinite = display.pageMode === "scroll";
  pageIndex = Math.min(pageIndex, pages - 1);
  loadedPages = Math.min(loadedPages, pages);
  const start = infinite ? 0 : pageIndex * pageSize;
  const end = infinite ? Math.min(matches.length, loadedPages * pageSize) : Math.min(matches.length, start + pageSize);
  const write = canWrite(book);
  const key = [book?.id, terms, infinite, allHidden, write, start].join("|");
  if (drawnRows?.key === key && drawnRows.words === words && drawnRows.end <= end) {
    rows.append(...matches.slice(drawnRows.end, end).map((entry) => wordRow(entry, book)));
  } else {
    rows.replaceChildren(...matches.slice(start, end).map((entry) => wordRow(entry, book)));
  }
  drawnRows = { key, words, end };
  sentinel.hidden = !infinite || end >= matches.length;
  const visibleCount = end - start;
  byId("list-context").textContent = !book || waiting || allHidden ? "" : pages > 1
    ? (infinite ? end + " / " + matches.length : (start + 1) + "–" + end + " / " + matches.length)
    : matches.length + (terms ? " 条结果" : " 个词条");
  byId("pagination").hidden = pages <= 1;
  updatePageButtons();
  byId("empty").hidden = visibleCount > 0;
  byId("retry-book").hidden = !packRequest?.error;
  byId("empty-text").textContent = !book ? "在设置的「词本」中选择要显示的词本。"
    : allHidden ? "英文和中文均已隐藏，可在设置中恢复显示。"
    : waiting ? (packRequest?.error ? packRequest.error.message
      : cloud && !exam && (book.kind === "personal" ? cloud.error : cloud.booksError)
        ? "云端词条暂不可用" : exam ? "正在载入词本…" : "正在读取云端词条…")
      : terms ? "未找到匹配的词条" : "暂无词条";
  add.disabled = !canWrite(book) || words.length >= wordLimit;
  add.title = exam ? "在个人或自建词本中添加单词"
    : words.length >= wordLimit ? `已达到 ${wordLimit} 条上限` : "添加单词";
  const syncLabel = cloud?.error ? "连接异常" : cloud?.ready ? "已同步" : cloud || connecting ? "正在连接" : "仅本机";
  byId("cloud-text").textContent = syncLabel;
  const cloudButton = byId("cloud-button");
  cloudButton.dataset.online = String(cloud?.ready === true);
  cloudButton.setAttribute("aria-label", "Firebase 同步设置 · " + syncLabel);
  cloudButton.title = syncLabel;
  feedback("sync-problem", cloud?.error ? describeError(cloud.error) : cloud ? "" : localLoadError);
  byId("account").hidden = !cloud;
  byId("account-email").textContent = cloud?.email ?? "";
  byId("account-project").textContent = cloud?.project ?? "";
  byId("cloud-config-editor").hidden = !!cloud;
  configImport.hidden = !!cloud;
  configImport.disabled = configExport.disabled = keepLogin.disabled = connecting;
  if (cloud) cloudForm.remove();
  else if (cloudForm.parentNode !== cloudLogin) cloudLogin.append(cloudForm);
  signIn.disabled = connecting;
  byId("sign-out").disabled = connecting || working;
  const remoteWords = personalWords();
  byId("merge-local").hidden = !cloud?.ready || !localWords.some((entry) =>
    !remoteWords.some((remote) => remote.Word.trim().toLowerCase() === entry.Word.trim().toLowerCase()));
  byId("merge-local").disabled = !canWrite(personalBook);
  byId("merge-local-books").hidden = !cloud?.booksReady || localBooks.length === 0;
  byId("merge-local-books").disabled = !canWriteCustom();
  refreshPractice?.();
}

function openSettings(tab) {
  for (const panel of ["display", "books", "cloud"]) {
    byId(panel + "-tab").setAttribute("aria-pressed", String(panel === tab));
    byId(panel + "-panel").hidden = panel !== tab;
  }
  if (!settings.open) settings.showModal();
}

byId("settings-button").addEventListener("click", () => openSettings("display"));
byId("cloud-button").addEventListener("click", () => openSettings("cloud"));
byId("display-tab").addEventListener("click", () => openSettings("display"));
byId("books-tab").addEventListener("click", () => openSettings("books"));
byId("cloud-tab").addEventListener("click", () => openSettings("cloud"));
const searchTrigger = byId("search-button");
const searchPanel = byId("search-panel");
function toggleSearch(open, restoreFocus = false) {
  searchPanel.hidden = !open;
  searchTrigger.setAttribute("aria-expanded", String(open));
  if (open) { search.focus(); search.select(); }
  else if (restoreFocus) searchTrigger.focus();
}
searchTrigger.addEventListener("click", () => toggleSearch(searchPanel.hidden));
search.addEventListener("input", () => { resetPagination(); render(); });
searchPanel.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { event.preventDefault(); toggleSearch(false, true); }
  else if (event.key === "Enter" && event.target === search) { event.preventDefault(); toggleSearch(false, true); }
});
byId("clear-search").addEventListener("click", () => {
  search.value = "";
  resetPagination();
  render();
  toggleSearch(false, true);
});
document.addEventListener("pointerdown", (event) => {
  if (!searchPanel.hidden && !searchPanel.contains(event.target) && !searchTrigger.contains(event.target)) toggleSearch(false);
});
bookVisibility.addEventListener("change", (event) => {
  const id = event.target.dataset.bookId;
  if (!id) return;
  if (event.target.checked) hiddenBooks.delete(id);
  else hiddenBooks.add(id);
  resetPagination();
  saveBookDisplay();
  render();
});
function resetPagination() { pageIndex = 0; loadedPages = 1; }

function scrollPageIndex() {
  const top = notebook.querySelector(".bookbar").getBoundingClientRect().bottom + 8;
  let first = 0;
  let end = rows.children.length;
  while (first < end) {
    const middle = (first + end) >>> 1;
    if (rows.children[middle].getBoundingClientRect().bottom < top) first = middle + 1;
    else end = middle;
  }
  return Math.floor(Math.min(first, Math.max(0, rows.children.length - 1)) / pageSize);
}

function updatePageButtons() {
  const position = display.pageMode === "scroll" ? scrollPageIndex() : pageIndex;
  byId("prev-page").disabled = position === 0;
  byId("next-page").disabled = (position + 1) * pageSize >= matchingCount;
}

function turnPage(delta) {
  const last = Math.max(0, Math.ceil(matchingCount / pageSize) - 1);
  const current = display.pageMode === "scroll" ? scrollPageIndex() : pageIndex;
  const target = Math.max(0, Math.min(last, current + delta));
  if (target === current) return;
  if (display.pageMode === "scroll") {
    if (loadedPages < target + 1) { loadedPages = target + 1; render(); }
    rows.children[target * pageSize]?.scrollIntoView({ block: "start" });
    updatePageButtons();
  } else {
    pageIndex = target;
    render();
    if (notebook.getBoundingClientRect().top < 0) notebook.scrollIntoView({ block: "start" });
  }
}

byId("prev-page").addEventListener("click", () => turnPage(-1));
byId("next-page").addEventListener("click", () => turnPage(1));
const moreRows = new IntersectionObserver((entries) => {
  if (!sentinel.hidden && entries.some((entry) => entry.isIntersecting)) { loadedPages++; render(); }
}, { rootMargin: "280px 0px" });
moreRows.observe(sentinel);
let pendingPageUpdate = false;
window.addEventListener("scroll", () => {
  if (display.pageMode !== "scroll" || pendingPageUpdate) return;
  pendingPageUpdate = true;
  requestAnimationFrame(() => { pendingPageUpdate = false; updatePageButtons(); });
}, { passive: true });
let touch;
list.addEventListener("pointerdown", (event) => {
  if (display.pageMode !== "swipe" || event.pointerType === "mouse" || !event.isPrimary) return;
  touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
list.addEventListener("pointercancel", () => { touch = null; });
list.addEventListener("pointerup", (event) => {
  if (touch?.id !== event.pointerId) return;
  const dx = event.clientX - touch.x;
  const dy = event.clientY - touch.y;
  touch = null;
  if (display.pageMode === "swipe" && Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.4) turnPage(dx < 0 ? 1 : -1);
});
let wheelOffset = 0, wheelAt = 0, wheelTurn = -Infinity;
list.addEventListener("wheel", (event) => {
  if (display.pageMode !== "swipe" || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
  event.preventDefault();
  const now = performance.now();
  if (now - wheelAt > 160) wheelOffset = 0;
  wheelAt = now;
  if (now - wheelTurn < 360) return;
  wheelOffset += event.deltaX * (event.deltaMode === 0 ? 1 : 24);
  if (Math.abs(wheelOffset) < 55) return;
  turnPage(wheelOffset > 0 ? 1 : -1);
  wheelTurn = now;
  wheelOffset = 0;
}, { passive: false });
byId("retry-book").addEventListener("click", () => {
  examRequests.delete(activeBook()?.id);
  render();
});

function openEditor(entry = null) {
  if (!canWrite()) return;
  editing = { entry, library: library(), bookId: activeBook().id };
  byId("editor-title").textContent = entry ? "编辑单词" : "添加单词";
  byId("word").value = entry?.Word ?? "";
  byId("meaning").value = entry?.Meaning ?? "";
  feedback("editor-error");
  editor.showModal();
  byId("word").focus();
  if (entry) byId("word").select();
}

function openRemove(entry) {
  if (!canWrite()) return;
  deleting = { entry, library: library(), bookId: activeBook().id };
  byId("remove-prompt").textContent = "确定删除「" + entry.Word + "」？";
  feedback("remove-error");
  remove.showModal();
}

let noticeTimer;
function notify(message) {
  const notice = byId("notice");
  clearTimeout(noticeTimer);
  notice.textContent = message;
  noticeTimer = setTimeout(() => { notice.textContent = ""; }, 2400);
}

async function storeBooksChange(change, target) {
  if (library() !== target) throw new Error("当前账号已切换，请重试。");
  if (cloud) {
    if (!cloud.booksReady) throw new Error("云端自建词本尚未连接，请稍后重试。");
    await connection.saveBooks(change);
  } else {
    localBooks = loadLocalBooks();
    if (localBooksError) throw new Error(localBooksError);
    const next = changeBooks(localBooks, change);
    encodeBooks(next);
    if (!remember(localBooksKey, next)) throw new Error("浏览器无法保存本机词本。");
    localBooks = next;
  }
}

async function storeChange(change, target, bookId) {
  if (library() !== target) throw new Error("当前单词本已切换，请重新打开词条。");
  if (bookId !== personalBook.id) {
    await storeBooksChange({ type: "word", id: bookId, change }, target);
    return;
  }
  if (cloud) {
    if (!cloud.ready) throw new Error("云端尚未连接，请稍后重试。");
    await connection.save(change);
  } else {
    localWords = loadLocalWords();
    if (localLoadError) throw new Error(localLoadError);
    const next = changeWords(localWords, change);
    if (!remember(localKey, next)) throw new Error("浏览器无法保存本机词条。");
    localWords = next;
  }
}

async function finishEdit(change, draft, dialog, button, errorId, success) {
  if (working) return;
  working = true;
  button.disabled = true;
  render();
  feedback(errorId);
  try {
    await storeChange(change, draft.library, draft.bookId);
    dialog.close();
    if (change.type === "add") {
      search.value = "";
      pageIndex = Math.floor((bookWords(activeBook())?.length ?? 0) / pageSize);
      if (display.pageMode === "scroll") loadedPages = Math.max(loadedPages, pageIndex + 1);
    }
    notify(success);
  } catch (error) {
    feedback(errorId, describeError(error));
  } finally {
    working = false;
    button.disabled = false;
    render();
    if (!dialog.open) add.focus();
  }
}

add.addEventListener("click", () => openEditor());
byId("create-book-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canWriteCustom()) return;
  const input = byId("new-book-name");
  const change = { type: "create", id: "custom-" + crypto.randomUUID(), name: input.value };
  const target = library();
  working = true;
  feedback("books-message");
  render();
  try {
    await storeBooksChange(change, target);
    chosenBookId = change.id;
    resetPagination();
    search.value = "";
    saveBookDisplay();
    input.value = "";
    notify("词本已新建");
  } catch (error) {
    feedback("books-message", describeError(error));
  } finally {
    working = false;
    render();
  }
});
byId("word-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const change = {
    type: editing.entry ? "edit" : "add", before: editing.entry, word: byId("word").value, meaning: byId("meaning").value
  };
  void finishEdit(change, editing, editor, byId("save-word"), "editor-error", "词条已保存");
});
byId("remove-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void finishEdit({ type: "delete", before: deleting.entry }, deleting, remove, byId("remove-word"), "remove-error", "词条已删除");
});
for (const button of document.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => {
    if (!working || button.dataset.close === "settings") byId(button.dataset.close).close();
  });
}
for (const dialog of [editor, remove]) {
  dialog.addEventListener("cancel", (event) => { if (working) event.preventDefault(); });
}
settings.addEventListener("click", (event) => {
  if (event.target !== settings) return;
  const box = settings.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) settings.close();
});

async function startConnection(config) {
  if (connection && JSON.stringify(selectedConfig) === JSON.stringify(config)) return;
  const { createFirebaseConnection } = await import("./firebase.js");
  if (connection) {
    await connection.signOut();
    await connection.dispose();
    connection = null;
  }
  selectedConfig = config;
  connection = createFirebaseConnection(config, (state) => {
    cloud = state;
    feedback("cloud-message", state?.error ? describeError(state.error) : "");
    render();
  }, savedKeepLogin);
  await connection.ready;
}

configImport.addEventListener("click", () => configFile.click());
configFile.addEventListener("change", async () => {
  const [file] = configFile.files;
  configFile.value = "";
  if (!file || connecting || cloud) return;
  try {
    if (file.size > configInput.maxLength) throw new Error("Firebase 配置文件最多 12 KB。");
    const config = parseFirebaseConfig(await file.text());
    if (connecting || cloud) return;
    configInput.value = JSON.stringify(config, null, 2);
    if (!remember(configKey, config)) throw new Error("配置已填入，但浏览器无法保留它。");
    feedback("cloud-message");
    notify("配置已导入，请登录 Firebase");
  } catch (error) {
    feedback("cloud-message", describeError(error));
  }
});

configExport.addEventListener("click", () => {
  try {
    const config = cloud ? selectedConfig : parseFirebaseConfig(configInput.value);
    const file = new Blob([JSON.stringify(config, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mizu-firebase-" + config.projectId + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback("cloud-message");
  } catch (error) {
    feedback("cloud-message", describeError(error));
  }
});

function rememberLoginPreference(keep) {
  savedKeepLogin = keep;
  return remember(keepLoginKey, keep);
}

keepLogin.addEventListener("change", async () => {
  if (!cloud || connecting) return;
  const keep = keepLogin.checked;
  connecting = true;
  render();
  try {
    await connection.setKeepLogin(keep);
    if (!rememberLoginPreference(keep)) throw new Error("浏览器无法保存保持登录的偏好。");
    feedback("cloud-message");
    notify(keep ? "已设置在此设备保持登录" : "登录将只保留在当前标签页");
  } catch (error) {
    keepLogin.checked = savedKeepLogin;
    feedback("cloud-message", describeError(error));
  } finally {
    connecting = false;
    render();
  }
});

cloudForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (connecting) return;
  connecting = true;
  feedback("cloud-message");
  render();
  try {
    const config = parseFirebaseConfig(configInput.value);
    await startConnection(config);
    const keep = keepLogin.checked;
    await connection.signIn(emailInput.value.trim(), passwordInput.value, keep);
    configInput.value = JSON.stringify(config, null, 2);
    passwordInput.value = "";
    const configSaved = remember(configKey, config);
    const preferenceSaved = rememberLoginPreference(keep);
    if (!configSaved || !preferenceSaved)
      feedback("cloud-message", "已登录，但浏览器无法保留配置或登录偏好。");
  } catch (error) {
    feedback("cloud-message", describeError(error));
  } finally {
    connecting = false;
    render();
  }
});
byId("sign-out").addEventListener("click", async () => {
  if (connecting || working) return;
  connecting = true;
  render();
  try {
    await connection.signOut();
    notify("已退出 Firebase，当前显示本机单词本。");
  } catch (error) {
    feedback("cloud-message", describeError(error));
  } finally {
    connecting = false;
    render();
  }
});
byId("merge-local").addEventListener("click", async () => {
  if (!canWrite(personalBook) || !cloud?.ready || localWords.length === 0) return;
  const target = library();
  working = true;
  feedback("cloud-message");
  render();
  try {
    await storeChange({ type: "merge", words: localWords }, target, personalBook.id);
    notify("本机词条已合并，重名词保留云端版本。");
  } catch (error) {
    feedback("cloud-message", describeError(error));
  } finally {
    working = false;
    render();
  }
});
byId("merge-local-books").addEventListener("click", async () => {
  if (!canWriteCustom() || !cloud?.booksReady || localBooks.length === 0) return;
  const target = library();
  working = true;
  feedback("cloud-message");
  render();
  try {
    await storeBooksChange({ type: "merge", books: localBooks }, target);
    notify("本机自建词本已合并");
  } catch (error) {
    feedback("cloud-message", describeError(error));
  } finally {
    working = false;
    render();
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === localKey || event.key === null) {
    localWords = loadLocalWords();
    render();
  }
  if (event.key === localBooksKey || event.key === null) {
    localBooks = loadLocalBooks();
    render();
  }
});

applyDisplay();
setupPoetry();
refreshPractice = setupPractice({
  getBooks: books, activeId: () => activeBook()?.id, library,
  loadWords(book) {
    if (book.kind === "exam") return loadExamWords(book);
    const ready = book.kind === "personal" ? cloud?.ready : cloud?.booksReady;
    const error = book.kind === "personal" ? cloud?.error : cloud?.booksError;
    const words = bookWords(book);
    if (!words.length && (connecting || (cloud && !ready)))
      throw new Error(error ? describeError(error) : "正在读取云端词本，请稍后重试。");
    return words;
  }
});
render();
const savedConfig = getSaved(configKey);
if (savedConfig) {
  try {
    const config = parseFirebaseConfig(savedConfig);
    configInput.value = JSON.stringify(config, null, 2);
    connecting = true;
    render();
    startConnection(config).catch((error) => feedback("cloud-message", describeError(error))).finally(() => {
      connecting = false;
      render();
    });
  } catch (error) {
    feedback("cloud-message", describeError(error));
  }
}
