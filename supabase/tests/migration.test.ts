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
  create table auth.users (id uuid primary key);
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

const save = (user: string, id: string | null, title: string) =>
  as(user, 'select * from public.save_chart($1, $2, $3, $4, $5)', [id, title, dataset, spec, { title }]);

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
    await expect(as(null, 'select * from public.save_chart(null, $1, $2, $3, $4)', ['x', dataset, spec, {}])).rejects.toThrow();
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
