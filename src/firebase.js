import { deleteApp, initializeApp } from "firebase/app";
import { browserSessionPersistence, connectAuthEmulator, initializeAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { Bytes, connectFirestoreEmulator, doc, getFirestore, onSnapshot, runTransaction } from "firebase/firestore";
import { changeWords, decodeSnapshot, encodeSnapshot, newSnapshot } from "./words.js";

function readSnapshot(document) {
  if (!document.exists()) return newSnapshot();
  const { schemaVersion, payload } = document.data();
  if (schemaVersion !== 1 || !(payload instanceof Bytes)) throw new Error("云端备份格式不受支持，暂时无法修改。");
  return decodeSnapshot(payload.toUint8Array());
}

export function createFirebaseConnection(config, onState) {
  const app = initializeApp(config, "mizu-wordbook");
  const auth = initializeAuth(app, { persistence: browserSessionPersistence });
  const firestore = getFirestore(app);
  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATOR === "1") {
    connectAuthEmulator(auth, "http://127.0.0.1:19099", { disableWarnings: true });
    connectFirestoreEmulator(firestore, "127.0.0.1", 18080);
  }
  let stopDocument = () => {};
  let active = true;
  const wordDocument = (user) => doc(firestore, "mizuSync", user.uid);
  const stopAuth = onAuthStateChanged(auth, (user) => {
    if (!active) return;
    stopDocument();
    if (!user) {
      onState(null);
      return;
    }
    const update = (state) => {
      if (active && auth.currentUser?.uid === user.uid) onState({ uid: user.uid, email: user.email, project: config.projectId, ...state });
    };
    update({ ready: false, words: [] });
    stopDocument = onSnapshot(wordDocument(user), { includeMetadataChanges: true }, (document) => {
      try {
        update({ ready: !document.metadata.fromCache, words: readSnapshot(document).Words });
      } catch (error) {
        update({ ready: false, words: [], error });
      }
    }, (error) => update({ ready: false, words: [], error }));
  });

  return {
    ready: auth.authStateReady(),
    signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
    signOut: () => signOut(auth),
    save(change) {
      if (!auth.currentUser) throw new Error("请重新登录 Firebase。");
      const reference = wordDocument(auth.currentUser);
      return runTransaction(firestore, async (transaction) => {
        const original = readSnapshot(await transaction.get(reference));
        const updated = { ...original, Words: changeWords(original.Words, change) };
        transaction.set(reference, { schemaVersion: 1, payload: Bytes.fromUint8Array(encodeSnapshot(updated)) });
      });
    },
    async dispose() {
      active = false;
      stopAuth();
      stopDocument();
      await deleteApp(app);
    }
  };
}
