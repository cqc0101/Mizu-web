import { createGamesView, isPlainClick } from "./games-ui.js";

export function setupGamesRoute(onReturn) {
  const opener = document.getElementById("games-button");
  const container = document.getElementById("games-view");
  const home = [document.querySelector(".wordbook-topbar"), document.getElementById("wordbook-home")];
  const homeTitle = "Mizu · 单词本";
  let view;
  let homeScroll = 0;

  function close() {
    if (history.state?.gamesFromHome) history.back();
    else {
      history.replaceState(null, "", location.pathname + location.search);
      syncRoute();
    }
  }

  function syncRoute() {
    const route = /^#games(?:\/([a-z]+))?$/.exec(location.hash);
    if (route) {
      const entering = container.hidden;
      if (entering) {
        homeScroll = window.scrollY;
        for (const element of home) element.hidden = true;
        container.hidden = false;
        document.title = "Mizu · 游戏";
      }
      view ??= createGamesView(container, (id) => {
        history.replaceState(history.state, "", "#games/" + id);
      }, close);
      view.show(route[1] ?? "slide");
      if (entering) {
        view.focus();
        window.scrollTo(0, 0);
      }
    } else if (!container.hidden) {
      container.hidden = true;
      view.hide();
      if (location.hash !== "#practice") {
        for (const element of home) element.hidden = false;
        document.title = homeTitle;
        onReturn();
        opener.focus({ preventScroll: true });
        window.scrollTo(0, homeScroll);
      } else {
        onReturn();
      }
    }
  }

  opener.addEventListener("click", (event) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    history.pushState({ gamesFromHome: true }, "", "#games");
    syncRoute();
  });
  window.addEventListener("popstate", syncRoute);
  window.addEventListener("hashchange", syncRoute);
  window.addEventListener("pagehide", () => view?.hide());
  window.addEventListener("pageshow", (event) => { if (event.persisted) syncRoute(); });
  syncRoute();
}
