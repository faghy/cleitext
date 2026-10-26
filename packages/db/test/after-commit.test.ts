/**
 * `afterCommit` (core 0.89): callbacks run once the transaction they were
 * registered in, and every transaction around it, committed; never after
 * a rollback, a failed savepoint included.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { afterCommit, createDatabase, withContext, type DatabaseClient } from '../src/index.js';

let owner: DatabaseClient;

beforeAll(() => {
  owner = createDatabase(inject('ownerUrl'), { max: 3 });
});

afterAll(async () => {
  await owner?.close();
});

/** Lets the callbacks scheduled with `setImmediate` run. */
const settle = () => sleep(20);

describe('afterCommit', () => {
  it('runs on the next turn outside a transaction', async () => {
    const seen: string[] = [];
    afterCommit(() => seen.push('now'));
    expect(seen).toEqual([]);
    await settle();
    expect(seen).toEqual(['now']);
  });

  it('waits for the commit, and runs outside the transaction', async () => {
    const seen: string[] = [];
    let inside = true;
    await owner.db.transaction(async (tx) => {
      await tx.execute(sql`select 1`);
      afterCommit(() => {
        seen.push(inside ? 'early' : 'committed');
      });
      await settle();
      expect(seen).toEqual([]);
    });
    inside = false;
    await settle();
    expect(seen).toEqual(['committed']);
  });

  it('never runs after a rollback', async () => {
    const seen: string[] = [];
    await expect(
      owner.db.transaction(async () => {
        afterCommit(() => seen.push('rolled back'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await settle();
    expect(seen).toEqual([]);
  });

  it('drops the callbacks of a failed savepoint, keeps those of the transaction', async () => {
    const seen: string[] = [];
    const siteId = randomUUID();
    await withContext(owner.db, { siteId }, async () => {
      afterCommit(() => seen.push('outer'));
      // Inside a transaction of the same site: a savepoint of it.
      await withContext(owner.db, { siteId }, async () => {
        afterCommit(() => seen.push('savepoint'));
        throw new Error('savepoint fails');
      }).catch(() => {});
      await withContext(owner.db, { siteId }, async () => {
        afterCommit(() => seen.push('kept savepoint'));
      });
      await settle();
      expect(seen).toEqual([]);
    });
    await settle();
    expect(seen).toEqual(['outer', 'kept savepoint']);
  });

  it('a callback that throws does not stop the others', async () => {
    const seen: string[] = [];
    await owner.db.transaction(async () => {
      afterCommit(() => {
        throw new Error('listener');
      });
      afterCommit(() => seen.push('second'));
    });
    await settle();
    expect(seen).toEqual(['second']);
  });
});
