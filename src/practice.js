const roundSize = 10;

export const practiceWordKey = (text) => text.trim().replace(/\s+/g, " ").toLowerCase();

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createOptions(entry, meanings, correctIndex, random) {
  const excluded = [correctIndex];
  const options = [entry.answer];
  while (options.length < 4) {
    let index = Math.floor(random() * (meanings.length - excluded.length));
    for (const skip of excluded) {
      if (index >= skip) index++;
    }
    options.push(meanings[index]);
    excluded.push(index);
    excluded.sort((a, b) => a - b);
  }
  return shuffled(options, random);
}

export function createPracticeCards(words, mode, random = Math.random, { limit = roundSize, previousWord } = {}) {
  const eligible = new Map();
  for (const { Word, Meaning } of words) {
    const key = practiceWordKey(Word);
    if (!Meaning.trim() || eligible.has(key)) continue;
    eligible.set(key, { word: Word, answer: Meaning.trim() });
  }
  const entries = [...eligible.values()];
  if (entries.length === 0) return { cards: [], reason: "empty" };
  const pool = new Map(entries.map(({ answer }) => [practiceWordKey(answer), answer]));
  if (mode === "choice" && pool.size < 4) return { cards: [], reason: "choices" };

  const deck = shuffled(entries, random);
  if (deck.length > 1 && practiceWordKey(deck[0].word) === practiceWordKey(previousWord ?? "")) {
    [deck[0], deck[1]] = [deck[1], deck[0]];
  }
  const meanings = [...pool.values()];
  const indexes = new Map([...pool.keys()].map((key, index) => [key, index]));
  const cards = deck.slice(0, limit).map((entry) => {
    if (mode === "self") return entry;
    return { ...entry, options: createOptions(entry, meanings, indexes.get(practiceWordKey(entry.answer)), random) };
  });
  return { cards };
}
