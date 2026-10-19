import { useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { AddMemberModal } from '../components/add-member-form';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AppScreen as Screen } from '@/components/app-screen';
import { Text } from '@/components/ui/text';
import { useSession } from '@/features/auth/session-store';
import { theme } from '@/theme';
import { listMembers } from '../api';

export default function MembersScreen() {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const token = useSession((state) => state.token)!;
  const members = useInfiniteQuery({
    queryKey: ['members'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => listMembers(token, pageParam, signal),
    getNextPageParam: (page) =>
      page.metadata.currentPage < page.metadata.lastPage
        ? page.metadata.currentPage + 1
        : undefined,
  });
  const rows = members.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(member) => member.id}
        contentContainerStyle={{
          paddingVertical: 24,
          paddingHorizontal: theme.spacing.screen,
          flexGrow: 1,
        }}
        refreshing={members.isRefetching}
        onRefresh={() => {
          void members.refetch();
        }}
        onEndReached={() => {
          if (
            members.hasNextPage &&
            !members.isFetchingNextPage &&
            !members.isError
          )
            void members.fetchNextPage();
        }}
        ListHeaderComponent={
          <View className="mb-6 gap-2">
            <View className="flex-row items-center justify-between">
              <Text variant="title" accessibilityRole="header">
                {t('tabs.members')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('members.add')}
                onPress={() => setAdding(true)}
                className="h-11 w-11 items-center justify-center"
              >
                <Feather name="plus" size={24} color={theme.colors.brand} />
              </Pressable>
            </View>
            <Text variant="caption" className="text-muted">
              {t('members.description')}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 border-b border-line py-4">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-page">
              <Text>
                {(item.fullName || item.user?.username || '?').slice(0, 1)}
              </Text>
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text>{item.fullName || item.user?.username || item.phone}</Text>
              {item.phone ? (
                <Text variant="caption" direction="ltr" className="text-muted">
                  {item.phone}
                </Text>
              ) : item.user?.username ? (
                <Text variant="caption" direction="ltr" className="text-muted">
                  @{item.user?.username}
                </Text>
              ) : null}
            </View>
            <Text variant="caption" className="text-muted">
              {t(`members.${item.role}`)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          members.isPending ? (
            <ActivityIndicator color={theme.colors.brand} />
          ) : !members.isError ? (
            <Text className="py-8 text-muted">{t('members.empty')}</Text>
          ) : undefined
        }
        ListFooterComponent={
          <View className="gap-3 py-4">
            {members.isFetchingNextPage ? (
              <ActivityIndicator color={theme.colors.brand} />
            ) : null}
            {members.isError ? (
              <>
                <Text className="text-danger">{t('members.loadError')}</Text>
                <Button
                  label={t('common.retry')}
                  variant="secondary"
                  onPress={() => {
                    if (rows.length) void members.fetchNextPage();
                    else void members.refetch();
                  }}
                />
              </>
            ) : null}
          </View>
        }
      />
      {adding ? <AddMemberModal onClose={() => setAdding(false)} /> : null}
    </Screen>
  );
}
