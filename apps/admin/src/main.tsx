import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { addMessages, setLanguage } from '@cleitext/admin-sdk';
import type { MeResponse } from '@cleitext/shared';
import { ME_QUERY_KEY } from './auth';
import { it } from './locales/it';
import { exposeSharedModules } from './plugins';
import { createAdminRouter } from './router';
import './index.css';

exposeSharedModules();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const router = createAdminRouter(queryClient);

// Admin language (RF-ADM-04): the browser's until sign-in, then the profile's.
addMessages('it', it);
setLanguage(navigator.language);
queryClient.getQueryCache().subscribe((event) => {
  if (event.query.queryKey[0] !== ME_QUERY_KEY[0]) return;
  const me = event.query.state.data as MeResponse | null | undefined;
  if (me) setLanguage(me.user.locale);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
