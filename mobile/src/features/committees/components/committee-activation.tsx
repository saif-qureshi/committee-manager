import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InfoTip } from '@/components/ui/info-tip';
import { Text } from '@/components/ui/text';
import { useSession } from '@/features/auth/session-store';
import { ApiError } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { theme } from '@/theme';
import { activateCommittee, getSchedule } from '../api';

export function CommitteeActivation({
  committeeId,
  allAssigned,
}: {
  committeeId: string;
  allAssigned: boolean;
}) {
  const { t } = useTranslation();
  const token = useSession((state) => state.token)!;
  const [confirm, setConfirm] = useState(false);
  const schedule = useQuery({
    queryKey: ['committee', committeeId, 'schedule'],
    queryFn: ({ signal }) => getSchedule(token, committeeId, signal),
  });
  const activation = useMutation({
    mutationFn: () => activateCommittee(token, committeeId),
    onSuccess: (response) => {
      if (useSession.getState().token !== token) return;
      queryClient.setQueryData(['committee', committeeId], response);
    },
    onSettled: () => {
      if (useSession.getState().token !== token) return;
      void queryClient.invalidateQueries({
        queryKey: ['committee', committeeId],
      });
      void queryClient.invalidateQueries({ queryKey: ['committees'] });
    },
  });
  const ready =
    allAssigned &&
    schedule.data?.data.readyToActivate === true &&
    !schedule.isError &&
    !schedule.isFetching;
  return (
    <View className="gap-3 border-t border-line pt-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" className="flex-1 text-muted">
          {t(ready ? 'setup.ready' : 'setup.notReady')}
        </Text>
        <InfoTip text={t('setup.activationLocks')} />
      </View>
      {schedule.isPending ? (
        <ActivityIndicator color={theme.colors.brand} />
      ) : schedule.isError ? (
        <>
          <Text className="text-danger">{t('setup.readinessError')}</Text>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => {
              void schedule.refetch();
            }}
          />
        </>
      ) : null}
      {activation.isError ? (
        <Text className="text-danger" accessibilityLiveRegion="polite">
          {t(
            activation.error instanceof ApiError &&
              activation.error.status === 409
              ? 'setup.activationConflict'
              : 'setup.activationError',
          )}
        </Text>
      ) : null}
      {confirm ? <Text>{t('setup.confirmActivation')}</Text> : null}
      <Button
        label={t(confirm ? 'setup.confirm' : 'setup.activate')}
        loading={activation.isPending}
        disabled={!ready}
        onPress={() => {
          if (confirm) {
            if (ready && !activation.isPending) activation.mutate();
          } else setConfirm(true);
        }}
      />
      {confirm ? (
        <Button
          label={t('common.cancel')}
          variant="secondary"
          disabled={activation.isPending}
          onPress={() => setConfirm(false)}
        />
      ) : null}
    </View>
  );
}
