import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

export default defineConfig({
    main: {
        define: {
            __VORA_CHANNEL__: JSON.stringify(process.env.VORA_CHANNEL === 'qa' ? 'qa' : 'prod'),
        },
        build: {
            rollupOptions: {
                input: { index: resolve('src/main/index.ts') },
            },
        },
    },
    preload: {
        build: {
            rollupOptions: {
                input: { index: resolve('src/preload/index.ts') },
            },
        },
    },
    renderer: {
        root: resolve('src/pages'),
        server: { port: 5180, strictPort: true },
        build: {
            rollupOptions: {
                input: {
                    connect: resolve('src/pages/connect.html'),
                    error: resolve('src/pages/error.html'),
                },
            },
        },
    },
});
