import { apiRequest } from '@/lib/api';
import type { User } from '@/features/auth/api';

export type Member = {
  id: string;
  role: 'organizer' | 'member';
  fullName: string | null;
  phone: string | null;
  user: User;
};
type MemberPage = {
  data: Member[];
  metadata: { currentPage: number; lastPage: number; total: number };
};
export const listMembers = (token: string, page: number, signal: AbortSignal) =>
  apiRequest<MemberPage>(`/organization/members?page=${page}`, {
    token,
    signal,
  });

export const createMember = (
  token: string,
  input: { fullName: string; phone: string },
) =>
  apiRequest<{ data: Member }>('/organization/members', {
    token,
    method: 'POST',
    body: JSON.stringify(input),
  });
