import { labelText, type EntryState } from '@cleitext/shared';
import { useMe } from '../auth';

/** What an entry is for, next to its title: front page, 404 page, privacy policy… */
export function EntryStates({ states }: { states: EntryState[] | undefined }) {
  const me = useMe();
  if (!states || states.length === 0) return null;
  return (
    <>
      {states.map((state) => (
        <span
          key={state.key}
          className="ml-2 inline-block rounded-full bg-sky-50 px-2 py-0.5 align-middle text-xs font-medium whitespace-nowrap text-sky-800 ring-1 ring-sky-200"
        >
          {labelText(state.label, me.user.locale)}
        </span>
      ))}
    </>
  );
}
