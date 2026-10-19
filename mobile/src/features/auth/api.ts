import { apiRequest } from '@/lib/api';

export type User = {
  id: number;
  fullName: string | null;
  username: string | null;
  phone: string | null;
};
type Credentials = { identifier: string; password: string };
type Registration = Credentials & {
  fullName: string;
  passwordConfirmation: string;
};
type SessionResponse = { data: { user: User; token: string } };

export const signIn = (input: Credentials) =>
  apiRequest<SessionResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const register = ({ identifier, ...input }: Registration) =>
  apiRequest<SessionResponse>('/users', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      accountType: 'organizer',
      ...(/^[+\d]/.test(identifier)
        ? { phone: identifier }
        : { username: identifier }),
    }),
  });

export const getProfile = (token: string, signal: AbortSignal) =>
  apiRequest<{ data: User }>('/users/me', { token, signal });
export const revokeSession = (token: string) =>
  apiRequest<void>('/sessions/current', { method: 'DELETE', token });
