import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // К базе обращается только слой доступа к данным (src/data/)
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@supabase/*'], message: 'Supabase используется только в src/data/.' },
          { group: ['**/supabaseClient'], message: 'Используйте функции из src/data/api.ts.' },
        ],
      }],
    },
  },
  {
    files: ['src/data/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
)
