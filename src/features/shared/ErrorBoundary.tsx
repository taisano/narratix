'use client';

import { Component, type ReactNode } from 'react';

/**
 * 画面の一部で例外が起きても、ページ全体を止めない（「This page couldn't load」にしない）。
 * 代わりに短い案内と［元に戻す］［もう一度表示する］を出す。resetKey が変われば、もう一度表示を試す
 */
export class ErrorBoundary extends Component<{ children: ReactNode; message: string; retryLabel: string; undoLabel?: string; onUndo?: () => void; resetKey?: unknown }, { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(p: { resetKey?: unknown }, s: { error: Error | null; key: unknown }) {
    return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null;
  }
  componentDidCatch(error: Error) { console.error('[ErrorBoundary]', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ padding: '12px 14px', borderRadius: 8, background: '#FBEAEA', color: '#7A1C1C', fontSize: 13, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span>{this.props.message}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {this.props.onUndo && <button type="button" className="btn" onClick={() => { this.props.onUndo!(); this.setState({ error: null }); }}>{this.props.undoLabel}</button>}
          <button type="button" className="btn" onClick={() => this.setState({ error: null })}>{this.props.retryLabel}</button>
        </span>
      </div>
    );
  }
}
