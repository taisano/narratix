import { beforeEach, describe, expect, it, vi } from 'vitest';
import { feedbackMail, handleFeedback, resendSender, resetFeedbackLimit, type FeedbackRow } from './server';

const ok = { category: 'bug', message: 'PPT の出力でタイトルが切れる', replyEmail: 'a@example.com', page: '/editor', locale: 'ja' };

describe('フィードバック', () => {
  beforeEach(() => resetFeedbackLimit());

  it('メールを送ってから保存する（通知できたかも残す）。返信先は Reply-To に', async () => {
    const rows: FeedbackRow[] = [];
    const send = vi.fn(async (_m: { subject: string; text: string; replyTo?: string }) => true);
    const r = await handleFeedback(ok, { sender: 'ip1', userEmail: 'tai@example.com', insert: async (x) => { rows.push(x); return true; }, sendEmail: send });
    expect(r).toEqual({ ok: true });
    expect(rows[0]).toMatchObject({ category: 'bug', reply_email: 'a@example.com', page: '/editor', notified: true });
    expect(send.mock.calls[0]![0]).toMatchObject({ replyTo: 'a@example.com' });
    expect(send.mock.calls[0]![0].text).toContain('tai@example.com');
  });

  it('メールの設定が無くても保存はする。保存もメールもだめなら失敗', async () => {
    expect(await handleFeedback(ok, { sender: 'ip2', insert: async () => true })).toEqual({ ok: true });
    expect(await handleFeedback(ok, { sender: 'ip3', insert: async () => false })).toEqual({ ok: false, reason: 'failed' });
    expect(await handleFeedback(ok, { sender: 'ip4', insert: async () => false, sendEmail: async () => true })).toEqual({ ok: true });
  });

  it('入力の確認：種類・空・長さ・メールの形・パス', async () => {
    const deps = { sender: 'ip5', insert: async () => true };
    expect(await handleFeedback({ ...ok, category: 'spam' }, deps)).toEqual({ ok: false, reason: 'bad_input' });
    expect(await handleFeedback({ ...ok, message: '   ' }, deps)).toEqual({ ok: false, reason: 'bad_input' });
    expect(await handleFeedback({ ...ok, message: 'x'.repeat(4001) }, deps)).toEqual({ ok: false, reason: 'bad_input' });
    expect(await handleFeedback({ ...ok, replyEmail: 'nope' }, deps)).toEqual({ ok: false, reason: 'bad_input' });
    expect(await handleFeedback({ ...ok, page: 'https://evil.example' }, deps)).toEqual({ ok: false, reason: 'bad_input' });
    expect(await handleFeedback({ ...ok, replyEmail: '' }, deps)).toEqual({ ok: true });
  });

  it('隠し欄に入力があれば（ロボット）、受け付けたふりをして保存しない', async () => {
    const insert = vi.fn(async () => true);
    expect(await handleFeedback({ ...ok, website: 'http://spam' }, { sender: 'ip6', insert })).toEqual({ ok: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it('同じ送り元から10分に5回まで', async () => {
    let now = 0;
    const deps = { sender: 'ip7', insert: async () => true, now: () => now };
    for (let i = 0; i < 5; i++) expect((await handleFeedback(ok, deps)).ok).toBe(true);
    expect(await handleFeedback(ok, deps)).toEqual({ ok: false, reason: 'too_many' });
    now = 10 * 60 * 1000 + 1;
    expect((await handleFeedback(ok, deps)).ok).toBe(true);
  });

  it('Resend：キーと宛先が無ければ送らない。あれば API を呼ぶ', async () => {
    expect(resendSender({})).toBeUndefined();
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    const send = resendSender({ RESEND_API_KEY: 're_x', FEEDBACK_TO_EMAIL: 'me@example.com' }, f as unknown as typeof fetch)!;
    expect(await send({ subject: 's', text: 't' })).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ['me@example.com'], subject: 's' });
  });

  it('件名に種類と内容の頭', () => {
    const m = feedbackMail({ category: 'request', message: '縦軸の\n目盛りを選びたい', reply_email: null, page: '/start', locale: 'ja', notified: false });
    expect(m.subject).toBe('[Slide Story Coach β] 要望：縦軸の 目盛りを選びたい');
  });
});
