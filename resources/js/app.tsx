import '../css/app.css';
import './bootstrap';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';

import { useEffect } from "react";
import Lenis from "@studio-freight/lenis";
import React from "react";

const appName = import.meta.env.VITE_APP_NAME || 'UBSC';

function LenisProvider({ children }: { children: React.ReactNode }) {

    useEffect(() => {
        const lenis = new Lenis({
            duration: 1.7,       // makin besar makin smooth
            lerp: 0.09,          // inertia smoothness
            smoothWheel: true,
            syncTouch: false,
        });

        function raf(time: number) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }

        requestAnimationFrame(raf);

        return () => {
            lenis.destroy();
        };
    }, []);

    return <>{children}</>;
}

createInertiaApp({
    title: (title) => `${title} - ${appName}`,

    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.tsx`,
            import.meta.glob('./Pages/**/*.tsx'),
        ),

    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(
            <React.StrictMode>
                <LenisProvider>
                    <App {...props} />
                </LenisProvider>
            </React.StrictMode>
        );
    },

    progress: {
        color: '#4B5563',
    },
});
