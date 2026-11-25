import { changeWords, readWords } from "./words.js";

export const personalBook = { id: "personal", name: "我的单词本", kind: "personal" };
const maxBytes = 1_000_000;
const reserved = new Set([personalBook.name, "四级", "六级", "雅思", "托福", "gre"]);
const nameKey = (name) => name.trim().toLowerCase();

export function readBooks(data) {
  if (!Array.isArray(data)) throw new Error("自建词本格式不受支持。");
  const ids = new Set();
  const names = new Set();
  for (const book of data) {
    if (typeof book?.id !== "string" || !/^custom-[a-z0-9-]{1,64}$/.test(book.id) ||
      typeof book.name !== "string" || !book.name.trim() || book.name.length > 36 ||
      ids.has(book.id) || names.has(nameKey(book.name)) || reserved.has(nameKey(book.name))) {
      throw new Error("自建词本格式不受支持。");
    }
    ids.add(book.id);
    names.add(nameKey(book.name));
    readWords(book.words);
  }
  return data;
}

export function encodeBooks(books) {
  const bytes = new TextEncoder().encode(JSON.stringify(readBooks(books)));
  if (bytes.length > maxBytes) throw new Error("自建词本数据已超过存储容量。");
  return bytes;
}

export function decodeBooks(bytes) {
  try {
    if (bytes.byteLength > maxBytes) throw new Error();
    return readBooks(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)));
  } catch {
    throw new Error("云端自建词本格式不受支持。");
  }
}

export function changeBooks(books, action) {
  const result = [...books];
  if (action.type === "create") {
    const name = action.name.trim();
    if (!name || name.length > 36) throw new Error("请输入 1 至 36 个字符的词本名称。");
    if (reserved.has(nameKey(name)) || books.some((book) => nameKey(book.name) === nameKey(name))) {
      throw new Error("已有同名词本。");
    }
    result.push({ id: action.id, name, words: [] });
  } else if (action.type === "merge") {
    for (const local of readBooks(action.books)) {
      const index = result.findIndex((book) => book.id === local.id || nameKey(book.name) === nameKey(local.name));
      if (index < 0) result.push(local);
      else {
        const remote = result[index];
        result[index] = { ...remote, words: changeWords(remote.words, { type: "merge", words: local.words }) };
      }
    }
  } else {
    const index = result.findIndex((book) => book.id === action.id);
    if (index < 0) throw new Error("该词本暂不可用，请重新选择。");
    const book = result[index];
    result[index] = { ...book, words: changeWords(book.words, action.change) };
  }
  return result;
}
