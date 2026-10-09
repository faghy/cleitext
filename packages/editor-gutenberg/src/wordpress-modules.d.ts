/** Individual block modules of @wordpress/block-library (no published types). */
declare module '@wordpress/block-library/build-module/*' {
  export const name: string;
  export const metadata: Record<string, unknown>;
  export const settings: Record<string, unknown>;
  export function init(): unknown;
}

/** @wordpress/block-editor ships no type declarations. */
declare module '@wordpress/block-editor';

declare module '*.css';
