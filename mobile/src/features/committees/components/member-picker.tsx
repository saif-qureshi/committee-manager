import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  View,
} from 'react-native';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InfoTip } from '@/components/ui/info-tip';
import Feather from '@expo/vector-icons/Feather';
import { AppScreen as Screen } from '@/components/app-screen';
import { Text } from '@/components/ui/text';
import { useSession } from '@/features/auth/session-store';
import { listMembers } from '@/features/members/api';
import { AddMemberForm } from '@/features/members/components/add-member-form';
import { ApiError } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { theme } from '@/theme';
import { assignMembers, type Slot } from '../api';
import { slotAssignments } from '../slot-assignments';

export function MemberPicker({
  committeeId,
  slots,
  slot,
  onClose,
}: {
  committeeId: string;
  slots: Slot[];
  slot: Slot;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const token = useSession((state) => state.token)!;
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState(slot.organizationMemberId);
  const members = useInfiniteQuery({
    queryKey: ['members'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => listMembers(token, pageParam, signal),
    getNextPageParam: (page) =>
      page.metadata.currentPage < page.metadata.lastPage
        ? page.metadata.currentPage + 1
        : undefined,
  });
  const save = useMutation({
    mutationFn: (memberId: string | null) =>
      assignMembers(
        token,
        committeeId,
        slotAssignments(slots, slot.slotNumber, memberId),
      ),
    onSuccess: (response) => {
      if (useSession.getState().token !== token) return;
      queryClient.setQueryData(['committee', committeeId, 'slots'], response);
    },
    onSettled: () => {
      if (useSession.getState().token !== token) return;
      void queryClient.invalidateQueries({
        queryKey: ['committee', committeeId],
      });
      void queryClient.invalidateQueries({ queryKey: ['committees'] });
    },
  });
  function assign(memberId: string | null) {
    if (save.isPending) return;
    save.mutate(memberId, {
      onSuccess: () => {
        if (useSession.getState().token === token) onClose();
      },
    });
  }
  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        if (
          !save.isPending &&
          !queryClient.isMutating({ mutationKey: ['addMember'] })
        )
          onClose();
      }}
    >
      <Screen onNavigate={onClose}>
        {adding ? (
          <View className="flex-1 p-screen">
            <AddMemberForm
              onAdded={(member) => {
                setSelectedId(member.id);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </View>
        ) : (
          <View accessibilityViewIsModal className="flex-1 p-screen">
            <View className="gap-2 pb-4">
              <View className="flex-row items-center justify-between gap-2">
                <Text
                  className="flex-1"
                  variant="title"
                  accessibilityRole="header"
                >
                  {t('setup.assignTitle', { slot: slot.slotNumber })}
                </Text>
                <InfoTip text={t('setup.multipleSlots')} />
              </View>
              {save.isPending ? (
                <ActivityIndicator
                  color={theme.colors.brand}
                  accessibilityLabel={t('common.loading')}
                />
              ) : null}
              {save.isError ? (
                <Text className="text-danger" accessibilityLiveRegion="polite">
                  {t(
                    save.error instanceof ApiError && save.error.status === 409
                      ? 'setup.assignmentConflict'
                      : 'setup.assignmentError',
                  )}
                </Text>
              ) : null}
            </View>
            <View className="gap-3 pb-5">
              <Button
                label={t('members.add')}
                variant="secondary"
                disabled={save.isPending}
                onPress={() => setAdding(true)}
              />
              {slot.organizationMemberId ? (
                <Button
                  label={t('setup.clearSlot')}
                  variant="secondary"
                  disabled={save.isPending}
                  onPress={() => setSelectedId(null)}
                />
              ) : null}
            </View>
            <FlatList
              data={members.data?.pages.flatMap((page) => page.data) ?? []}
              keyExtractor={(member) => member.id}
              ItemSeparatorComponent={() => <View className="h-2" />}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: item.id === selectedId,
                    disabled: save.isPending,
                  }}
                  disabled={save.isPending}
                  onPress={() => setSelectedId(item.id)}
                  className={`min-h-[64px] flex-row items-center gap-3 border-b border-line px-2 py-4 ${item.id === selectedId ? 'bg-successSoft' : ''}`}
                >
                  <View className="flex-1 gap-1">
                    <Text>
                      {item.fullName || item.user?.username || item.phone}
                    </Text>
                    <Text
                      variant="caption"
                      className="text-muted"
                      direction="ltr"
                    >
                      {item.phone ||
                        (item.user?.username ? `@${item.user.username}` : '')}
                    </Text>
                  </View>
                  {item.id === selectedId ? (
                    <Feather
                      name="check-circle"
                      size={22}
                      color={theme.colors.success}
                    />
                  ) : null}
                </Pressable>
              )}
              ListEmptyComponent={
                members.isPending ? (
                  <ActivityIndicator color={theme.colors.brand} />
                ) : !members.isError ? (
                  <Text>{t('members.empty')}</Text>
                ) : undefined
              }
              ListFooterComponent={
                <View className="gap-3 py-4">
                  {members.isError ? (
                    <>
                      <Text className="text-danger">
                        {t('members.loadError')}
                      </Text>
                      <Button
                        label={t('common.retry')}
                        variant="secondary"
                        onPress={() => {
                          if (members.isFetchNextPageError)
                            void members.fetchNextPage();
                          else void members.refetch();
                        }}
                      />
                    </>
                  ) : members.hasNextPage ? (
                    <Button
                      label={t('setup.moreMembers')}
                      variant="secondary"
                      loading={members.isFetchingNextPage}
                      onPress={() => {
                        void members.fetchNextPage();
                      }}
                    />
                  ) : null}
                </View>
              }
            />
            <View className="gap-3 pt-3">
              {selectedId === null && slot.organizationMemberId ? (
                <Text variant="caption">{t('setup.clearSelected')}</Text>
              ) : null}
              <Button
                label={t('common.save')}
                loading={save.isPending}
                disabled={selectedId === slot.organizationMemberId}
                onPress={() => assign(selectedId)}
              />
              <Button
                label={t('common.cancel')}
                variant="secondary"
                disabled={save.isPending}
                onPress={onClose}
              />
            </View>
          </View>
        )}
      </Screen>
    </Modal>
  );
}
