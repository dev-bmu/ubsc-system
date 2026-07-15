import '../css/app.css';
import './bootstrap';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot, hydrateRoot } from 'react-dom/client';

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
        let rafId = 0;
        let active = true;

        function raf(time: number) {
            if (!active) return;
            lenis.raf(time);
            rafId = requestAnimationFrame(raf);
        }

        rafId = requestAnimationFrame(raf);

        return () => {
            active = false;
            cancelAnimationFrame(rafId);
            lenis.destroy();
        };
    }, []);

    return <>{children}</>;
}

createInertiaApp({
    title: (title) => title.includes(appName) ? title : `${title} - ${appName}`,

    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.tsx`,
            import.meta.glob('./Pages/**/*.tsx'),
        ),

    setup({ el, App, props }) {
        const tree = (
            <React.StrictMode>
                <LenisProvider>
                    <App {...props} />
                </LenisProvider>
            </React.StrictMode>
        );

        if (el.hasChildNodes()) {
            hydrateRoot(el, tree);
        } else {
            createRoot(el).render(tree);
        }
    },

    progress: {
        color: '#4B5563',
    },
});
