/**
 * 入力欄で Enter を「確定」として扱ってよいか。日本語の変換を確定する Enter（変換中）では、項目や名前を確定しない。
 * composing＝compositionstart〜compositionend の間か。isComposing／keyCode 229 は、ブラウザによってはこちらだけが立つ
 */
export const isCommitEnter = (e: { key: string; keyCode?: number; nativeEvent?: { isComposing?: boolean } }, composing: boolean): boolean =>
  e.key === 'Enter' && !composing && !e.nativeEvent?.isComposing && e.keyCode !== 229;
