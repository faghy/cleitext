/**
 * Machine-readable output (`--json`), for hosting panels and scripts such as
 * the Plesk extension "Cleitext Toolkit".
 *
 * The contract:
 * - a command run with `--json` prints exactly one JSON object on stdout,
 *   followed by a newline; progress and logs go to stderr;
 * - on failure the object is `{"error":{"code":"…","message":"…"}}` and the
 *   exit code is not 0;
 * - without `--json` nothing changes: the usual text on stdout.
 *
 * Commands describe their result once with `report(data, text)`.
 */
import { CommanderError } from 'commander';
import { OperationError } from './operations.js';

export interface JsonError {
  error: { code: string; message: string };
}

interface State {
  json: boolean;
  result: Record<string, unknown> | undefined;
}

const state: State = { json: false, result: undefined };

/** Whether this run prints JSON. */
export function jsonMode(): boolean {
  return state.json;
}

/**
 * The result of the command: kept for the JSON object in `--json` mode,
 * otherwise `text` is printed (a line, or several).
 */
export function report(data: Record<string, unknown>, text?: string | string[]): void {
  if (state.json) {
    if (state.result) throw new Error('A command reported its result twice.');
    state.result = data;
    return;
  }
  if (text === undefined) return;
  for (const line of Array.isArray(text) ? text : [text]) console.log(line);
}

/** Text output only (progress lines); in `--json` mode it goes to stderr. */
export function say(text: string): void {
  console.log(text);
}

/** PostgreSQL and network errors that mean "the database cannot be reached". */
const UNREACHABLE = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  '28P01', // invalid password
  '28000', // invalid authorization
  '3D000', // database does not exist
  '57P03', // cannot connect now
]);

/** The `{"error":…}` object for any error thrown by a command. */
export function errorBody(error: unknown): JsonError {
  if (error instanceof OperationError) {
    return { error: { code: error.code, message: error.message } };
  }
  if (error instanceof CommanderError) {
    return { error: { code: 'usage', message: error.message.replace(/^error: /, '') } };
  }
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  if (typeof code === 'string' && UNREACHABLE.has(code)) {
    return { error: { code: 'db_unreachable', message } };
  }
  return { error: { code: 'internal', message } };
}

export interface RunIo {
  /** Where the JSON object goes (default: stdout). */
  stdout?: (text: string) => void;
}

/**
 * Runs `fn` in JSON or text mode. In JSON mode `console.log`/`info`/`debug`
 * write to stderr while it runs, and the single object is printed at the end.
 * Returns the exit code.
 */
export async function runCommand(
  json: boolean,
  fn: () => Promise<void>,
  io: RunIo = {},
): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  state.json = json;
  state.result = undefined;
  const saved = { log: console.log, info: console.info, debug: console.debug };
  if (json) {
    const toStderr = (...args: unknown[]) => console.error(...args);
    console.log = toStderr;
    console.info = toStderr;
    console.debug = toStderr;
  }
  try {
    await fn();
    if (json) stdout(`${JSON.stringify(state.result ?? { ok: true })}\n`);
    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    if (json) {
      stdout(`${JSON.stringify(errorBody(error))}\n`);
    } else if (error instanceof OperationError) {
      console.error(`Error: ${error.message}`);
    } else if (!(error instanceof CommanderError)) {
      console.error(error);
    }
    return error instanceof CommanderError ? error.exitCode || 1 : 1;
  } finally {
    Object.assign(console, saved);
    state.json = false;
    state.result = undefined;
  }
}
