/**
 * Shape of the server's task module (apps/server/src/tasks.ts), loaded at
 * runtime by the CLI. Declared here so the CLI does not depend on the server.
 */
export interface ImportReport {
  created: Record<string, number>;
  skipped: Record<string, number>;
  warnings: string[];
  errors: string[];
}

export interface TaskContext {
  close(): Promise<void>;
}

export declare function openTasks(log?: (message: string) => void): Promise<TaskContext>;
export declare function exportTask(
  context: TaskContext,
  options: { site: string; out: string },
): Promise<void>;
export declare function importTask(
  context: TaskContext,
  options: { file: string; site: string; as?: string | undefined },
): Promise<ImportReport>;
export declare function importWxrTask(
  context: TaskContext,
  options: {
    file: string;
    site: string;
    locale?: string | undefined;
    uploads?: string | undefined;
    as?: string | undefined;
    authorRole?: string | undefined;
  },
): Promise<ImportReport>;
export declare function formatReport(report: ImportReport): string;
export declare function saveReport(file: string, report: ImportReport): Promise<void>;
