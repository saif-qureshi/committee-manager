import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { AppScreen as Screen } from '@/components/app-screen';
import { Text } from '@/components/ui/text';
import { useSession } from '@/features/auth/session-store';
import { theme } from '@/theme';
import { getCommittee } from '../api';
import CommitteeFormScreen from './committee-form-screen';

export default function EditCommitteeScreen() {
  const { t } = useTranslation();
  const { committeeId } = useLocalSearchParams<{ committeeId: string }>();
  const token = useSession((state) => state.token)!;
  const committee = useQuery({
    queryKey: ['committee', committeeId],
    queryFn: ({ signal }) => getCommittee(token, committeeId, signal),
  });
  if (committee.data?.data.status === 'draft')
    return (
      <CommitteeFormScreen key={committeeId} committee={committee.data.data} />
    );
  return (
    <Screen>
      <PageHeader title={t('committeeForm.editTitle')} />
      <View className="gap-4 p-screen">
        {committee.data ? (
          <Text>{t('committeeForm.draftOnly')}</Text>
        ) : committee.isError ? (
          <>
            <Text className="text-danger">{t('dashboard.loadError')}</Text>
            <Button
              label={t('common.retry')}
              onPress={() => {
                void committee.refetch();
              }}
            />
          </>
        ) : (
          <ActivityIndicator
            color={theme.colors.brand}
            accessibilityLabel={t('common.loading')}
          />
        )}
      </View>
    </Screen>
  );
}
