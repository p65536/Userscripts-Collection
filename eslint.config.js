import globals from 'globals';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';

export const baseRules = [
    {
        ignores: ['**/node_modules/', '**/dist/', '**/build/', '**/_*/**'],
    },
    {
        files: ['scripts/**/*.user.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'none' }],
            'no-debugger': 'error',
            eqeqeq: 'error',
            'no-var': 'error',
            'prefer-const': 'warn',
        },
    },
    {
        files: ['scripts/**/*.user.js'],
        languageOptions: {
            sourceType: 'script',
            globals: {
                ...globals.browser,
                GM: 'readonly',
            },
        },
    },
    {
        files: ['eslint.config.js'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
    },
];

export const prettierRules = prettierConfig;

export default [...baseRules, prettierRules];
