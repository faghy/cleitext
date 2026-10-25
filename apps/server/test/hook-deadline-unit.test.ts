/**
 * The time limit of plugin code counts the time the server was free to run
 * it (core 0.82): a handler waiting behind other work that blocks the event
 * loop is not abandoned for it, a slow one still is.
 */
import { describe, expect, it } from 'vitest';
import { hookDeadline } from '../src/plugins/hook-deadline.js';

/** Keeps the event loop busy, as reading a large export does. */
function block(ms: number) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // busy
  }
}

const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

describe('hookDeadline', () => {
  it('abandons a handler slower than the limit', async () => {
    const deadline = hookDeadline(100);
    const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 400));
    const outcome = await settle(Promise.race([slow, deadline.expired]));
    deadline.clear();
    expect(outcome.ok).toBe(false);
    expect(String((outcome as { error: unknown }).error)).toContain('timed out after 100 ms');
  });

  it('does not charge a handler for time the event loop spent on other work', async () => {
    const deadline = hookDeadline(100);
    // The handler is ready right after its turn comes (as after I/O, which
    // Node runs after due timers)…
    const fast = new Promise((resolve) => setImmediate(() => resolve('done')));
    // …but other work keeps the loop busy for three times the limit.
    block(300);
    const outcome = await settle(Promise.race([fast, deadline.expired]));
    deadline.clear();
    expect(outcome).toEqual({ ok: true, value: 'done' });
  });

  it('stops counting once cleared', async () => {
    const deadline = hookDeadline(20);
    deadline.clear();
    const outcome = await settle(
      Promise.race([deadline.expired, new Promise((r) => setTimeout(() => r('quiet'), 80))]),
    );
    expect(outcome).toEqual({ ok: true, value: 'quiet' });
  });
});
