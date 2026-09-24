# NarratiX（Google スプレッドシート版）の参照資料

- `Code.gs` … Apps Script のバックエンド（NarratiX MVP V36 CODEX／V38_6_FreeBeta）。計算・検証・クイックインサイト・Advice・Slides 書き出し
- `Sidebar.html` … サイドバーの画面（HTML／JavaScript）
- `narratix-sidebar-screenshot.png` … 既存サイドバーの画面

計算・判定のルールは `docs/narratix-rules.md` に抜き出してある。実装はそちらを基準にし、細部を確かめる時にこのコードを読む。
画面の見た目と操作の流れは Web 版（Chart Advisor）のものを基本にし、NarratiX の画面は設定項目の参考にとどめる。

※ `Code.gs` にはテスト用のアンロック用パスワードの既定値が含まれる（実際の API キーは含まれない）。リポジトリは非公開のまま扱う。
