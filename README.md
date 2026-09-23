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
