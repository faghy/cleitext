/** Text files bundled as strings (esbuild's text loader). */
declare module '*.txt' {
  const text: string;
  export default text;
}
