// ============================================================
// firebase-config.js
// Firebaseプロジェクトの接続情報。
//
// Firebaseコンソール（プロジェクト設定 → 全般 →「アプリを追加」→
// Web ("</>") アイコン）で新しいWebアプリを登録すると表示される
// firebaseConfig の値に、必ず書き換えてから使用すること。
//
// この値自体は秘密情報ではない（Firebaseの公開クライアント設定は
// 公開されても安全なように設計されている。実際のアクセス制御は
// Firestore/Storageのセキュリティルール側で行う）が、正しい値で
// なければFirebaseへ接続できない。
// ============================================================

const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyAnOD_OGuGfHO68psK_UYSTIMeFcHZCtDQ',
  authDomain: 'apptest-6752c.firebaseapp.com',
  projectId: 'apptest-6752c',
  storageBucket: 'apptest-6752c.firebasestorage.app',
  messagingSenderId: '251875277279',
  appId: '1:251875277279:web:b44bf7ccf1d33c6cd06c6a',
});

export default firebaseConfig;