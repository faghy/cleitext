/**
 * Path patterns of plugin routes: literal segments, `:param`, `:param.ext`
 * (a segment ending in `.ext`, e.g. `/:key.txt`; plugin API 1.69) and a final `*`.
 */
export interface CompiledRoute {
  pattern: string;
  match(path: string): Record<string, string> | null;
}

export function compileRoute(pattern: string): CompiledRoute {
  const segments = pattern.split('/').filter(Boolean);
  return {
    pattern,
    match(path) {
      const parts = path.split('/').filter(Boolean);
      const params: Record<string, string> = {};
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]!;
        if (segment === '*' && i === segments.length - 1) {
          params['*'] = parts.slice(i).join('/');
          return params;
        }
        const part = parts[i];
        if (part === undefined) return null;
        if (segment.startsWith(':')) {
          let value: string;
          try {
            value = decodeURIComponent(part);
          } catch {
            return null;
          }
          // `:name.ext`: only a value with that ending, given without it.
          const dot = segment.indexOf('.');
          if (dot > 1) {
            const suffix = segment.slice(dot);
            if (value.length <= suffix.length || !value.endsWith(suffix)) return null;
            params[segment.slice(1, dot)] = value.slice(0, -suffix.length);
          } else {
            params[segment.slice(1)] = value;
          }
        } else if (segment !== part) {
          return null;
        }
      }
      return parts.length === segments.length ? params : null;
    },
  };
}
