/** The status file of `cleitext update --status`, read by the admin and the hosting panels. */
import { readFile, readdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeStatus, type UpdateStatus } from '../src/program.js';

const base = (step: string | null): UpdateStatus =>
  ({
    state: 'running',
    from: '0.42.0',
    to: '0.68.1',
    step,
    steps: [],
    startedAt: '2026-10-24T00:00:00.000Z',
  }) as unknown as UpdateStatus;

describe('the update status file', () => {
  it('keeps steps a few ms apart in order, without losing the file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'cleitext-status-'));
    const file = path.join(dir, '.toolkit-update.json');
    const steps = ['download', 'verify', 'unpack', 'configure', 'backup', 'migrate'];
    // As the update does: one write per step, not awaited.
    await Promise.all(steps.map((step) => writeStatus(file, base(step))));
    expect(JSON.parse(await readFile(file, 'utf8')).step).toBe('migrate');
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('never stops the update when the file cannot be written', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'cleitext-status-'));
    // A folder where the file should be: the rename fails.
    const file = dir;
    await expect(writeStatus(file, base('backup'))).resolves.toBeUndefined();
  });
});
