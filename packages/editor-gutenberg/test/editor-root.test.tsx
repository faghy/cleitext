import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { mountEditorRoot } from '../src/editor-root';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const targets: HTMLElement[] = [];
function target(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  targets.push(element);
  return element;
}
afterEach(() => {
  for (const element of targets.splice(0)) element.remove();
});

/** Like the media and relation fields of plugin blocks: a query in the editor's tree. */
function Probe({ seen }: { seen?: (client: QueryClient) => void }) {
  const client = useQueryClient();
  seen?.(client);
  const query = useQuery({ queryKey: ['probe'], queryFn: async () => 'loaded' });
  return <p>{query.data ?? 'loading'}</p>;
}

describe('mountEditorRoot', () => {
  it('gives the editor a query client when none is passed', async () => {
    const element = target();
    let root!: ReturnType<typeof mountEditorRoot>;
    await act(async () => {
      root = mountEditorRoot(element, <Probe />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(element.textContent).toBe('loaded');
    act(() => root.unmount());
  });

  it("uses the admin's query client when given, sharing its cache", async () => {
    const element = target();
    const client = new QueryClient();
    client.setQueryData(['probe'], 'cached');
    let seen: QueryClient | undefined;
    let root!: ReturnType<typeof mountEditorRoot>;
    await act(async () => {
      root = mountEditorRoot(element, <Probe seen={(c) => (seen = c)} />, client);
    });
    expect(seen).toBe(client);
    expect(element.textContent).toBe('cached');
    act(() => root.unmount());
  });

  it('gives each editor its own client when none is passed', async () => {
    const clients: QueryClient[] = [];
    const roots: ReturnType<typeof mountEditorRoot>[] = [];
    await act(async () => {
      roots.push(mountEditorRoot(target(), <Probe seen={(c) => clients.push(c)} />));
      roots.push(mountEditorRoot(target(), <Probe seen={(c) => clients.push(c)} />));
    });
    expect(new Set(clients).size).toBe(2);
    act(() => roots.forEach((root) => root.unmount()));
  });
});
