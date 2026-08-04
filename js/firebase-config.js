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
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
});

export default firebaseConfig;