import { describe, expect, it } from 'vitest';
import { detectDevice } from './device';

describe('端末の種類', () => {
  it('スマホ・タブレット（iPad は Mac と名乗る）・パソコン', () => {
    expect(detectDevice({ coarse: true, touchPoints: 5, ua: 'iPhone', shortSide: 390 })).toBe('phone');
    expect(detectDevice({ coarse: true, touchPoints: 5, ua: 'Android', shortSide: 412 })).toBe('phone');
    expect(detectDevice({ coarse: false, touchPoints: 5, ua: 'Macintosh; Intel Mac OS X', shortSide: 820 })).toBe('tablet');
    expect(detectDevice({ coarse: false, touchPoints: 0, ua: 'Macintosh; Intel Mac OS X', shortSide: 900 })).toBe('desktop');
    expect(detectDevice({ coarse: false, touchPoints: 0, ua: 'Windows', shortSide: 1080 })).toBe('desktop');
  });
});
