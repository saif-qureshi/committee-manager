import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { InfoTip } from '@/components/ui/info-tip';
import { Card } from '@/components/ui/card';
import { AppScreen as Screen } from '@/components/app-screen';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { useSession } from '@/features/auth/session-store';
import { theme } from '@/theme';
import {
  getBalance,
  getCommittee,
  getPayouts,
  getSlots,
  type Payout,
  type Slot,
} from '../api';
import { localDate } from '@/lib/date';
import { formatAmount } from '../format-amount';
import { MemberPicker } from '../components/member-picker';
import { CommitteeActivation } from '../components/committee-activation';

type DashboardRow =
  { kind: 'slot'; value: Slot } | { kind: 'payout'; value: Payout };
function AmountRow({
  label,
  amount,
  overdue = false,
}: {
  label: string;
  amount: string;
  overdue?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-2">
      <Text variant="caption" className="text-muted" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text direction="ltr" className={overdue ? 'text-danger' : ''}>
        Rs {formatAmount(amount)}
      </Text>
    </View>
  );
}

export default function CommitteeDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = useState<'overview' | 'members' | 'schedule'>(
    'overview',
  );
  const [showTotals, setShowTotals] = useState(false);
  const [selectedSlotNumber, setSelectedSlotNumber] = useState<number | null>(
    null,
  );
  const params = useLocalSearchParams<{ committeeId: string }>();
  const id = typeof params.committeeId === 'string' ? params.committeeId : '';
  const token = useSession((state) => state.token)!;
  const asOf = localDate();
  const committee = useQuery({
    queryKey: ['committee', id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => getCommittee(token, id, signal),
  });
  const slots = useQuery({
    queryKey: ['committee', id, 'slots'],
    enabled: Boolean(id),
    queryFn: ({ signal }) => getSlots(token, id, signal),
  });
  const payouts = useQuery({
    queryKey: ['committee', id, 'payouts'],
    enabled: Boolean(id),
    queryFn: ({ signal }) => getPayouts(token, id, signal),
  });
  const active = committee.data?.data.status === 'active';
  const balance = useQuery({
    queryKey: ['committee', id, 'balance', asOf],
    enabled: Boolean(id) && active,
    queryFn: ({ signal }) => getBalance(token, id, asOf, signal),
  });
  const current = committee.data?.data;
  const members = slots.data?.data ?? [];
  const rounds = payouts.data?.data ?? [];
  const assignedCount = members.filter(
    (slot) => slot.organizationMemberId !== null,
  ).length;
  const selectedSlot = members.find(
    (slot) => slot.slotNumber === selectedSlotNumber,
  );
  const next = rounds.find((round) => round.status !== 'paid');
  const totals = balance.data?.data;
  const refreshing = [committee, slots, payouts, balance].some(
    (query) => query.isRefetching,
  );
  const failed = [committee, slots, payouts].some((query) => query.isError);
  function refresh() {
    void committee.refetch();
    void slots.refetch();
    void payouts.refetch();
    if (active) void balance.refetch();
  }
  function memberName(slot: Slot | undefined) {
    return (
      slot?.member?.fullName ||
      slot?.member?.user?.username ||
      slot?.member?.phone ||
      t('dashboard.unassigned')
    );
  }
  function recipient(round: Payout) {
    if (!round.committeeMemberId) return t('dashboard.notSelected');
    const slot = members.find(
      (member) => member.id === round.committeeMemberId,
    );
    return t('dashboard.recipient', {
      slot: slot?.slotNumber ?? '',
      name: memberName(slot),
    });
  }
  const rows: DashboardRow[] =
    tab === 'members'
      ? members.map((value) => ({ kind: 'slot', value }))
      : tab === 'schedule'
        ? rounds.map((value) => ({ kind: 'payout', value }))
        : [];
  return (
    <Screen>
      <PageHeader title={current?.name ?? t('dashboard.title')} />
      {!id || ((!current || !slots.data || !payouts.data) && failed) ? (
        <View className="gap-4 p-screen">
          <Text className="text-danger">{t('dashboard.loadError')}</Text>
          <Button label={t('common.retry')} onPress={refresh} />
        </View>
      ) : !current || !slots.data || !payouts.data ? (
        <ActivityIndicator
          className="my-12"
          color={theme.colors.brand}
          accessibilityLabel={t('common.loading')}
        />
      ) : (
        <View className="flex-1">
          <View
            accessibilityRole="tablist"
            className="flex-row border-b border-line px-4"
          >
            {(['overview', 'members', 'schedule'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === value }}
                onPress={() => setTab(value)}
                className={`min-h-[52px] flex-1 items-center justify-center border-b-2 px-1 ${tab === value ? 'border-brand' : 'border-transparent'}`}
              >
                <Text
                  variant="caption"
                  className={tab === value ? 'text-brand' : 'text-muted'}
                >
                  {t(`dashboard.${value}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          <FlatList<DashboardRow>
            key={tab}
            data={rows}
            keyExtractor={(item) => `${item.kind}-${item.value.id}`}
            contentContainerStyle={{
              padding: theme.spacing.screen,
              paddingBottom: 40,
            }}
            refreshing={refreshing}
            onRefresh={refresh}
            ListHeaderComponent={
              <View className="gap-6 pb-4">
                <View className="flex-row items-center justify-between gap-3">
                  <Text variant="caption" className="flex-1 text-muted">
                    {t(`committees.${current.selectionType}`)} /{' '}
                    {t(`committeeForm.${current.frequency}`)}
                  </Text>
                  <StatusBadge status={current.status} />
                </View>
                {tab === 'overview' ? (
                  <>
                    {!active ? (
                      <Card className="gap-3">
                        <View className="flex-row items-center justify-between gap-2">
                          <Text variant="title">
                            {t('dashboard.draftTitle')}
                          </Text>
                          <InfoTip text={t('dashboard.draftDescription')} />
                        </View>
                        <Text variant="caption" className="text-muted">
                          {t('dashboard.slotSummary', {
                            count: current.slotCount,
                            assigned: members.filter(
                              (slot) => slot.organizationMemberId !== null,
                            ).length,
                          })}
                        </Text>
                        <Button
                          label={t('committeeForm.editTitle')}
                          onPress={() =>
                            router.push({
                              pathname: '/committees/[committeeId]/edit',
                              params: { committeeId: id },
                            })
                          }
                        />
                        <Button
                          label={t('dashboard.memberSlots')}
                          variant="secondary"
                          onPress={() => setTab('members')}
                        />
                        <CommitteeActivation
                          committeeId={id}
                          allAssigned={
                            members.length === current.slotCount &&
                            assignedCount === current.slotCount
                          }
                        />
                      </Card>
                    ) : next ? (
                      <Card className="gap-3">
                        <View className="flex-row items-center justify-between gap-3">
                          <Text>
                            {t('dashboard.roundNumber', {
                              round: next.roundNumber,
                            })}
                          </Text>
                          <Text
                            variant="caption"
                            direction="ltr"
                            className="text-muted"
                          >
                            {next.dueDate}
                          </Text>
                        </View>
                        <Text variant="caption" className="text-muted">
                          {recipient(next)}
                        </Text>
                        <Text variant="amount" direction="ltr">
                          Rs {formatAmount(next.expectedAmount)}
                        </Text>
                        <View className="border-t border-line pt-2">
                          <AmountRow
                            label={t('dashboard.handedOver')}
                            amount={next.paidAmount}
                          />
                          <AmountRow
                            label={t('dashboard.remaining')}
                            amount={next.remainingAmount}
                          />
                        </View>
                        <Text variant="caption" className="text-muted">
                          {t(`payoutStatus.${next.status}`)}
                        </Text>
                      </Card>
                    ) : (
                      <Text className="text-muted">
                        {t('dashboard.payoutsSettled')}
                      </Text>
                    )}
                    {active ? (
                      <View className="gap-2">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ expanded: showTotals }}
                          onPress={() => setShowTotals(!showTotals)}
                          className="min-h-[48px] flex-row items-center justify-between gap-3"
                        >
                          <Text>{t('dashboard.cycleTotals')}</Text>
                          <Text>{showTotals ? '−' : '+'}</Text>
                        </Pressable>
                        <Text variant="caption" className="text-muted">
                          {t('dashboard.allRounds')} {asOf}
                        </Text>
                        {balance.isPending ? (
                          <ActivityIndicator color={theme.colors.brand} />
                        ) : totals ? (
                          <View>
                            <AmountRow
                              label={t('dashboard.received')}
                              amount={totals.contributions.receivedAmount}
                            />
                            <AmountRow
                              label={t('dashboard.overdue')}
                              amount={totals.contributions.overdueAmount}
                              overdue={
                                totals.contributions.overdueAmount !== '0.00'
                              }
                            />
                            {showTotals ? (
                              <>
                                <AmountRow
                                  label={t('dashboard.expected')}
                                  amount={totals.contributions.expectedAmount}
                                />
                                <AmountRow
                                  label={t('dashboard.outstanding')}
                                  amount={totals.contributions.remainingAmount}
                                />
                                <AmountRow
                                  label={t('dashboard.pending')}
                                  amount={totals.contributions.pendingAmount}
                                />
                                <Text className="mt-4">
                                  {t('dashboard.payoutTotals')}
                                </Text>
                                <AmountRow
                                  label={t('dashboard.expected')}
                                  amount={totals.payouts.expectedAmount}
                                />
                                <AmountRow
                                  label={t('dashboard.handedOver')}
                                  amount={totals.payouts.paidAmount}
                                />
                                <AmountRow
                                  label={t('dashboard.remaining')}
                                  amount={totals.payouts.remainingAmount}
                                />
                              </>
                            ) : null}
                          </View>
                        ) : null}
                        {balance.isError ? (
                          <View className="gap-2">
                            <Text className="text-danger">
                              {t('dashboard.balanceError')}
                            </Text>
                            <Button
                              label={t('common.retry')}
                              variant="secondary"
                              onPress={() => {
                                void balance.refetch();
                              }}
                            />
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    <View className="border-t border-line pt-4">
                      <Text className="mb-2">{t('dashboard.details')}</Text>
                      <AmountRow
                        label={t(`committees.${current.frequency}`)}
                        amount={current.contributionAmount}
                      />
                      {rounds[0] ? (
                        <AmountRow
                          label={t('committeeForm.payoutPerRound')}
                          amount={rounds[0].expectedAmount}
                        />
                      ) : null}
                      <View className="flex-row items-center justify-between gap-3 py-2">
                        <Text variant="caption" className="text-muted">
                          {t('committeeForm.slots')}
                        </Text>
                        <Text direction="ltr">{current.slotCount}</Text>
                      </View>
                      <View className="flex-row items-center justify-between gap-3 py-2">
                        <Text variant="caption" className="text-muted">
                          {t('committeeForm.firstDueDate')}
                        </Text>
                        <Text direction="ltr">{current.firstDueDate}</Text>
                      </View>
                      {current.selectionType === 'draw' ? (
                        <Text variant="caption" className="mt-2 text-muted">
                          {t(
                            current.overdueDrawAllowed === null
                              ? 'dashboard.ruleUndecided'
                              : current.overdueDrawAllowed
                                ? 'dashboard.overdueAllowed'
                                : 'dashboard.overdueExcluded',
                          )}
                        </Text>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <Text variant="caption" className="text-muted">
                    {tab === 'members'
                      ? t('dashboard.slotSummary', {
                          count: current.slotCount,
                          assigned: members.filter(
                            (slot) => slot.organizationMemberId !== null,
                          ).length,
                        })
                      : t('committeeForm.roundCount', { count: rounds.length })}
                  </Text>
                )}
                {failed ? (
                  <Button
                    label={t('common.retry')}
                    variant="secondary"
                    onPress={refresh}
                  />
                ) : null}
              </View>
            }
            renderItem={({ item }) =>
              item.kind === 'slot' ? (
                <Pressable
                  accessibilityRole={active ? undefined : 'button'}
                  accessibilityLabel={`${t('setup.assignTitle', { slot: item.value.slotNumber })}: ${memberName(item.value)}`}
                  disabled={active}
                  onPress={() => setSelectedSlotNumber(item.value.slotNumber)}
                  className="flex-row items-center gap-4 border-b border-line py-4"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-control bg-page border border-line">
                    <Text direction="ltr">{item.value.slotNumber}</Text>
                  </View>
                  <Text className="flex-1">{memberName(item.value)}</Text>
                  {!active ? (
                    <Text variant="caption" className="text-brand">
                      {t(
                        item.value.organizationMemberId
                          ? 'setup.change'
                          : 'setup.assign',
                      )}
                    </Text>
                  ) : null}
                </Pressable>
              ) : (
                <View className="gap-2 border-b border-line py-4">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text>
                      {t('dashboard.roundNumber', {
                        round: item.value.roundNumber,
                      })}
                    </Text>
                    <Text
                      variant="caption"
                      direction="ltr"
                      className="text-muted"
                    >
                      {item.value.dueDate}
                    </Text>
                  </View>
                  <Text variant="caption" className="text-muted">
                    {recipient(item.value)}
                  </Text>
                  <View className="flex-row items-center justify-between gap-3">
                    <Text variant="caption" className="flex-1 text-muted">
                      {t(`payoutStatus.${item.value.status}`)}
                    </Text>
                    <Text direction="ltr">
                      Rs {formatAmount(item.value.expectedAmount)}
                    </Text>
                  </View>
                  {item.value.status === 'partially_paid' ? (
                    <>
                      <AmountRow
                        label={t('dashboard.handedOver')}
                        amount={item.value.paidAmount}
                      />
                      <AmountRow
                        label={t('dashboard.remaining')}
                        amount={item.value.remainingAmount}
                      />
                    </>
                  ) : null}
                </View>
              )
            }
          />
          {!active && selectedSlot ? (
            <MemberPicker
              committeeId={id}
              slots={members}
              slot={selectedSlot}
              onClose={() => setSelectedSlotNumber(null)}
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
