export * from '@cleitext/blocks/transfer';

/** What an import did, shown to the user (RF-IMP-01: "with a report"). */
export interface ImportReport {
  created: Record<string, number>;
  skipped: Record<string, number>;
  /** Not blocking: something was adapted or left out. */
  warnings: string[];
  /** Blocking for that record: it was not imported. */
  errors: string[];
}

export function emptyReport(): ImportReport {
  return { created: {}, skipped: {}, warnings: [], errors: [] };
}

export function count(report: ImportReport, kind: string, what: 'created' | 'skipped' = 'created') {
  report[what][kind] = (report[what][kind] ?? 0) + 1;
}
