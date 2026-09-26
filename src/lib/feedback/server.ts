import { z } from 'zod';

/**
 * ベータ版のフィードバック（/api/feedback の中身。Next.js から切り離してテストする）。
 * 1) 入力を確かめる（隠し欄に何か入っていればスパムとして、受け付けたふりをして捨てる）
 * 2) 同じ送り元からの回数を抑える
 * 3) メールで通知（設定がある時だけ）→ 4) Supabase に保存（通知できたかも残す）
 * 保存かメールのどちらかができれば「届いた」とする。
 */
export const FEEDBACK_CATEGORIES = ['bug', 'hard_to_use', 'request', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_MAX = 4000;

export const FeedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(1).max(FEEDBACK_MAX),
  replyEmail: z.string().trim().max(254).email().optional().or(z.literal('')),
  page: z.string().max(300).regex(/^\/[^\s]*$/).optional(),
  locale: z.enum(['ja', 'en']).optional(),
  /** 人には見えない欄。入っていればロボット */
  website: z.string().max(0).optional(),
});
export type FeedbackInput = z.infer<typeof FeedbackSchema>;

export type FeedbackRow = { category: FeedbackCategory; message: string; reply_email: string | null; page: string | null; locale: 'ja' | 'en' | null; notified: boolean };

export interface FeedbackDeps {
  /** 送り元（IP など）。回数の上限に使うだけで、保存しない */
  sender: string;
  /** ログイン中ならその人のメール（通知メールに書くだけ） */
  userEmail?: string | null;
  insert: (row: FeedbackRow) => Promise<boolean>;
  /** 設定が無ければ undefined（メールを送らない） */
  sendEmail?: (mail: { subject: string; text: string; replyTo?: string }) => Promise<boolean>;
  now?: () => number;
}

export type FeedbackResult = { ok: true } | { ok: false; reason: 'bad_input' | 'too_many' | 'failed' };

/** 10分に5回まで（サーバーが動いている間だけの歯止め） */
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;
const hits = new Map<string, number[]>();
export const resetFeedbackLimit = () => hits.clear();

const CATEGORY_JA: Record<FeedbackCategory, string> = { bug: '不具合', hard_to_use: '使いにくい', request: '要望', other: 'その他' };

export function feedbackMail(row: FeedbackRow, userEmail?: string | null): { subject: string; text: string } {
  const head = row.message.replace(/\s+/g, ' ').slice(0, 40);
  return {
    subject: `[Slide Story Coach β] ${CATEGORY_JA[row.category]}：${head}`,
    text: [
      `種類：${CATEGORY_JA[row.category]}`,
      `画面：${row.page ?? '-'}`,
      `言語：${row.locale ?? '-'}`,
      `返信先：${row.reply_email ?? '（希望なし）'}`,
      `ログイン：${userEmail ?? '（未ログイン）'}`,
      '',
      row.message,
    ].join('\n'),
  };
}

export async function handleFeedback(body: unknown, deps: FeedbackDeps): Promise<FeedbackResult> {
  const p = FeedbackSchema.safeParse(body);
  if (!p.success) {
    // 隠し欄だけが原因なら、受け付けたふりをする（ロボットに手がかりを与えない）
    const onlyBot = p.error.issues.every((i) => i.path[0] === 'website');
    return onlyBot ? { ok: true } : { ok: false, reason: 'bad_input' };
  }
  const now = deps.now?.() ?? Date.now();
  const recent = (hits.get(deps.sender) ?? []).filter((x) => now - x < WINDOW_MS);
  if (recent.length >= LIMIT) return { ok: false, reason: 'too_many' };
  hits.set(deps.sender, [...recent, now]);

  const v = p.data;
  const row: FeedbackRow = {
    category: v.category, message: v.message, reply_email: v.replyEmail ? v.replyEmail : null,
    page: v.page ?? null, locale: v.locale ?? null, notified: false,
  };
  const mail = feedbackMail(row, deps.userEmail);
  row.notified = deps.sendEmail ? await deps.sendEmail({ ...mail, ...(row.reply_email ? { replyTo: row.reply_email } : {}) }).catch(() => false) : false;
  const saved = await deps.insert(row).catch(() => false);
  return saved || row.notified ? { ok: true } : { ok: false, reason: 'failed' };
}

/** Resend（https://resend.com）でメールを送る。キーと宛先が無ければ undefined */
export function resendSender(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): FeedbackDeps['sendEmail'] {
  const key = env.RESEND_API_KEY, to = env.FEEDBACK_TO_EMAIL;
  if (!key || !to) return undefined;
  const from = env.FEEDBACK_FROM_EMAIL || 'Slide Story Coach <onboarding@resend.dev>';
  return async ({ subject, text, replyTo }) => {
    const r = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    return r.ok;
  };
}
