import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    // Keep the development asset origin deterministic. On Windows, Vite can
    // otherwise advertise the IPv6 loopback (`[::1]`) in public/hot even when
    // the Laravel page is opened through localhost/IPv4. Some browsers then
    // fail individual image requests while scripts appear to keep working.
    server: {
        host: '127.0.0.1',
    },
    resolve: {
        alias: {
            'ziggy-js': fileURLToPath(new URL('./vendor/tightenco/ziggy/dist/index.esm.js', import.meta.url)),
        },
    },
    plugins: [
        laravel({
            input: 'resources/js/app.tsx',
            ssr: 'resources/js/ssr.tsx',
            refresh: true,
        }),
        react(),
    ],
});
