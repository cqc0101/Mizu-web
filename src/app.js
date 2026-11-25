import "./style.css";
import { changeWords, parseFirebaseConfig, readWords, wordLimit } from "./words.js";
import { setupPractice } from "./practice-ui.js";

const byId = (id) => document.getElementById(id);
const prefKey = "mizu-web:display";
const localKey = "mizu-web:words";
const configKey = "mizu-web:firebase";
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
const bounded = (value, min, max, fallback) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const savedDisplay = readJson(prefKey) ?? {};
const display = {
  theme: Object.hasOwn(themes, savedDisplay.theme) ? savedDisplay.theme : "light",
  hideEnglish: savedDisplay.hideEnglish === true,
  hideMeaning: savedDisplay.hideMeaning === true,
  englishSize: bounded(savedDisplay.englishSize, 16, 38, 24),
  meaningSize: bounded(savedDisplay.meaningSize, 14, 34, 17),
  weight: bounded(savedDisplay.weight, 400, 700, 500)
};

const settings = byId("settings");
const editor = byId("editor");
const remove = byId("remove");
const add = byId("add-word");
const search = byId("search");
const list = byId("word-list");
const rows = byId("rows");
const configInput = byId("firebase-config");
const emailInput = byId("email");
const passwordInput = byId("password");
let localWords = loadLocalWords();
let connection;
let selectedConfig;
let cloud = null;
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

const currentWords = () => cloud?.words ?? localWords;
const library = () => cloud ? cloud.project + "/" + cloud.uid : "local";
const canWrite = () => !connecting && !working && (cloud ? cloud.ready : !localLoadError);

function wordRow(entry) {
  const row = document.createElement("li");
  row.className = "word-row word-grid";
  const english = document.createElement("span");
  english.className = "english-col";
  english.lang = "en";
  english.textContent = entry.Word;
  const meaning = document.createElement("span");
  meaning.className = "meaning-col" + (entry.Meaning ? "" : " muted");
  meaning.textContent = entry.Meaning || "—";
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
    button.disabled = !canWrite();
    button.append(icon(glyph));
    button.addEventListener("click", () => open(entry));
    actions.append(button);
  }
  row.addEventListener("contextmenu", (event) => {
    if (!canWrite() || event.target.closest("button")) return;
    event.preventDefault();
    openEditor(entry);
  });
  row.append(english, meaning, actions);
  return row;
}

function render() {
  const terms = search.value.trim().toLowerCase();
  const words = currentWords();
  const allHidden = display.hideEnglish && display.hideMeaning;
  const visible = allHidden ? [] : words.filter(
    (entry) => !terms || entry.Word.toLowerCase().includes(terms) || entry.Meaning.toLowerCase().includes(terms)
  );
  byId("list-context").textContent = visible.length + (terms ? " 条结果" : " 个词条");
  byId("list-header").hidden = visible.length === 0;
  rows.replaceChildren(...visible.map(wordRow));
  byId("empty").hidden = visible.length > 0;
  byId("empty-text").textContent = allHidden ? "英文和中文均已隐藏，可在设置中恢复显示。"
    : cloud && !cloud.ready ? (cloud.error ? "云端词条暂不可用" : "正在读取云端词条…")
      : terms ? "未找到匹配的词条" : "暂无词条";
  add.disabled = !canWrite() || words.length >= wordLimit;
  byId("practice-button").disabled = connecting || !!(cloud && !cloud.ready && words.length === 0);
  add.title = words.length >= wordLimit ? "已达到 500 条上限" : "添加单词";
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
  byId("cloud-form").hidden = !!cloud;
  byId("sign-in").disabled = connecting;
  byId("sign-out").disabled = connecting || working;
  byId("merge-local").hidden = !cloud?.ready || !localWords.some((entry) =>
    !words.some((remote) => remote.Word.trim().toLowerCase() === entry.Word.trim().toLowerCase()));
  byId("merge-local").disabled = !canWrite();
}

function openSettings(tab) {
  const showCloud = tab === "cloud";
  byId("display-tab").setAttribute("aria-pressed", String(!showCloud));
  byId("cloud-tab").setAttribute("aria-pressed", String(showCloud));
  byId("display-panel").hidden = showCloud;
  byId("cloud-panel").hidden = !showCloud;
  if (!settings.open) settings.showModal();
}

byId("settings-button").addEventListener("click", () => openSettings("display"));
byId("cloud-button").addEventListener("click", () => openSettings("cloud"));
byId("display-tab").addEventListener("click", () => openSettings("display"));
byId("cloud-tab").addEventListener("click", () => openSettings("cloud"));
search.addEventListener("input", render);

function openEditor(entry = null) {
  if (!canWrite()) return;
  editing = { entry, library: library() };
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
  deleting = { entry, library: library() };
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

async function storeChange(change, target) {
  if (library() !== target) throw new Error("当前单词本已切换，请重新打开词条。");
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
    await storeChange(change, draft.library);
    dialog.close();
    if (change.type === "add" && search.value) search.value = "";
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
  });
  await connection.ready;
}

byId("cloud-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (connecting) return;
  connecting = true;
  feedback("cloud-message");
  render();
  try {
    const config = parseFirebaseConfig(configInput.value);
    await startConnection(config);
    await connection.signIn(emailInput.value.trim(), passwordInput.value);
    remember(configKey, config);
    configInput.value = JSON.stringify(config, null, 2);
    passwordInput.value = "";
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
  if (!canWrite() || !cloud?.ready || localWords.length === 0) return;
  const target = library();
  working = true;
  feedback("cloud-message");
  render();
  try {
    await storeChange({ type: "merge", words: localWords }, target);
    notify("本机词条已合并，重名词保留云端版本。");
  } catch (error) {
    feedback("cloud-message", describeError(error));
  } finally {
    working = false;
    render();
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === localKey || event.key === null) {
    localLoadError = "";
    localWords = loadLocalWords();
    render();
  }
});

applyDisplay();
setupPractice(currentWords);
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
