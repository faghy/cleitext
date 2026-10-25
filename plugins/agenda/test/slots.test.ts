import { describe, expect, it } from 'vitest';
import { normalizeService } from '../src/model/normalize';
import { clashes, freeSlots, hoursOn, isFree, placesLeft, type Busy } from '../src/model/slots';
import { addDays, localDate, localMinutes, localToUtc, offsetAt, weekday } from '../src/model/time';
import type { Exception, Service } from '../src/model/types';

const ROME = 'Europe/Rome';
const H = 3600_000;
const M = 60_000;

const at = (date: string, time: string, tz = ROME) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return localToUtc(date, h * 60 + m, tz)!;
};

/** linomissio.com's service: Thursdays 13:00, 14:15, 15:30; 50'; buffers 80'/10'; 24 h – 1 year. */
function consultation(extra: Partial<Service> = {}): Service {
  const thursday = { windows: [], times: [13 * 60, 14 * 60 + 15, 15 * 60 + 30] };
  const none = { windows: [], times: [] };
  return normalizeService({
    id: 'svc-1',
    name: 'Consulenza psicologica online',
    duration: 50,
    bufferBefore: 80,
    bufferAfter: 10,
    minNotice: 24 * 60,
    maxNotice: 365 * 24 * 60,
    schedule: { mode: 'fixed', step: 0, days: [none, none, none, none, thursday, none, none] },
    ...extra,
  });
}

function office(extra: Partial<Service> = {}): Service {
  const day = { windows: [{ start: 9 * 60, end: 13 * 60 }], times: [] };
  const none = { windows: [], times: [] };
  return normalizeService({
    id: 'svc-2',
    name: 'Visit',
    duration: 30,
    schedule: { mode: 'intervals', step: 0, days: [none, day, day, day, day, day, none] },
    ...extra,
  });
}

const busy = (service: Service, start: number, extra: Partial<Busy> = {}): Busy => ({
  serviceId: service.id,
  start,
  end: start + service.duration * M,
  seats: 1,
  bufferBefore: service.bufferBefore,
  bufferAfter: service.bufferAfter,
  ...extra,
});

describe('time zones', () => {
  it('converts local times and back, in summer and winter', () => {
    expect(new Date(at('2026-07-02', '13:00')).toISOString()).toBe('2026-07-02T11:00:00.000Z');
    expect(new Date(at('2026-12-03', '13:00')).toISOString()).toBe('2026-12-03T12:00:00.000Z');
    expect(localDate(at('2026-07-02', '00:30'), ROME)).toBe('2026-07-02');
    expect(localMinutes(at('2026-07-02', '13:45'), ROME)).toBe(13 * 60 + 45);
    expect(offsetAt(Date.UTC(2026, 6, 1), ROME)).toBe(2 * H);
    expect(weekday('2026-10-29')).toBe(4);
  });

  it('skips the hour lost in spring and takes the first of the hour repeated in autumn', () => {
    // 29 March 2026: 02:00 → 03:00 in Rome.
    expect(localToUtc('2026-03-29', 2 * 60 + 30, ROME)).toBeNull();
    expect(new Date(at('2026-03-29', '03:00')).toISOString()).toBe('2026-03-29T01:00:00.000Z');
    // 25 October 2026: 03:00 → 02:00, 02:30 happens twice.
    expect(new Date(at('2026-10-25', '02:30')).toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(new Date(at('2026-10-25', '03:30')).toISOString()).toBe('2026-10-25T02:30:00.000Z');
  });
});

describe('free slots', () => {
  const now = at('2026-07-01', '09:00');

  it('offers fixed start times on their day only', () => {
    const slots = freeSlots({
      service: consultation(),
      exceptions: [],
      busy: [],
      from: '2026-07-01',
      to: '2026-07-08',
      now,
      timeZone: ROME,
      shared: true,
    });
    expect(slots.map((s) => new Date(s.start).toISOString())).toEqual([
      '2026-07-02T11:00:00.000Z',
      '2026-07-02T12:15:00.000Z',
      '2026-07-02T13:30:00.000Z',
    ]);
    expect(slots[0]!.end - slots[0]!.start).toBe(50 * M);
  });

  it('makes a slot every step inside the windows, the last one ending in time', () => {
    const service = office();
    const day = freeSlots({
      service,
      exceptions: [],
      busy: [],
      from: '2026-07-06',
      to: '2026-07-06',
      now,
      timeZone: ROME,
      shared: true,
    });
    expect(day).toHaveLength(8);
    expect(localMinutes(day[7]!.start, ROME)).toBe(12 * 60 + 30);
    const stepped = freeSlots({
      service: office({ duration: 45, schedule: { ...service.schedule, step: 30 } }),
      exceptions: [],
      busy: [],
      from: '2026-07-06',
      to: '2026-07-06',
      now,
      timeZone: ROME,
      shared: true,
    });
    expect(stepped.map((s) => localMinutes(s.start, ROME))).toEqual([
      540, 570, 600, 630, 660, 690, 720,
    ]);
  });

  it('keeps the minimum and maximum notice', () => {
    const service = consultation();
    // Wednesday 14:00: Thursday 13:00 is less than 24 h away.
    const wed = at('2026-07-01', '14:00');
    const slots = freeSlots({
      service,
      exceptions: [],
      busy: [],
      from: '2026-07-02',
      to: '2026-07-02',
      now: wed,
      timeZone: ROME,
      shared: true,
    });
    expect(slots.map((s) => localMinutes(s.start, ROME))).toEqual([14 * 60 + 15, 15 * 60 + 30]);
    const short = consultation({ maxNotice: 7 * 24 * 60 });
    const far = freeSlots({
      service: short,
      exceptions: [],
      busy: [],
      from: '2026-07-01',
      to: '2026-07-31',
      now,
      timeZone: ROME,
      shared: true,
    });
    expect(far.every((s) => s.start <= now + 7 * 24 * H)).toBe(true);
    expect(far).toHaveLength(3);
  });

  it('keeps the buffers free around appointments', () => {
    const service = consultation();
    const first = at('2026-07-02', '13:00');
    const slots = freeSlots({
      service,
      exceptions: [],
      busy: [busy(service, first)],
      from: '2026-07-02',
      to: '2026-07-02',
      now,
      timeZone: ROME,
      shared: true,
    });
    // 14:15 needs 80' free before it: 12:55, inside 13:00–13:50. 15:30 is fine.
    expect(slots.map((s) => localMinutes(s.start, ROME))).toEqual([15 * 60 + 30]);
    expect(
      clashes(
        at('2026-07-02', '14:00'),
        at('2026-07-02', '14:30'),
        { bufferBefore: 0, bufferAfter: 0 },
        busy(office(), at('2026-07-02', '13:00'), { bufferAfter: 31 }),
      ),
    ).toBe(true);
    expect(
      clashes(
        at('2026-07-02', '14:00'),
        at('2026-07-02', '14:30'),
        { bufferBefore: 0, bufferAfter: 0 },
        busy(office(), at('2026-07-02', '13:00'), { bufferAfter: 30 }),
      ),
    ).toBe(false);
  });

  it('follows the buffer rule of Simply Schedule Appointments', () => {
    // SSA (is_appointment_period_available and the check across types): a
    // new appointment's buffered period may not cover another appointment,
    // and its own time may not fall in another's buffers; buffers may cover
    // each other. That is "the gap is at least the larger facing buffer".
    const service = consultation();
    const day = (taken: string[]) =>
      freeSlots({
        service,
        exceptions: [],
        busy: taken.map((t) => busy(service, at('2026-07-02', t))),
        from: '2026-07-02',
        to: '2026-07-02',
        now,
        timeZone: ROME,
        shared: true,
      }).map((s) => localMinutes(s.start, ROME));
    expect(day([])).toEqual([13 * 60, 14 * 60 + 15, 15 * 60 + 30]);
    // 14:15 blocks both: 13:00 ends 25' before it (80' needed), 15:30 starts 25' after its end.
    expect(day(['14:15'])).toEqual([]);
    expect(day(['15:30'])).toEqual([13 * 60]);
    // Buffers facing each other overlap: 30'/30' around 10:00–10:30 leaves 11:00 free.
    const half = office({ bufferBefore: 30, bufferAfter: 30 });
    const ten = busy(half, at('2026-07-02', '10:00'));
    expect(clashes(at('2026-07-02', '11:00'), at('2026-07-02', '11:30'), half, ten)).toBe(false);
    expect(clashes(at('2026-07-02', '10:55'), at('2026-07-02', '11:25'), half, ten)).toBe(true);
    // Across services each side keeps its own: the larger facing buffer wins.
    const plain = { bufferBefore: 0, bufferAfter: 0 };
    expect(clashes(at('2026-07-02', '11:00'), at('2026-07-02', '11:30'), plain, ten)).toBe(false);
    expect(clashes(at('2026-07-02', '10:45'), at('2026-07-02', '11:15'), plain, ten)).toBe(true);
    expect(clashes(at('2026-07-02', '09:15'), at('2026-07-02', '09:30'), plain, ten)).toBe(false);
    expect(clashes(at('2026-07-02', '09:15'), at('2026-07-02', '09:45'), plain, ten)).toBe(true);
  });

  it('fills a group slot up to its capacity', () => {
    const service = office({ capacity: 3 });
    const start = at('2026-07-06', '09:00');
    const two = [busy(service, start), busy(service, start, { seats: 1 })];
    expect(placesLeft(service, start, two, true)).toBe(1);
    const full = [...two, busy(service, start)];
    const slots = freeSlots({
      service,
      exceptions: [],
      busy: full,
      from: '2026-07-06',
      to: '2026-07-06',
      now,
      timeZone: ROME,
      shared: true,
    });
    expect(slots.find((s) => s.start === start)).toBeUndefined();
    expect(slots[0]!.left).toBe(3);
  });

  it('shares one calendar between services, or keeps them apart', () => {
    const a = office();
    const b = office({ id: 'svc-3' });
    const start = at('2026-07-06', '09:00');
    expect(placesLeft(b, start, [busy(a, start)], true)).toBe(0);
    expect(placesLeft(b, start, [busy(a, start)], false)).toBe(1);
    expect(placesLeft(b, start, [], true, [{ start, end: start + H }])).toBe(0);
  });

  it('applies closures and days with other hours', () => {
    const service = office();
    const closed: Exception = {
      id: 'x',
      serviceId: null,
      from: '2026-08-10',
      to: '2026-08-14',
      closed: true,
      hours: { windows: [], times: [] },
      note: 'Holidays',
    };
    const special: Exception = {
      id: 'y',
      serviceId: service.id,
      from: '2026-08-12',
      to: '2026-08-12',
      closed: false,
      hours: { windows: [{ start: 15 * 60, end: 16 * 60 }], times: [] },
      note: '',
    };
    expect(hoursOn(service, [closed], '2026-08-11')).toBeNull();
    // The service's own exception wins over the closure for everyone.
    expect(hoursOn(service, [closed, special], '2026-08-12')?.windows).toEqual([
      { start: 900, end: 960 },
    ]);
    const slots = freeSlots({
      service,
      exceptions: [closed, special],
      busy: [],
      from: '2026-08-10',
      to: '2026-08-14',
      now,
      timeZone: ROME,
      shared: true,
    });
    expect(slots.map((s) => [localDate(s.start, ROME), localMinutes(s.start, ROME)])).toEqual([
      ['2026-08-12', 900],
      ['2026-08-12', 930],
    ]);
  });

  it('handles the days daylight saving time changes in Rome', () => {
    const none = { windows: [], times: [] };
    const night = { windows: [{ start: 60, end: 4 * 60 }], times: [] };
    const service = normalizeService({
      id: 's',
      duration: 30,
      schedule: { mode: 'intervals', step: 30, days: [night, none, none, none, none, none, none] },
    });
    const before = at('2026-03-20', '00:00');
    // Sunday 29 March: 01:00–04:00 local has no 02:00–02:59.
    const spring = freeSlots({
      service,
      exceptions: [],
      busy: [],
      from: '2026-03-29',
      to: '2026-03-29',
      now: before,
      timeZone: ROME,
      shared: true,
    });
    expect(spring.map((s) => localMinutes(s.start, ROME))).toEqual([60, 90, 180, 210]);
    // Sunday 25 October: 02:00 and 02:30 exist twice; each is offered once.
    const autumn = freeSlots({
      service,
      exceptions: [],
      busy: [],
      from: '2026-10-25',
      to: '2026-10-25',
      now: at('2026-10-20', '00:00'),
      timeZone: ROME,
      shared: true,
    });
    expect(autumn.map((s) => localMinutes(s.start, ROME))).toEqual([60, 90, 120, 150, 180, 210]);
    expect(autumn[2]!.start - autumn[1]!.start).toBe(30 * M);
    // Fixed weekly times keep their wall-clock time across the change.
    const weekly = consultation({ maxNotice: 0 });
    const across = freeSlots({
      service: weekly,
      exceptions: [],
      busy: [],
      from: '2026-10-22',
      to: '2026-10-29',
      now: at('2026-10-01', '00:00'),
      timeZone: ROME,
      shared: true,
    });
    expect(across.filter((s) => localMinutes(s.start, ROME) === 13 * 60)).toHaveLength(2);
    expect(new Date(across[0]!.start).toISOString()).toBe('2026-10-22T11:00:00.000Z');
    expect(new Date(across[3]!.start).toISOString()).toBe('2026-10-29T12:00:00.000Z');
  });

  it('checks one start, leaving out the appointment being moved', () => {
    const service = consultation();
    const start = at('2026-07-02', '13:00');
    const mine = { ...busy(service, start), id: 'mine' };
    expect(
      isFree({
        service,
        exceptions: [],
        busy: [mine],
        start,
        date: '2026-07-02',
        now,
        timeZone: ROME,
        shared: true,
      }),
    ).toBeNull();
    expect(
      isFree({
        service,
        exceptions: [],
        busy: [mine],
        start,
        date: '2026-07-02',
        now,
        timeZone: ROME,
        shared: true,
        ignoreId: 'mine',
      }),
    ).not.toBeNull();
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
