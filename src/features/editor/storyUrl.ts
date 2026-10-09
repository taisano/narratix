/**
 * 編集画面のURL：ストーリーを開いている間は ?story=… を残す（再読込で同じストーリーを開き直す）。
 * チャートを開く・新しく作るなど、ほかの指示ではクエリを消す
 */
export const storyUrl = (intent: { kind: string; id?: string } | null | undefined, path: string): string =>
  intent?.kind === 'story' && intent.id ? `${path}?story=${encodeURIComponent(intent.id)}` : path;
