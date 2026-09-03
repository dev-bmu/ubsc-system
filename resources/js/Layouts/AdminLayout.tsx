import axios from "axios";
import { PropsWithChildren, ReactNode, useEffect, useRef, useState } from "react";
import Sidebar from "@/Components/Admin/Sidebar";
import Topbar from "@/Components/Admin/Topbar";

interface AdminLayoutProps {
    header?: ReactNode;
}

type AdminPresenceState = "online" | "idle";

const PRESENCE_ENDPOINT = "/ubsc-staff/presence/heartbeat";
const PRESENCE_HEARTBEAT_MS = 30_000;
const PRESENCE_IDLE_MS = 5 * 60_000;
const PRESENCE_INTERACTION_SAMPLE_MS = 5_000;
const PRESENCE_SEQUENCE_MAX = 2_147_483_647;

// This identity deliberately lives only for the current JavaScript document.
// Unlike sessionStorage, it cannot be copied when a browser tab is duplicated.
let presenceTabId: string | null = null;
let presenceSequence = 0;

const createPresenceTabId = (): string | null => {
    const browserCrypto = typeof globalThis.crypto === "undefined"
        ? null
        : globalThis.crypto;

    if (!browserCrypto) return null;

    if (typeof browserCrypto.randomUUID === "function") {
        return browserCrypto.randomUUID();
    }

    const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

    return [
        hex.slice(0, 4).join(""),
        hex.slice(4, 6).join(""),
        hex.slice(6, 8).join(""),
        hex.slice(8, 10).join(""),
        hex.slice(10, 16).join(""),
    ].join("-");
};

const nextPresenceEnvelope = (): { tab_id: string; sequence: number } | null => {
    if (!presenceTabId || presenceSequence >= PRESENCE_SEQUENCE_MAX) {
        presenceTabId = createPresenceTabId();
        presenceSequence = 0;
    }

    if (!presenceTabId) return null;

    presenceSequence += 1;

    return {
        tab_id: presenceTabId,
        sequence: presenceSequence,
    };
};

export default function AdminLayout({
    header,
    children,
}: PropsWithChildren<AdminLayoutProps>) {
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const lastInteractionAt = useRef(Date.now());
    const lastSampledInteractionAt = useRef(0);
    const lastSentState = useRef<AdminPresenceState | null>(null);
    const lastSentAt = useRef(0);
    const heartbeatInFlight = useRef(false);
    const heartbeatQueued = useRef(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMobileSidebarOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
        let disposed = false;

        const presenceState = (now = Date.now()): AdminPresenceState => (
            document.hasFocus() && now - lastInteractionAt.current < PRESENCE_IDLE_MS
                ? "online"
                : "idle"
        );

        const sendHeartbeat = async (force = false) => {
            if (disposed || document.visibilityState !== "visible") return;

            if (heartbeatInFlight.current) {
                heartbeatQueued.current = heartbeatQueued.current || force;
                return;
            }

            const now = Date.now();
            const state = presenceState(now);
            const stateChanged = lastSentState.current !== state;

            if (!force && !stateChanged && now - lastSentAt.current < PRESENCE_HEARTBEAT_MS - 1_000) return;

            const envelope = nextPresenceEnvelope();

            if (!envelope) return;

            heartbeatInFlight.current = true;

            try {
                await axios.post(
                    PRESENCE_ENDPOINT,
                    { state, ...envelope },
                    {
                        headers: {
                            "X-UBSC-Background-Poll": "1",
                            "X-Requested-With": "XMLHttpRequest",
                        },
                        timeout: 8_000,
                    },
                );

                if (!disposed) {
                    lastSentState.current = state;
                    lastSentAt.current = Date.now();
                }
            } catch {
                // Presence is intentionally best-effort. Authentication and
                // page access must never depend on this decorative signal.
            } finally {
                heartbeatInFlight.current = false;

                if (!disposed && heartbeatQueued.current) {
                    heartbeatQueued.current = false;
                    void sendHeartbeat(true);
                }
            }
        };

        const registerInteraction = () => {
            if (document.visibilityState !== "visible" || !document.hasFocus()) return;

            const now = Date.now();
            const wasIdle = now - lastInteractionAt.current >= PRESENCE_IDLE_MS
                || lastSentState.current === "idle";

            if (!wasIdle && now - lastSampledInteractionAt.current < PRESENCE_INTERACTION_SAMPLE_MS) return;

            lastSampledInteractionAt.current = now;
            lastInteractionAt.current = now;

            if (wasIdle) void sendHeartbeat(true);
        };

        const onFocus = () => {
            lastInteractionAt.current = Date.now();
            lastSampledInteractionAt.current = lastInteractionAt.current;
            void sendHeartbeat(true);
        };

        const onBlur = () => {
            window.setTimeout(() => {
                if (!disposed && document.visibilityState === "visible") void sendHeartbeat(true);
            }, 0);
        };

        const onVisibilityChange = () => {
            if (document.visibilityState !== "visible") return;

            if (document.hasFocus()) {
                lastInteractionAt.current = Date.now();
                lastSampledInteractionAt.current = lastInteractionAt.current;
            }

            void sendHeartbeat(true);
        };

        const interactionEvents: Array<keyof WindowEventMap> = [
            "pointerdown",
            "pointermove",
            "keydown",
            "touchstart",
            "wheel",
        ];

        interactionEvents.forEach((eventName) => {
            window.addEventListener(eventName, registerInteraction, { passive: true });
        });
        window.addEventListener("focus", onFocus);
        window.addEventListener("blur", onBlur);
        document.addEventListener("visibilitychange", onVisibilityChange);

        void sendHeartbeat(true);
        const interval = window.setInterval(() => void sendHeartbeat(), PRESENCE_HEARTBEAT_MS);

        return () => {
            disposed = true;
            window.clearInterval(interval);
            interactionEvents.forEach((eventName) => {
                window.removeEventListener(eventName, registerInteraction);
            });
            window.removeEventListener("focus", onFocus);
            window.removeEventListener("blur", onBlur);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, []);

    return (
        <div className="relative flex h-[100dvh] w-full max-w-[100vw] overflow-hidden bg-[#F8F9FA] font-bdo text-gray-900">
            <Sidebar
                mobileOpen={mobileSidebarOpen}
                onClose={() => setMobileSidebarOpen(false)}
            />

            <div
                className="relative z-10 flex h-full w-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
                data-lenis-prevent="true"
            >
                <Topbar
                    onMobileMenuClick={() => setMobileSidebarOpen(true)}
                />

                {header && (
                    <div className="px-4 pt-2 xl:px-8">{header}</div>
                )}

                <main className="max-w-full flex-1 px-4 pb-10 pt-2 xl:px-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
