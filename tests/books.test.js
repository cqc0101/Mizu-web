import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { changeBooks, decodeBooks, encodeBooks, readBooks } from "../src/books.js";
import { createPracticeCards } from "../src/practice.js";

test("自建词本独立保存和修改，合并时保留已存在的词条", () => {
  const a = { type: "create", id: "custom-a", name: " 会话 " };
  const first = changeBooks([], a);
  const second = changeBooks(first, { type: "create", id: "custom-b", name: "工作" });
  const added = changeBooks(second, { type: "word", id: a.id, change: { type: "add", word: "calm", meaning: "平静的" } });
  assert.deepEqual(second[0].words, []);
  assert.deepEqual(added[1].words, []);
  assert.deepEqual(decodeBooks(encodeBooks(added)), added);
  assert.throws(() => changeBooks(second, { ...a, id: "custom-c" }), /同名/);
  assert.throws(() => changeBooks([], { ...a, name: "gre" }), /同名/);
  const merged = changeBooks(added, {
    type: "merge",
    books: [{ id: "custom-other", name: "会话", words: [{ Word: "CALM", Meaning: "安静" }, { Word: "lucid", Meaning: "清楚" }] }]
  });
  assert.deepEqual(merged[0].words, [{ Word: "calm", Meaning: "平静的" }, { Word: "lucid", Meaning: "清楚" }]);
  assert.equal(merged.length, 2);
  assert.throws(() => readBooks([merged[0], merged[0]]), /不受支持/);
});

test("五套词包有可复现内容哈希，全部能够组合出题", () => {
  const manifest = JSON.parse(readFileSync(new URL("../src/wordpacks.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.packs.map(({ id }) => id), ["cet4", "cet6", "ielts", "toefl", "gre"]);
  const words = manifest.packs.flatMap(({ path, count, translated }) => {
    const content = readFileSync(new URL("../public/" + path, import.meta.url));
    assert.ok(path.endsWith(createHash("sha256").update(content).digest("hex").slice(0, 12) + ".json"));
    const rows = JSON.parse(content);
    assert.equal(rows.length, count);
    assert.equal(new Set(rows.map(([word]) => word.toLowerCase())).size, count);
    assert.equal(rows.filter(([, meaning]) => meaning).length, translated);
    return rows.map(([Word, Meaning]) => ({ Word, Meaning }));
  });
  const { cards } = createPracticeCards(words, "choice");
  assert.equal(cards.length, 10);
  assert.ok(cards.every((card) => card.options.length === 4 && card.options.includes(card.answer)));
});
