import "./style.css";
import { createGamesView } from "./games-ui.js";

try {
  const theme = JSON.parse(localStorage.getItem("mizu-web:display"))?.theme;
  if (["light", "dark", "navy", "pink", "lavender"].includes(theme)) document.documentElement.dataset.theme = theme;
} catch {}

const view = createGamesView(document.getElementById("games-view"), (id) => {
  history.replaceState(null, "", "#" + id);
});
const show = () => view.show(location.hash.slice(1));
window.addEventListener("hashchange", show);
window.addEventListener("pagehide", () => view.hide());
window.addEventListener("pageshow", (event) => { if (event.persisted) show(); });
show();
