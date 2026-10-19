import type { CommitteeInput } from './api';

export type CommitteeForm = Omit<
  CommitteeInput,
  'contributionAmount' | 'slotCount'
> & { contributionAmount: string; slotCount: string };
export type FormErrors = Partial<Record<keyof CommitteeForm, string>>;
const amountPattern = /^(?!0(?:\.0{1,2})?$)(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export function payoutPerRound(amount: string, slots: string): string | null {
  if (
    !amountPattern.test(amount.trim()) ||
    !/^(?:[1-9]\d?|100)$/.test(slots.trim())
  )
    return null;
  const [whole, fraction = ''] = amount.trim().split('.');
  const total =
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) *
    BigInt(slots.trim());
  return `${total / 100n}.${String(total % 100n).padStart(2, '0')}`;
}

export function parseCommitteeForm(form: CommitteeForm): {
  input: CommitteeInput | null;
  errors: FormErrors;
} {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name || name.length > 120) errors.name = 'committeeForm.invalidName';
  if (!amountPattern.test(form.contributionAmount.trim()))
    errors.contributionAmount = 'committeeForm.invalidAmount';
  if (!/^(?:[1-9]\d?|100)$/.test(form.slotCount.trim()))
    errors.slotCount = 'committeeForm.invalidSlots';
  const date = new Date(`${form.firstDueDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.firstDueDate) ||
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1900 ||
    date.getUTCFullYear() > 2100 ||
    date.toISOString().slice(0, 10) !== form.firstDueDate
  )
    errors.firstDueDate = 'committeeForm.invalidDate';
  if (form.selectionType === 'draw' && form.overdueDrawAllowed === null)
    errors.overdueDrawAllowed = 'committeeForm.chooseRule';
  if (Object.keys(errors).length) return { input: null, errors };
  const [whole, fraction = ''] = form.contributionAmount.trim().split('.');
  return {
    errors,
    input: {
      ...form,
      name,
      contributionAmount: `${whole}.${fraction.padEnd(2, '0')}`,
      slotCount: Number(form.slotCount),
      overdueDrawAllowed:
        form.selectionType === 'fixed' ? null : form.overdueDrawAllowed,
    },
  };
}
