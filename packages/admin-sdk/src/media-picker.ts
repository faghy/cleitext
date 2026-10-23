import type { MediaListResponse, MediaView } from '@cleitext/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from './api.js';

/**
 * The images of a media picker: every image of the library, newest first,
 * 60 at a time, with a search; and the chosen one, also when it is older
 * than the ones listed.
 */
export function useMediaPicker(open: boolean, value: string | null) {
  const [search, setSearch] = useState('');
  const q = search.trim();
  const images = useInfiniteQuery({
    queryKey: ['media', 'picker', q],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ kind: 'image', limit: '60' });
      if (q) params.set('q', q);
      if (pageParam) params.set('cursor', pageParam);
      return api<MediaListResponse>('GET', `/media?${params}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open,
  });
  const selected = useQuery({
    queryKey: ['media', value],
    queryFn: () => api<MediaView>('GET', `/media/${value}`),
    enabled: value !== null,
  }).data;
  return {
    search,
    setSearch,
    searching: q !== '',
    items: images.data?.pages.flatMap((page) => page.items) ?? [],
    loaded: images.isSuccess,
    more: images.hasNextPage,
    loadingMore: images.isFetchingNextPage,
    loadMore: () => void images.fetchNextPage(),
    selected,
  };
}
