import { createPracticeCards } from "./practice.js";

const modeKey = "mizu-web:practice-mode";
const byId = (id) => document.getElementById(id);

function savedMode() {
  try { return localStorage.getItem(modeKey) === "choice" ? "choice" : "self"; }
  catch { return "self"; }
}

export function setupPractice(getWords) {
  const dialog = byId("practice");
  const modeButtons = [...dialog.querySelectorAll("[data-mode]")];
  const empty = byId("practice-empty");
  const question = byId("practice-question");
  const progress = byId("practice-progress");
  const count = byId("practice-count");
  const word = byId("practice-word");
  const options = byId("practice-options");
  const feedback = byId("practice-feedback");
  const reveal = byId("practice-reveal");
  const forgot = byId("practice-forgot");
  const knew = byId("practice-knew");
  const next = byId("practice-next");
  const finish = byId("practice-finish");
  const result = byId("practice-result");
  const restart = byId("practice-restart");
  let mode = savedMode();
  const rounds = new Map();

  function startRound() {
    const round = { ...createPracticeCards(getWords(), mode), index: 0, score: 0, response: null };
    rounds.set(mode, round);
    return round;
  }

  function grade(correct) {
    const round = rounds.get(mode);
    round.score += Number(correct);
    round.index++;
    round.response = null;
    render();
    (question.hidden ? restart : word).focus();
  }

  function render() {
    for (const button of modeButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    }
    const round = rounds.get(mode) ?? startRound();
    const card = round.cards[round.index];
    const self = mode === "self";
    const answered = round.response !== null;
    empty.hidden = !round.reason;
    question.hidden = !card;
    finish.hidden = !!round.reason || !!card;
    if (round.reason) {
      empty.textContent = round.reason === "empty" ? "先添加带中文释义的单词，就能开始练习。"
        : "四选一需要至少四种不同的释义。可以切换到自测。";
      return;
    }
    if (!card) {
      result.textContent = (self ? "记得 " : "答对 ") + round.score + " / " + round.cards.length + " 题";
      return;
    }

    progress.max = round.cards.length;
    progress.value = round.index + 1;
    count.textContent = (round.index + 1) + " / " + round.cards.length;
    word.textContent = card.word;
    options.hidden = self;
    options.replaceChildren();
    for (const answer of card.options ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary practice-option";
      button.textContent = answer;
      button.disabled = answered;
      if (answered && answer === card.answer) button.dataset.answer = "correct";
      else if (answered && answer === round.response) button.dataset.answer = "incorrect";
      button.addEventListener("click", () => {
        if (round.response !== null) return;
        round.response = answer;
        render();
        next.focus();
      });
      options.append(button);
    }
    feedback.textContent = !answered ? "" : self ? card.answer
      : round.response === card.answer ? "答对了" : "正确释义是「" + card.answer + "」";
    reveal.hidden = !self || answered;
    forgot.hidden = knew.hidden = !self || !answered;
    next.hidden = self || !answered;
    next.textContent = round.index + 1 === round.cards.length ? "查看结果" : "下一题";
  }

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      try { localStorage.setItem(modeKey, mode); } catch {}
      render();
    });
  }
  byId("practice-button").addEventListener("click", () => {
    rounds.clear();
    render();
    dialog.showModal();
    if (!question.hidden) word.focus();
  });
  reveal.addEventListener("click", () => {
    rounds.get(mode).response = true;
    render();
    knew.focus();
  });
  forgot.addEventListener("click", () => grade(false));
  knew.addEventListener("click", () => grade(true));
  next.addEventListener("click", () => {
    const round = rounds.get(mode);
    grade(round.response === round.cards[round.index].answer);
  });
  restart.addEventListener("click", () => {
    startRound();
    render();
    if (!question.hidden) word.focus();
  });
}
