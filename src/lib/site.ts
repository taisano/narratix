/** 本番サイトの正式なアドレス（サイトマップ・robots・canonical に使う）。別のドメインで確かめる時は NEXT_PUBLIC_SITE_URL で上書き */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.scoach.wonderjapan.studio').replace(/\/+$/, '');

/** 検索に載せてよい、ログイン不要のページ */
export const PUBLIC_PATHS = ['/', '/start', '/library', '/privacy'] as const;

/** 検索に載せないページ（ログインが要る画面・管理・API） */
export const PRIVATE_PATHS = ['/admin', '/api/', '/account', '/editor', '/quick', '/charts', '/join', '/story'] as const;
