/** A person's profile picture, or their initials on a color derived from the name. */
export function Avatar({
  name,
  url,
  size = 32,
}: {
  name: string;
  url: string | null | undefined;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={style}
        className="inline-block shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: size * 0.4, backgroundColor: `hsl(${hue(name)} 45% 40%)` }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none"
    >
      {initials(name)}
    </span>
  );
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words.at(-1)!] : words;
  return letters.map((word) => [...word][0]!.toUpperCase()).join('') || '?';
}

function hue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 360;
  return hash;
}
