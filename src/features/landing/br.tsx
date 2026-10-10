import { Fragment, type ReactNode } from 'react';
import css from './landing.module.css';

/** 見出しの「\n」の位置で、スマホだけ改行する（パソコンでは1行のまま。改行位置は翻訳の文言で決める） */
export function br(text: string): ReactNode {
  return text.split('\n').map((part, i) => (
    <Fragment key={i}>{i > 0 && <br className={css.spBr} />}{part}</Fragment>
  ));
}
