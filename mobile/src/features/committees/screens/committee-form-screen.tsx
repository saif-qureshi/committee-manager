import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ChoiceField } from '@/components/ui/choice-field';
import { DateField } from '@/components/ui/date-field';
import { Input } from '@/components/ui/input';
import { InfoTip } from '@/components/ui/info-tip';
import { AppScreen as Screen } from '@/components/app-screen';
import { Text } from '@/components/ui/text';
import { useSession } from '@/features/auth/session-store';
import { ApiError } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { theme } from '@/theme';
import { localDate } from '@/lib/date';
import { createCommittee, updateCommittee, type Committee } from '../api';
import {
  parseCommitteeForm,
  payoutPerRound,
  type CommitteeForm,
  type FormErrors,
} from '../committee-form';
import { formatAmount } from '../format-amount';

export default function CommitteeFormScreen({
  committee,
}: {
  committee?: Committee;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const token = useSession((state) => state.token)!;
  const [form, setForm] = useState<CommitteeForm>({
    name: committee?.name ?? '',
    contributionAmount: committee?.contributionAmount ?? '',
    slotCount: String(committee?.slotCount ?? 10),
    selectionType: committee?.selectionType ?? 'fixed',
    frequency: committee?.frequency ?? 'monthly',
    firstDueDate: committee?.firstDueDate ?? localDate(),
    overdueDrawAllowed: committee?.overdueDrawAllowed ?? null,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const save = useMutation({
    mutationFn: (input: Parameters<typeof createCommittee>[1]) =>
      committee
        ? updateCommittee(token, committee.id, input)
        : createCommittee(token, input),
    onSuccess: (response) => {
      if (useSession.getState().token !== token) return;
      queryClient.setQueryData(['committee', response.data.id], response);
      void queryClient.invalidateQueries({ queryKey: ['committees'] });
      if (committee)
        void queryClient.invalidateQueries({
          queryKey: ['committee', committee.id],
        });
    },
  });
  const update = <K extends keyof CommitteeForm>(
    key: K,
    value: CommitteeForm[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  function submit() {
    if (save.isPending) return;
    const parsed = parseCommitteeForm(form);
    setErrors(parsed.errors);
    if (!parsed.input) return;
    save.mutate(parsed.input, {
      onSuccess: ({ data }) => {
        if (useSession.getState().token !== token) return;
        if (committee && router.canGoBack()) router.back();
        else
          router.replace({
            pathname: '/committees/[committeeId]',
            params: { committeeId: data.id },
          });
      },
    });
  }
  const payout = payoutPerRound(form.contributionAmount, form.slotCount);
  return (
    <Screen>
      <PageHeader
        title={t(committee ? 'committeeForm.editTitle' : 'committeeForm.title')}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.spacing.screen }}
        >
          <View className="gap-5">
            <Input
              label={t('committeeForm.name')}
              placeholder={t('committeeForm.namePlaceholder')}
              value={form.name}
              onChangeText={(value) => update('name', value)}
              maxLength={120}
              editable={!save.isPending}
              error={errors.name ? t(errors.name) : undefined}
            />
            <ChoiceField
              label={t('committeeForm.type')}
              value={form.selectionType}
              options={
                [
                  { value: 'fixed', label: t('committees.fixed') },
                  { value: 'draw', label: t('committees.draw') },
                ] as const
              }
              onChange={(value) => update('selectionType', value)}
              disabled={
                save.isPending || Boolean(committee?.assignedMemberCount)
              }
            />
            <Input
              label={t('committeeForm.amount')}
              value={form.contributionAmount}
              onChangeText={(value) => update('contributionAmount', value)}
              keyboardType="decimal-pad"
              latin
              placeholder="10000.00"
              editable={!save.isPending}
              error={
                errors.contributionAmount
                  ? t(errors.contributionAmount)
                  : undefined
              }
            />
            <View>
              <Input
                label={t('committeeForm.slots')}
                value={form.slotCount}
                onChangeText={(value) => update('slotCount', value)}
                keyboardType="number-pad"
                latin
                maxLength={3}
                editable={!save.isPending && !committee?.assignedMemberCount}
                error={errors.slotCount ? t(errors.slotCount) : undefined}
              />
              {committee?.assignedMemberCount ? (
                <View style={{ position: 'absolute', end: 0, top: -12 }}>
                  <InfoTip text={t('committeeForm.assignedLock')} />
                </View>
              ) : null}
            </View>
            <ChoiceField
              label={t('committeeForm.frequency')}
              value={form.frequency}
              options={
                [
                  { value: 'monthly', label: t('committeeForm.monthly') },
                  { value: 'weekly', label: t('committeeForm.weekly') },
                ] as const
              }
              onChange={(value) => update('frequency', value)}
              disabled={save.isPending}
            />
            <View>
              <DateField
                label={t('committeeForm.firstDueDate')}
                value={form.firstDueDate}
                onChange={(value) => update('firstDueDate', value)}
                disabled={save.isPending}
                error={errors.firstDueDate ? t(errors.firstDueDate) : undefined}
              />
              <View style={{ position: 'absolute', end: 0, top: -12 }}>
                <InfoTip text={t('committeeForm.dateHint')} />
              </View>
            </View>
            {form.selectionType === 'draw' ? (
              <View className="gap-2">
                <ChoiceField
                  label={t('committeeForm.overdueRule')}
                  value={
                    form.overdueDrawAllowed === null
                      ? null
                      : form.overdueDrawAllowed
                        ? 'allow'
                        : 'exclude'
                  }
                  options={
                    [
                      { value: 'allow', label: t('committeeForm.allow') },
                      { value: 'exclude', label: t('committeeForm.exclude') },
                    ] as const
                  }
                  onChange={(value) =>
                    update('overdueDrawAllowed', value === 'allow')
                  }
                  disabled={save.isPending}
                />
                {errors.overdueDrawAllowed ? (
                  <Text variant="caption" className="text-danger">
                    {t(errors.overdueDrawAllowed)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {payout ? (
              <View className="gap-2 border-y border-line py-4">
                <View className="flex-row items-center justify-between gap-4">
                  <Text variant="caption" className="text-muted">
                    {t('committeeForm.payoutPerRound')}
                  </Text>
                  <Text direction="ltr">Rs {formatAmount(payout)}</Text>
                </View>
                <Text variant="caption" className="text-muted">
                  {t('committeeForm.roundCount', {
                    count: Number(form.slotCount),
                  })}
                </Text>
              </View>
            ) : null}

            {save.isError ? (
              <Text className="text-danger" accessibilityLiveRegion="polite">
                {t(
                  save.error instanceof ApiError && save.error.status === 409
                    ? 'committeeForm.editConflict'
                    : save.error instanceof ApiError &&
                        save.error.status === 422
                      ? 'committeeForm.validationError'
                      : 'committeeForm.saveError',
                )}
              </Text>
            ) : null}
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <Button
                  label={t(
                    committee
                      ? 'committeeForm.saveChanges'
                      : 'committeeForm.save',
                  )}
                  loading={save.isPending}
                  onPress={submit}
                />
              </View>
              <InfoTip
                text={t(
                  committee
                    ? 'committeeForm.assignedLock'
                    : 'committeeForm.draftHint',
                )}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
