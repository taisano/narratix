/** 文字幅の見積もり（インチ）。半角は全角の0.56倍として数える */
export function textWidth(s: string, pt: number): number {
  let w = 0;
  for (const ch of s) w += (/[\x20-\x7e]/.test(ch) ? 0.56 : 1.0) * pt / 72;
  return w;
}

/** 幅に収まるように折り返す（日本語は1文字単位、英数字は単語単位）。行数を超えたら末尾を「…」にする */
export function wrapText(s: string, pt: number, maxW: number, maxLines: number): string[] {
  const out: string[] = [];
  // 入力した改行はそのまま改行にし、1行が長ければさらに折り返す
  for (const para of s.replace(/\r/g, '').split('\n')) {
    let line = '';
    // 英数字の単語は途中で切らない（「marke ts」にしない）。日本語は1文字ずつ。単語が1行より長い時だけ文字で切る
    for (const tok of para.match(/[\x21-\x7e]+|\s+|[^\s\x21-\x7e]/g) ?? []) {
      if (textWidth(line + tok, pt) <= maxW || !line) {
        if (textWidth(tok, pt) > maxW && !line) {
          for (const ch of tok) { if (textWidth(line + ch, pt) > maxW && line) { out.push(line); line = ch; } else line += ch; }
        } else line += tok;
        continue;
      }
      // 行の頭に句読点・閉じかっこを置かない（前の行に少しはみ出させる）
      if (/^[。、，．）」』】！？]$/.test(tok)) { line += tok; continue; }
      out.push(line.trimEnd());
      if (/^\s+$/.test(tok)) { line = ''; continue; }
      if (textWidth(tok, pt) > maxW) {
        line = '';
        for (const ch of tok) { if (textWidth(line + ch, pt) > maxW && line) { out.push(line); line = ch; } else line += ch; }
      } else line = tok;
    }
    out.push(line.trimEnd());
  }
  // 最後の空行（末尾の改行）は捨てる
  while (out.length > 1 && out[out.length - 1] === '') out.pop();
  if (out.length === 1 && out[0] === '') out.length = 0;
  if (out.length > maxLines) {
    out.length = maxLines;
    out[maxLines - 1] = out[maxLines - 1]!.slice(0, -1) + '…';
  }
  return out;
}
