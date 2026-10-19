import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores(['out', 'dist', 'node_modules']),
    {
        files: ['**/*.{ts,mts,mjs}'],
        extends: [js.configs.recommended, tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 2023,
            globals: globals.node,
        },
    },
    {
        files: ['src/pages/**/*.ts'],
        languageOptions: {
            globals: globals.browser,
        },
    },
]);
