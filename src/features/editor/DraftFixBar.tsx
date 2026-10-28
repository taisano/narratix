import { useState } from 'react';
import { useT } from '@/i18n/ui';
import { RolePicker } from '../start/DraftPanel';
import { RelationAxes } from '../start/RelationAxes';
import { KpiBasis } from '../start/KpiBasis';
import { DerivedConfirm } from '../start/DerivedConfirm';
import { analyzeTable } from '../data/draft/session';
import { familyOf, rebuildProjectFromDraft, type ProjectState } from './project';
import type { ColumnRoleMap } from '../data/draft/columnRoles';
import { useConfirm } from '../shared/Confirm';
import css from '../start/draft.module.css';

/** 貼った表から作ったデータの上に出す：列の使い方を直して、データを作り直す（保存後も開ける） */
export function DraftFixBar({ project, setProject, rebuildWith }: { project: ProjectState; setProject: (f: (p: ProjectState) => ProjectState) => void; /** Story：スライドを作り直さず、データだけ作り直す関数（無ければ1枚の流れの作り直し） */ rebuildWith?: (p: ProjectState, map: ColumnRoleMap) => ReturnType<typeof rebuildProjectFromDraft> }) {
  const t = useT();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);
  const o = project.draft;
  if (!o) return null;
  const a = analyzeTable(o.tsv);
  const hasKpi = project.slides.some((sl) => sl.recipe === 'TABLE_KPI');
  const hasRelation = project.slides.some((sl) => familyOf(sl.chart) === 'relation');
  const rebuild = (map: typeof o.map) => {
    const r = (rebuildWith ?? rebuildProjectFromDraft)(project, map);
    if (!r.ok) { setMsg({ kind: 'err', text: t(r.reason === 'mixed' ? 'editor.draftFix.mixed' : 'editor.draftFix.unbuildable') }); return; }
    setProject(() => r.project);
    setMsg({ kind: 'ok', text: t('editor.draftFix.done') });
  };
  return (
    <div className={css.picker} data-testid="draft-fix">
      <p className={css.note}>{t('editor.draftFix.lead')}</p>
      {!open && <button type="button" className={css.link} onClick={() => { setOpen(true); setMsg(null); }}>{t('editor.draftFix.open')}</button>}
      {open && (
        <RolePicker
          draft={{ tsv: o.tsv, map: o.map, shape: null, question: o.question }}
          onCancel={() => setOpen(false)}
          onApply={async (map) => {
            if (!(await confirm({ title: t('editor.draftFix.confirmTitle'), body: t('editor.draftFix.confirmBody'), ok: t('editor.draftFix.confirmOk') }))) return;
            const r = (rebuildWith ?? rebuildProjectFromDraft)(project, map);
            if (!r.ok) { setMsg({ kind: 'err', text: t(r.reason === 'mixed' ? 'editor.draftFix.mixed' : 'editor.draftFix.unbuildable') }); return; }
            setProject(() => r.project);
            setMsg({ kind: 'ok', text: t('editor.draftFix.done') });
            setOpen(false);
          }}
        />
      )}
      {!open && hasRelation && a.ok && <RelationAxes map={o.map} columns={a.profile.columns} onApply={rebuild} />}
      {!open && hasKpi && a.ok && <KpiBasis map={o.map} rows={a.table.rows.length} onApply={rebuild} />}
      {!open && a.ok && <DerivedConfirm map={o.map} table={a.table} onApply={rebuild} />}
      {msg && <p className={msg.kind === 'err' ? css.err : css.note} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
    </div>
  );
}
