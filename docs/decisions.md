# 決定記録

設計書（registry-spec.md）と食い違う判断や、実装上の選択を1〜3行で残す。

## 2026-09-23

- **コードの置き場所**：iCloud Drive 外の `~/Project/Narratix web app` を git リポジトリの正本とする。iCloud 側の指示書フォルダは参照用に残し、以後の更新はリポジトリ内の `docs/` で行う。
- **技術スタック確定**：Next.js 16（App Router）＋ TypeScript 5.9、Vitest、zod 4（レジストリと ViewSpec の検証。JSON Schema は `z.toJSONSchema` で生成）、next-intl、Supabase（Postgres＋Auth＋RLS）。TypeScript 7 は Next.js との組み合わせ実績が少ないため見送り。
- **PptxGenJS は 3.12.0 に固定**：見本コードの注意点（テキストの margin はpt、表セルの margin はインチ）が 3.12 の挙動に基づくため。4.x への更新は出力の見た目を検証してから。
- **ホスティング**：Vercel を想定（未確定）。

## 2026-09-23（レジストリ）

- **設定の適用先は Control 側だけに持つ**：チャート定義に `controls` 一覧は置かず、`controlsFor(chart)` で逆引きする（二重管理を避ける）。補完パーツは、チャート側に「推奨」、補完パーツ側に「適用可能（appliesTo）」を持ち、推奨 ⊆ 適用可能をテストで保証する。appliesTo は設計書の「主な適用チャート」と各チャートの「推奨補完」の和集合。
- **見せられる／見せられないは語彙（AspectId）で持つ**：設計書の日本語の説明を20語の語彙に置き換え、補完パーツの `covers` と突き合わせる。語彙は `src/registry/aspects.ts`。
- **スキーマの互換**：MATRIX 系チャート（trend / comparison）は MEKKO データも受け取れる（どちらも「行×列の実数」）。p05 の左の合計棒（stacked_100）を MEKKO データから描くため。transform を持つパネルはスキーマ照合を省き、変換後の形は配置エンジン側で確かめる。
- **パネル型の補完パーツの置き場所**：揃えた表は既定で p02（上下 3:1）の下、Mekko は p05 の右下、横棒ランキングとヒートマップは p03 の右（行揃え）。示唆ボックスは p03 の右（3:1）。
- **ViewSpec の id / version は任意**：AI が返す JSON には含まれないため。保存時に DB 側で付ける。
- **sparkline は保留**：3時点以上が必要だが、Dataset は current / base の2時点しか持てない。Dataset の拡張と合わせて決める。
- **slope は比較期間を必須にしない**：MATRIX_TIME_SERIES の2行（2時点）でも描けるため。
