import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Mounts the editor in its own React root, inside the providers the admin's
 * components expect: the forms of plugin blocks (media and relation fields of
 * `@cleitext/admin-sdk`) read data with TanStack Query. The admin's own client
 * is used when given, so its cache is shared; otherwise each editor gets one.
 */
export function mountEditorRoot(
  target: HTMLElement,
  children: ReactNode,
  queryClient: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  }),
): Root {
  const root = createRoot(target);
  root.render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
  return root;
}
