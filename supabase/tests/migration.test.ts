import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

/**
 * supabase/migrations の SQL を、Supabase の auth スキーマを模した Postgres（PGlite）で実行し、
 * 保存の関数と RLS（本人しか読み書きできない）を確かめる。
 */
const AUTH_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

const dataset = { schema: 'MEKKO', rows: ['A'], cols: ['x'], periods: { current: { label: '2025', values: [[1]] } } };
const spec = { datasetId: 'local', layout: { id: 'p01_single' }, panels: [], slide: { title: 't' }, slideLocale: 'ja' };

let db: PGlite;

async function as(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

const save = (user: string, id: string | null, title: string, name: string | null = null) =>
  as(user, 'select * from public.save_chart($1, $2, $3, $4, $5, $6)', [id, name, title, dataset, spec, { title }]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  const dir = join(__dirname, '..', 'migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  await db.query('insert into auth.users (id) values ($1), ($2)', [ALICE, BOB]);
});

describe('save_chart', () => {
  it('新規保存でプロジェクト・データ・ViewSpec・履歴ができ、上書きで version が進む', async () => {
    const r1 = await save(ALICE, null, '最初');
    const { saved_id: id, saved_version: v1 } = r1.rows[0] as { saved_id: string; saved_version: number };
    expect(v1).toBe(1);
    const r2 = await save(ALICE, id, '直した');
    expect(r2.rows[0]).toMatchObject({ saved_id: id, saved_version: 2 });

    const row = (await as(ALICE, 'select title, version, spec from public.view_specs where id = $1', [id])).rows[0] as {
      title: string; version: number; spec: { id: string; version: number; datasetId: string };
    };
    expect(row.title).toBe('直した');
    expect(row.spec).toMatchObject({ id, version: 2 });
    expect(row.spec.datasetId).not.toBe('local');

    const hist = await as(ALICE, 'select version from public.view_spec_versions where view_spec_id = $1 order by version', [id]);
    expect(hist.rows.map((r) => r.version)).toEqual([1, 2]);
    const projects = await as(ALICE, 'select count(*)::int as n from public.projects');
    expect(projects.rows[0]!.n).toBe(1);
  });

  it('ログインしていなければ保存できない', async () => {
    await expect(as(null, 'select * from public.save_chart(null, null, $1, $2, $3, $4)', ['x', dataset, spec, {}])).rejects.toThrow();
  });
});

describe('チャート名', () => {
  it('名前を付けて保存でき、未指定ならタイトルが名前になる', async () => {
    const a = (await save(ALICE, null, 'スライドのタイトル', '地域別の構成')).rows[0] as { saved_id: string };
    const b = (await save(ALICE, null, 'タイトルだけ')).rows[0] as { saved_id: string };
    const names = await as(ALICE, 'select id, name from public.view_specs where id in ($1, $2)', [a.saved_id, b.saved_id]);
    const byId = Object.fromEntries(names.rows.map((r) => [r.id, r.name]));
    expect(byId[a.saved_id]).toBe('地域別の構成');
    expect(byId[b.saved_id]).toBe('タイトルだけ');
  });

  it('上書き保存で名前を渡さなければ、今の名前のまま', async () => {
    const { saved_id: id } = (await save(ALICE, null, 't', '最初の名前')).rows[0] as { saved_id: string };
    await save(ALICE, id, 'タイトル変更');
    const r = await as(ALICE, 'select name, title from public.view_specs where id = $1', [id]);
    expect(r.rows[0]).toEqual({ name: '最初の名前', title: 'タイトル変更' });
  });

  it('名前だけを変えられる（本人のみ）', async () => {
    const { saved_id: id } = (await save(ALICE, null, 't', '旧名')).rows[0] as { saved_id: string };
    await as(ALICE, 'update public.view_specs set name = $1 where id = $2', ['新名', id]);
    const bob = await as(BOB, 'update public.view_specs set name = $1 where id = $2', ['乗っ取り', id]);
    expect(bob.affectedRows ?? 0).toBe(0);
    expect((await as(ALICE, 'select name from public.view_specs where id = $1', [id])).rows[0]!.name).toBe('新名');
  });
});

describe('RLS：本人しか読み書きできない', () => {
  it('他人の保存は見えず、上書きもできない', async () => {
    const { saved_id: aliceId } = (await save(ALICE, null, 'Alice のチャート')).rows[0] as { saved_id: string };
    const bobSees = await as(BOB, 'select id from public.view_specs');
    expect(bobSees.rows.map((r) => r.id)).not.toContain(aliceId);
    await expect(save(BOB, aliceId, '乗っ取り')).rejects.toThrow(/not found/);
    const upd = await as(BOB, 'update public.view_specs set title = $1 where id = $2', ['x', aliceId]);
    expect(upd.affectedRows ?? 0).toBe(0);
    const del = await as(BOB, 'delete from public.datasets');
    expect(del.affectedRows ?? 0).toBe(0);
    const still = await as(ALICE, 'select title from public.view_specs where id = $1', [aliceId]);
    expect(still.rows[0]!.title).toBe('Alice のチャート');
  });

  it('他人のプロジェクトにデータを書き込めない', async () => {
    const aliceProject = (await as(ALICE, 'select id from public.projects limit 1')).rows[0]!.id;
    await expect(as(BOB, 'insert into public.datasets (project_id, schema, data) values ($1, $2, $3)', [aliceProject, 'MEKKO', dataset])).rejects.toThrow();
  });

  it('ログインしていない利用者は何も読めない', async () => {
    await expect(as(null, 'select * from public.view_specs')).rejects.toThrow(/permission denied/);
  });

  it('履歴は書き換えられない', async () => {
    const upd = as(ALICE, 'update public.view_spec_versions set version = 99');
    await expect(upd).rejects.toThrow(/permission denied/);
  });

  it('データを消すと、その ViewSpec と履歴も消える', async () => {
    const { saved_id: id } = (await save(ALICE, null, '消す')).rows[0] as { saved_id: string };
    const ds = (await as(ALICE, 'select dataset_id from public.view_specs where id = $1', [id])).rows[0]!.dataset_id;
    await as(ALICE, 'delete from public.datasets where id = $1', [ds]);
    expect((await as(ALICE, 'select count(*)::int as n from public.view_specs where id = $1', [id])).rows[0]!.n).toBe(0);
    expect((await as(ALICE, 'select count(*)::int as n from public.view_spec_versions where view_spec_id = $1', [id])).rows[0]!.n).toBe(0);
  });
});

describe('AI のプランと回数', () => {
  it('プランは本人だけ読めて、自分では書き換えられない（行が無ければ free 扱い）', async () => {
    await db.query("insert into public.user_plans (user_id, plan) values ($1, 'pro')", [ALICE]);
    expect((await as(ALICE, 'select plan from public.user_plans')).rows).toEqual([{ plan: 'pro' }]);
    expect((await as(BOB, 'select plan from public.user_plans')).rows).toEqual([]);
    await expect(as(BOB, "insert into public.user_plans (user_id, plan) values ($1, 'team')", [BOB])).rejects.toThrow();
    await expect(as(ALICE, "update public.user_plans set plan = 'team'")).rejects.toThrow();
  });

  it('回数は本人の行として足せて、本人だけ読める。消す・書き換えるはできない', async () => {
    await as(ALICE, "insert into public.ai_usage (feature, model, input_tokens, output_tokens, ok) values ('ai_consult', 'm', 10, 5, true)");
    await expect(as(ALICE, "insert into public.ai_usage (user_id, feature, ok) values ($1, 'ai_consult', true)", [BOB])).rejects.toThrow();
    expect((await as(ALICE, 'select count(*)::int as n from public.ai_usage')).rows).toEqual([{ n: 1 }]);
    expect((await as(BOB, 'select count(*)::int as n from public.ai_usage')).rows).toEqual([{ n: 0 }]);
    await expect(as(ALICE, 'delete from public.ai_usage')).rejects.toThrow();
    await expect(as(ALICE, 'update public.ai_usage set ok = false')).rejects.toThrow();
    await expect(as(null, "insert into public.ai_usage (feature, ok) values ('ai_consult', true)")).rejects.toThrow();
  });
});

describe('相談の履歴', () => {
  const add = (user: string, text: string, starred = false) =>
    as(user, 'insert into public.consultation_history (text, classifier, starred) values ($1, $2, $3) returning id', [text, 'ai', starred]);

  it('本人だけ読める。☆とチャートのリンクだけ書き換えられる。消せる', async () => {
    const r = await add(ALICE, '地域別の売上の推移');
    const id = (r.rows[0] as { id: string }).id;
    expect((await as(BOB, 'select count(*)::int as n from public.consultation_history')).rows).toEqual([{ n: 0 }]);
    await as(ALICE, 'update public.consultation_history set starred = true where id = $1', [id]);
    expect((await as(ALICE, 'select starred from public.consultation_history where id = $1', [id])).rows).toEqual([{ starred: true }]);
    await expect(as(ALICE, "update public.consultation_history set text = 'x' where id = $1", [id])).rejects.toThrow();
    // ほかの人の行は書き換え・削除できない（0行）
    await as(BOB, 'update public.consultation_history set starred = false where id = $1', [id]);
    await as(BOB, 'delete from public.consultation_history where id = $1', [id]);
    expect((await as(ALICE, 'select starred from public.consultation_history where id = $1', [id])).rows).toEqual([{ starred: true }]);
    await expect(as(ALICE, 'insert into public.consultation_history (owner_id, text) values ($1, $2)', [BOB, 'x'])).rejects.toThrow();
    await as(ALICE, 'delete from public.consultation_history where id = $1', [id]);
    expect((await as(ALICE, 'select count(*)::int as n from public.consultation_history')).rows).toEqual([{ n: 0 }]);
  });

  it('☆なしは新しい100件だけ残り、☆付きは消えない', async () => {
    await add(BOB, '大事な相談', true);
    for (let i = 0; i < 105; i++) await add(BOB, `相談 ${i}`);
    const rows = (await as(BOB, 'select text, starred from public.consultation_history order by created_at, text')).rows as { text: string; starred: boolean }[];
    expect(rows.filter((r) => !r.starred)).toHaveLength(100);
    expect(rows.some((r) => r.text === '大事な相談')).toBe(true);
    expect(rows.some((r) => r.text === '相談 104')).toBe(true);
  });
});

describe('ベータ版の登録', () => {
  const CAROL = '33333333-3333-3333-3333-333333333333';
  const DAVE = '44444444-4444-4444-4444-444444444444';
  it('同意がないと登録できない。同意すると active。自分の行だけ読める。直接は書けない', async () => {
    await db.query('insert into auth.users (id) values ($1), ($2) on conflict do nothing', [CAROL, DAVE]);
    await expect(as(CAROL, 'select public.join_beta(false, false)')).rejects.toThrow();
    expect((await as(CAROL, 'select public.join_beta(true, true) as s')).rows).toEqual([{ s: 'active' }]);
    // 2回目は今の状態を返す
    expect((await as(CAROL, 'select public.join_beta(true, false) as s')).rows).toEqual([{ s: 'active' }]);
    expect((await as(CAROL, 'select status, email_opt_in from public.beta_members')).rows).toEqual([{ status: 'active', email_opt_in: true }]);
    expect((await as(DAVE, 'select count(*)::int as n from public.beta_members')).rows).toEqual([{ n: 0 }]);
    await expect(as(DAVE, "insert into public.beta_members (user_id, email, status, terms_agreed_at) values ($1, 'x', 'active', now())", [DAVE])).rejects.toThrow();
    await as(CAROL, 'select public.set_beta_email_opt_in(false)');
    expect((await as(CAROL, 'select email_opt_in from public.beta_members')).rows).toEqual([{ email_opt_in: false }]);
  });

  it('上限を超えたら順番待ち', async () => {
    await db.query('update public.beta_settings set cap = 1');
    expect((await as(DAVE, 'select public.join_beta(true, false) as s')).rows).toEqual([{ s: 'waitlist' }]);
    await db.query('update public.beta_settings set cap = 1000');
  });

  it('PPT の出力は登録済みの人だけ、無料は月10回まで', async () => {
    expect((await as(DAVE, 'select * from public.record_ppt_export(10)')).rows).toEqual([{ allowed: false, used: 0 }]);
    for (let i = 1; i <= 10; i++) expect((await as(CAROL, 'select * from public.record_ppt_export(10)')).rows).toEqual([{ allowed: true, used: i }]);
    expect((await as(CAROL, 'select * from public.record_ppt_export(10)')).rows).toEqual([{ allowed: false, used: 10 }]);
    // 大きな上限を渡しても 10 まで
    expect((await as(CAROL, 'select * from public.record_ppt_export(999)')).rows).toEqual([{ allowed: false, used: 10 }]);
  });
});

describe('Library', () => {
  const ADMIN = '55555555-5555-5555-5555-555555555555';
  const project = { version: 3, slides: [] };
  it('管理者だけ公開・非公開・削除できる。公開中は登録前（anon）も読める', async () => {
    await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [ADMIN]);
    await db.query('insert into public.app_admins (user_id) values ($1)', [ADMIN]);
    await expect(as(ALICE, "insert into public.library_items (title, project) values ('x', $1)", [project])).rejects.toThrow();
    const r = await as(ADMIN, "insert into public.library_items (title, description, project) values ('推移の見本', 'desc', $1) returning id", [project]);
    const id = (r.rows[0] as { id: string }).id;
    expect((await as(null, 'select title from public.library_items')).rows).toEqual([{ title: '推移の見本' }]);
    expect((await as(ALICE, 'select title from public.library_items')).rows).toEqual([{ title: '推移の見本' }]);
    await as(ALICE, 'update public.library_items set title = $2 where id = $1', [id, '乗っ取り']);
    await as(ADMIN, 'update public.library_items set published = false where id = $1', [id]);
    expect((await as(null, 'select count(*)::int as n from public.library_items')).rows).toEqual([{ n: 0 }]);
    expect((await as(ADMIN, 'select title, published from public.library_items')).rows).toEqual([{ title: '推移の見本', published: false }]);
    await as(ALICE, 'delete from public.library_items where id = $1', [id]);
    expect((await as(ADMIN, 'select count(*)::int as n from public.library_items')).rows).toEqual([{ n: 1 }]);
    await as(ADMIN, 'delete from public.library_items where id = $1', [id]);
    expect((await as(ADMIN, 'select count(*)::int as n from public.library_items')).rows).toEqual([{ n: 0 }]);
    expect((await as(ADMIN, 'select public.is_admin() as a')).rows).toEqual([{ a: true }]);
    expect((await as(ALICE, 'select public.is_admin() as a')).rows).toEqual([{ a: false }]);
  });
});

describe('タグ', () => {
  it('保存したチャートと見本にタグを付けられる。本人のものだけ。数と長さに上限', async () => {
    const r = await save(ALICE, null, 'タグの確認');
    const id = (r.rows[0] as { saved_id: string }).saved_id;
    await as(ALICE, 'update public.view_specs set tags = $2 where id = $1', [id, ['日本語', '市場']]);
    expect((await as(ALICE, 'select tags from public.view_specs where id = $1', [id])).rows).toEqual([{ tags: ['日本語', '市場'] }]);
    await as(BOB, 'update public.view_specs set tags = $2 where id = $1', [id, ['乗っ取り']]);
    expect((await as(ALICE, 'select tags from public.view_specs where id = $1', [id])).rows).toEqual([{ tags: ['日本語', '市場'] }]);
    await expect(as(ALICE, 'update public.view_specs set tags = $2 where id = $1', [id, ['x'.repeat(31)]])).rejects.toThrow();
    await expect(as(ALICE, 'update public.view_specs set tags = $2 where id = $1', [id, Array.from({ length: 21 }, (_, i) => 't' + i)])).rejects.toThrow();
    expect((await as(ALICE, "select count(*)::int as n from public.view_specs where tags @> array['市場']")).rows).toEqual([{ n: 1 }]);
  });
});

describe('A/B の計測とフィードバック', () => {
  const V = '99999999-9999-9999-9999-999999999999';
  const ADMIN2 = '66666666-6666-6666-6666-666666666666';
  beforeAll(async () => {
    await db.query('insert into auth.users (id) values ($1)', [ADMIN2]);
    await db.query('insert into public.app_admins (user_id) values ($1)', [ADMIN2]);
  });
  it('だれでも記録できるが、読めるのは管理者だけ。決まったイベント・短い値だけ', async () => {
    await as(null, "insert into public.ab_events (variant, visitor, event) values ('a', $1, 'landing_view')", [V]);
    await as(ALICE, "insert into public.ab_events (variant, visitor, event, detail, logged_in) values ('b', $1, 'start_purpose_selected', 'trend,comparison', true)", [V]);
    await expect(as(null, "insert into public.ab_events (visitor, event) values ($1, 'something_else')", [V])).rejects.toThrow();
    await expect(as(null, "insert into public.ab_events (visitor, event, detail) values ($1, 'landing_view', '相談文')", [V])).rejects.toThrow();
    await expect(as(null, 'select * from public.ab_events')).rejects.toThrow();
    expect((await as(ALICE, 'select count(*)::int as n from public.ab_events')).rows).toEqual([{ n: 0 }]);
    expect((await as(ADMIN2, 'select count(*)::int as n from public.ab_events')).rows).toEqual([{ n: 2 }]);
  });
  it('フィードバック：だれでも送れる。他人のふりはできない。読めるのは管理者だけ', async () => {
    await as(null, "insert into public.beta_feedback (category, message, user_id) values ('request', '未ログインの要望', null)");
    await as(ALICE, "insert into public.beta_feedback (category, message, reply_email) values ('bug', 'ボタンが押せない', 'a@example.com')");
    await expect(as(ALICE, "insert into public.beta_feedback (category, message, user_id) values ('bug', 'なりすまし', $1)", [BOB])).rejects.toThrow();
    await expect(as(ALICE, "insert into public.beta_feedback (category, message) values ('spam', 'x')")).rejects.toThrow();
    await expect(as(ALICE, "insert into public.beta_feedback (category, message, reply_email) values ('bug', 'x', 'not-an-email')")).rejects.toThrow();
    expect((await as(ALICE, 'select count(*)::int as n from public.beta_feedback')).rows).toEqual([{ n: 0 }]);
    const r = await as(ADMIN2, 'select category, user_id from public.beta_feedback order by created_at');
    expect(r.rows).toEqual([{ category: 'request', user_id: null }, { category: 'bug', user_id: ALICE }]);
  });
});
