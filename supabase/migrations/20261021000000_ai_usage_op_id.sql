-- AI 相談の二重計上を防ぐ：「AI 相談」を押した1回の操作ごとの ID（画面が作る UUID）を記録し、
-- 同じ人・同じ操作 ID は1行しか入らないようにする（再送・連打・リトライで回数が増えない）。
-- 既存の行は op_id なし（null）のまま。null は何件あってもよい。
alter table public.ai_usage add column if not exists op_id uuid;
create unique index if not exists ai_usage_user_op_uidx on public.ai_usage (user_id, op_id) where op_id is not null;
