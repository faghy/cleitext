import { createContext, useContext, type ReactNode } from 'react';
import type { PageContext } from './types.js';

const PageContextReact = createContext<PageContext | null>(null);

export function PageProvider({ value, children }: { value: PageContext; children: ReactNode }) {
  return <PageContextReact.Provider value={value}>{children}</PageContextReact.Provider>;
}

/** Site, language, menus and URL helpers of the page being rendered. */
export function usePage(): PageContext {
  const value = useContext(PageContextReact);
  if (!value) throw new Error('usePage() must be used inside a Cleitext page');
  return value;
}
