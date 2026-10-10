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
  create function auth.role() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
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
  await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [user ? 'authenticated' : 'anon']);
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

async function asService(sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  await db.exec('set role service_role');
  await db.query(`select set_config('request.jwt.claim.role', 'service_role', false)`);
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
    expect((await as(CAROL, "select public.join_beta(true, true, 'planner', 'other:友人の紹介') as s")).rows).toEqual([{ s: 'active' }]);
    // 2回目は今の状態を返す
    expect((await as(CAROL, 'select public.join_beta(true, false) as s')).rows).toEqual([{ s: 'active' }]);
    expect((await as(CAROL, 'select status, email_opt_in, occupation, referral from public.beta_members')).rows).toEqual([{ status: 'active', email_opt_in: true, occupation: 'planner', referral: 'other:友人の紹介' }]);
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

  it('PPT の出力は登録済みの人だけ。回数の上限はなし', async () => {
    expect((await as(DAVE, 'select * from public.record_ppt_export(10)')).rows).toEqual([{ allowed: false, used: 0 }]);
    for (let i = 1; i <= 10; i++) expect((await as(CAROL, 'select * from public.record_ppt_export(10)')).rows).toEqual([{ allowed: true, used: i }]);
    // ベータ版は回数の上限なし（記録だけ残る）
    expect((await as(CAROL, 'select * from public.record_ppt_export(10)')).rows).toEqual([{ allowed: true, used: 11 }]);
    expect((await as(CAROL, 'select * from public.record_ppt_export(null)')).rows).toEqual([{ allowed: true, used: 12 }]);
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
    // 端末の種類と、エディター・かんたん修正のイベント（20261003）
    await as(null, "insert into public.ab_events (visitor, event, device) values ($1, 'quick_edit_opened', 'phone')", [V]);
    await expect(as(null, "insert into public.ab_events (visitor, event, device) values ($1, 'editor_opened', 'iPhone 15')", [V])).rejects.toThrow();
    // Coach 型の切り口選定のイベント（20261004）
    await as(null, "insert into public.ab_events (visitor, event, detail) values ($1, 'coach_lead_replaced', 'trend_slope')", [V]);
    await expect(as(null, 'select * from public.ab_events')).rejects.toThrow();
    expect((await as(ALICE, 'select count(*)::int as n from public.ab_events')).rows).toEqual([{ n: 0 }]);
    expect((await as(ADMIN2, 'select count(*)::int as n from public.ab_events')).rows).toEqual([{ n: 4 }]);
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

describe('管理者は無制限・フィードバックを読める', () => {
  const BOSS = '77777777-7777-7777-7777-777777777777';
  beforeAll(async () => {
    await db.query('insert into auth.users (id) values ($1)', [BOSS]);
    await db.query('insert into public.app_admins (user_id) values ($1)', [BOSS]);
  });
  it('PPT の出力は10回を超えても出せる（ベータ登録がなくても）', async () => {
    for (let i = 1; i <= 12; i++) expect((await as(BOSS, 'select * from public.record_ppt_export(10)')).rows).toEqual([{ allowed: true, used: i }]);
  });
  it('提案へのフィードバックは、本人と管理者だけが読める', async () => {
    await as(ALICE, "insert into public.recommendation_feedback (entry_mode, consultation_text, rating, recommendation_version) values ('CONSULTATION', '相談文', 'down', 'v')");
    expect((await as(BOB, 'select count(*)::int as n from public.recommendation_feedback')).rows).toEqual([{ n: 0 }]);
    expect((await as(BOSS, "select consultation_text from public.recommendation_feedback where consultation_text = '相談文'")).rows).toEqual([{ consultation_text: '相談文' }]);
  });
});

describe('Story（マイチャートの「Story」タブ）', () => {
  const story = { version: 1, title: 'インバウンド', slides: [] };
  it('本人は保存・一覧・更新・削除でき、他人からは見えず、書き換えもできない', async () => {
    const ins = await as(ALICE, "insert into public.stories (name, slides, route, story) values ('インバウンド', 3, 'AIMED', $1) returning id, owner_id", [story]);
    const { id, owner_id } = ins.rows[0] as { id: string; owner_id: string };
    expect(owner_id).toBe(ALICE);
    expect((await as(ALICE, 'select name, slides from public.stories where id = $1', [id])).rows).toEqual([{ name: 'インバウンド', slides: 3 }]);
    expect((await as(BOB, 'select id from public.stories')).rows).toEqual([]);
    expect((await as(BOB, "update public.stories set name = 'x' where id = $1", [id])).affectedRows ?? 0).toBe(0);
    expect((await as(BOB, 'delete from public.stories where id = $1', [id])).affectedRows ?? 0).toBe(0);
    await expect(as(BOB, "insert into public.stories (owner_id, name, story) values ($1, 'なりすまし', $2)", [ALICE, story])).rejects.toThrow();
    await expect(as(null, 'select id from public.stories')).rejects.toThrow();
    expect((await as(ALICE, "update public.stories set name = '改名' where id = $1", [id])).affectedRows).toBe(1);
    expect((await as(ALICE, 'delete from public.stories where id = $1', [id])).affectedRows).toBe(1);
  });
});

describe('データモデル v2：workspace・資産・書き換えない版', () => {
  const table = { schemaVersion: 1, fields: [], records: [] };
  const content = { schemaVersion: 1, slideLocale: 'ja', slides: [] };

  const personalWorkspace = async (user: string) => {
    const r = await as(user, "select id from public.workspaces where kind = 'personal'");
    return (r.rows[0] as { id: string }).id;
  };

  const addDataset = async (user: string, workspaceId: string, suffix: string, sourceIds: string[] = []) => {
    const asset = await as(user, 'insert into public.dataset_assets (workspace_id, name) values ($1, $2) returning id', [workspaceId, `データ ${suffix}`]);
    const assetId = (asset.rows[0] as { id: string }).id;
    const version = await as(user, `
      insert into public.dataset_versions
        (dataset_asset_id, workspace_id, version, payload, input, source_ids, content_hash, semantics_hash, original_table_hash)
      values ($1, $2, 1, $3, $4, $5, $6, $7, $8)
      returning id
    `, [assetId, workspaceId, table, { kind: 'legacy_dataset', dataset: {} }, sourceIds, `content-${suffix}`, `semantics-${suffix}`, `original-${suffix}`]);
    const versionId = (version.rows[0] as { id: string }).id;
    await as(user, 'update public.dataset_assets set current_version_id = $1 where id = $2', [versionId, assetId]);
    return { assetId, versionId };
  };

  it('利用者ごとに個人workspaceを作り、本人以外には見せない', async () => {
    const aliceWorkspace = await personalWorkspace(ALICE);
    const bobWorkspace = await personalWorkspace(BOB);
    expect(aliceWorkspace).not.toBe(bobWorkspace);
    expect((await as(ALICE, 'select id from public.workspaces')).rows).toEqual([{ id: aliceWorkspace }]);
    expect((await as(BOB, 'select id from public.workspaces')).rows).toEqual([{ id: bobWorkspace }]);
    expect((await as(ALICE, 'select user_id, role from public.workspace_members')).rows).toEqual([{ user_id: ALICE, role: 'owner' }]);
  });

  it('同じworkspaceに出典・データ・deckと版を作り、他人からは読めず書けない', async () => {
    const workspaceId = await personalWorkspace(ALICE);
    const source = await as(ALICE, `
      insert into public.sources (workspace_id, kind, title, citation_text)
      values ($1, 'external_web', '統計資料', '出典：統計資料') returning id
    `, [workspaceId]);
    const sourceId = (source.rows[0] as { id: string }).id;
    const { assetId, versionId } = await addDataset(ALICE, workspaceId, '境界', [sourceId]);

    const deck = await as(ALICE, `
      insert into public.decks (workspace_id, kind, name, working)
      values ($1, 'chart', '地域別推移', $2) returning id
    `, [workspaceId, content]);
    const deckId = (deck.rows[0] as { id: string }).id;
    const deckVersion = await as(ALICE, `
      insert into public.deck_versions (deck_id, workspace_id, version, content)
      values ($1, $2, 1, $3) returning id
    `, [deckId, workspaceId, content]);
    const deckVersionId = (deckVersion.rows[0] as { id: string }).id;
    await as(ALICE, 'update public.decks set current_version_id = $1 where id = $2', [deckVersionId, deckId]);

    expect((await as(ALICE, 'select current_version_id from public.dataset_assets where id = $1', [assetId])).rows).toEqual([{ current_version_id: versionId }]);
    expect((await as(ALICE, 'select current_version_id from public.decks where id = $1', [deckId])).rows).toEqual([{ current_version_id: deckVersionId }]);
    expect((await as(BOB, 'select id from public.sources where id = $1', [sourceId])).rows).toEqual([]);
    expect((await as(BOB, 'select id from public.dataset_assets where id = $1', [assetId])).rows).toEqual([]);
    expect((await as(BOB, 'select id from public.dataset_versions where id = $1', [versionId])).rows).toEqual([]);
    expect((await as(BOB, 'select id from public.decks where id = $1', [deckId])).rows).toEqual([]);
    expect((await as(BOB, 'select id from public.deck_versions where id = $1', [deckVersionId])).rows).toEqual([]);
    await expect(as(BOB, "insert into public.dataset_assets (workspace_id, name) values ($1, '乗っ取り')", [workspaceId])).rejects.toThrow();
    expect((await as(BOB, "update public.decks set name = '乗っ取り' where id = $1", [deckId])).affectedRows ?? 0).toBe(0);
  });

  it('データ版とdeck版は追記だけで、直接の書き換え・削除や資産だけの削除はできない', async () => {
    const workspaceId = await personalWorkspace(ALICE);
    const { assetId, versionId } = await addDataset(ALICE, workspaceId, '不変');
    const deck = await as(ALICE, `
      insert into public.decks (workspace_id, kind, name, working)
      values ($1, 'story', '版の確認', $2) returning id
    `, [workspaceId, content]);
    const deckId = (deck.rows[0] as { id: string }).id;
    const version = await as(ALICE, `
      insert into public.deck_versions (deck_id, workspace_id, version, content)
      values ($1, $2, 1, $3) returning id
    `, [deckId, workspaceId, content]);
    const deckVersionId = (version.rows[0] as { id: string }).id;

    await expect(as(ALICE, 'update public.dataset_versions set version = 2 where id = $1', [versionId])).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, 'delete from public.dataset_versions where id = $1', [versionId])).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, 'update public.deck_versions set version = 2 where id = $1', [deckVersionId])).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, 'delete from public.deck_versions where id = $1', [deckVersionId])).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, 'delete from public.dataset_assets where id = $1', [assetId])).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, 'delete from public.decks where id = $1', [deckId])).rejects.toThrow(/permission denied/);
  });

  it('データ版は別workspaceの出典を参照できない', async () => {
    const aliceWorkspace = await personalWorkspace(ALICE);
    const bobWorkspace = await personalWorkspace(BOB);
    const source = await as(BOB, `
      insert into public.sources (workspace_id, kind, title, citation_text)
      values ($1, 'internal', 'Bobの資料', 'Bobの資料') returning id
    `, [bobWorkspace]);
    const sourceId = (source.rows[0] as { id: string }).id;
    await expect(addDataset(ALICE, aliceWorkspace, '別workspace出典', [sourceId])).rejects.toThrow(/same workspace/);
  });

  it('公開テンプレートは全員が読め、追加・変更は管理者だけができる', async () => {
    const ADMIN = '55555555-5555-5555-5555-555555555555';
    await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [ADMIN]);
    await db.query('insert into public.app_admins (user_id) values ($1) on conflict do nothing', [ADMIN]);
    const workspaceId = await personalWorkspace(ADMIN);
    await expect(as(ALICE, `
      insert into public.templates (workspace_id, title, deck_content)
      values ($1, 'なりすまし', $2)
    `, [await personalWorkspace(ALICE), content])).rejects.toThrow();
    const template = await as(ADMIN, `
      insert into public.templates (workspace_id, title, deck_content)
      values ($1, '公開テンプレート', $2) returning id
    `, [workspaceId, content]);
    const templateId = (template.rows[0] as { id: string }).id;
    expect((await as(null, 'select title from public.templates where id = $1', [templateId])).rows).toEqual([{ title: '公開テンプレート' }]);
    await as(ADMIN, 'update public.templates set published = false where id = $1', [templateId]);
    expect((await as(null, 'select id from public.templates where id = $1', [templateId])).rows).toEqual([]);
  });

  it('workspace全体を消す時だけ、資産と版もまとめて消せる', async () => {
    const CAROL = '33333333-3333-3333-3333-333333333333';
    await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [CAROL]);
    const workspaceId = await personalWorkspace(CAROL);
    const { assetId, versionId } = await addDataset(CAROL, workspaceId, 'workspace削除');
    expect((await as(CAROL, 'delete from public.workspaces where id = $1', [workspaceId])).affectedRows).toBe(1);
    expect((await db.query('select count(*)::int as n from public.dataset_assets where id = $1', [assetId])).rows).toEqual([{ n: 0 }]);
    expect((await db.query('select count(*)::int as n from public.dataset_versions where id = $1', [versionId])).rows).toEqual([{ n: 0 }]);
  });
});

describe('データモデル v2：保存・読み込み・PPT版', () => {
  const table = { schemaVersion: 1, fields: [], records: [] };
  const content = { schemaVersion: 1, slideLocale: 'ja', slides: [], editor: { current: 0, slots: {} }, datasetRefs: {} };

  it('同じデータは版を増やさず、値が変わった時だけ新しい版を作る', async () => {
    const workspaceId = (await as(ALICE, "select id from public.workspaces where kind = 'personal'")).rows[0]!.id;
    const save = (assetId: string | null, hash: string, records: unknown[]) => as(ALICE, `
      select * from public.save_dataset_asset_version($1, $2, '売上', 'ja', $3, $4, $5, 'semantics', $6)
    `, [workspaceId, assetId, { ...table, records }, { kind: 'legacy_dataset', dataset: {}, projection: { mode: 'matrix', measureFieldIds: [] } }, hash, `original-${hash}`]);
    const first = (await save(null, 'content-1', [])).rows[0] as { asset_id: string; version_id: string; saved_version: number };
    const same = (await save(first.asset_id, 'content-1', [])).rows[0] as { version_id: string; saved_version: number };
    const changed = (await save(first.asset_id, 'content-2', [[1]])).rows[0] as { version_id: string; saved_version: number };
    expect(same).toMatchObject({ version_id: first.version_id, saved_version: 1 });
    expect(changed.saved_version).toBe(2);
    expect(changed.version_id).not.toBe(first.version_id);
  });

  it('出典をデータ版につなぎ、変更時は過去の出典を上書きしない', async () => {
    const workspaceId = (await as(ALICE, "select id from public.workspaces where kind = 'personal'")).rows[0]!.id;
    const sourceId = (await as(ALICE, `select public.save_source($1, null, 'sample', '見本データ', null, null, null, null, null, '出典：見本データ') as id`, [workspaceId])).rows[0]!.id;
    const changedId = (await as(ALICE, `select public.save_source($1, $2, 'external_web', '公開統計', null, 'https://example.com/report', '2026-09-01', null, null, '出典：公開統計') as id`, [workspaceId, sourceId])).rows[0]!.id;
    expect(changedId).not.toBe(sourceId);
    expect((await as(ALICE, 'select kind, title from public.sources where id in ($1, $2) order by title', [sourceId, changedId])).rows).toEqual([
      { kind: 'external_web', title: '公開統計' }, { kind: 'sample', title: '見本データ' },
    ]);
    await expect(as(BOB, `select public.save_source($1, null, 'internal', '他人の資料', null, null, null, null, null, '')`, [workspaceId])).rejects.toThrow();

    const saved = await as(ALICE, `
      select * from public.save_dataset_asset_version($1, null, '売上', 'ja', $2, $3, 'source-content', 'source-semantics', 'source-original', array[$4]::uuid[])
    `, [workspaceId, table, { kind: 'legacy_dataset', dataset: {}, projection: { mode: 'matrix', measureFieldIds: [] } }, sourceId]);
    const versionId = saved.rows[0]!.version_id;
    expect((await as(ALICE, 'select source_ids from public.dataset_versions where id = $1', [versionId])).rows).toEqual([{ source_ids: [sourceId] }]);
  });

  it('作成→保存→開くためのworkingと版を残し、PPT出力では固定版と記録を追加する', async () => {
    const saved = await as(ALICE, `
      select * from public.save_deck_state(null, 'chart', '地域別売上', 'ja', array['市場'], $1, $1, true, 'save')
    `, [content]);
    const first = saved.rows[0] as { saved_id: string; saved_version: number; saved_version_id: string };
    expect(first.saved_version).toBe(1);
    expect((await as(ALICE, 'select name, working from public.decks where id = $1', [first.saved_id])).rows).toEqual([{ name: '地域別売上', working: content }]);

    const exported = await as(ALICE, 'select * from public.append_deck_export($1, $2)', [first.saved_id, { ...content, exported: true }]);
    expect(exported.rows[0]).toMatchObject({ saved_version: 2 });
    const versions = await as(ALICE, 'select version, reason, content from public.deck_versions where deck_id = $1 order by version', [first.saved_id]);
    expect(versions.rows).toEqual([
      { version: 1, reason: 'save', content },
      { version: 2, reason: 'ppt_export', content: { ...content, exported: true } },
    ]);
    expect((await as(ALICE, 'select deck_version_id from public.deck_exports where deck_id = $1', [first.saved_id])).rows).toHaveLength(1);
    expect((await as(BOB, 'select id from public.decks where id = $1', [first.saved_id])).rows).toEqual([]);
    await expect(as(BOB, 'select * from public.append_deck_export($1, $2)', [first.saved_id, content])).rejects.toThrow(/not found/);
  });

  it('Storyの自動保存はworkingを直し、最初と30分の区切り・名前変更では版を作る', async () => {
    const first = (await as(ALICE, `
      select * from public.save_deck_state(null, 'story', '市場戦略', 'ja', '{}', $1, $1, false, 'save')
    `, [content])).rows[0] as { saved_id: string; saved_version: number };
    expect(first.saved_version).toBe(1);
    const autosave = (await as(ALICE, `
      select * from public.save_deck_state($1, 'story', null, 'ja', '{}', $2, $2, false, 'save')
    `, [first.saved_id, { ...content, autosaved: true }])).rows[0] as { saved_version: number };
    expect(autosave.saved_version).toBe(1);
    const renamed = (await as(ALICE, `
      select * from public.save_deck_state($1, 'story', '新しい名前', 'ja', '{}', $2, $2, true, 'rename')
    `, [first.saved_id, { ...content, renamed: true }])).rows[0] as { saved_version: number };
    expect(renamed.saved_version).toBe(2);
  });
});

describe('旧ユーザーデータの移行', () => {
  const deckId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const deckVersionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const assetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const datasetVersionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const sourceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const working = {
    schemaVersion: 1, slideLocale: 'ja', slides: [], editor: { current: 0, slots: {} }, datasetRefs: {},
    legacyImport: { sourceTable: 'view_specs', sourceId: deckId, sourceVersion: 3 },
  };
  const datasets = [{
    assetId, versionId: datasetVersionId, name: 'table',
    payload: { schemaVersion: 1, fields: [], records: [] },
    input: { kind: 'legacy_dataset', dataset: {}, projection: { mode: 'matrix', measureFieldIds: [] } },
    contentHash: 'legacy-content', semanticsHash: 'legacy-semantics', originalTableHash: 'legacy-original',
    source: { id: sourceId, kind: 'internal', title: '旧資料', citationText: '出典：旧資料' },
  }];

  it('service roleだけが1件をまとめて移し、再実行は重複させない', async () => {
    const workspaceId = (await as(ALICE, "select id from public.workspaces where kind = 'personal'")).rows[0]!.id;
    const sql = `select public.import_legacy_user_deck($1, $2, $3, $4, 'chart', '旧チャート', 'ja', array['日本語'], $5, 3, now(), now(), $6) as result`;
    await expect(as(ALICE, sql, [ALICE, workspaceId, deckId, deckVersionId, working, datasets])).rejects.toThrow();
    expect((await asService(sql, [ALICE, workspaceId, deckId, deckVersionId, working, datasets])).rows).toEqual([{ result: 'imported' }]);
    expect((await asService(sql, [ALICE, workspaceId, deckId, deckVersionId, working, datasets])).rows).toEqual([{ result: 'skipped' }]);
    expect((await as(ALICE, 'select kind, name, user_tags from public.decks where id = $1', [deckId])).rows)
      .toEqual([{ kind: 'chart', name: '旧チャート', user_tags: ['日本語'] }]);
    expect((await as(ALICE, 'select version from public.deck_versions where deck_id = $1', [deckId])).rows).toEqual([{ version: 3 }]);
    expect((await as(ALICE, 'select current_version_id from public.dataset_assets where id = $1', [assetId])).rows)
      .toEqual([{ current_version_id: datasetVersionId }]);
    expect((await as(ALICE, 'select title from public.sources where id = $1', [sourceId])).rows).toEqual([{ title: '旧資料' }]);
  });
});
