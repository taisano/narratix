'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import { downloadFile, sendFile } from '../editor/pptExport';
import {
  addCandidateField, addField, addRequest, canBuildDataPack, dataPackIssues, fallbackDataPack, moveField, moveRequest, pruneQuestionRefs,
  removeField, removeRequest, renameField, updateField, updateRequest,
} from './dataPack';
import { buildDataPackBook, dataPackMail } from './dataPackExport';
import { overviewIncludes, type DataFieldKind, type DataRequestImportance, type OverviewSection, type StoryDataPackPlan } from './dataPackPlan';
import { XLSX_MIME, dataPackXlsx } from './dataPackXlsx';
import { isCommitEnter } from './ime';
import { storyDisplayTitle, type StoryState } from './model';
import css from './dataPack.module.css';

/**
 * Story データパック（データを集める依頼書）を作る画面。Coach の提案を、Dataset ごとに直して Excel にする。
 * 開いた時点の下書きが StoryState.dataPackPlan に入る（Start 側では plan.storyDraft、保存後は Story に保存）。
 * 流れ：① 直す → ② プレビューで公開される内容を確認 → ダウンロード／メールで依頼
 */

const IMPORTANCE: DataRequestImportance[] = ['required', 'recommended', 'optional'];
const KINDS: DataFieldKind[] = ['dimension', 'measure'];

export function DataPackBuilder({ story, onChange, onClose }: { story: StoryState; onChange: (s: StoryState) => void; onClose: () => void }) {
  const t = useT();
  const seed = useMemo(() => fallbackDataPack(story), [story]);
  const plan: StoryDataPackPlan = useMemo(
    () => pruneQuestionRefs(story.dataPackPlan ?? seed, new Set(story.slides.map((s) => s.id))),
    [story.dataPackPlan, story.slides, seed],
  );
  const commit = (next: StoryDataPackPlan) => onChange({ ...story, dataPackPlan: next });
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  const [selected, setSelected] = useState(plan.requests[0]?.id ?? '');
  const current = plan.requests.find((r) => r.id === selected) ?? plan.requests[0];

  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  return (
    <div className={css.overlay} onClick={onClose}>
      <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby="datapack-title" onClick={(e) => e.stopPropagation()}>
        <header className={css.head}>
          <div>
            <h2 id="datapack-title" className={css.title}>{t('dataPack.title')}</h2>
            <p className={css.lead}>{step === 'edit' ? t('dataPack.lead') : t('dataPack.previewLead')}</p>
          </div>
          <button ref={closeRef} type="button" className={css.close} aria-label={t('dataPack.close')} onClick={onClose}>×</button>
        </header>
        {step === 'edit'
          ? <EditStep story={story} plan={plan} commit={commit} seed={seed} selected={current?.id ?? ''} setSelected={setSelected} onNext={() => setStep('preview')} />
          : <PreviewStep story={story} plan={plan} commit={commit} onBack={() => setStep('edit')} />}
      </div>
    </div>
  );
}

// ──────────── ① 直す ────────────

export function EditStep({ story, plan, commit, seed, selected, setSelected, onNext }: {
  story: StoryState; plan: StoryDataPackPlan; commit: (p: StoryDataPackPlan) => void; seed: StoryDataPackPlan;
  selected: string; setSelected: (id: string) => void; onNext: () => void;
}) {
  const t = useT();
  const current = plan.requests.find((r) => r.id === selected);
  const issues = dataPackIssues(plan);
  const name = (id: string, label: string) => label.trim() || t('dataPack.unnamed', { n: plan.requests.findIndex((r) => r.id === id) + 1 });
  const candidates = current ? (seed.requests.find((r) => r.id === current.id)?.fields ?? []).filter((f) => !current.fields.some((x) => x.id === f.id)) : [];

  return (
    <>
      <div className={css.body}>
        <nav className={css.list} aria-label={t('dataPack.datasets')}>
          <p className={css.sub}>{t('dataPack.datasets')}</p>
          {plan.requests.map((r) => (
            <div key={r.id} className={`${css.item} ${r.id === selected ? css.itemOn : ''}`}>
              <button type="button" className={css.itemMain} aria-current={r.id === selected ? 'true' : undefined} onClick={() => setSelected(r.id)}>
                <span className={css.itemName}>{name(r.id, r.label)}</span>
                <span className={css.badge}>{t(`dataPack.imp.${r.importance}`)}</span>
              </button>
              <span className={css.itemTools}>
                <button type="button" className={css.tool} aria-label={t('dataPack.moveUp')} onClick={() => commit(moveRequest(plan, r.id, -1))}>↑</button>
                <button type="button" className={css.tool} aria-label={t('dataPack.moveDown')} onClick={() => commit(moveRequest(plan, r.id, 1))}>↓</button>
              </span>
            </div>
          ))}
          <button type="button" className={css.add} onClick={() => {
            const next = addRequest(plan, '');
            commit(next);
            const added = next.requests.at(-1);
            if (added && added.id !== plan.requests.at(-1)?.id) setSelected(added.id);
          }}>{t('dataPack.addDataset')}</button>
        </nav>

        {current ? (
          <section className={css.editor} aria-label={name(current.id, current.label)}>
            <label className={css.field}>
              <span>{t('dataPack.name')}</span>
              <input value={current.label} maxLength={100} onChange={(e) => commit(updateRequest(plan, current.id, { label: e.target.value }))} />
            </label>
            <label className={css.field}>
              <span>{t('dataPack.role')}</span>
              <input value={current.role} maxLength={300} onChange={(e) => commit(updateRequest(plan, current.id, { role: e.target.value }))} />
            </label>
            <label className={css.field}>
              <span>{t('dataPack.importance')}</span>
              <select value={current.importance} onChange={(e) => commit(updateRequest(plan, current.id, { importance: e.target.value as DataRequestImportance }))}>
                {IMPORTANCE.map((i) => <option key={i} value={i}>{t(`dataPack.imp.${i}`)}</option>)}
              </select>
            </label>
            <div className={css.field}>
              <span>{t('dataPack.questions')}</span>
              {current.questionRefs.length
                ? <ul className={css.chips}>{current.questionRefs.map((id) => <li key={id}>{story.slides.find((s) => s.id === id)?.question}</li>)}</ul>
                : <span className={css.muted}>{t('dataPack.noQuestions')}</span>}
            </div>

            <div className={css.field}>
              <span>{t('dataPack.fields')}</span>
              <ol className={css.fields}>
                {current.fields.map((f) => (
                  <FieldRow key={f.id} field={f}
                    onRename={(label) => commit(renameField(plan, current.id, f.id, label))}
                    onRequired={(v) => commit(updateField(plan, current.id, f.id, { required: v }))}
                    onUnit={(unit) => commit(updateField(plan, current.id, f.id, { unit }))}
                    onUp={() => commit(moveField(plan, current.id, f.id, -1))}
                    onDown={() => commit(moveField(plan, current.id, f.id, 1))}
                    onRemove={() => commit(removeField(plan, current.id, f.id))} />
                ))}
              </ol>
              {candidates.length > 0 && (
                <div className={css.candidates}>
                  <span className={css.muted}>{t('dataPack.candidates')}</span>
                  {candidates.map((f) => (
                    <button key={f.id} type="button" className={css.chip} onClick={() => commit(addCandidateField(plan, current.id, f))}>＋ {f.label}</button>
                  ))}
                </div>
              )}
              <AddField onAdd={(label, kind) => commit(addField(plan, current.id, label, kind))} />
            </div>
            <button type="button" className={css.danger} onClick={() => {
              const rest = plan.requests.filter((r) => r.id !== current.id);
              commit(removeRequest(plan, current.id));
              setSelected(rest[0]?.id ?? '');
            }}>{t('dataPack.removeDataset')}</button>
          </section>
        ) : <p className={css.muted}>{t('dataPack.empty')}</p>}
      </div>

      <footer className={css.foot}>
        {issues.length > 0 || plan.requests.length === 0 ? (
          <div className={css.issues} role="status">
            <b>{t('dataPack.issues')}</b>
            <ul>
              {plan.requests.length === 0 && <li>{t('dataPack.issue.none')}</li>}
              {issues.map((i) => <li key={`${i.requestId}-${i.missing}`}>{t(`dataPack.issue.${i.missing}`, { name: name(i.requestId, i.label) })}</li>)}
            </ul>
          </div>
        ) : <span />}
        <button type="button" className={css.primary} disabled={!canBuildDataPack(plan)} onClick={onNext}>{t('dataPack.toPreview')}</button>
      </footer>
    </>
  );
}

function FieldRow({ field, onRename, onRequired, onUnit, onUp, onDown, onRemove }: {
  field: StoryDataPackPlan['requests'][number]['fields'][number];
  onRename: (label: string) => void; onRequired: (v: boolean) => void; onUnit: (u: string) => void; onUp: () => void; onDown: () => void; onRemove: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.label);
  const composing = useRef(false);
  const done = (save: boolean) => { if (save) onRename(draft); setEditing(false); };
  return (
    <li className={css.fieldRow}>
      <span className={css.kind} title={t(`dataPack.kind.${field.kind}`)}>{t(`dataPack.kindShort.${field.kind}`)}</span>
      {editing ? (
        <input className={css.inline} autoFocus value={draft} maxLength={100} aria-label={t('dataPack.rename')}
          onChange={(e) => setDraft(e.target.value)}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={(e) => {
            // 日本語の変換を確定する Enter では、名前を確定しない
            if (isCommitEnter(e, composing.current)) { e.preventDefault(); done(true); }
            if (e.key === 'Escape') { e.stopPropagation(); done(false); }
          }}
          onBlur={() => done(true)} />
      ) : <span className={css.fieldName}>{field.label}{field.origin === 'user' && <em className={css.own}>{t('dataPack.own')}</em>}</span>}
      {field.kind === 'measure' && (
        <input className={css.unit} value={field.unit ?? ''} maxLength={40} placeholder={t('dataPack.unit')} aria-label={t('dataPack.unit')} onChange={(e) => onUnit(e.target.value)} />
      )}
      <label className={css.req}><input type="checkbox" checked={field.required} onChange={(e) => onRequired(e.target.checked)} />{t('dataPack.required')}</label>
      <span className={css.itemTools}>
        <button type="button" className={css.tool} aria-label={t('dataPack.rename')} onClick={() => { setDraft(field.label); setEditing(true); }}>✎</button>
        <button type="button" className={css.tool} aria-label={t('dataPack.moveUp')} onClick={onUp}>↑</button>
        <button type="button" className={css.tool} aria-label={t('dataPack.moveDown')} onClick={onDown}>↓</button>
        <button type="button" className={css.tool} aria-label={t('dataPack.removeField')} onClick={onRemove}>✕</button>
      </span>
    </li>
  );
}

function AddField({ onAdd }: { onAdd: (label: string, kind: DataFieldKind) => void }) {
  const t = useT();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<DataFieldKind>('measure');
  const composing = useRef(false);
  const submit = () => { if (label.trim()) { onAdd(label, kind); setLabel(''); } };
  return (
    <div className={css.addField}>
      <input value={label} maxLength={100} placeholder={t('dataPack.fieldPlaceholder')} aria-label={t('dataPack.addField')}
        onChange={(e) => setLabel(e.target.value)}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(e) => {
          // 日本語の変換を確定する Enter では、項目を足さない
          if (isCommitEnter(e, composing.current)) { e.preventDefault(); submit(); }
        }} />
      <select value={kind} aria-label={t('dataPack.kindLabel')} onChange={(e) => setKind(e.target.value as DataFieldKind)}>
        {KINDS.map((k) => <option key={k} value={k}>{t(`dataPack.kind.${k}`)}</option>)}
      </select>
      <button type="button" className={css.addBtn} disabled={!label.trim()} onClick={submit}>{t('dataPack.add')}</button>
    </div>
  );
}

// ──────────── ② プレビューと出力 ────────────

export function PreviewStep({ story, plan, commit, onBack }: { story: StoryState; plan: StoryDataPackPlan; commit: (p: StoryDataPackPlan) => void; onBack: () => void }) {
  const t = useT();
  const book = useMemo(() => buildDataPackBook(story, plan), [story, plan]);
  const [tab, setTab] = useState(0);
  const sheet = book.sheets[Math.min(tab, book.sheets.length - 1)]!;
  const [busy, setBusy] = useState<'download' | 'mail' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mail = useMemo(() => dataPackMail(story, plan), [story, plan]);

  const setOverview = (patch: Partial<StoryDataPackPlan['overview']>) => commit({ ...plan, overview: { ...plan.overview, ...patch } });
  const toggle = (s: OverviewSection, on: boolean) => setOverview({ include: { ...plan.overview.include, [s]: on } });
  const text = (key: 'titleOverride' | 'purposeOverride' | 'backgroundOverride' | 'rulesOverride', v: string) => {
    const next = { ...plan.overview };
    if (v.trim()) next[key] = v; else delete next[key];
    commit({ ...plan, overview: next });
  };

  async function make(kind: 'download' | 'mail') {
    setBusy(kind); setError(null); setNote(null);
    try {
      const blob = await dataPackXlsx(book);
      const file = new File([blob], mail.filename, { type: XLSX_MIME });
      if (kind === 'download') downloadFile(file);
      else {
        const r = await sendFile(file, mail.subject, mail.body);
        if (r === 'retry') setNote(t('dataPack.retry'));
        else if (r === 'mailto') setNote(t('dataPack.mailNote'));
      }
    } catch (e) {
      setError(t('dataPack.error', { message: (e as Error).message ?? String(e) }));
    } finally {
      setBusy(null);
    }
  }

  type Hint = 'dataPack.ov.purposeHint' | 'dataPack.ov.backgroundHint' | 'dataPack.ov.rulesHint';
  const sections: { key: OverviewSection; text?: 'purposeOverride' | 'backgroundOverride' | 'rulesOverride'; hint?: Hint }[] = [
    { key: 'purpose', text: 'purposeOverride', hint: 'dataPack.ov.purposeHint' }, { key: 'background', text: 'backgroundOverride', hint: 'dataPack.ov.backgroundHint' },
    { key: 'consultation' }, { key: 'questions' }, { key: 'datasets' }, { key: 'rules', text: 'rulesOverride', hint: 'dataPack.ov.rulesHint' },
  ];
  const valueOf = (k: 'titleOverride' | 'purposeOverride' | 'backgroundOverride' | 'rulesOverride') => plan.overview[k] ?? '';

  return (
    <>
      <div className={css.body}>
        <section className={css.editor} aria-label={t('dataPack.overviewHead')}>
          <p className={css.sub}>{t('dataPack.overviewHead')}</p>
          <label className={css.field}>
            <span>{t('dataPack.ov.title')}</span>
            <input value={valueOf('titleOverride')} maxLength={100} placeholder={storyDisplayTitle(story)} onChange={(e) => text('titleOverride', e.target.value)} />
          </label>
          {sections.map(({ key, text: tk, hint }) => (
            <div key={key} className={css.field}>
              <label className={css.req}>
                <input type="checkbox" checked={overviewIncludes(plan, key)} onChange={(e) => toggle(key, e.target.checked)} />
                {t(`dataPack.include.${key}`)}
              </label>
              {tk && overviewIncludes(plan, key) && (
                <textarea rows={key === 'rules' ? 4 : 2} value={valueOf(tk)} maxLength={2000} placeholder={hint ? t(hint) : undefined} onChange={(e) => text(tk, e.target.value)} />
              )}
              {key === 'consultation' && overviewIncludes(plan, key) && <p className={css.warn}>{t('dataPack.consultWarn')}</p>}
            </div>
          ))}
          <p className={css.muted}>{t('dataPack.sheetsNote')}</p>
        </section>

        <section className={css.preview} aria-label={t('dataPack.previewHead')}>
          <div className={css.tabs} role="tablist">
            {book.sheets.map((s, i) => (
              <button key={s.name} type="button" role="tab" aria-selected={i === tab} className={`${css.tab} ${i === tab ? css.tabOn : ''}`} onClick={() => setTab(i)}>{s.name}</button>
            ))}
          </div>
          <div className={css.sheetWrap}>
            <table className={css.sheet}>
              <tbody>
                {sheet.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.length === 0 ? <td /> : row.map((c, ci) => (
                      <td key={ci} className={`${c?.bold ? css.th : ''} ${c?.muted ? css.mutedCell : ''}`}>{c?.value ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer className={css.foot}>
        <button type="button" className={css.secondary} onClick={onBack}>{t('dataPack.back')}</button>
        <div className={css.actions}>
          {error && <p className={css.error} role="alert">{error}</p>}
          {note && <p className={css.muted} role="status">{note}</p>}
          <button type="button" className={css.secondary} disabled={busy !== null} aria-busy={busy === 'mail'} onClick={() => void make('mail')}>
            {busy === 'mail' ? t('dataPack.making') : t('dataPack.mail')}
          </button>
          <button type="button" className={css.primary} disabled={busy !== null} aria-busy={busy === 'download'} onClick={() => void make('download')}>
            {busy === 'download' ? t('dataPack.making') : t('dataPack.download')}
          </button>
        </div>
      </footer>
    </>
  );
}

