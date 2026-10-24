/**
 * Undo and redo of the editor: every change is a step, except changes of the
 * same field in a row (typing, dragging a slider control), which make one,
 * and live changes during a drag, which become a step when it ends.
 */
import { useCallback, useRef, useState } from 'react';

const MAX = 200;
/** Changes of the same field closer than this make one step. */
const MERGE_MS = 1200;

export interface History<T> {
  value: T;
  /** Changes the value; `group` merges quick changes of the same field into one step. */
  change: (next: T | ((current: T) => T), group?: string) => void;
  /** A live change (a drag): no step until `commit`. */
  preview: (next: T | ((current: T) => T)) => void;
  commit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Starts over from a value (after loading), with no steps. */
  reset: (value: T) => void;
}

export function useHistory<T>(initial: T): History<T> {
  const [state, setState] = useState({ past: [] as T[], value: initial, future: [] as T[] });
  const last = useRef<{ group: string; at: number } | null>(null);
  const before = useRef<T | null>(null);

  const change = useCallback((next: T | ((current: T) => T), group?: string) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (c: T) => T)(s.value) : next;
      if (value === s.value) return s;
      const now = Date.now();
      const merge = group && last.current?.group === group && now - last.current.at < MERGE_MS;
      last.current = group ? { group, at: now } : null;
      return {
        past: merge ? s.past : [...s.past, s.value].slice(-MAX),
        value,
        future: [],
      };
    });
  }, []);

  const preview = useCallback((next: T | ((current: T) => T)) => {
    setState((s) => {
      if (before.current === null) before.current = s.value;
      const value = typeof next === 'function' ? (next as (c: T) => T)(s.value) : next;
      return { ...s, value };
    });
  }, []);

  const commit = useCallback(() => {
    const start = before.current;
    before.current = null;
    last.current = null;
    if (start === null) return;
    setState((s) =>
      s.value === start ? s : { past: [...s.past, start].slice(-MAX), value: s.value, future: [] },
    );
  }, []);

  const undo = useCallback(() => {
    last.current = null;
    setState((s) =>
      s.past.length === 0
        ? s
        : {
            past: s.past.slice(0, -1),
            value: s.past[s.past.length - 1]!,
            future: [s.value, ...s.future],
          },
    );
  }, []);

  const redo = useCallback(() => {
    last.current = null;
    setState((s) =>
      s.future.length === 0
        ? s
        : { past: [...s.past, s.value], value: s.future[0]!, future: s.future.slice(1) },
    );
  }, []);

  const reset = useCallback((value: T) => {
    last.current = null;
    before.current = null;
    setState({ past: [], value, future: [] });
  }, []);

  return {
    value: state.value,
    change,
    preview,
    commit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
  };
}
