import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeCards } from "../src/practice.js";

const entry = (Word, Meaning) => ({ Word, Meaning });
const words = [
  entry("lucid", "清晰的"), entry("radiant", "发光的"),
  entry("glimmer", "微光"), entry("steady", "稳定的"),
  entry("calm", "  安静  "), entry("quiet", "安静"),
  entry("LUCID ", "清楚的"), entry("draft", " ")
];

test("自测跳过无释义词条，同一轮不重复抽词", () => {
  const input = Array.from({ length: 13 }, (_, i) => entry("word" + i, "释义" + i));
  const { cards } = createPracticeCards(input, "self", () => 0);
  assert.equal(cards.length, 10);
  assert.equal(new Set(cards.map((card) => card.word)).size, 10);
  assert.notEqual(cards[0].word, input[0].Word);
  assert.equal(input[0].Word, "word0");
  assert.deepEqual(createPracticeCards([entry("blank", " ")], "self"), { cards: [], reason: "empty" });
  assert.equal(createPracticeCards(words, "self").cards.length, 6);
});

test("四选一提供四个不同释义和唯一正确答案", () => {
  const { cards } = createPracticeCards(words, "choice", () => .47);
  for (const card of cards) {
    assert.equal(new Set(card.options).size, 4);
    assert.equal(card.options.filter((answer) => answer === card.answer).length, 1);
  }
  assert.deepEqual(createPracticeCards(words.slice(4), "choice"), { cards: [], reason: "choices" });
});

test("题数可调整，无限练习每轮用完词本后避免紧接着抽到同一词", () => {
  assert.equal(createPracticeCards(words, "self", () => 0, { limit: 2 }).cards.length, 2);
  const { cards } = createPracticeCards(words, "choice", () => 0, { limit: Infinity });
  assert.equal(cards.length, 6);
  assert.ok(cards.every((card) => new Set(card.options).size === 4 && card.options.includes(card.answer)));
  const previousWord = cards[0].word;
  const repeat = createPracticeCards(words, "choice", () => 0, { limit: Infinity, previousWord });
  assert.notEqual(repeat.cards[0].word, previousWord);
  assert.deepEqual(new Set(repeat.cards.map(({ word }) => word)), new Set(cards.map(({ word }) => word)));
});
