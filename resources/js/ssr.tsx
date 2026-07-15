import "../css/app.css";
import React from "react";
import { createInertiaApp } from "@inertiajs/react";
import createServer from "@inertiajs/react/server";
import { renderToString } from "react-dom/server";
import { resolvePageComponent } from "laravel-vite-plugin/inertia-helpers";
import { route as ziggyRoute } from "ziggy-js";

const appName = import.meta.env.VITE_APP_NAME || "UBSC";

createServer((page) => {
    const ziggy = page.props.ziggy as Parameters<typeof ziggyRoute>[3];
    globalThis.route = ((
        name?: string,
        params?: Parameters<typeof ziggyRoute>[1],
        absolute?: boolean,
    ) => ziggyRoute(name as string, params, absolute, ziggy)) as typeof ziggyRoute;

    return createInertiaApp({
        page,
        render: renderToString,
        title: (title) => title.includes(appName) ? title : `${title} - ${appName}`,
        resolve: (name) =>
            resolvePageComponent(
                `./Pages/${name}.tsx`,
                import.meta.glob("./Pages/**/*.tsx"),
            ),
        setup: ({ App, props }) => (
            <React.StrictMode>
                <App {...props} />
            </React.StrictMode>
        ),
    });
});
