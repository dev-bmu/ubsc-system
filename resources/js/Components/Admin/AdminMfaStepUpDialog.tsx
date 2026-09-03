import { Passkeys } from "@laravel/passkeys";
import axios from "axios";
import {
    AlertCircle,
    Check,
    Fingerprint,
    KeyRound,
    LoaderCircle,
    LockKeyhole,
    ShieldCheck,
    ShieldEllipsis,
    Smartphone,
    X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type StepMethod = "passkey" | "totp" | "recovery";

interface SecurityStatus {
    csrf_token?: string;
    mfa?: {
        passkeys?: unknown[];
        totp?: { enabled?: boolean };
        recovery_codes?: { remaining?: number };
    };
    step_up?: {
        methods?: StepMethod[];
    };
}

interface StepResponse {
    csrf_token?: string;
}

interface Props {
    open: boolean;
    actionLabel: string;
    purpose: "manage_staff_accounts";
    onCancel: () => void;
    onVerified: () => void;
}

const ENDPOINTS = {
    status: "/ubsc-staff/account/security",
    passkeyOptions: "/ubsc-staff/account/security/mfa/step-up/passkey/options",
    passkeyVerify: "/ubsc-staff/account/security/mfa/step-up/passkey",
    totpVerify: "/ubsc-staff/account/security/mfa/step-up/totp",
    recoveryVerify: "/ubsc-staff/account/security/mfa/step-up/recovery",
} as const;

const GENERIC_ERROR = "Verifikasi belum berhasil. Periksa faktor keamanan lalu coba lagi.";

function syncCsrfToken(payload?: StepResponse | null) {
    if (!payload?.csrf_token) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
    if (meta) meta.content = payload.csrf_token;
}

function errorMessage(reason: unknown): string {
    if (!axios.isAxiosError(reason)) {
        return reason instanceof Error && reason.message ? reason.message : GENERIC_ERROR;
    }

    const payload = reason.response?.data as {
        message?: string;
        errors?: Record<string, string[] | string>;
    } | undefined;
    const detail = payload?.errors
        ? Object.values(payload.errors).flat().find((value) => typeof value === "string")
        : null;

    return detail || payload?.message || GENERIC_ERROR;
}

function normalizeMethods(status: SecurityStatus, passkeySupported: boolean): StepMethod[] {
    const supported = new Set<StepMethod>();
    const advertised = status.step_up?.methods ?? [];

    advertised.forEach((method) => {
        if (["passkey", "totp", "recovery"].includes(method)) supported.add(method);
    });

    if (supported.size === 0) {
        if ((status.mfa?.passkeys?.length ?? 0) > 0) supported.add("passkey");
        if (status.mfa?.totp?.enabled) supported.add("totp");
        if ((status.mfa?.recovery_codes?.remaining ?? 0) > 0) supported.add("recovery");
    }

    const methods = Array.from(supported);
    const usable = methods.filter((method) => method !== "passkey" || passkeySupported);
    return usable.length > 0 ? usable : methods;
}

export default function AdminMfaStepUpDialog({
    open,
    actionLabel,
    purpose,
    onCancel,
    onVerified,
}: Props) {
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [methods, setMethods] = useState<StepMethod[]>([]);
    const [method, setMethod] = useState<StepMethod>("passkey");
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const passkeySupported = useMemo(
        () => typeof window !== "undefined" && window.isSecureContext && Passkeys.isSupported(),
        [],
    );

    useEffect(() => {
        if (!open) {
            Passkeys.cancel();
            return;
        }

        const controller = new AbortController();
        setLoading(true);
        setSubmitting(false);
        setCode("");
        setError("");

        axios.get<SecurityStatus>(ENDPOINTS.status, {
            signal: controller.signal,
            withCredentials: true,
            headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        }).then((response) => {
            syncCsrfToken(response.data);
            const available = normalizeMethods(response.data, passkeySupported);
            setMethods(available);
            setMethod(available[0] ?? "totp");
            if (available.length === 0) {
                setError("Tidak ada faktor MFA aktif. Selesaikan pengaturan keamanan akun sebelum mengelola staff.");
            } else if (available.every((availableMethod) => availableMethod === "passkey") && !passkeySupported) {
                setError("Passkey akun ini memerlukan browser modern pada koneksi HTTPS yang aman.");
            }
        }).catch((reason) => {
            if (!axios.isCancel(reason)) setError(errorMessage(reason));
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });

        return () => {
            controller.abort();
            Passkeys.cancel();
        };
    }, [open, passkeySupported]);

    useEffect(() => {
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || submitting) return;
            event.stopPropagation();
            onCancel();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onCancel, open, submitting]);

    const verify = async (event: FormEvent) => {
        event.preventDefault();
        if (loading || submitting || methods.length === 0) return;

        setSubmitting(true);
        setError("");
        try {
            if (method === "passkey") {
                if (!passkeySupported) throw new Error("Passkey tidak tersedia pada browser atau koneksi ini.");
                const response = await Passkeys.verify({
                    routes: {
                        options: `${ENDPOINTS.passkeyOptions}?purpose=${encodeURIComponent(purpose)}`,
                        submit: ENDPOINTS.passkeyVerify,
                    },
                }) as StepResponse;
                syncCsrfToken(response);
            } else {
                const endpoint = method === "totp" ? ENDPOINTS.totpVerify : ENDPOINTS.recoveryVerify;
                const response = await axios.post<StepResponse>(
                    endpoint,
                    { code: code.trim(), purpose },
                    {
                        withCredentials: true,
                        withXSRFToken: true,
                        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
                    },
                );
                syncCsrfToken(response.data);
            }

            onVerified();
        } catch (reason) {
            setError(errorMessage(reason));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const methodMeta: Record<StepMethod, {
        icon: typeof KeyRound;
        title: string;
        note: string;
    }> = {
        passkey: { icon: KeyRound, title: "Passkey", note: "Wajah, sidik jari, PIN, atau security key" },
        totp: { icon: Smartphone, title: "Authenticator", note: "Kode enam digit dari aplikasi" },
        recovery: { icon: ShieldEllipsis, title: "Kode pemulihan", note: "Gunakan hanya sebagai jalur darurat" },
    };

    return (
        <div
            className="fixed inset-0 z-[10030] flex items-end justify-center bg-slate-950/55 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-6 sm:py-6"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <button
                type="button"
                className="absolute inset-0"
                onClick={() => { if (!submitting) onCancel(); }}
                aria-label="Batalkan verifikasi keamanan"
            />
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="staff-step-up-title"
                className="relative max-h-[calc(100dvh-24px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-[20px] border border-white/70 bg-white shadow-[0_34px_110px_rgba(15,23,42,.38)]"
                data-lenis-prevent="true"
            >
                <header className="relative overflow-hidden bg-slate-950 px-5 py-4 text-white">
                    <span className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-[#E35336]/25 blur-3xl" />
                    <div className="relative flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white/10 ring-1 ring-white/15">
                            <Fingerprint size={19} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="font-bdo text-[9px] font-bold uppercase tracking-[.18em] text-[#F8B5A8]">Persetujuan sensitif</p>
                            <h2 id="staff-step-up-title" className="mt-1 font-clash text-lg font-semibold">Konfirmasi identitas Anda</h2>
                            <p className="mt-1 font-bdo text-[11px] font-semibold leading-5 text-white/55">Untuk {actionLabel}. Persetujuan langsung hangus setelah satu tindakan.</p>
                        </div>
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={onCancel}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                            aria-label="Tutup verifikasi"
                        >
                            <X size={17} />
                        </button>
                    </div>
                    <div className="relative mt-4 flex items-center justify-between gap-3 rounded-[12px] bg-white/[.07] px-3 py-2 font-bdo text-[10px] font-bold text-white/55 ring-1 ring-white/10">
                        <span>Fresh MFA</span>
                        <span className="inline-flex items-center gap-1.5 text-[#F8B5A8]"><LockKeyhole size={12} /> Satu aksi</span>
                    </div>
                </header>

                <form onSubmit={verify} className="p-5">
                    {loading ? (
                        <div className="grid min-h-32 place-items-center text-center" role="status">
                            <div>
                                <LoaderCircle size={22} className="mx-auto animate-spin text-[#B93D2A]" />
                                <p className="mt-3 font-bdo text-xs font-semibold text-slate-500">Memeriksa faktor keamanan…</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {error && (
                                <div className="mb-4 flex items-start gap-2.5 rounded-[14px] border border-rose-100 bg-rose-50 px-3 py-2.5 font-bdo text-xs font-semibold leading-5 text-rose-700" role="alert">
                                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                                    <span className="min-w-0 flex-1">{error}</span>
                                </div>
                            )}

                            <div className="grid gap-2" role="radiogroup" aria-label="Metode verifikasi MFA">
                                {methods.map((option) => {
                                    const meta = methodMeta[option];
                                    const Icon = meta.icon;
                                    const active = method === option;
                                    return (
                                        <button
                                            key={option}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            disabled={submitting || (option === "passkey" && !passkeySupported)}
                                            onClick={() => { setMethod(option); setCode(""); setError(""); }}
                                            className={cn(
                                                "flex items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                                                active
                                                    ? "border-[#F8B5A8] bg-[#FFF1EE] ring-2 ring-[#E35336]/10"
                                                    : "border-slate-200 bg-white hover:border-[#F8B5A8] hover:bg-[#FFF9F7]",
                                            )}
                                        >
                                            <Icon size={17} className={active ? "text-[#B93D2A]" : "text-slate-400"} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-bdo text-xs font-bold text-slate-900">{meta.title}</span>
                                                <span className="mt-0.5 block font-bdo text-[10px] font-semibold text-slate-400">{meta.note}</span>
                                            </span>
                                            {active && <Check size={15} className="shrink-0 text-[#B93D2A]" />}
                                        </button>
                                    );
                                })}
                            </div>

                            {method !== "passkey" && methods.includes(method) && (
                                <label className="mt-4 block space-y-1.5">
                                    <span className="font-bdo text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        {method === "totp" ? "Kode authenticator" : "Kode pemulihan"}
                                    </span>
                                    <input
                                        value={code}
                                        onChange={(event) => setCode(method === "totp" ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value)}
                                        inputMode={method === "totp" ? "numeric" : "text"}
                                        autoComplete="one-time-code"
                                        autoFocus
                                        className="h-12 w-full rounded-[14px] border border-slate-200 px-4 font-mono text-sm font-bold tracking-[.12em] text-slate-900 outline-none transition focus:border-[#F8B5A8] focus:ring-4 focus:ring-[#E35336]/10"
                                    />
                                </label>
                            )}

                            <button
                                type="submit"
                                disabled={submitting || methods.length === 0 || (method === "passkey" && !passkeySupported) || (method !== "passkey" && code.trim().length < 6)}
                                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-4 font-clash text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:bg-none disabled:text-slate-400 disabled:shadow-none disabled:hover:translate-y-0"
                            >
                                {submitting ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                                {submitting ? "Memverifikasi…" : "Verifikasi dan lanjutkan"}
                            </button>
                        </>
                    )}
                </form>
            </section>
        </div>
    );
}
