import { readBooks } from "./books.js";
import { readWords } from "./words.js";

export const cloudAccountKey = "mizu-web:cached-account";
const stores = ["words", "books"];
let opening;

function storage(keep) {
  return keep ? localStorage : sessionStorage;
}

export function sameCloudAccount(a, b) {
  return !!a && !!b && a.project === b.project && a.uid === b.uid;
}

export function cachedAccount(project, keep) {
  try {
    const account = JSON.parse(storage(keep).getItem(cloudAccountKey));
    if (account?.project === project && typeof account.uid === "string" && account.uid &&
        typeof account.email === "string") return account;
  } catch {}
  return null;
}

export function forgetCachedAccount(account) {
  for (const keep of [true, false]) {
    try {
      if (sameCloudAccount(account, cachedAccount(account.project, keep))) storage(keep).removeItem(cloudAccountKey);
    } catch {}
  }
}

export function rememberCloudAccount(account, keep) {
  try {
    const value = JSON.stringify({ project: account.project, uid: account.uid, email: account.email ?? "" });
    const target = storage(keep);
    if (target.getItem(cloudAccountKey) !== value) target.setItem(cloudAccountKey, value);
    if (sameCloudAccount(account, cachedAccount(account.project, !keep))) storage(!keep).removeItem(cloudAccountKey);
  } catch {}
}

function openCache() {
  opening ??= new Promise((resolve) => {
    const request = indexedDB.open("mizu-web-cloud-words", 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      for (const store of stores) request.result.createObjectStore(store);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => { blocked = true; resolve(null); };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onclose = () => { opening = undefined; };
      db.onversionchange = () => { db.close(); opening = undefined; };
      resolve(db);
    };
  }).catch(() => null);
  return opening;
}

async function useCache(account, kind, action, value) {
  try {
    const db = await openCache();
    if (!db) return undefined;
    const key = [account.project, account.uid];
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(kind, action === "get" ? "readonly" : "readwrite");
      const store = tx.objectStore(kind);
      const request = action === "put" ? store.put(value, key) : store[action](key);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  } catch { return undefined; }
}

export async function loadCloudCache(account) {
  const [words, books] = await Promise.all(stores.map((kind) => useCache(account, kind, "get")));
  let cachedWords, cachedBooks;
  try { if (words !== undefined) cachedWords = readWords(words); } catch {}
  try { if (books !== undefined) cachedBooks = readBooks(books); } catch {}
  return { words: cachedWords, books: cachedBooks };
}

export const cacheCloudWords = (account, kind, words) => useCache(account, kind, "put", words);
export const clearCloudWords = (account, kind) => useCache(account, kind, "delete");
