import React, { useState } from 'react';
import { LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import { AdminCard, IconAction, Notice, PrimaryButton, StatusBadge } from '../AdminUi';
import { userErrorMessage } from '../../../utils/errorMessages';
import { toPersianDigits } from '../../../utils/helpers';
import { appConfirm } from '../../../utils/appDialog';
import { type StructureTemplate, type TemplateNode, type TemplateNodeType, deleteTemplate, getTemplate, listTemplates } from '../../../services/orgStructureApi';
import { EmptyRow, LoadingRow, useLoad } from './orgShared';
import { UI_LEVEL_TITLES } from './nodes/CompanyWizard';
import { CompanyFormDialog } from './nodes/CompanyFormDialog';
import { NodeTypeIcon, safeColor } from './nodes/nodeTypeStyle';

const TemplateTree: React.FC<{ nodes: TemplateNode[]; types: Map<string, TemplateNodeType>; depth?: number }> = ({ nodes, types, depth = 0 }) => (
  <ul className={depth === 0 ? 'space-y-1' : 'space-y-1 ms-5 border-s-2 border-slate-100 dark:border-slate-800 ps-3 mt-1'}>
    {nodes.map((node) => {
      const type = node.type ? types.get(node.type) : undefined;
      return (
        <li key={node.key}>
          <span className="flex items-center gap-2 text-sm">
            <NodeTypeIcon icon={type?.icon} className="w-4 h-4 shrink-0" color={type?.color} />
            <span className="font-bold text-slate-800 dark:text-slate-100">{node.name}</span>
            {type && <span className="text-[10px] font-bold" style={{ color: safeColor(type.color) }}>{type.name}</span>}
          </span>
          {node.children && node.children.length > 0 && <TemplateTree nodes={node.children} types={types} depth={depth + 1} />}
        </li>
      );
    })}
  </ul>
);

/** «قالب‌ها»: the ready structures (built in, and the ones saved from companies) and what each holds. */
export const OrgTemplatesPanel: React.FC<{ canManageTemplates: boolean; canCreateCompany: boolean }> = ({ canManageTemplates, canCreateCompany }) => {
  const data = useLoad(listTemplates, 'دریافت قالب‌ها ممکن نشد.');
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [wizardFor, setWizardFor] = useState<string | null | undefined>(undefined);
  const detail = useLoad(async () => (openId ? getTemplate(openId) : null), 'دریافت محتوای قالب ممکن نشد.');
  const lastOpen = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (lastOpen.current !== openId) { lastOpen.current = openId; void detail.reload(); }
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (template: StructureTemplate) => {
    if (!(await appConfirm(`قالب «${template.name}» حذف شود؟ شرکت‌هایی که از آن ساخته شده‌اند تغییری نمی‌کنند.`, { danger: true, confirmLabel: 'حذف' }))) return;
    try {
      await deleteTemplate(template.id);
      setMessage({ type: 'success', text: 'قالب حذف شد.' });
      if (openId === template.id) setOpenId(null);
      await data.reload();
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'حذف قالب انجام نشد.') });
    }
  };

  if (data.loading && !data.data) return <AdminCard><LoadingRow /></AdminCard>;
  if (data.error) return <Notice type="error">{data.error}</Notice>;
  const templates = data.data || [];
  const content = detail.data?.content;
  const types = new Map((content?.nodeTypes || []).map((t) => [t.key, t] as const));

  return (
    <div className="space-y-4">
      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">قالب‌های ساختار</h3>
            <p className="text-xs text-slate-500 mt-0.5">ساختار آماده برای شرکت تازه. «ذخیره به‌عنوان قالب» را از چارتِ هر شرکت بزنید تا ساختار خودتان هم اینجا بیاید.</p>
          </div>
          {canCreateCompany && <PrimaryButton onClick={() => setWizardFor(null)}><Plus className="w-4 h-4" /> شرکت جدید</PrimaryButton>}
        </div>
        {templates.length === 0 ? <EmptyRow>قالبی نیست.</EmptyRow> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {templates.map((t) => (
              <div key={t.id}>
                <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <LayoutTemplate className="w-5 h-5 text-indigo-600 shrink-0" />
                  <button type="button" onClick={() => setOpenId(openId === t.id ? null : t.id)} aria-expanded={openId === t.id} className="min-w-0 flex-1 text-right cursor-pointer">
                    <span className="block text-sm font-extrabold text-slate-900 dark:text-slate-100">{t.name}</span>
                    <span className="block text-[11px] text-slate-500">{toPersianDigits(t.nodeCount)} گره · {toPersianDigits(t.nodeTypeCount)} جزء چارت · سطح {UI_LEVEL_TITLES[t.uiLevel] || t.uiLevel}</span>
                  </button>
                  <StatusBadge tone={t.isSystem ? 'slate' : 'green'}>{t.isSystem ? 'آماده' : 'قالب شما'}</StatusBadge>
                  {canCreateCompany && <IconAction icon={Plus} label={`ساخت شرکت با ${t.name}`} onClick={() => setWizardFor(t.id)} />}
                  {canManageTemplates && !t.isSystem && <IconAction icon={Trash2} tone="rose" label={`حذف ${t.name}`} onClick={() => remove(t)} />}
                </div>
                {openId === t.id && (
                  <div className="px-5 pb-4 space-y-3">
                    {t.description && <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">{t.description}</p>}
                    {detail.loading ? <LoadingRow /> : detail.error ? <Notice type="error">{detail.error}</Notice>
                      : content?.nodes && content.nodes.length > 0 ? <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800 p-3" data-scrollable><TemplateTree nodes={content.nodes} types={types} /></div>
                        : <p className="text-xs text-slate-400">این قالب گره‌ی اولیه ندارد.</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </AdminCard>
      {wizardFor !== undefined && (
        <CompanyFormDialog
          templates={templates}
          initialTemplateId={wizardFor}
          onSaved={() => setMessage({ type: 'success', text: 'شرکت ساخته شد. در «چارت سازمانی» ببینیدش.' })}
          onClose={() => setWizardFor(undefined)}
        />
      )}
    </div>
  );
};
