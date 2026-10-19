import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AppScreen as Screen } from '@/components/app-screen';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api';
import { useSession } from '@/features/auth/session-store';
import { useSignOut } from '@/features/auth/use-auth';
import { theme } from '@/theme';
import { listCommittees, type Committee } from '../api';
import { formatAmount } from '../format-amount';

function CommitteeCard({ committee }: { committee: Committee }) {
  const { t } = useTranslation();
  return (
    <Link
      href={{
        pathname: '/committees/[committeeId]',
        params: { committeeId: committee.id },
      }}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={committee.name}
        className="gap-3 border-b border-line py-5"
        style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="title" style={{ flex: 1, fontSize: 18 }}>
            {committee.name}
          </Text>
          <StatusBadge status={committee.status} />
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="caption" className="text-muted">
            {t(`committees.${committee.selectionType}`)}
          </Text>
          <Text variant="caption" className="text-muted">
            {t('committees.slots', { count: committee.slotCount })}
          </Text>
        </View>
        <View className="flex-row items-center justify-between gap-4">
          <Text variant="caption" className="text-muted">
            {t(`committees.${committee.frequency}`)}
          </Text>
          <Text direction="ltr">
            Rs {formatAmount(committee.contributionAmount)}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

export default function CommitteesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const token = useSession((state) => state.token)!;
  const signOut = useSignOut();
  const committees = useInfiniteQuery({
    queryKey: ['committees'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      listCommittees(token, pageParam, signal),
    getNextPageParam: (last) =>
      last.metadata.currentPage < last.metadata.lastPage
        ? last.metadata.currentPage + 1
        : undefined,
  });
  const rows = committees.data?.pages.flatMap((page) => page.data) ?? [];
  const expired = [committees.error].some(
    (error) => error instanceof ApiError && error.status === 401,
  );
  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CommitteeCard committee={item} />}
        contentContainerStyle={{
          flexGrow: 1,
          paddingVertical: 24,
          paddingHorizontal: theme.spacing.screen,
        }}
        showsVerticalScrollIndicator={false}
        refreshing={committees.isRefetching}
        onRefresh={() => {
          void committees.refetch();
        }}
        onEndReached={() => {
          if (
            committees.hasNextPage &&
            !committees.isFetchingNextPage &&
            !committees.isError
          )
            void committees.fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <View className="mb-3">
            <View className="gap-2">
              <View className="flex-row items-center justify-between gap-3">
                <Text variant="title" accessibilityRole="header">
                  {t('committees.heading')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('committeeForm.title')}
                  onPress={() => router.push('/committees/new')}
                  className="h-11 w-11 items-center justify-center rounded-control bg-brand"
                >
                  <Feather name="plus" color={theme.colors.surface} size={22} />
                </Pressable>
              </View>
              <Text variant="caption" className="text-muted">
                {t('committees.description')}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          committees.isPending ? (
            <ActivityIndicator
              accessibilityLabel={t('common.loading')}
              color={theme.colors.brand}
              className="my-12"
            />
          ) : !committees.isError ? (
            <View className="items-center gap-3 py-12">
              <View className="p-4">
                <Feather name="layers" size={28} color={theme.colors.brand} />
              </View>
              <Text variant="title" style={{ textAlign: 'center' }}>
                {t('committees.emptyTitle')}
              </Text>
              <Text className="text-muted" style={{ textAlign: 'center' }}>
                {t('committees.emptyDescription')}
              </Text>
              <Button
                label={t('committeeForm.title')}
                onPress={() => router.push('/committees/new')}
                className="mt-3"
              />
            </View>
          ) : undefined
        }
        ListFooterComponent={
          <View className="gap-4 pb-4">
            {committees.isFetchingNextPage ? (
              <ActivityIndicator color={theme.colors.brand} />
            ) : null}
            {committees.isError || expired ? (
              <Card className="gap-4">
                <Text className="text-danger" accessibilityLiveRegion="polite">
                  {t(expired ? 'auth.expired' : 'committees.loadError')}
                </Text>
                <Button
                  label={t(expired ? 'auth.signInAgain' : 'common.retry')}
                  variant="secondary"
                  loading={signOut.isPending}
                  onPress={() => {
                    if (expired) signOut.mutate();
                    else if (rows.length) void committees.fetchNextPage();
                    else void committees.refetch();
                  }}
                />
              </Card>
            ) : null}
          </View>
        }
      />
    </Screen>
  );
}
