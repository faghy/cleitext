/**
 * Sidebar icons: outline drawings on a 24×24 grid, one stroke weight, round
 * ends. Each is SVG path data, the same format plugins give in `icon` on
 * their admin pages (admin SDK), so core and plugin entries look alike.
 */
export const MENU_ICONS = {
  /** A speech bubble. */
  comments: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
  /** A gauge. */
  dashboard:
    'M3.5 16a8.5 8.5 0 0 1 17 0 M12 16l4-4.5 M10.5 16a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M6.6 10.6l.9.9 M12 7.5v1.3 M17.4 10.6l-.9.9',
  /** Two arrows in a circle. */
  updates: 'M20 12a8 8 0 0 1-14 5.3 M4 12a8 8 0 0 1 14-5.3 M18.5 3v4h-4 M5.5 21v-4h4',
  /** A pencil over a line. */
  posts: 'M4 21h7 M15 4.5l4.5 4.5L9.5 19H5v-4.5z M13 6.5l4.5 4.5',
  /** A photo with a mountain and the sun. */
  media:
    'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M4 16l5-5 5 5 2-2 4 4 M14 9a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  /** Two sheets, one with a folded corner. */
  pages:
    'M9 3h6l4 4v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M15 3v4h4 M5 7v13a1 1 0 0 0 1 1h9',
  /** A painter's palette. */
  appearance:
    'M12 3a9 9 0 0 0 0 18c1.2 0 1.9-1 1.5-2-.5-1.3.4-2.3 1.7-2.3H17a4 4 0 0 0 4-4C21 7.3 17 3 12 3z M7 11.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M10.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M15 9a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  /** A plug with two pins. */
  plugins: 'M9 3v4.5 M15 3v4.5 M6 7.5h12V11a6 6 0 0 1-12 0z M12 17v4',
  /** Two people. */
  users:
    'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7z M2.5 20.5a6.5 6.5 0 0 1 13 0 M16 4.2a3.5 3.5 0 0 1 0 6.6 M18 14.3a6.5 6.5 0 0 1 3.5 6.2',
  /** A person in a circle. */
  profile:
    'M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18z M12 12.5a3 3 0 1 0 0-6a3 3 0 1 0 0 6z M6.3 18.3a6.5 6.5 0 0 1 11.4 0',
  /** Two sparkles. */
  assistants:
    'M11 3l1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  /** A cog. */
  settings:
    'M12 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6z M12 18.5a6.5 6.5 0 1 0 0-13a6.5 6.5 0 1 0 0 13z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1',
  /** A wrench. */
  tools:
    'M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.5-.5-.5-2.5z',
  /** A path that turns towards an arrow. */
  redirects: 'M4 20v-6a6 6 0 0 1 6-6h10 M16 4l4 4-4 4',
  /** A tree of boxes. */
  structure: 'M9.5 3h5v4.5h-5z M3 16.5h5V21H3z M16 16.5h5V21h-5z M12 7.5V12 M5.5 16.5V12h13v4.5',
  /** A pulse. */
  activity: 'M3 12h4l3-7 4 14 3-7h4',
  /** Two stacked servers. */
  system:
    'M5 4h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M5 14h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z M8 7h.01 M8 17h.01',
  /** A globe. */
  sites:
    'M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18z M3 12h18 M12 3c2.4 2.5 3.7 5.5 3.7 9s-1.3 6.5-3.7 9c-2.4-2.5-3.7-5.5-3.7-9S9.6 5.5 12 3z',
  /** Stacked layers: content types added by plugins or in Content structure. */
  content: 'M12 3l9 4.5-9 4.5-9-4.5z M3 12l9 4.5 9-4.5 M3 16.5L12 21l9-4.5',
  /** A puzzle piece: plugin pages without an icon of their own. */
  plugin:
    'M10 5a2 2 0 1 1 4 0v1h4a1 1 0 0 1 1 1v4h-1a2 2 0 1 0 0 4h1v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-4h1a2 2 0 1 0 0-4H5V7a1 1 0 0 1 1-1h4z',
} as const;

export type MenuIconName = keyof typeof MENU_ICONS;

/** Path data only (commands, numbers, separators), and not too long. */
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,eE+-]{1,2000}$/;

/** A plugin's icon when it is valid path data, the default one otherwise. */
export function pluginIcon(icon: unknown): string {
  return typeof icon === 'string' && PATH_DATA.test(icon) ? icon : MENU_ICONS.plugin;
}

export function MenuIcon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d={path} />
    </svg>
  );
}
