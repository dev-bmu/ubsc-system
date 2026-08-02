import { router } from "@inertiajs/react";
import {
    createContext,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import AuthModal from "@/Components/Landing/AuthModal";

export type AuthFlowView = "login" | "register" | "forgot" | "reset";

export type AuthFlowErrors = Record<string, string>;

export interface OpenAuthOptions {
    view?: AuthFlowView;
    returnTo?: string;
    stacked?: boolean;
    notice?: string;
    resetToken?: string;
    resetEmail?: string;
    onClose?: () => void;
}

interface AuthFlowContextValue {
    isOpen: boolean;
    openAuth: (options?: OpenAuthOptions) => void;
    closeAuth: () => void;
}

interface AuthFlowProviderProps {
    children: ReactNode;
    initialAuthenticated?: boolean;
    initialErrors?: unknown;
}

interface AuthFlowState {
    open: boolean;
    initialView: AuthFlowView;
    returnTo: string;
    stacked: boolean;
    notice?: string;
    resetToken?: string;
    resetEmail?: string;
    externalErrors?: AuthFlowErrors;
    source: "programmatic" | "url";
}

interface ParsedAuthLocation {
    view: AuthFlowView;
    returnTo: string;
    hasExplicitReturnTo: boolean;
    notice?: string;
    resetToken?: string;
    resetEmail?: string;
}

const AuthFlowContext = createContext<AuthFlowContextValue | null>(null);

const AUTH_VIEWS = new Set<AuthFlowView>([
    "login",
    "register",
    "forgot",
    "reset",
]);

const AUTH_QUERY_KEYS = [
    "auth",
    "return_to",
    "password_reset",
    // Compatibility with short-lived links created before password_reset=1.
    "reset_success",
] as const;

const RESET_HASH_KEYS = [
    "token",
    "email",
    "reset_token",
    "reset_email",
] as const;

const RESET_SUCCESS_NOTICE =
    "Password berhasil diperbarui. Silakan masuk menggunakan password baru Anda.";
const MODAL_EXIT_DURATION_MS = 180;

const CLOSED_STATE: AuthFlowState = {
    open: false,
    initialView: "login",
    returnTo: "/",
    stacked: false,
    source: "programmatic",
};

function isAuthView(value: string | null): value is AuthFlowView {
    return value !== null && AUTH_VIEWS.has(value as AuthFlowView);
}

function normalizeErrors(value: unknown): AuthFlowErrors | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }

    const errors = Object.entries(value).reduce<AuthFlowErrors>(
        (normalized, [key, message]) => {
            if (typeof message === "string" && message.trim() !== "") {
                normalized[key] = message;
            } else if (Array.isArray(message)) {
                const firstMessage = message.find(
                    (item): item is string =>
                        typeof item === "string" && item.trim() !== "",
                );
                if (firstMessage) normalized[key] = firstMessage;
            }

            return normalized;
        },
        {},
    );

    return Object.keys(errors).length > 0 ? errors : undefined;
}

function hashParameterSource(hash: string): {
    prefix: string;
    parameters: URLSearchParams | null;
} {
    const fragment = hash.replace(/^#/, "");
    if (fragment === "") return { prefix: "", parameters: null };

    const queryIndex = fragment.indexOf("?");
    const prefix = queryIndex >= 0 ? fragment.slice(0, queryIndex) : "";
    const source =
        queryIndex >= 0 ? fragment.slice(queryIndex + 1) : fragment;

    return source.includes("=")
        ? { prefix, parameters: new URLSearchParams(source) }
        : { prefix: fragment, parameters: null };
}

function resetCredentialsFromHash(hash: string): {
    token?: string;
    email?: string;
} {
    const { parameters } = hashParameterSource(hash);
    if (!parameters) return {};

    const token =
        parameters.get("token") ?? parameters.get("reset_token") ?? undefined;
    const email =
        parameters.get("email") ?? parameters.get("reset_email") ?? undefined;

    return {
        token: token?.trim() || undefined,
        email: email?.trim() || undefined,
    };
}

function removeResetCredentialsFromHash(url: URL): void {
    const { prefix, parameters } = hashParameterSource(url.hash);
    if (!parameters) return;

    RESET_HASH_KEYS.forEach((key) => parameters.delete(key));
    const remaining = parameters.toString();

    if (prefix && remaining) {
        url.hash = `${prefix}?${remaining}`;
    } else if (prefix) {
        url.hash = prefix;
    } else {
        url.hash = remaining;
    }
}

function stripAuthControls(url: URL, removeResetHash = false): URL {
    const cleaned = new URL(url.toString());
    AUTH_QUERY_KEYS.forEach((key) => cleaned.searchParams.delete(key));

    if (removeResetHash) removeResetCredentialsFromHash(cleaned);

    return cleaned;
}

function relativeLocation(url: URL): string {
    return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Authentication redirects may only target an explicit same-origin path.
 * Absolute and protocol-relative values are rejected even when they happen to
 * name the current host, keeping the browser and PHP validators equivalent.
 */
function safeRelativeReturnTo(
    value: unknown,
    baseUrl: URL,
): string | undefined {
    if (typeof value !== "string") return undefined;

    const candidate = value.trim();
    if (
        candidate === "" ||
        candidate.length > 2048 ||
        !candidate.startsWith("/") ||
        candidate.startsWith("//") ||
        /[\u0000-\u001f\u007f\\]/u.test(candidate) ||
        /%(?:0a|0d|5c)/i.test(candidate) ||
        /^\/%2f/i.test(candidate)
    ) {
        return undefined;
    }

    try {
        const target = new URL(candidate, baseUrl.origin);
        if (
            target.origin !== baseUrl.origin ||
            target.username !== "" ||
            target.password !== ""
        ) {
            return undefined;
        }

        return relativeLocation(
            stripAuthControls(
                target,
                target.searchParams.get("auth") === "reset",
            ),
        );
    } catch {
        return undefined;
    }
}

function resetWasSuccessful(url: URL): boolean {
    const passwordReset = url.searchParams.get("password_reset");
    const compatibilityReset = url.searchParams.get("reset_success");

    return (
        passwordReset === "1" ||
        passwordReset === "success" ||
        compatibilityReset === "1" ||
        compatibilityReset === "success"
    );
}

function parseAuthLocation(value: string | URL): ParsedAuthLocation | null {
    if (typeof window === "undefined") return null;

    const url =
        value instanceof URL
            ? new URL(value.toString())
            : new URL(value, window.location.origin);
    const requestedView = url.searchParams.get("auth");
    const resetSuccess = resetWasSuccessful(url);
    const view = isAuthView(requestedView)
        ? requestedView
        : resetSuccess
          ? "login"
          : null;

    if (!view) return null;

    const resetCredentials =
        view === "reset" ? resetCredentialsFromHash(url.hash) : {};
    const cleanLocation = relativeLocation(
        stripAuthControls(url, view === "reset"),
    );
    const explicitReturnTo = safeRelativeReturnTo(
        url.searchParams.get("return_to"),
        url,
    );

    return {
        view,
        returnTo: explicitReturnTo ?? cleanLocation,
        hasExplicitReturnTo: explicitReturnTo !== undefined,
        notice: resetSuccess ? RESET_SUCCESS_NOTICE : undefined,
        resetToken: resetCredentials.token,
        resetEmail: resetCredentials.email,
    };
}

function cleanBrowserAuthLocation(value: string | URL): void {
    if (typeof window === "undefined") return;

    const url =
        value instanceof URL
            ? new URL(value.toString())
            : new URL(value, window.location.origin);
    const removeResetHash = url.searchParams.get("auth") === "reset";
    const cleaned = stripAuthControls(url, removeResetHash);
    const nextLocation = relativeLocation(cleaned);
    const currentLocation = relativeLocation(
        new URL(window.location.href),
    );

    if (nextLocation !== currentLocation) {
        /*
         * Keep Inertia's in-memory page URL and encrypted/serialized history
         * entry in sync with the visible address. A native replaceState would
         * clean the address bar while leaving reset credentials recoverable
         * from Inertia's history payload.
         */
        router.replace({
            url: nextLocation,
            flash: (currentFlash) => currentFlash,
            preserveScroll: true,
            preserveState: true,
        });
    }
}

function pageHasAuthenticatedUser(props: unknown): boolean {
    if (!props || typeof props !== "object") return false;

    const auth = (props as { auth?: unknown }).auth;
    if (!auth || typeof auth !== "object") return false;

    return (auth as { user?: unknown }).user != null;
}

export function AuthFlowProvider({
    children,
    initialAuthenticated = false,
    initialErrors,
}: AuthFlowProviderProps) {
    const initialLocationRef = useRef(
        typeof window === "undefined" ? null : new URL(window.location.href),
    );
    const initialAuthLocationRef = useRef(
        initialLocationRef.current
            ? parseAuthLocation(initialLocationRef.current)
            : null,
    );
    const closeCallbackRef = useRef<(() => void) | undefined>(undefined);

    /*
     * The server cannot see the browser fragment that carries reset
     * credentials. Start from identical closed markup on SSR and the browser,
     * then open synchronously in a layout effect before the first paint. This
     * avoids a hydration mismatch without introducing a visible modal delay.
     */
    const [flow, setFlow] = useState<AuthFlowState>(CLOSED_STATE);
    const [presentedFlow, setPresentedFlow] = useState<AuthFlowState>(flow);
    const [modalPresent, setModalPresent] = useState(flow.open);
    const modalRemovalTimerRef = useRef<number | null>(null);

    const closeAuth = useCallback(() => {
        const callback = closeCallbackRef.current;
        closeCallbackRef.current = undefined;
        setFlow(CLOSED_STATE);
        callback?.();
    }, []);

    const openAuth = useCallback((options: OpenAuthOptions = {}) => {
        if (typeof window === "undefined") return;

        const currentUrl = new URL(window.location.href);
        const cleanCurrentLocation = relativeLocation(
            stripAuthControls(
                currentUrl,
                currentUrl.searchParams.get("auth") === "reset",
            ),
        );

        closeCallbackRef.current = options.onClose;
        setFlow({
            open: true,
            initialView: options.view ?? "login",
            returnTo:
                safeRelativeReturnTo(options.returnTo, currentUrl) ??
                cleanCurrentLocation,
            stacked: options.stacked ?? false,
            notice: options.notice,
            resetToken: options.resetToken,
            resetEmail: options.resetEmail,
            externalErrors: undefined,
            source: "programmatic",
        });
    }, []);

    useLayoutEffect(() => {
        const parsed = initialAuthLocationRef.current;
        if (parsed && !initialAuthenticated) {
            setFlow({
                open: true,
                initialView: parsed.view,
                returnTo: parsed.returnTo,
                stacked: false,
                notice: parsed.notice,
                resetToken: parsed.resetToken,
                resetEmail: parsed.resetEmail,
                externalErrors: normalizeErrors(initialErrors),
                source: "url",
            });
        }

        if (initialLocationRef.current) {
            cleanBrowserAuthLocation(initialLocationRef.current);
        }

        initialLocationRef.current = null;
        initialAuthLocationRef.current = null;
    }, []);

    useLayoutEffect(() => {
        const stopNavigateListener = router.on("navigate", (event) => {
            const page = event.detail.page;

            if (pageHasAuthenticatedUser(page.props)) {
                closeAuth();
                return;
            }

            const navigatedUrl = new URL(page.url, window.location.origin);
            const parsed = parseAuthLocation(navigatedUrl);

            if (parsed) {
                setFlow((current) => ({
                    open: true,
                    initialView: parsed.view,
                    returnTo:
                        current.open &&
                        !parsed.hasExplicitReturnTo
                            ? current.returnTo
                            : parsed.returnTo,
                    stacked:
                        current.open && current.source === "programmatic"
                            ? current.stacked
                            : false,
                    notice: parsed.notice,
                    resetToken: parsed.resetToken,
                    resetEmail: parsed.resetEmail,
                    externalErrors: normalizeErrors(
                        (page.props as { errors?: unknown }).errors,
                    ),
                    /*
                     * A forgot/reset redirect is a view transition inside the
                     * same programmatic flow. Keep its close callback until
                     * the user actually closes the flow or authenticates.
                     */
                    source:
                        current.open && current.source === "programmatic"
                            ? "programmatic"
                            : "url",
                }));
                cleanBrowserAuthLocation(navigatedUrl);
                return;
            }
        });

        /*
         * A same-URL replace visit (used by session reconciliation in another
         * tab) is not guaranteed to produce the same navigation sequence in
         * every browser. The successful page response is an additional,
         * server-authoritative point at which the modal can be closed.
         */
        const stopSuccessListener = router.on("success", (event) => {
            if (pageHasAuthenticatedUser(event.detail.page.props)) {
                closeAuth();
            }
        });

        return () => {
            stopNavigateListener();
            stopSuccessListener();
        };
    }, [closeAuth]);

    useLayoutEffect(() => {
        if (modalRemovalTimerRef.current !== null) {
            window.clearTimeout(modalRemovalTimerRef.current);
            modalRemovalTimerRef.current = null;
        }

        if (flow.open) {
            setPresentedFlow(flow);
            setModalPresent(true);
            return;
        }

        if (!modalPresent) return;

        modalRemovalTimerRef.current = window.setTimeout(() => {
            setModalPresent(false);
            setPresentedFlow(CLOSED_STATE);
            modalRemovalTimerRef.current = null;
        }, MODAL_EXIT_DURATION_MS);
    }, [flow, modalPresent]);

    useLayoutEffect(
        () => () => {
            if (modalRemovalTimerRef.current !== null) {
                window.clearTimeout(modalRemovalTimerRef.current);
            }
        },
        [],
    );

    const contextValue = useMemo<AuthFlowContextValue>(
        () => ({ isOpen: flow.open, openAuth, closeAuth }),
        [closeAuth, flow.open, openAuth],
    );

    return (
        <AuthFlowContext.Provider value={contextValue}>
            {children}
            {modalPresent && (
                <AuthModal
                    open={flow.open}
                    initialView={presentedFlow.initialView}
                    returnTo={presentedFlow.returnTo}
                    resetToken={presentedFlow.resetToken}
                    resetEmail={presentedFlow.resetEmail}
                    notice={presentedFlow.notice}
                    externalErrors={presentedFlow.externalErrors}
                    stacked={presentedFlow.stacked}
                    onClose={closeAuth}
                />
            )}
        </AuthFlowContext.Provider>
    );
}

export function useAuthFlow(): AuthFlowContextValue {
    const context = useContext(AuthFlowContext);

    if (!context) {
        throw new Error("useAuthFlow must be used within AuthFlowProvider.");
    }

    return context;
}
