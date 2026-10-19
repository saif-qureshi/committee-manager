import { apiRequest } from '@/lib/api';
import type { Member } from '@/features/members/api';

export type Committee = {
  id: string;
  name: string;
  status: 'draft' | 'active';
  contributionAmount: string;
  slotCount: number;
  selectionType: 'fixed' | 'draw';
  frequency: 'weekly' | 'monthly';
  firstDueDate: string;
  overdueDrawAllowed: boolean | null;
  assignedMemberCount: number;
};
export type CommitteeInput = Pick<
  Committee,
  | 'name'
  | 'contributionAmount'
  | 'slotCount'
  | 'selectionType'
  | 'frequency'
  | 'firstDueDate'
  | 'overdueDrawAllowed'
>;
export type Slot = {
  id: string;
  slotNumber: number;
  organizationMemberId: string | null;
  member: Member | null;
};
export type Payout = {
  id: string;
  roundNumber: number;
  dueDate: string;
  committeeMemberId: string | null;
  expectedAmount: string;
  paidAmount: string;
  remainingAmount: string;
  status: 'scheduled' | 'selected' | 'partially_paid' | 'paid';
};
export type Balance = {
  asOf: string;
  contributions: {
    expectedAmount: string;
    receivedAmount: string;
    remainingAmount: string;
    overdueAmount: string;
    pendingAmount: string;
  };
  payouts: {
    expectedAmount: string;
    paidAmount: string;
    remainingAmount: string;
  };
  recordedNetAmount: string;
};
export type CommitteePage = {
  data: Committee[];
  metadata: { currentPage: number; lastPage: number; total: number };
};

export const listCommittees = (
  token: string,
  page: number,
  signal: AbortSignal,
) =>
  apiRequest<CommitteePage>(`/organization/committees?page=${page}`, {
    token,
    signal,
  });

const committeePath = (id: string) =>
  `/organization/committees/${encodeURIComponent(id)}`;
export const createCommittee = (token: string, input: CommitteeInput) =>
  apiRequest<{ data: Committee }>('/organization/committees', {
    token,
    method: 'POST',
    body: JSON.stringify(input),
  });
export const getCommittee = (token: string, id: string, signal: AbortSignal) =>
  apiRequest<{ data: Committee }>(committeePath(id), { token, signal });
export const getSlots = (token: string, id: string, signal: AbortSignal) =>
  apiRequest<{ data: Slot[] }>(`${committeePath(id)}/members`, {
    token,
    signal,
  });
export const getPayouts = (token: string, id: string, signal: AbortSignal) =>
  apiRequest<{ data: Payout[] }>(`${committeePath(id)}/payouts`, {
    token,
    signal,
  });
export const getBalance = (
  token: string,
  id: string,
  asOf: string,
  signal: AbortSignal,
) =>
  apiRequest<{ data: Balance }>(
    `${committeePath(id)}/balance?asOf=${encodeURIComponent(asOf)}`,
    { token, signal },
  );

export const updateCommittee = (
  token: string,
  id: string,
  input: CommitteeInput,
) =>
  apiRequest<{ data: Committee }>(committeePath(id), {
    token,
    method: 'PUT',
    body: JSON.stringify(input),
  });

export const assignMembers = (
  token: string,
  id: string,
  members: { slotNumber: number; organizationMemberId: string | null }[],
) =>
  apiRequest<{ data: Slot[] }>(`${committeePath(id)}/members`, {
    token,
    method: 'PUT',
    body: JSON.stringify({ members }),
  });
export const getSchedule = (token: string, id: string, signal: AbortSignal) =>
  apiRequest<{ data: { readyToActivate: boolean } }>(
    `${committeePath(id)}/schedule`,
    { token, signal },
  );
export const activateCommittee = (token: string, id: string) =>
  apiRequest<{ data: Committee }>(`${committeePath(id)}/activations`, {
    token,
    method: 'POST',
  });
