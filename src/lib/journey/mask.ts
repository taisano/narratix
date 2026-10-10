/**
 * 利用の流れの記録（docs/research-data-collection-design.md）に入れる相談文の「伏せ字」。
 * メールアドレス・URL・電話番号・郵便番号・長い数字の並び・@アカウントを伏せ、長さを切る。
 * 会社名などの固有名詞までは自動では伏せられない（利用者には、そのことを同意の文面で伝える）。
 */
export const JOURNEY_TEXT_MAX = 600;

export function maskText(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[メール]')
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/〒?\s*\d{3}-\d{4}/g, '[番号]')
    .replace(/\+?\d[\d\-\s().]{8,}\d/g, '[番号]')
    .replace(/\d{7,}/g, '[番号]')
    .replace(/(^|[\s、。，,（(])@\w{2,}/g, '$1[アカウント]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, JOURNEY_TEXT_MAX);
}
