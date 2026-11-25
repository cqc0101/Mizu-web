import { deleteApp, initializeApp } from "firebase/app";
import { browserLocalPersistence, browserSessionPersistence, connectAuthEmulator, initializeAuth, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { Bytes, connectFirestoreEmulator, doc, getFirestore, onSnapshot, runTransaction } from "firebase/firestore";
import { changeWords, decodeSnapshot, encodeSnapshot, newSnapshot } from "./words.js";
import { changeBooks, decodeBooks, encodeBooks } from "./books.js";

function readSnapshot(document) {
  if (!document.exists()) return newSnapshot();
  return decodeSnapshot(readPayload(document));
}

function readCustomBooks(document) {
  return document.exists() ? decodeBooks(readPayload(document)) : [];
}

function readPayload(document) {
  const { schemaVersion, payload } = document.data();
  if (schemaVersion !== 1 || !(payload instanceof Bytes)) throw new Error("云端备份格式不受支持，暂时无法修改。");
  return payload.toUint8Array();
}

const loginPersistence = (keep) => keep ? browserLocalPersistence : browserSessionPersistence;

export function createFirebaseConnection(config, onState, keepLogin = false) {
  const app = initializeApp(config, "mizu-wordbook");
  const auth = initializeAuth(app, { persistence: loginPersistence(keepLogin) });
  const firestore = getFirestore(app);
  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATOR === "1") {
    connectAuthEmulator(auth, "http://127.0.0.1:19099", { disableWarnings: true });
    connectFirestoreEmulator(firestore, "127.0.0.1", 18080);
  }
  let subscriptions = [];
  let active = true;
  const stopDocuments = () => {
    for (const stop of subscriptions) stop();
    subscriptions = [];
  };
  const accountDocument = (collection, user) => doc(firestore, collection, user.uid);
  function watch(reference, read, update) {
    const failed = (error) => update([], false, error);
    return onSnapshot(reference, { includeMetadataChanges: true }, (document) => {
      try { update(read(document), !document.metadata.fromCache, null); }
      catch (error) { failed(error); }
    }, failed);
  }
  const stopAuth = onAuthStateChanged(auth, (user) => {
    if (!active) return;
    stopDocuments();
    if (!user) {
      onState(null);
      return;
    }
    let state = {
      uid: user.uid, email: user.email, project: config.projectId, ready: false, words: [],
      booksReady: false, books: []
    };
    const update = (patch) => {
      if (!active || auth.currentUser?.uid !== user.uid) return;
      state = { ...state, ...patch };
      onState(state);
    };
    update({});
    subscriptions = [
      watch(accountDocument("mizuSync", user), (snapshot) => readSnapshot(snapshot).Words,
        (words, ready, error) => update({ words, ready, error })),
      watch(accountDocument("mizuWebBooks", user), readCustomBooks,
        (books, booksReady, booksError) => update({ books, booksReady, booksError }))
    ];
  });

  return {
    ready: auth.authStateReady(),
    async signIn(email, password, keep) {
      await setPersistence(auth, loginPersistence(keep));
      return signInWithEmailAndPassword(auth, email, password);
    },
    setKeepLogin: (keep) => setPersistence(auth, loginPersistence(keep)),
    signOut: () => signOut(auth),
    save(change) {
      if (!auth.currentUser) throw new Error("请重新登录 Firebase。");
      const reference = accountDocument("mizuSync", auth.currentUser);
      return runTransaction(firestore, async (transaction) => {
        const original = readSnapshot(await transaction.get(reference));
        const updated = { ...original, Words: changeWords(original.Words, change) };
        transaction.set(reference, { schemaVersion: 1, payload: Bytes.fromUint8Array(encodeSnapshot(updated)) });
      });
    },
    saveBooks(change) {
      if (!auth.currentUser) throw new Error("请重新登录 Firebase。");
      const reference = accountDocument("mizuWebBooks", auth.currentUser);
      return runTransaction(firestore, async (transaction) => {
        const books = readCustomBooks(await transaction.get(reference));
        const updated = changeBooks(books, change);
        transaction.set(reference, { schemaVersion: 1, payload: Bytes.fromUint8Array(encodeBooks(updated)) });
        return updated;
      });
    },
    async dispose() {
      active = false;
      stopAuth();
      stopDocuments();
      await deleteApp(app);
    }
  };
}
