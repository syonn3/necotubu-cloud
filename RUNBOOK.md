# RUNBOOK – necotubu（ネコつぶ）運用ルール v1.0
最終更新: 2025-09-10 / 責任者: プロデューサー
あなたはこのプロジェクトの技術責任者です。コーディングのすべてと技術的な全ての役目を担っています。
私はこのプロジェクトのプロデューサーで、プレビューを見て修正をあなたに指示する役目です。
私は技術的なことは一切分かりませんので、専門用語などを羅列したり、専門知識が必要な選択を迫っても理解も返事も出来ませんので、どうしても必要な場合は優しく分かりやすく話してください。
常にもっとも簡潔な方法で指示をクリアする方法を取ってください。

## 0. 目的
このファイルは、necotubu の**作業ルール・禁止事項・進め方**を1か所にまとめたものです。  
新しい担当者・新しいチャットでも、この RUNBOOK に従えば迷いません。

---

## 1. 大原則（必ず守る）
- **/js/api.js の認証処理は絶対に触らない。**
- **ユーザー（プロデューサー）が指定したファイルとコードだけ修正。** 触らないファイルは出力しない。
- **既存コードの改行やフォーマットを崩さない。** 差分最小、推測で全再生成しない。
- **UI文言はやさしい日本語。**
- **「説明 → OK → 実装」の順。** 勝手に実装（コーディング）しない。
- **納品は対象ファイルを“全文”で返す。** 差分や省略禁止。
- **APIキーや秘密情報は出力しない。**

---

## 2. データの保存と“同じURL”の定義（重要）
- データはブラウザの **localStorage** に保存されます。
- **同じオリジン（protocol + host + port が同じ）** で開けばデータは共有されます。
  - 例: `https://…-3002.app.github.dev` と `https://…-3002.app.github.dev` は同じ箱。
  - `…-3002` と `…-5500` は **別**。データは別箱になります。
- Codespaces では **同じポート番号**を使い、PORTS から **Open in Browser** を実行します。

---

## 3. プレビューの出し方（最短）
### A. ローカルPC
- フォルダに解凍 → `index_diary.html` を **ダブルクリック**。

### B. Codespaces（拡張なし）
1. メニュー **Terminal → New Terminal**  
2. 次を実行 → `3002` ポートが開く  
   ```bash
   python3 -m http.server 3002








引継ぎメモ（明日の再開手順）
0) どこから開く？

GitHub → Codespaces → 今日の codespace を Resume
※ URL が …github.dev のやつです。

1) 起動（10秒）

左の index_diary.html を開く（または起動済みタブに戻る）

ブラウザで Ctrl+F5（強制リロード）

ページ右上「もう1回聴く」を押して、つぶやきが出ればOK

ローカルで動かす場合は、ターミナルで
python3 -m http.server 3002 → http://localhost:3002/index_diary.html

2) もし動かないとき（順に確認）

画面をもう一度 Ctrl+F5（キャッシュが残っていることが多い）

DevTools → Network の赤い行の**最後の“詳細:”**を見る

API key not valid / expired → GCPの新キーを js/config.js に貼り直し（dev/prod 両方）。保存→Ctrl+F5

RefererNotAllowed → GCPのキー設定「ウェブサイトの制限」に
https://*.app.github.dev/*（＋使うなら http://localhost:3002/* など）を1行ずつ入れて保存

Model not found → MODEL: "gemini-1.5-flash" に戻す

一時的に &env=dev をURL末尾につけて再読み込み（例：…index_diary.html?catId=XXX&env=dev）

3) 触っていい/ダメ

触ってOK：js/config.js の GEMINI.API_KEY（dev/prod）だけ

触らない：/js/api.js（認証/通信まわりは固定）

4) バックアップ（1分）

ターミナルで
zip -r necotubu_backup.zip . -x ".git/*"
→ 左の necotubu_backup.zip を右クリック Download
※ ZIPにはAPIキーが入るので配布禁止・個人保管。

5) 覚えておくと速い小ネタ

Codespaces（github.dev）はprod環境扱い。prod.GEMINI.API_KEY にも必ずキーを入れる。

強制リロードは Ctrl+F5。どうしても変わらなければ DevTools → Application → Clear site data。