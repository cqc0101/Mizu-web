import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        wordbook: fileURLToPath(new URL("./index.html", import.meta.url)),
        games: fileURLToPath(new URL("./games.html", import.meta.url))
      }
    }
  }
});
