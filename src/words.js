export const wordLimit = 1500;
const maxBytes = 1_000_000;
const normalize = (value) => value.trim().toLowerCase();

export function readWords(value) {
  if (!Array.isArray(value) || value.length > wordLimit || value.some((entry) =>
    typeof entry?.Word !== "string" || !entry.Word.trim() || entry.Word.length > 80 ||
    typeof entry?.Meaning !== "string" || entry.Meaning.length > 200)) {
    throw new Error("云端词条格式不受支持。");
  }
  return value;
}

export function changeWords(words, change) {
  const result = [...words];
  if (change.type === "merge") {
    const known = new Set(result.map((entry) => normalize(entry.Word)));
    for (const entry of readWords(change.words)) {
      const key = normalize(entry.Word);
      if (known.has(key)) continue;
      result.push({ Word: entry.Word, Meaning: entry.Meaning });
      known.add(key);
    }
    if (result.length > wordLimit) throw new Error(`合并后会超过 ${wordLimit} 条，云端词条未更改。`);
    return result;
  }

  const updating = change.type === "edit" || change.type === "delete";
  const index = updating ? result.findIndex((entry) =>
    entry.Word === change.before.Word && entry.Meaning === change.before.Meaning) : -1;
  if (updating && index < 0) throw new Error("这条单词已在其他位置更新，请重新打开后再操作。");
  if (change.type === "delete") {
    result.splice(index, 1);
    return result;
  }

  const Word = change.word.trim();
  const Meaning = change.meaning.trim();
  if (!Word) throw new Error("请输入英文。");
  if (Word.length > 80 || Meaning.length > 200) throw new Error("英文最多 80 个字符，释义最多 200 个字符。");
  if (result.some((entry, i) => i !== index && normalize(entry.Word) === normalize(Word))) {
    throw new Error("这个单词已存在。");
  }
  if (index >= 0) result[index] = { ...result[index], Word, Meaning };
  else {
    if (result.length >= wordLimit) throw new Error(`单词本最多保存 ${wordLimit} 条。`);
    result.push({ Word, Meaning });
  }
  return result;
}

export function newSnapshot() {
  return {
    Appearance: {
      Theme: "light", Scale: 1, GlassOpacity: .62, CornerRadius: 30, TextScale: 1,
      TextWeight: 400, CompactMode: false, SmoothResize: true
    },
    Display: {
      Order: [8, 0, 1, 2, 9, 3, 4, 5, 7, 6], Visible: [0, 1, 7], TodoRows: 4,
      HideCompletedTodos: true, WordRows: 1, WordColumns: 1, WordSpacing: 8, MeaningFontSize: 12,
      HideMeaning: false, RandomWords: false, WordMinutes: 1
    },
    Todos: [],
    Words: []
  };
}

export function decodeSnapshot(bytes) {
  try {
    if (bytes.byteLength > maxBytes) throw new Error();
    const snapshot = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!snapshot?.Appearance || !snapshot.Display || !Array.isArray(snapshot.Todos)) throw new Error();
    readWords(snapshot.Words);
    return snapshot;
  } catch {
    throw new Error("云端备份格式不受支持，暂时无法修改。");
  }
}

export function encodeSnapshot(snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  if (bytes.byteLength > maxBytes) throw new Error("备份已超过 Firebase 同步容量。");
  return bytes;
}

export function parseFirebaseConfig(text) {
  let data;
  const value = text.trim();
  if (value.length > 12000 || /private_key|-----BEGIN/i.test(value)) {
    throw new Error("请粘贴网页应用的 firebaseConfig。");
  }
  try {
    data = JSON.parse(value);
  } catch {
    const field = (key) => {
      const match = value.match(new RegExp("(?:^|[{,\\s])[\"']?" + key + "[\"']?\\s*:\\s*(?:\"([^\"]*)\"|'([^']*)')"));
      return match?.[1] ?? match?.[2];
    };
    data = { projectId: field("projectId"), apiKey: field("apiKey"), appId: field("appId") };
  }

  const { projectId, apiKey, appId } = data ?? {};
  if (typeof projectId !== "string" || !/^[a-z][a-z0-9-]{2,59}$/.test(projectId) ||
    typeof apiKey !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(apiKey)) {
    throw new Error("配置缺少有效的 projectId 或 apiKey。");
  }
  const config = { apiKey, projectId };
  if (typeof appId === "string" && /^[A-Za-z0-9:-]{1,100}$/.test(appId)) config.appId = appId;
  return config;
}
