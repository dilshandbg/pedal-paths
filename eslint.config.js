import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Directories that must stay framework-free so they can be unit tested in isolation
 * (see docs/architecture.md → "Dependency rules").
 */
const PURE_LOGIC_FILES = [
  'src/types/**/*.ts',
  'src/utils/**/*.ts',
  'src/services/gpx/**/*.ts',
  'src/services/fit/**/*.ts',
  'src/services/strava-export/**/*.ts',
  'src/features/*/services/**/*.ts',
  'src/features/*/utils/**/*.ts',
  'src/features/*/types/**/*.ts',
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'playwright-report',
      'test-results',
      'blob-report',
      'tests/perf/dist',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: PURE_LOGIC_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'Business logic must not depend on React.' },
            { name: 'react-dom', message: 'Business logic must not depend on React.' },
          ],
          patterns: [
            {
              group: ['react/*', 'react-dom/*', '@deck.gl/*', 'maplibre-gl', 'maplibre-gl/*'],
              message:
                'Business logic must stay independent of UI and map rendering libraries. Move rendering code to a components/ folder or src/services/map.',
            },
            {
              group: ['**/components/*', '**/components'],
              message: 'Business logic must not import UI components.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'tests/e2e/**/*.ts', 'server/**/*.ts', 'tests/server/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
);
