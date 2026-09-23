// reference/mekko-builder.html の model() と layout() をそのまま Node で動かし、
// 配置エンジンのゴールデンテスト用の期待値を書き出す。
//   node scripts/extract-reference-golden.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../reference/mekko-builder.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
let src = scripts[scripts.length - 1];
const hook = 'bindControls();\n})();';
if (!src.includes(hook)) throw new Error('reference script layout changed');
src = src.replace(hook, 'globalThis.__ref={sample,model,layout,setS:v=>{S=v;}};\n})();');

const el = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : el()), set: () => true, apply: () => el() });
const ctx = {
  document: { getElementById: el, querySelectorAll: () => [], querySelector: el },
  localStorage: { getItem: () => null, setItem() {} },
  window: {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  console,
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const ref = ctx.__ref;

const variants = {
  default: {},
  period_mode: { mode: 'period' },
  highlight_dual: { highlight: 1 },
  no_table: { growMarket: false, growShapes: [false, false, false, false] },
  input_order_no_pt: { sortBySize: false, ptLabels: false },
};
const out = {};
for (const [name, patch] of Object.entries(variants)) {
  const S = { ...ref.sample(), ...patch };
  ref.setS(S);
  const m = ref.model();
  out[name] = JSON.parse(JSON.stringify({ state: S, model: m, layout: ref.layout(m) }));
}
writeFileSync(new URL('../src/engine/__fixtures__/reference-mekko.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('wrote', Object.keys(out).join(', '));
