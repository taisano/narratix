# Chart Advisor

ビジネス資料向けのチャートを「言いたいこと」から設計し、編集できるPPTとして出力するWebアプリ（NarratiX の Web 版）。

- 開発の前提と原則：`CLAUDE.md`
- 設計書：`docs/registry-spec.md`
- 動く見本：`reference/mekko-builder.html`（ブラウザで開くとプレビューまで動作。PPT保存は claude.ai 上でのみ動く）

## Claude Code での始め方

このフォルダを開いて Claude Code を起動し、最初に次のように依頼する。

> CLAUDE.md と docs/registry-spec.md、reference/mekko-builder.html を読んで、M1（Composition を端から端まで）の実装計画を提案してください。技術スタックの確定、フォルダ構成、レジストリの型定義の方針、配置エンジンとPPT出力の分け方、テスト方針を含めてください。コードはまだ書かないでください。

計画に合意したら、レジストリの型定義 → transform と配置計算（テスト付き）→ プレビュー画面 → PPTX 出力 → 多言語、の順に進める。

## 開発環境

```bash
npm install
cp .env.example .env.local   # Supabase の URL と公開キーを記入
npm run dev                  # http://localhost:3000
npm test                     # Vitest
npm run typecheck
```

Node.js 20.9 以上が必要。

## Supabase の準備（ログインと保存）

1. Supabase ダッシュボードの **SQL Editor** で `supabase/migrations/` の SQL を古い順に実行する（テーブル、RLS、保存用の関数 `save_chart` ができる）。
2. **Authentication → URL Configuration** で、Site URL に `http://localhost:3000`、Redirect URLs に `http://localhost:3000/**` を登録する（公開する場合は公開 URL も足す）。
3. `.env.local` に Project URL と Publishable key を書く（`.env.example` 参照）。

ログインはメールのリンク（パスワードなし）。未設定のままでも画面は動き、ブラウザにだけ控えを残す。
SQL と RLS は `supabase/tests/migration.test.ts` が PGlite 上で確かめる。
