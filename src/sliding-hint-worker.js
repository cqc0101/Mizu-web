import databaseUrl from "./sliding-patterns.bin?url";
import { patternBytes, solveSlidingBoard } from "./sliding-solver.js";

let database;

self.onmessage = async ({ data: board }) => {
  try {
    if (!database) {
      const response = await fetch(databaseUrl);
      if (!response.ok) throw new Error("Pattern database unavailable");
      database = new Uint8Array(await response.arrayBuffer());
      if (database.length !== patternBytes) {
        database = undefined;
        throw new Error("Invalid pattern database");
      }
    }
    self.postMessage(solveSlidingBoard(board, database));
  } catch {
    self.postMessage(null);
  }
};
