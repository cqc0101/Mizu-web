const roundSize = 10;

const key = (text) => text.trim().replace(/\s+/g, " ").toLowerCase();

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createPracticeCards(words, mode, random = Math.random) {
  const eligible = new Map();
  for (const { Word, Meaning } of words) {
    if (!Meaning.trim() || eligible.has(key(Word))) continue;
    eligible.set(key(Word), { word: Word, answer: Meaning.trim() });
  }
  const entries = [...eligible.values()];
  if (entries.length === 0) return { cards: [], reason: "empty" };
  const pool = new Map(entries.map(({ answer }) => [key(answer), answer]));
  if (mode === "choice" && pool.size < 4) return { cards: [], reason: "choices" };

  const cards = shuffled(entries, random).slice(0, roundSize).map((entry) => {
    if (mode === "self") return entry;
    const others = [...pool].filter(([meaning]) => meaning !== key(entry.answer)).map(([, answer]) => answer);
    const options = shuffled([entry.answer, ...shuffled(others, random).slice(0, 3)], random);
    return { ...entry, options };
  });
  return { cards };
}
