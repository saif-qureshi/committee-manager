import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AppScreen as Screen } from '@/components/app-screen';
import { Text } from '@/components/ui/text';
import { theme } from '@/theme';
import { getProfile } from '../api';
import { useSession } from '../session-store';
import { useSignOut } from '../use-auth';

export default function AccountScreen() {
  const { t } = useTranslation();
  const token = useSession((state) => state.token)!;
  const signOut = useSignOut();
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => getProfile(token, signal),
  });
  const user = profile.data?.data;
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingVertical: 24,
          paddingHorizontal: theme.spacing.screen,
        }}
      >
        <Text variant="title" accessibilityRole="header">
          {t('tabs.account')}
        </Text>
        <View className="my-6 gap-2 border-b border-line pb-6">
          {profile.isPending ? (
            <ActivityIndicator color={theme.colors.brand} />
          ) : null}
          {user ? (
            <>
              <Text variant="title">
                {user.fullName || user.username || user.phone}
              </Text>
              {user.username ? (
                <Text direction="ltr" className="text-muted">
                  @{user.username}
                </Text>
              ) : null}
              {user.phone ? (
                <Text direction="ltr" className="text-muted">
                  {user.phone}
                </Text>
              ) : null}
            </>
          ) : null}
          {profile.isError ? (
            <>
              <Text className="text-danger">{t('account.loadError')}</Text>
              <Button
                label={t('common.retry')}
                variant="secondary"
                onPress={() => {
                  void profile.refetch();
                }}
              />
            </>
          ) : null}
        </View>
        {signOut.isError ? (
          <Text accessibilityLiveRegion="polite" className="mb-3 text-danger">
            {t('auth.signOutError')}
          </Text>
        ) : null}
        <Button
          label={t('auth.signOut')}
          variant="secondary"
          loading={signOut.isPending}
          onPress={() => signOut.mutate()}
        />
      </ScrollView>
    </Screen>
  );
}
