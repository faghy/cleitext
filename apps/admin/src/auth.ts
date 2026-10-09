import type { MeResponse } from '@cleitext/shared';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';

export const ME_QUERY_KEY = ['me'] as const;

/** Current user on this site, or null when signed out. */
export const meQuery = queryOptions({
  queryKey: ME_QUERY_KEY,
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await api<MeResponse>('GET', '/auth/me');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 60_000,
});

/** Signed-in user; only for routes behind the authenticated layout. */
export function useMe(): MeResponse {
  const { data } = useSuspenseQuery(meQuery);
  if (!data) throw new Error('useMe() used outside the authenticated layout');
  return data;
}
