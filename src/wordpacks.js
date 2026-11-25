import manifest from "./wordpacks.json";

export const examBooks = manifest.packs.map((book) => ({ ...book, kind: "exam" }));
const pending = new Map();
const loaded = new Map();

export function getExamWords(id) {
  return loaded.get(id);
}

export function loadExamWords(book) {
  if (loaded.has(book.id)) return Promise.resolve(loaded.get(book.id));
  if (pending.has(book.id)) return pending.get(book.id);
  const base = new URL(import.meta.env.BASE_URL, document.baseURI);
  const request = fetch(new URL(book.path, base)).then(async (response) => {
    if (!response.ok) throw new Error("词本下载失败，请重试。");
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== book.count ||
      rows.some((row) => !Array.isArray(row) || typeof row[0] !== "string" || !row[0] || typeof row[1] !== "string")) {
      throw new Error("词本数据不完整，请重试。");
    }
    const words = rows.map(([Word, Meaning]) => ({ Word, Meaning }));
    loaded.set(book.id, words);
    return words;
  }).catch(() => { throw new Error("词本载入失败，请检查网络后重试。"); })
    .finally(() => pending.delete(book.id));
  pending.set(book.id, request);
  return request;
}
