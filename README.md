# Calculator 0209

iPhone専用のPWA電卓アプリです。HTML / CSS / JavaScript（フレームワーク不使用）のみで作られており、Safariから「ホーム画面に追加」することでネイティブアプリのように使用できます。

## 主な機能

- 四則演算・％・±・小数点・連続計算
- 小数誤差（0.1 + 0.2 問題）を補正した計算ロジック
- 計算履歴の表示・保存（最大100件、端末内のlocalStorageに保存）
- 桁区切り表示、長い数字への自動対応
- 5種類のテーマ（ダーク／ミッドナイト／ブルー／パープル／ゴールド）
- タップ音・バイブレーションのON/OFF
- 生体認証（Face ID / Touch ID）によるアプリロック（Passkey / WebAuthn）
- オフライン動作（Service Worker）
- Dynamic Island・ノッチ・Safe Areaへの対応

## 技術構成

- プレーンなHTML / CSS / JavaScript（ビルドツール不使用）
- JavaScriptはES Modules構成（`js/app.js`のみを`<script type="module">`で読み込み、他は`import`で連結）
- 状態の永続化はすべて`localStorage`（`js/storage.js`が唯一の窓口）
- 生体認証は`WebAuthn`（`navigator.credentials`）を使用。サーバーは持たず、端末内で完結
- サウンドは音声ファイルを使わず、Web Audio APIの`OscillatorNode`で都度生成
- PWA対応：`manifest.json` + `service-worker.js`（キャッシュ優先のオフライン戦略）

## フォルダ構成

## Update 24
- メッセージ通常画面は送受信内容を短時間表示した後に自動で非表示。
- メッセージ画面の履歴アイコンからメッセージ履歴のみを表示。
- Archiveは従来どおり保存した記録専用で、メッセージ履歴とは分離。
- Workspaceからメッセージ／カレンダー／写真／記録を開く際の個別パスコードロック設定を追加。
- Service Worker cache version: 15.
