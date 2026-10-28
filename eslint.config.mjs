import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.cache/**'] },
  ...tseslint.configs.recommended,
  { files: ['packages/core/src/domain/**/*.ts', 'packages/core/src/application/**/*.ts'], rules: {
    'no-restricted-imports': ['error', { patterns: [
      { regex: '^(?!zod$|\\.{1,2}/)', message: 'Only zod and internal modules are permitted.' },
      { group: ['**/adapters/**'], message: 'Depend on application ports.' }
    ] }]
  } },
  { files: ['packages/core/src/domain/**/*.ts'], rules: {
    'no-restricted-imports': ['error', { patterns: [
      { regex: '^(?!zod$|\\.{1,2}/)', message: 'Only zod and internal modules are permitted.' },
      { group: ['**/application/**', '**/adapters/**'], message: 'Domain must remain independent.' }
    ] }]
  } }
);
