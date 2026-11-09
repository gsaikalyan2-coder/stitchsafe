import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    ignores: ['node_modules/**', '.next/**', 'src/generated/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
]
