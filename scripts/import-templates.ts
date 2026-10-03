/**
 * 旧Libraryの書き出しを新しいtemplatesへ読み込む。
 * 実行例：npm run import:templates
 * 必須環境変数：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、TEMPLATE_WORKSPACE_ID、TEMPLATE_OWNER_ID
 * Codexは実行しない。本番への投入はユーザーまたはClaudeが行う。
 */
import { createClient } from '@supabase/supabase-js';
import seed from '../supabase/seed/library_items.v3.json' with { type: 'json' };
import { convertTemplateSeed, type LegacyTemplateSeed } from '../src/features/data/template';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export async function importTemplates(): Promise<number> {
  const url = required('SUPABASE_URL');
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  const workspaceId = required('TEMPLATE_WORKSPACE_ID');
  const ownerId = required('TEMPLATE_OWNER_ID');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = convertTemplateSeed(seed as LegacyTemplateSeed[]).map((row) => ({
    ...row, workspace_id: workspaceId, created_by: ownerId,
  }));
  const { error } = await client.from('templates').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(error.message);
  return rows.length;
}

if (import.meta.url === new URL(process.argv[1]!, 'file:').href) {
  const run = process.argv.includes('--dry-run')
    ? Promise.resolve(convertTemplateSeed(seed as LegacyTemplateSeed[]).length).then((count) => console.log(`Validated ${count} templates.`))
    : importTemplates().then((count) => console.log(`Imported ${count} templates.`));
  run.catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Template import failed.');
    process.exitCode = 1;
  });
}
