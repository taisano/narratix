/**
 * 課金を始めたら Vercel の環境変数 NEXT_PUBLIC_BILLING_ENABLED を 1 にする（ビルド時に決まる）。
 * 1 の間だけ、料金表のボタンが Stripe への申し込みになる。それ以外は従来の「この料金なら使いたい」の記録だけ。
 * サーバー側は STRIPE_SECRET_KEY が無ければ API が 503 を返すので、片方だけ入れても誤って課金されない。
 */
export const BILLING_LIVE = process.env.NEXT_PUBLIC_BILLING_ENABLED === '1';
