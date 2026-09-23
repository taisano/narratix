# 決定記録

設計書（registry-spec.md）と食い違う判断や、実装上の選択を1〜3行で残す。

## 2026-09-23

- **コードの置き場所**：iCloud Drive 外の `~/Project/Narratix web app` を git リポジトリの正本とする。iCloud 側の指示書フォルダは参照用に残し、以後の更新はリポジトリ内の `docs/` で行う。
- **技術スタック確定**：Next.js 16（App Router）＋ TypeScript 5.9、Vitest、zod 4（レジストリと ViewSpec の検証。JSON Schema は `z.toJSONSchema` で生成）、next-intl、Supabase（Postgres＋Auth＋RLS）。TypeScript 7 は Next.js との組み合わせ実績が少ないため見送り。
- **PptxGenJS は 3.12.0 に固定**：見本コードの注意点（テキストの margin はpt、表セルの margin はインチ）が 3.12 の挙動に基づくため。4.x への更新は出力の見た目を検証してから。
- **ホスティング**：Vercel を想定（未確定）。
