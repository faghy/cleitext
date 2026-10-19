import { useNavigate, useRouterState } from '@tanstack/react-router';

/**
 * A tab of a screen kept in the address (`?tab=menus`), so the sidebar's
 * submenus open it and the browser's back button returns to it.
 */
export function useTabParam<T extends string>(fallback: T): [T, (tab: T) => void] {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const navigate = useNavigate();
  const tab = (typeof search.tab === 'string' && search.tab ? search.tab : fallback) as T;
  const setTab = (next: T) =>
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        tab: next === fallback ? undefined : next,
      })) as never,
      replace: true,
    });
  return [tab, setTab];
}
