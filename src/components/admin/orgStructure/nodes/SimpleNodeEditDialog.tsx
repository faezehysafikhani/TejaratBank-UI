// «ویرایش نام و شخص» of a node in the simple chart: the name and, for a سمت سازمانی, the one person who holds it.
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { type ChartUnit, type UnplacedUser, getAssignment, removeAssignment, setAssignment, setNodeManager, updateNode } from '../../../../services/orgStructureApi';

export const SimpleNodeEditDialog: React.FC<{
  unit: ChartUnit;
  companyId: string;
  /** A سمت: it has a person. */
  isRole: boolean;
  /** People with no place yet (the current holder is added to the list). */
  people: UnplacedUser[];
  rowVersion: string | null;
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}> = ({ unit, companyId, isRole, people, rowVersion, onSaved, onClose }) => {
  const [name, setName] = useState(unit.name);
  const [personId, setPersonId] = useState(unit.manager?.userId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holder = unit.manager;
  const choices = [...(holder ? [{ userId: holder.userId, displayName: holder.displayName }] : []), ...people.filter((p) => p.userId !== holder?.userId)];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let version = rowVersion;
      if (name.trim() !== unit.name) {
        const node = await updateNode(unit.unitId, { name: name.trim(), nodeTypeId: unit.nodeType?.nodeTypeId ?? null, rowVersion: version });
        version = node.rowVersion;
      }
      if (isRole && personId !== (holder?.userId ?? '')) {
        // The one who held the seat becomes someone with no place; the new person takes it.
        if (holder) {
          const old = await getAssignment(holder.userId);
          if (old?.unitId === unit.unitId) await removeAssignment(holder.userId);
        }
        await setNodeManager(unit.unitId, personId || null, version);
        if (personId) await setAssignment(personId, { companyId, unitId: unit.unitId, positionId: null, managerUserId: null });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'ذخیره انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title={`ویرایش «${unit.name}»`}
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={save} disabled={busy || !name.trim()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ذخیره</PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      <Field label="عنوان" required>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
      </Field>
      {isRole && (
        <Field label="شخص" hint="فقط کسانی که هنوز جایگاهی ندارند. خالی: سمت بدون شخص.">
          <select className={inputClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">— بدون شخص —</option>
            {choices.map((u) => <option key={u.userId} value={u.userId}>{u.displayName}</option>)}
          </select>
        </Field>
      )}
    </AdminDialog>
  );
};
