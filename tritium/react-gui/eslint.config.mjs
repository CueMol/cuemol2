// @ts-check
/**
 * ESLint flat config for @cuemol/react-gui.
 *
 * Two jobs:
 *   1. Catch the bug classes this codebase has repeatedly hit -- floating
 *      promises (an unhandled rejection currently mounts the fatal crash
 *      overlay) and hook misuse.
 *   2. Enforce the process/thread layering documented in
 *      docs/architecture/react-gui-layering.md, so a module cannot import
 *      across a boundary by accident.
 *
 * Severity policy: rules land as `warn` and are promoted to `error` once the
 * existing violations for that rule are cleared. Do not add new warnings; the
 * baseline is tracked in the refactoring plan and `--max-warnings` is tightened
 * as each phase completes.
 *
 * NOTE on flat config: later blocks REPLACE a rule's options rather than
 * merging them. `no-restricted-imports` is therefore configured exactly once
 * per file, by composing pattern lists (see `restrict`) instead of stacking
 * blocks.
 */
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * Patterns every layer inherits.
 *
 * `allowTypeImports` is what makes the layering enforceable today: a service's
 * arg/result DTO may still be referenced from the UI with `import type`, while
 * a runtime import of the same module -- which would pull worker code into the
 * renderer bundle -- is rejected.
 */
/**
 * `hooks/react/` holds hooks that depend on React and nothing else, so they
 * can be read and tested without knowing anything about CueMol. The rule is
 * what makes that name true: a hook that needs the worker, the main process
 * or a feature belongs in `hooks/cuemol/` or with its owner instead.
 */
const REACT_HOOKS_ONLY_REACT = {
  group: [
    '@renderer/*',
    '@shared/*',
    '@shared/**',
    '@main/*',
    '@cuemol/**',
    '../*',
    '../**',
    'electron',
  ],
  message:
    'hooks/react/ must depend on React only. A hook that needs CueMol, IPC or a feature belongs elsewhere.',
}

const NO_TEST_HELPERS = {
  group: ['**/__test__/**', '**/testHarness*'],
  message: 'Test helpers must not be imported from production code.',
}

/**
 * `@/*` belongs to @cuemol/core (it maps onto core's own src/). tsconfig.web
 * declares it so core's sources resolve when they are pulled into our program;
 * react-gui code must never use it.
 */
const NO_CORE_ALIAS = {
  group: ['@/**'],
  message: 'The `@/` prefix is @cuemol/core\'s own alias. Use @renderer/ or @shared/.',
}

/** Relative specifiers that climb three or more levels. */
const NO_DEEP_RELATIVE = {
  group: ['../../../**'],
  message:
    'Use the @renderer/ or @shared/ alias instead of climbing three or more directory levels.',
}

/** Build the single `no-restricted-imports` entry for a layer. */
const restrict = (...patterns) => ({
  '@typescript-eslint/no-restricted-imports': [
    'warn',
    { patterns: [NO_TEST_HELPERS, NO_CORE_ALIAS, ...patterns] },
  ],
})

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'build/**',
      'release/**',
      'node_modules/**',
      'packaging/**',
      'scripts/**',
      '**/*.d.ts',
      'electron.vite.config.ts',
      'vitest.config.ts',
      'eslint.config.mjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // --- Type-aware setup (required by no-floating-promises) ---
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.web.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // A rejected promise with no handler reaches the global
      // `unhandledrejection` listener, which mounts the crash overlay. Every
      // fire-and-forget call must state its failure policy (`.catch` / `void`).
      '@typescript-eslint/no-floating-promises': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // `any` is unavoidable at the generated C++ wrapper boundary and is not
      // what this config is for.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Default for anything not covered by a layer block below.
      ...restrict(),
    },
  },

  // --- Layer: shared/ is the main<->renderer contract and nothing else ---
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: restrict({
      group: ['@renderer/**', '@main/**', '**/renderer/**', '**/main/**', 'electron', 'react', 'react-dom'],
      message: 'shared/ is the main<->renderer contract: it must not depend on either implementation.',
    }),
  },

  // --- Layer: main/ never imports renderer code ---
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    rules: restrict({
      group: ['@renderer/**', '**/renderer/**'],
      message: 'main/ must not import renderer code. Put the shared type in @shared/ instead.',
    }),
  },

  // --- Layer: the Web Worker thread has no UI and no DOM ---
  {
    files: ['src/renderer/worker/server/**/*.ts'],
    rules: restrict(
      {
        group: [
          '@renderer/components/**', '@renderer/hooks/**', '@renderer/contexts/**',
          '@renderer/commands/**', '@renderer/h3-kit/**',
          '**/components/**', '**/hooks/**', '**/contexts/**', '**/h3-kit/**',
        ],
        message: 'worker/server runs in the Web Worker: import DTOs from worker/shared, never from the UI tree.',
      },
      {
        group: ['react', 'react-dom', '@blueprintjs/**', '@renderer/worker/client/**', '**/worker/client/**', '../client/**'],
        message: 'Wrong thread: worker/server may not reach the renderer thread or React.',
      },
    ),
  },

  // --- Layer: worker/shared is loaded by BOTH threads ---
  {
    files: ['src/renderer/worker/shared/**/*.ts'],
    rules: restrict({
      group: [
        '@renderer/worker/server/**', '@renderer/worker/client/**',
        '@renderer/components/**', '@renderer/hooks/**',
        '**/worker/server/**', '**/worker/client/**', '../server/**', '../client/**',
        '@cuemol/core', '@cuemol/core/**', 'react', 'electron',
      ],
      allowTypeImports: true,
      message: 'worker/shared holds wire DTOs and pure functions only; it is loaded by both threads.',
    }),
  },

  // --- Layer: the transport facade stays on the renderer thread ---
  {
    files: ['src/renderer/worker/client/**/*.ts'],
    rules: restrict(
      {
        group: ['@renderer/worker/server/**', '**/worker/server/**', '../server/**'],
        allowTypeImports: true,
        message: 'worker/client may reference worker/server types, never its values.',
      },
      {
        group: ['@renderer/components/**', '@renderer/hooks/**', '@renderer/contexts/**', 'react'],
        message: 'No UI in the transport layer.',
      },
    ),
  },

  // --- Layer: UI code reaches the worker only through the client facade ---
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ignores: ['src/renderer/worker/**'],
    rules: restrict(
      {
        group: ['@renderer/worker/server/**', '**/worker/server/**'],
        allowTypeImports: true,
        message:
          'Import the DTO with `import type`, or go through cm.invokeService(); a value import pulls worker code into the renderer bundle.',
      },
      {
        group: ['@main/**', '**/main/**', 'electron'],
        message: 'The renderer talks to main through window.electronAPI only.',
      },
      NO_DEEP_RELATIVE,
    ),
  },

  // --- Tests may reach anywhere ---
  {
    files: ['src/renderer/hooks/react/**'],
    ignores: ['src/renderer/hooks/react/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [REACT_HOOKS_ONLY_REACT] },
      ],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/**/__test__/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/rules-of-hooks': 'off',
      // `const self = this` in the hand-rolled mock Worker classes, and
      // literal runs of spaces in fixture-matching regexes.
      '@typescript-eslint/no-this-alias': 'off',
      'no-regex-spaces': 'off',
    },
  },
)
