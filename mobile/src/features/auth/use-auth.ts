import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { register, revokeSession, signIn } from './api';
import { useSession } from './session-store';

export function useAuthenticate() {
  return useMutation({
    mutationFn: ({
      mode,
      ...input
    }: {
      mode: 'signIn' | 'register';
      identifier: string;
      password: string;
      fullName: string;
      passwordConfirmation: string;
    }) =>
      mode === 'register'
        ? register(input)
        : signIn({ identifier: input.identifier, password: input.password }),
    onSuccess: async ({ data }) => {
      queryClient.clear();
      await useSession.getState().setToken(data.token);
    },
  });
}

export function useSignOut() {
  return useMutation({
    mutationFn: async () => {
      const token = useSession.getState().token;
      try {
        if (token) await revokeSession(token);
      } catch {
        // shortcut: offline sign-out clears this device; unreached server tokens expire normally.
      } finally {
        queryClient.clear();
        await useSession.getState().clear();
      }
    },
  });
}

export function authErrorKey(error: Error | null) {
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 401)
      return 'auth.invalidCredentials';
    if (error.status === 422) return 'auth.invalidRegistration';
    if (error.status === 429) return 'auth.tooManyAttempts';
  }
  return 'auth.connectionError';
}
