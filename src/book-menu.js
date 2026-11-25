export function setupBookMenu(onChoose) {
  const trigger = document.getElementById("book-select");
  const name = document.getElementById("book-name");
  const menu = document.getElementById("book-menu");
  let signature;

  function close(restoreFocus = false) {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus();
  }

  function open(last = false) {
    if (trigger.disabled) return;
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const entries = [...menu.children];
    const option = last ? entries.at(-1) : entries.find((entry) => entry.getAttribute("aria-checked") === "true") ?? entries[0];
    option?.focus();
  }

  trigger.addEventListener("click", () => { if (menu.hidden) open(); else close(); });
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    open(event.key === "ArrowUp");
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { close(true); event.preventDefault(); return; }
    if (event.key === "Tab") { close(true); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const entries = [...menu.children];
    const current = entries.indexOf(document.activeElement);
    const target = event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1
      : (current + entries.length + (event.key === "ArrowDown" ? 1 : -1)) % entries.length;
    entries[target]?.focus();
    event.preventDefault();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !menu.parentElement.contains(event.target)) close();
  });

  return {
    update(books, active) {
      const next = JSON.stringify(books.map(({ id, name }) => [id, name]));
      let focusId;
      if (next !== signature) {
        signature = next;
        if (!menu.hidden && menu.contains(document.activeElement)) focusId = document.activeElement.dataset.id;
        menu.replaceChildren(...books.map((book) => {
          const option = document.createElement("button");
          option.type = "button";
          option.className = "book-option";
          option.tabIndex = -1;
          option.dataset.id = book.id;
          option.setAttribute("role", "menuitemradio");
          const title = document.createElement("span");
          title.textContent = book.name;
          const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          const path = document.createElementNS(icon.namespaceURI, "path");
          icon.setAttribute("viewBox", "0 0 24 24");
          icon.setAttribute("aria-hidden", "true");
          path.setAttribute("d", "m5 12 4 4 10-10");
          icon.append(path);
          option.append(title, icon);
          option.addEventListener("click", () => { close(true); onChoose(book.id); });
          return option;
        }));
      }
      trigger.disabled = books.length === 0;
      name.textContent = active?.name ?? "无可见词本";
      trigger.dataset.book = active?.id ?? "";
      trigger.setAttribute("aria-label", "当前词本 · " + name.textContent);
      for (const option of menu.children) option.setAttribute("aria-checked", String(option.dataset.id === active?.id));
      if (!menu.hidden && books.length === 0) close(true);
      else if (focusId) {
        const option = [...menu.children].find((item) => item.dataset.id === focusId)
          ?? [...menu.children].find((item) => item.dataset.id === active?.id) ?? menu.firstElementChild;
        option?.focus();
      }
    }
  };
}
