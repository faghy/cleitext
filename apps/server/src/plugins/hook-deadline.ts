/**
 * The time limit of plugin code (RF-PLG-06), counted in time the server was
 * free to run it (core 0.82). A plain timer also counts the time the event
 * loop was blocked by other work (a large import being read, a big document
 * being checked): when the loop frees up, the timer fires before the handler,
 * which was ready all along, gets its turn, and a fast handler is abandoned.
 * Here the time is counted in short ticks: a tick that arrives late counts
 * as one tick, so blocked time is not charged to the handler.
 */
export interface HookDeadline {
  /** Rejects once the handler has had `limit` ms of free time. */
  readonly expired: Promise<never>;
  clear(): void;
}

export function hookDeadline(limit: number, message = `timed out after ${limit} ms`): HookDeadline {
  const tick = Math.max(10, Math.min(250, Math.floor(limit / 10)));
  let used = 0;
  let last = performance.now();
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const expired = new Promise<never>((_, reject) => {
    const step = () => {
      if (stopped) return;
      const now = performance.now();
      // A late tick (the loop was busy elsewhere) counts as one tick only.
      used += Math.min(now - last, tick * 2);
      last = now;
      if (used >= limit) {
        // Work that became ready while the loop was blocked runs first.
        setImmediate(() => {
          if (!stopped) reject(new Error(message));
        });
        return;
      }
      timer = setTimeout(step, Math.min(tick, limit - used));
    };
    timer = setTimeout(step, Math.min(tick, limit));
  });
  // Never an unhandled rejection when nobody awaits it any more.
  expired.catch(() => {});
  return {
    expired,
    clear() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
