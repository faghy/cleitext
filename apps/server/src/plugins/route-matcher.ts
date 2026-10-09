/** Path patterns of plugin routes: literal segments, `:param` and a final `*`. */
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
          params[segment.slice(1)] = value;
        } else if (segment !== part) {
          return null;
        }
      }
      return parts.length === segments.length ? params : null;
    },
  };
}
