/** A fake service for the adapters: answers by method and path, and keeps what it got. */
import type { Http, HttpRequest } from '../src/providers/types';

export type Route = (request: HttpRequest & { json: Record<string, unknown> }) => {
  status: number;
  body?: unknown;
};

export function fakeHttp(routes: Record<string, Route>) {
  const calls: (HttpRequest & { json: Record<string, unknown> })[] = [];
  const http: Http = async (request) => {
    const url = new URL(request.url);
    const json = request.body ? (JSON.parse(request.body) as Record<string, unknown>) : {};
    const call = { ...request, json };
    calls.push(call);
    const path = `${request.method} ${url.host}${url.pathname}`;
    const route =
      routes[path] ??
      Object.entries(routes).find(([pattern]) =>
        new RegExp(`^${pattern.replace(/\*/g, '[^/]+')}$`).test(path),
      )?.[1];
    if (!route) return { status: 404, text: JSON.stringify({ message: `No route ${path}` }) };
    const res = route(call);
    return {
      status: res.status,
      text: res.body === undefined ? '' : JSON.stringify(res.body),
    };
  };
  return { http, calls };
}

export const unauthorized: Route = () => ({ status: 401, body: { message: 'Key not found' } });
