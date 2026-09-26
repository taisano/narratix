/**
 * 紹介動画（YouTube）。本番の動画ができたら URL をここで差し替える。
 * いまは仮の URL（動画はまだ無い）。仮のうちは「準備中」と出す。
 */
export const INTRO_VIDEO_URL = 'https://www.youtube.com/watch?v=XXXXXXXXXXX';
export const INTRO_VIDEO_PLACEHOLDER = INTRO_VIDEO_URL.includes('XXXXXXXXXXX');

/** watch?v= / youtu.be / embed のどれからでも動画 ID を取り出す */
export function youtubeId(url: string): string | null {
  const m = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/.exec(url);
  return m ? m[1]! : null;
}
