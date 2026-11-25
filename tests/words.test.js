import test from "node:test";
import assert from "node:assert/strict";
import { changeWords, decodeSnapshot, encodeSnapshot, newSnapshot, parseFirebaseConfig } from "../src/words.js";
import { changeBooks, decodeBooks, encodeBooks } from "../src/books.js";

const serene = { Word: "serene", Meaning: "宁静的" };
const lucid = { Word: "lucid", Meaning: "清晰的" };

test("词条增删改、重名验证和并发修改检查", () => {
  const added = changeWords([serene], { type: "add", word: " lucid ", meaning: " 清晰的 " });
  assert.deepEqual(added, [serene, lucid]);
  assert.throws(() => changeWords(added, { type: "add", word: "LUCID", meaning: "" }), /已存在/);
  const edited = changeWords(added, { type: "edit", before: serene, word: "Serene", meaning: "安详的" });
  assert.deepEqual(edited, [{ Word: "Serene", Meaning: "安详的" }, lucid]);
  assert.throws(() => changeWords(edited, { type: "delete", before: serene }), /其他位置更新/);
  assert.deepEqual(changeWords(edited, { type: "delete", before: lucid }), [edited[0]]);
});

test("修改云端词条时保留桌面设置和待办", () => {
  const existing = newSnapshot();
  existing.Appearance.Theme = "navy";
  existing.Todos = [{ Id: "todo-sample", Text: "保留的待办", Completed: true }];
  const loaded = decodeSnapshot(encodeSnapshot(existing));
  const update = { ...loaded, Words: changeWords(loaded.Words, { type: "merge", words: [serene, { ...serene, Meaning: "不覆盖" }, lucid] }) };
  assert.deepEqual(decodeSnapshot(encodeSnapshot(update)), { ...existing, Words: [serene, lucid] });
  assert.throws(() => decodeSnapshot(new TextEncoder().encode('{"Words":[]}')), /格式不受支持/);
});

test("Firebase 配置接受网页片段和 JSON，拒绝服务账号", () => {
  const config = { projectId: "demo-wordbook", apiKey: "test_example_key" };
  assert.deepEqual(parseFirebaseConfig(JSON.stringify(config)), config);
  assert.deepEqual(parseFirebaseConfig('const firebaseConfig = { apiKey: "test_example_key", projectId: "demo-wordbook" };'), config);
  assert.throws(() => parseFirebaseConfig('{"projectId":"demo-wordbook","private_key":"secret"}'), /网页应用/);
});

test("主词本和自建词本均可保存 1500 条，第 1501 条被拒绝", () => {
  const words = Array.from({ length: 1499 }, (_, index) => ({ Word: `word-${index}`, Meaning: "示例释义" }));
  const change = { type: "add", word: "last", meaning: "最后一条" };
  const full = changeWords(words, change);
  assert.equal(full.length, 1500);
  const snapshot = { ...newSnapshot(), Words: full };
  assert.deepEqual(decodeSnapshot(encodeSnapshot(snapshot)), snapshot);
  assert.throws(() => changeWords(full, { ...change, word: "overflow" }), /1500/);
  assert.throws(() => changeWords(full, { type: "merge", words: [serene] }), /1500/);

  const books = changeBooks([{ id: "custom-test", name: "测试词本", words }], { type: "word", id: "custom-test", change });
  assert.deepEqual(decodeBooks(encodeBooks(books))[0].words, full);
});
