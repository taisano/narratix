/**
 * 端末の種類（計測と、スマホでの案内に使う）。
 * phone：指で操作し、画面の短い辺が 600px 未満。tablet：指で操作し、それ以上（iPad は Mac と名乗るので、タッチの点の数で見分ける）。
 * それ以外は desktop（キーボードとマウスのある画面。キーボード付きの iPad も tablet のまま）
 */
export type Device = 'phone' | 'tablet' | 'desktop';

export function detectDevice(env: { coarse: boolean; touchPoints: number; ua: string; shortSide: number }): Device {
  const ipad = /Macintosh/.test(env.ua) && env.touchPoints > 1;
  const touch = env.coarse || ipad || /iPhone|iPad|Android/.test(env.ua);
  if (!touch) return 'desktop';
  return env.shortSide < 600 ? 'phone' : 'tablet';
}

export function deviceType(): Device {
  if (typeof window === 'undefined') return 'desktop';
  try {
    return detectDevice({
      coarse: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      touchPoints: navigator.maxTouchPoints ?? 0,
      ua: navigator.userAgent,
      shortSide: Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight),
    });
  } catch {
    return 'desktop';
  }
}
