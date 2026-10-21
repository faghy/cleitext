import {
  labelText,
  type AssistantChatEvent,
  type AssistantChatMessage,
  type EntryView,
} from '@cleitext/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, apiStream, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, useT } from '../components/ui';
import { siteEditors, usePluginAdmin } from '../plugins';

/** What the assistant is doing, by tool. */
const STEP_LABELS: Record<string, string> = {
  get_site: 'Reading the site',
  get_block_guide: 'Reading how to write blocks',
  get_pattern: 'Reading a pattern',
  list_entries: 'Looking for pages and posts',
  get_entry: 'Reading a page',
  create_entry: 'Creating a draft',
  update_entry: 'Changing a page',
  get_preview_link: 'Making a preview link',
  publish_entry: 'Publishing',
  upload_image: 'Uploading an image',
  list_media: 'Looking at the media',
  set_menu: 'Updating a menu',
};

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  steps?: { name: string; ok?: boolean }[];
  error?: string;
}

interface Saved {
  turns: Turn[];
  messages: AssistantChatMessage[];
}

/**
 * Admin → AI assistants → Chat (RF-AI-03): ask, and the site's AI provider
 * does it. Opened from an entry's editor (`entryId`), it is about that entry:
 * the server tells the assistant which entry and editor it is.
 */
export function AssistantChat({
  suggestion,
  entryId = null,
}: {
  suggestion: { text: string; at: number } | null;
  entryId?: string | null;
}) {
  const { t } = useT();
  const me = useMe();
  // One conversation per entry, and one for the rest.
  const storageKey = `cleitext-chat-${me.site.id}${entryId ? `-${entryId}` : ''}`;
  const entry = useQuery({
    queryKey: ['entry', entryId],
    queryFn: () => api<EntryView>('GET', `/entries/${entryId}`),
    enabled: entryId !== null,
  });
  const plugins = usePluginAdmin();
  const editorId = (entry.data?.revision?.document as { editor?: { id?: string } } | undefined)
    ?.editor?.id;
  const editor = siteEditors(plugins, me.capabilities).find((e) => e.id === (editorId || 'blocks'));
  const [saved, setSaved] = useState<Saved>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) ?? '') as Saved;
    } catch {
      return { turns: [], messages: [] };
    }
  });
  const [input, setInput] = useState('');
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const canPublish = me.capabilities.includes('publish_entries');

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(saved));
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [saved, storageKey]);

  // A ready request chosen below lands in the box.
  useEffect(() => {
    if (!suggestion) return;
    setInput(suggestion.text);
    box.current?.focus();
    box.current?.scrollIntoView({ block: 'center' });
  }, [suggestion]);

  const updateLast = (change: (turn: Turn) => Turn) =>
    setSaved((current) => ({
      ...current,
      turns: [...current.turns.slice(0, -1), change(current.turns.at(-1)!)],
    }));

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    setInput('');
    setFailure(null);
    setBusy(true);
    const messages: AssistantChatMessage[] = [
      ...saved.messages,
      { role: 'user', content: question },
    ];
    setSaved((current) => ({
      ...current,
      turns: [
        ...current.turns,
        { role: 'user', text: question },
        { role: 'assistant', text: '', steps: [] },
      ],
    }));
    abort.current = new AbortController();
    try {
      await apiStream<AssistantChatEvent>(
        '/assistants/chat',
        { messages, publish, ...(entryId ? { entryId } : {}) },
        (event) => {
          if (event.type === 'tool') {
            updateLast((turn) => ({
              ...turn,
              steps: [...(turn.steps ?? []), { name: event.name }],
            }));
          } else if (event.type === 'tool-done') {
            updateLast((turn) => {
              const steps = [...(turn.steps ?? [])];
              const index = steps.findLastIndex((s) => s.name === event.name && s.ok === undefined);
              if (index >= 0) steps[index] = { ...steps[index]!, ok: event.ok };
              return { ...turn, steps };
            });
          } else if (event.type === 'text' && event.text) {
            updateLast((turn) => ({
              ...turn,
              text: turn.text ? `${turn.text}\n\n${event.text}` : event.text,
            }));
          } else if (event.type === 'done') {
            setSaved((current) => ({ ...current, messages: event.messages }));
          } else if (event.type === 'error') {
            updateLast((turn) => ({ ...turn, error: event.message }));
          }
        },
        abort.current.signal,
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setFailure(errorMessage(error));
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  return (
    <div className="space-y-4 text-sm">
      {entry.data && (
        <p className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900">
          {t('About “{title}”, made with {editor}.', {
            title: entry.data.title || t('(no title)'),
            editor: editor ? labelText(editor.title, me.user.locale) : (editorId ?? ''),
          })}
        </p>
      )}
      {saved.turns.length === 0 ? (
        <p className="text-slate-600">
          {t(
            'Ask for a page, a post, a translation or a change: the assistant works on the site with your permissions and leaves drafts for you to check.',
          )}
        </p>
      ) : (
        <div className="max-h-[32rem] space-y-3 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3">
          {saved.turns.map((turn, index) => (
            <div
              key={index}
              className={
                turn.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-lg bg-sky-700 px-3 py-2 whitespace-pre-wrap text-white'
                  : 'max-w-[95%] space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2'
              }
            >
              {turn.role === 'user' ? (
                turn.text
              ) : (
                <>
                  {turn.steps && turn.steps.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-slate-500">
                      {turn.steps.map((step, i) => (
                        <li key={i}>
                          {step.ok === undefined ? '…' : step.ok ? '✓' : '✗'}{' '}
                          {t(STEP_LABELS[step.name] ?? step.name)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {turn.text && <RichText text={turn.text} />}
                  {turn.error && <Alert>{t(turn.error)}</Alert>}
                  {!turn.text && !turn.error && busy && index === saved.turns.length - 1 && (
                    <p className="text-slate-500">{t('Working…')}</p>
                  )}
                </>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
      )}
      {failure && <Alert>{failure}</Alert>}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="block">
          <span className="sr-only">{t('Your request')}</span>
          <textarea
            ref={box}
            rows={3}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2"
            placeholder={t('What should the assistant do?')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? t('Working…') : t('Send')}
          </Button>
          {busy && (
            <Button type="button" variant="secondary" onClick={() => abort.current?.abort()}>
              {t('Stop')}
            </Button>
          )}
          {!busy && saved.turns.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSaved({ turns: [], messages: [] });
                setFailure(null);
              }}
            >
              {t('New conversation')}
            </Button>
          )}
          {canPublish && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
              />
              {t('It may also publish')}
            </label>
          )}
          <span className="text-xs text-slate-500">{t('Ctrl+Enter to send')}</span>
        </div>
      </form>
    </div>
  );
}

/** The assistant's text: paragraphs, **bold**, [links](…) and bare addresses. */
function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-2 whitespace-pre-wrap">
      {text.split(/\n{2,}/).map((paragraph, i) => (
        <p key={i}>{inline(paragraph)}</p>
      ))}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s)<>]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, label, url, bold, bare] = match;
    if (bold) parts.push(<strong key={match.index}>{bold}</strong>);
    else
      parts.push(
        <a
          key={match.index}
          href={url ?? bare}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-700 underline"
        >
          {label ?? bare}
        </a>,
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
