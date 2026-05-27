import tseslint from 'typescript-eslint';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import importPlugin from 'eslint-plugin-import';
import { base as insighttBase } from '@rapid-recovery-agency-inc/eslint-plugin-rra';

const toErrorSeverity = (ruleConfig) => {
  if (ruleConfig === 'warn' || ruleConfig === 'warning' || ruleConfig === 1) {
    return 'error';
  }

  if (Array.isArray(ruleConfig) && ruleConfig.length > 0) {
    const [severity, ...rest] = ruleConfig;
    if (severity === 'warn' || severity === 'warning' || severity === 1) {
      return ['error', ...rest];
    }
  }

  return ruleConfig;
};

const normalizeConfigEntryRules = (entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return entry;
  }

  if (
    !entry.rules ||
    typeof entry.rules !== 'object' ||
    Array.isArray(entry.rules)
  ) {
    return entry;
  }

  return {
    ...entry,
    rules: Object.fromEntries(
      Object.entries(entry.rules).map(([ruleName, ruleConfig]) => [
        ruleName,
        toErrorSeverity(ruleConfig),
      ]),
    ),
  };
};

export const normalizeWarnRulesToError = (configs) => {
  if (!Array.isArray(configs)) {
    return configs;
  }

  return configs.map(normalizeConfigEntryRules);
};

export default normalizeWarnRulesToError([
  insighttBase,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/vite.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.{ts,js}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
      import: importPlugin,
    },
    languageOptions: {
      globals: {
        __DEV__: true,
        Buffer: 'readonly',
        URL: 'readonly',
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-console': 'error',
      'no-duplicate-imports': 'error',
      'no-nested-ternary': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^@?\\w'],
            ['^(@|@foundd|@ui|components|utils|config|vendored-lib)(/.*|$)'],
            ['^\\u0000'],
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
            ['^.+\\.s?css$'],
          ],
        },
      ],
      'import/no-duplicates': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
  },
]);
