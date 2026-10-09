import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '.cleitext-dev/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // The editor must stay replaceable (docs/ARCHITECTURE.md §10, RNF-16).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@wordpress/*'],
              message:
                'Gutenberg packages are allowed only in packages/editor-gutenberg and *.gutenberg.tsx files.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/editor-gutenberg/**', '**/*.gutenberg.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['apps/admin/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // NestJS injects constructor parameters by type: type-only imports would
    // erase the runtime metadata it relies on.
    files: ['apps/server/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  prettier,
);
