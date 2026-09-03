import { Passkeys } from "@laravel/passkeys";
import { router } from "@inertiajs/react";
import axios from "axios";
import {
    AlertCircle,
    ArrowRight,
    Check,
    CheckCircle2,
    ChevronRight,
    Copy,
    Download,
    Eye,
    EyeOff,
    Fingerprint,
    KeyRound,
    Laptop,
    LoaderCircle,
    LockKeyhole,
    Pencil,
    Plus,
    RefreshCw,
    ShieldCheck,
    ShieldEllipsis,
    Smartphone,
    Trash2,
    X,
} from "lucide-react";
import {
    FormEvent,
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { cn } from "@/lib/utils";

type MfaMethod = "passkey" | "totp" | "recovery";
type MfaPurpose =
    | "add_passkey"
    | "remove_passkey"
    | "replace_totp"
    | "remove_totp"
    | "rotate_recovery_codes";

interface PasskeyItem {
    id: number | string;
    name: string;
    created_at?: string | null;
    last_used_at?: string | null;
    can_remove?: boolean;
}

interface MfaStatus {
    enabled: boolean;
    required: boolean;
    passkeys: PasskeyItem[];
    totp: {
        enabled: boolean;
        confirmed_at?: string | null;
        can_remove?: boolean;
    };
    recovery_codes: {
        remaining: number;
        total: number;
        generated_at?: string | null;
    };
    last_verified_at?: string | null;
    last_verified_method?: string | null;
}

interface StepUpStatus {
    verified: boolean;
    mfa_verified: boolean;
    expires_at?: string | null;
    method?: string | null;
    methods: MfaMethod[];
    purpose?: MfaPurpose | null;
}

interface SecurityStatusResponse {
    mfa: MfaStatus;
    step_up: StepUpStatus;
    csrf_token?: string;
}

interface TotpOptionsResponse {
    secret: string;
    qr_code?: string;
    qrCode?: string;
    qr_code_svg?: string;
    qrCodeSvg?: string;
}

interface RecoveryCodesResponse {
    recovery_codes?: string[];
    recoveryCodes?: string[];
    recovery_codes_version?: number;
    csrf_token?: string;
}

interface StepUpResponse {
    step_up?: Partial<StepUpStatus>;
    csrf_token?: string;
}

interface PendingAction {
    purpose: MfaPurpose;
    label: string;
    run: () => Promise<void>;
}

const ENDPOINTS = {
    status: "/ubsc-staff/account/security",
    passkeyStepOptions: "/ubsc-staff/account/security/mfa/step-up/passkey/options",
    passkeyStepVerify: "/ubsc-staff/account/security/mfa/step-up/passkey",
    totpStep: "/ubsc-staff/account/security/mfa/step-up/totp",
    recoveryStep: "/ubsc-staff/account/security/mfa/step-up/recovery",
    passkeyOptions: "/ubsc-staff/account/security/mfa/passkeys/options",
    passkeys: "/ubsc-staff/account/security/mfa/passkeys",
    totpOptions: "/ubsc-staff/account/security/mfa/totp/options",
    totp: "/ubsc-staff/account/security/mfa/totp",
    recoveryCodes: "/ubsc-staff/account/security/mfa/recovery-codes",
    recoveryAcknowledge: "/ubsc-staff/account/security/mfa/recovery-codes/acknowledge",
    recoveryCancel: "/ubsc-staff/account/security/mfa/recovery-codes/pending",
} as const;

const GENERIC_ERROR =
    "Tindakan belum dapat diselesaikan. Tidak ada perubahan yang disimpan; silakan coba lagi.";

const emptyStatus: SecurityStatusResponse = {
    mfa: {
        enabled: false,
        required: true,
        passkeys: [],
        totp: { enabled: false },
        recovery_codes: { remaining: 0, total: 0 },
    },
    step_up: {
        verified: false,
        mfa_verified: false,
        methods: [],
    },
};

function apiError(error: unknown): string {
    if (!axios.isAxiosError(error)) {
        return error instanceof Error && error.message ? error.message : GENERIC_ERROR;
    }

    const payload = error.response?.data as
        | { message?: string; errors?: Record<string, string[] | string> }
        | undefined;
    const first = payload?.errors
        ? Object.values(payload.errors).flat().find((value) => typeof value === "string")
        : null;

    return first || payload?.message || GENERIC_ERROR;
}

function isStepUpError(error: unknown): boolean {
    if (!axios.isAxiosError(error) || error.response?.status !== 428) return false;

    const code = (error.response?.data as { code?: string } | undefined)?.code;
    return code === "mfa_step_up_required";
}

function isExpiredCeremonyError(error: unknown): boolean {
    if (!axios.isAxiosError(error) || error.response?.status !== 422) return false;

    const errors = (error.response?.data as {
        errors?: Record<string, string[] | string>;
    } | undefined)?.errors;

    return Boolean(errors?.credential);
}

function post<T>(url: string, data: Record<string, unknown> = {}) {
    return axios.post<T>(url, data, {
        withCredentials: true,
        withXSRFToken: true,
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
}

function syncCsrfToken(payload?: { csrf_token?: string } | null) {
    if (!payload?.csrf_token) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
    if (meta) meta.content = payload.csrf_token;
}

function formatDate(value?: string | null, fallback = "Belum pernah") {
    if (!value) return fallback;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return fallback;

    return new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(parsed);
}

function qrSource(options: TotpOptionsResponse | null): string | null {
    if (!options) return null;
    const value = options.qrCodeSvg ?? options.qr_code_svg ?? options.qrCode ?? options.qr_code;
    if (!value) return null;

    return value.trimStart().startsWith("<svg")
        ? `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(value)}`
        : value;
}

function SectionIcon({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "red" }) {
    return (
        <span
            className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px_15px_5px_15px] border bg-white shadow-[0_14px_28px_-22px_rgba(15,23,42,.7)]",
                tone === "red"
                    ? "border-red-100 text-[#E33A2C]"
                    : "border-sky-100 text-[#15678D]",
            )}
        >
            {children}
        </span>
    );
}

function ActionButton({
    children,
    onClick,
    disabled,
    tone = "dark",
    type = "button",
}: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    tone?: "dark" | "light" | "danger";
    type?: "button" | "submit";
}) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px_13px_4px_13px] px-4 py-2.5 font-bdo text-xs font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-45",
                tone === "dark" &&
                    "bg-[#07111F] text-white shadow-[0_14px_32px_-20px_rgba(7,17,31,.9)] hover:-translate-y-px hover:bg-[#124E70] focus-visible:ring-sky-100",
                tone === "light" &&
                    "border border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50/45 hover:text-[#124E70] focus-visible:ring-slate-100",
                tone === "danger" &&
                    "border border-red-100 bg-white text-[#D72D20] hover:border-red-200 hover:bg-red-50 focus-visible:ring-red-100",
            )}
        >
            {children}
        </button>
    );
}

export default function AdminSecurityCenter() {
    const [status, setStatus] = useState<SecurityStatusResponse>(emptyStatus);
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [stepUpOpen, setStepUpOpen] = useState(false);
    const [stepMethod, setStepMethod] = useState<MfaMethod>("passkey");
    const [stepCode, setStepCode] = useState("");
    const pendingActionRef = useRef<PendingAction | null>(null);
    const [pendingLabel, setPendingLabel] = useState("");
    const [passkeyName, setPasskeyName] = useState("");
    const [addingPasskey, setAddingPasskey] = useState(false);
    const [editingPasskey, setEditingPasskey] = useState<PasskeyItem | null>(null);
    const [renamedPasskey, setRenamedPasskey] = useState("");
    const [removingPasskey, setRemovingPasskey] = useState<PasskeyItem | null>(null);
    const [totpOptions, setTotpOptions] = useState<TotpOptionsResponse | null>(null);
    const [totpCode, setTotpCode] = useState("");
    const [totpOpen, setTotpOpen] = useState(false);
    const [removeTotpOpen, setRemoveTotpOpen] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [recoveryVersion, setRecoveryVersion] = useState<number | null>(null);
    const [recoveryOpen, setRecoveryOpen] = useState(false);
    const [codesSaved, setCodesSaved] = useState(false);
    const [codesCopied, setCodesCopied] = useState(false);
    const [passwordExpanded, setPasswordExpanded] = useState(false);
    const [showPasswords, setShowPasswords] = useState(false);
    const [passwordData, setPasswordData] = useState({
        current_password: "",
        password: "",
        password_confirmation: "",
    });
    const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
    const [passkeySupported, setPasskeySupported] = useState(false);

    const loadStatus = useCallback(async (quiet = false) => {
        if (quiet) setRefreshing(true);
        else setLoading(true);
        setError("");

        try {
            const response = await axios.get<SecurityStatusResponse>(ENDPOINTS.status, {
                withCredentials: true,
                headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
            });
            syncCsrfToken(response.data);
            setStatus({
                mfa: { ...emptyStatus.mfa, ...response.data.mfa },
                step_up: { ...emptyStatus.step_up, ...response.data.step_up },
            });
            setLoaded(true);
        } catch (reason) {
            setError(apiError(reason));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void loadStatus();
        return () => Passkeys.cancel();
    }, [loadStatus]);

    useEffect(() => {
        setPasskeySupported(Passkeys.isSupported() && window.isSecureContext);
    }, []);

    const availableStepMethods = useMemo<MfaMethod[]>(() => {
        const serverMethods = status.step_up.methods ?? [];
        if (serverMethods.length > 0) {
            const usable = serverMethods.filter((method) => method !== "passkey" || passkeySupported);
            return usable.length > 0 ? usable : serverMethods;
        }

        const fallback: MfaMethod[] = [];
        if (status.mfa.passkeys.length > 0) fallback.push("passkey");
        if (status.mfa.totp.enabled) fallback.push("totp");
        if (status.mfa.recovery_codes.remaining > 0) fallback.push("recovery");
        return fallback;
    }, [passkeySupported, status]);

    useEffect(() => {
        if (!availableStepMethods.includes(stepMethod)) {
            setStepMethod(availableStepMethods[0] ?? "totp");
        }
    }, [availableStepMethods, stepMethod]);

    const clearMessages = () => {
        setError("");
        setNotice("");
    };

    const consumeLocalStepUp = () => {
        setStatus((current) => ({
            ...current,
            step_up: {
                ...current.step_up,
                verified: false,
                mfa_verified: false,
                expires_at: null,
                method: null,
                purpose: null,
            },
        }));
    };

    const executePending = async () => {
        const pending = pendingActionRef.current;
        pendingActionRef.current = null;
        setPendingLabel("");
        setStepUpOpen(false);
        setStepCode("");
        if (!pending) return;

        setBusy(true);
        try {
            await pending.run();
        } catch (reason) {
            if (isStepUpError(reason)) {
                pendingActionRef.current = pending;
                setPendingLabel(pending.label);
                setStepUpOpen(true);
            } else {
                setError(apiError(reason));
            }
        } finally {
            setBusy(false);
        }
    };

    const requireStepUp = (purpose: MfaPurpose, label: string, run: () => Promise<void>) => {
        clearMessages();
        if (status.step_up.verified && status.step_up.purpose === purpose) {
            pendingActionRef.current = { purpose, label, run };
            void executePending();
            return;
        }

        pendingActionRef.current = { purpose, label, run };
        setPendingLabel(label);
        setStepUpOpen(true);
    };

    const completeStepUp = async (response?: StepUpResponse) => {
        setStatus((current) => ({
            ...current,
            step_up: {
                ...current.step_up,
                ...(response?.step_up ?? {}),
                mfa_verified: true,
                verified: true,
                purpose: pendingActionRef.current?.purpose ?? current.step_up.purpose,
            },
        }));
        await executePending();
    };

    const submitFactorStep = async (event?: FormEvent) => {
        event?.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");

        try {
            const purpose = pendingActionRef.current?.purpose;
            if (!purpose) throw new Error(GENERIC_ERROR);

            if (stepMethod === "passkey") {
                const response = (await Passkeys.verify({
                    routes: {
                        options: `${ENDPOINTS.passkeyStepOptions}?purpose=${encodeURIComponent(purpose)}`,
                        submit: ENDPOINTS.passkeyStepVerify,
                    },
                })) as StepUpResponse;
                syncCsrfToken(response);
                await completeStepUp(response);
                return;
            }

            const endpoint = stepMethod === "totp" ? ENDPOINTS.totpStep : ENDPOINTS.recoveryStep;
            const response = await post<StepUpResponse>(endpoint, {
                code: stepCode.trim(),
                purpose,
            });
            syncCsrfToken(response.data);
            await completeStepUp(response.data);
        } catch (reason) {
            setError(apiError(reason));
        } finally {
            setBusy(false);
        }
    };

    const registerPasskey = () => {
        const name = passkeyName.trim() || "Perangkat utama";
        requireStepUp("add_passkey", "menambahkan passkey", async () => {
            if (!Passkeys.isSupported() || !window.isSecureContext) {
                throw new Error("Passkey tidak tersedia pada browser ini.");
            }
            const response = (await Passkeys.register({
                name,
                routes: { options: ENDPOINTS.passkeyOptions, submit: ENDPOINTS.passkeys },
            })) as { csrf_token?: string };
            syncCsrfToken(response);
            consumeLocalStepUp();
            setAddingPasskey(false);
            setPasskeyName("");
            setNotice("Passkey baru berhasil ditambahkan.");
            await loadStatus(true);
        });
    };

    const savePasskeyName = async (event: FormEvent) => {
        event.preventDefault();
        if (!editingPasskey || !renamedPasskey.trim() || busy) return;
        const target = editingPasskey;
        const nextName = renamedPasskey.trim();
        setBusy(true);
        clearMessages();
        try {
            const response = await axios.patch<{ csrf_token?: string }>(
                `${ENDPOINTS.passkeys}/${target.id}`,
                { name: nextName },
                { headers: { Accept: "application/json" }, withXSRFToken: true },
            );
            syncCsrfToken(response.data);
            setEditingPasskey(null);
            setNotice("Nama passkey diperbarui.");
            await loadStatus(true);
        } catch (reason) {
            setError(apiError(reason));
        } finally {
            setBusy(false);
        }
    };

    const removePasskey = () => {
        if (!removingPasskey) return;
        const target = removingPasskey;
        setRemovingPasskey(null);
        requireStepUp("remove_passkey", `menghapus passkey ${target.name}`, async () => {
            const response = await axios.delete<{ csrf_token?: string }>(`${ENDPOINTS.passkeys}/${target.id}`, {
                withXSRFToken: true,
                headers: { Accept: "application/json" },
            });
            syncCsrfToken(response.data);
            consumeLocalStepUp();
            setNotice("Passkey telah dihapus dan tidak lagi dapat digunakan.");
            await loadStatus(true);
        });
    };

    const prepareTotp = () => {
        requireStepUp("replace_totp", status.mfa.totp.enabled ? "mengganti authenticator" : "menambahkan authenticator", async () => {
            const response = await post<TotpOptionsResponse>(ENDPOINTS.totpOptions);
            setTotpOptions(response.data);
            setTotpCode("");
            setTotpOpen(true);
        });
    };

    const confirmTotp = async (event: FormEvent) => {
        event.preventDefault();
        if (busy || totpCode.replace(/\s/g, "").length !== 6) return;
        setBusy(true);
        setError("");
        try {
            const response = await axios.put<{ csrf_token?: string }>(
                ENDPOINTS.totp,
                { code: totpCode.replace(/\s/g, "") },
                { headers: { Accept: "application/json" }, withXSRFToken: true },
            );
            syncCsrfToken(response.data);
            consumeLocalStepUp();
            setTotpOpen(false);
            setTotpOptions(null);
            setNotice("Aplikasi authenticator aktif dan siap digunakan.");
            await loadStatus(true);
        } catch (reason) {
            if (isExpiredCeremonyError(reason)) {
                setTotpOpen(false);
                setTotpOptions(null);
                setTotpCode("");
                consumeLocalStepUp();
                setError("Verifikasi keamanan telah kedaluwarsa. Mulai kembali pengaturan authenticator untuk melanjutkan.");
            } else {
                setError(apiError(reason));
            }
        } finally {
            setBusy(false);
        }
    };

    const removeTotp = () => {
        setRemoveTotpOpen(false);
        requireStepUp("remove_totp", "menghapus authenticator", async () => {
            const response = await axios.delete<{ csrf_token?: string }>(ENDPOINTS.totp, {
                withXSRFToken: true,
                headers: { Accept: "application/json" },
            });
            syncCsrfToken(response.data);
            consumeLocalStepUp();
            setNotice("Authenticator dihapus. Faktor lain tetap melindungi akun.");
            await loadStatus(true);
        });
    };

    const regenerateRecoveryCodes = () => {
        requireStepUp("rotate_recovery_codes", "membuat ulang kode pemulihan", async () => {
            const response = await post<RecoveryCodesResponse>(ENDPOINTS.recoveryCodes);
            syncCsrfToken(response.data);
            consumeLocalStepUp();
            const codes = response.data.recovery_codes ?? response.data.recoveryCodes ?? [];
            if (!codes.length || !response.data.recovery_codes_version) throw new Error(GENERIC_ERROR);
            setRecoveryCodes(codes);
            setRecoveryVersion(response.data.recovery_codes_version);
            setCodesSaved(false);
            setCodesCopied(false);
            setRecoveryOpen(true);
        });
    };

    const copyRecoveryCodes = async () => {
        try {
            await navigator.clipboard.writeText(recoveryCodes.join("\n"));
            setCodesCopied(true);
            setCodesSaved(true);
            window.setTimeout(() => setCodesCopied(false), 1800);
        } catch {
            setError("Kode belum dapat disalin. Unduh atau catat kode secara manual.");
        }
    };

    const downloadRecoveryCodes = () => {
        const content = [
            "UB Sport Center — kode pemulihan admin",
            "Simpan di tempat aman. Setiap kode hanya dapat digunakan satu kali.",
            "",
            ...recoveryCodes,
        ].join("\n");
        const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "ubsc-admin-recovery-codes.txt";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setCodesSaved(true);
    };

    const clearRecoveryDraft = () => {
        setRecoveryOpen(false);
        setRecoveryCodes([]);
        setRecoveryVersion(null);
        setCodesSaved(false);
        setCodesCopied(false);
    };

    const acknowledgeRecoveryCodes = async () => {
        if (!codesSaved || !recoveryVersion || busy) return;
        setBusy(true);
        setError("");
        try {
            const response = await post<{ csrf_token?: string }>(ENDPOINTS.recoveryAcknowledge, {
                acknowledged: true,
                recovery_codes_version: recoveryVersion,
            });
            syncCsrfToken(response.data);
            clearRecoveryDraft();
            setNotice("Kode pemulihan baru aktif. Kode sebelumnya telah dicabut.");
            await loadStatus(true);
        } catch (reason) {
            if (isExpiredCeremonyError(reason)) {
                try {
                    const cancelled = await axios.delete<{ csrf_token?: string }>(ENDPOINTS.recoveryCancel, {
                        withXSRFToken: true,
                        headers: { Accept: "application/json" },
                    });
                    syncCsrfToken(cancelled.data);
                } catch {
                    // The old codes remain authoritative; the staged bundle also expires server-side.
                }
                clearRecoveryDraft();
                consumeLocalStepUp();
                setError("Verifikasi keamanan telah kedaluwarsa. Kode lama tetap aktif; mulai kembali rotasi kode jika diperlukan.");
            } else {
                setError(apiError(reason));
            }
        } finally {
            setBusy(false);
        }
    };

    const cancelRecoveryRotation = async () => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            const response = await axios.delete<{ csrf_token?: string }>(ENDPOINTS.recoveryCancel, {
                withXSRFToken: true,
                headers: { Accept: "application/json" },
            });
            syncCsrfToken(response.data);
            clearRecoveryDraft();
            consumeLocalStepUp();
            setNotice("Pembuatan kode baru dibatalkan. Kode pemulihan lama tetap aktif.");
        } catch (reason) {
            clearRecoveryDraft();
            consumeLocalStepUp();
            setError(`Permintaan pembatalan tidak terkonfirmasi. Kode baru tidak diaktifkan dan kode lama tetap berlaku; draft server akan kedaluwarsa otomatis. ${apiError(reason)}`);
        } finally {
            setBusy(false);
        }
    };

    const updatePassword = (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        setPasswordErrors({});
        router.put(route("admin.account.password.update"), passwordData, {
            preserveScroll: true,
            onError: (errors) => {
                setPasswordErrors(
                    Object.fromEntries(
                        Object.entries(errors).map(([key, value]) => [key, String(value)]),
                    ),
                );
                setError("Periksa kembali kata sandi yang Anda masukkan.");
            },
            onSuccess: () => {
                setPasswordData({ current_password: "", password: "", password_confirmation: "" });
            },
            onFinish: () => setBusy(false),
        });
    };

    if (loading) {
        return (
            <div className="grid min-h-[340px] place-items-center" role="status" aria-live="polite">
                <div className="text-center">
                    <LoaderCircle className="mx-auto animate-spin text-sky-700" size={26} />
                    <p className="mt-3 text-sm font-semibold text-slate-500">Memeriksa perlindungan akun…</p>
                </div>
            </div>
        );
    }

    if (!loaded) {
        return (
            <div className="grid min-h-[340px] place-items-center px-3 text-center" role="alert">
                <div className="max-w-sm">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[15px] border border-rose-100 bg-rose-50 text-rose-600">
                        <AlertCircle size={21} />
                    </span>
                    <h3 className="mt-4 font-bdo text-lg font-semibold text-slate-950">
                        Status keamanan belum dapat dimuat
                    </h3>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                        Kami tidak menampilkan perkiraan agar status perlindungan akun tidak menyesatkan.
                    </p>
                    <div className="mt-4 flex justify-center">
                        <ActionButton onClick={() => void loadStatus()}>
                            <RefreshCw size={14} /> Coba lagi
                        </ActionButton>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-2 font-bdo">
            <header className="grid gap-4 border-b border-slate-200/80 pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#15678D]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#15678D] shadow-[0_0_0_4px_rgba(21,103,141,.1)]" />
                        Keamanan akun
                    </div>
                    <h3 className="mt-2 max-w-2xl font-bdo text-[clamp(1.45rem,3vw,2rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-[#07111F]">
                        Perlindungan yang jelas, tanpa langkah yang membingungkan.
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm font-normal leading-6 text-slate-500">
                        Kelola faktor masuk, jalur pemulihan, dan kata sandi dari satu tempat. Faktor lama tetap aman sampai penggantinya selesai diverifikasi.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void loadStatus(true)}
                    disabled={refreshing}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-[13px_13px_4px_13px] border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-600 shadow-[0_10px_24px_-20px_rgba(15,23,42,.7)] transition hover:border-sky-200 hover:text-[#124E70] disabled:opacity-50 sm:self-end"
                >
                    <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                    Perbarui status
                </button>
            </header>

            <div aria-live="polite" className="space-y-2">
                {error && (
                    <div className="flex items-start gap-3 rounded-[15px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" role="alert">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" />
                        <span className="min-w-0 flex-1">{error}</span>
                        <button type="button" onClick={() => setError("")} aria-label="Tutup pesan kesalahan">
                            <X size={15} />
                        </button>
                    </div>
                )}
                {notice && (
                    <div className="flex items-start gap-3 rounded-[15px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">
                        <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
                        <span className="min-w-0 flex-1">{notice}</span>
                        <button type="button" onClick={() => setNotice("")} aria-label="Tutup pemberitahuan">
                            <X size={15} />
                        </button>
                    </div>
                )}
            </div>

            <section className="relative isolate overflow-hidden rounded-[26px_26px_8px_26px] bg-[#07111F] px-4 py-5 text-white shadow-[0_28px_60px_-40px_rgba(7,17,31,.95)] sm:px-6 sm:py-6">
                <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-[#15678D]/32 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 left-[18%] h-40 w-72 rounded-full bg-[#E33A2C]/12 blur-3xl" />
                <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#36A7D8] via-white/35 to-[#E33A2C]" />
                <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="flex min-w-0 items-start gap-3.5">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[17px_17px_5px_17px] bg-white/[.08] text-sky-100 ring-1 ring-white/15">
                            <Fingerprint size={22} strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-base font-semibold tracking-[-0.015em]">Perlindungan berlapis aktif</p>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/12 px-2 py-1 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                                    Terlindungi
                                </span>
                            </div>
                            <p className="mt-1.5 max-w-lg text-xs font-normal leading-5 text-white/55">
                                Verifikasi terakhir {formatDate(status.mfa.last_verified_at, "pada sesi ini")}. Setiap perubahan sensitif memerlukan konfirmasi ulang.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-white/10 border-y border-white/10 lg:min-w-[310px] lg:border-y-0 lg:border-l">
                        {[
                            ["Passkey", status.mfa.passkeys.length],
                            ["Authenticator", status.mfa.totp.enabled ? "Aktif" : "—"],
                            ["Kode aman", status.mfa.recovery_codes.remaining],
                        ].map(([label, value]) => (
                            <div key={String(label)} className="min-w-0 px-2 py-3 text-center sm:px-4 lg:py-1.5">
                                <p className="text-base font-semibold leading-none text-white">{value}</p>
                                <p className="mt-1.5 truncate text-[10px] font-normal text-white/45">{label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
                <section className="relative overflow-hidden rounded-[24px_24px_7px_24px] border border-slate-200/80 bg-white p-4 shadow-[0_24px_50px_-42px_rgba(15,23,42,.8)] sm:p-5">
                    <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#15678D] via-sky-300/45 to-transparent" />
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                            <SectionIcon><KeyRound size={18} /></SectionIcon>
                            <div className="min-w-0">
                                <p className="text-[11px] font-medium text-[#15678D]">Faktor utama</p>
                                <h4 className="mt-0.5 text-lg font-semibold tracking-[-0.025em] text-[#07111F]">Passkey</h4>
                                <p className="mt-1 max-w-sm text-xs font-normal leading-5 text-slate-500">
                                    Masuk dengan wajah, sidik jari, PIN perangkat, atau security key.
                                </p>
                            </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-[#15678D] ring-1 ring-sky-100">
                            {status.mfa.passkeys.length} aktif
                        </span>
                    </div>

                    <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
                        {status.mfa.passkeys.length === 0 ? (
                            <div className="flex items-center gap-2.5 py-4 text-xs font-normal text-slate-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                Belum ada passkey pada akun ini.
                            </div>
                        ) : status.mfa.passkeys.map((passkey) => (
                            <div key={passkey.id} className="group flex items-center gap-3 py-3.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px_11px_4px_11px] bg-slate-50 text-slate-400 ring-1 ring-slate-100">
                                    <Laptop size={15} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-slate-800">{passkey.name}</p>
                                    <p className="mt-0.5 truncate text-[10px] font-normal text-slate-400">
                                        Terakhir dipakai {formatDate(passkey.last_used_at, "belum pernah")}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingPasskey(passkey);
                                        setRenamedPasskey(passkey.name);
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-[10px_10px_3px_10px] text-slate-400 transition hover:bg-sky-50 hover:text-[#15678D]"
                                    aria-label={`Ubah nama ${passkey.name}`}
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRemovingPasskey(passkey)}
                                    disabled={passkey.can_remove === false}
                                    title={passkey.can_remove === false ? "Aktifkan faktor lain sebelum menghapus passkey ini" : undefined}
                                    className="flex h-8 w-8 items-center justify-center rounded-[10px_10px_3px_10px] text-slate-400 transition hover:bg-red-50 hover:text-[#D72D20] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                    aria-label={passkey.can_remove === false ? `${passkey.name} adalah faktor terakhir` : `Hapus ${passkey.name}`}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {addingPasskey ? (
                        <div className="mt-3 flex flex-col gap-2 rounded-[15px_15px_5px_15px] border border-sky-100 bg-sky-50/55 p-3 sm:flex-row">
                            <input
                                value={passkeyName}
                                onChange={(event) => setPasskeyName(event.target.value)}
                                placeholder="Nama perangkat"
                                maxLength={120}
                                autoFocus
                                className="min-h-10 min-w-0 flex-1 rounded-[12px_12px_4px_12px] border border-white bg-white px-3 text-sm font-medium text-slate-900 outline-none ring-1 ring-sky-100 focus:ring-2 focus:ring-sky-200"
                            />
                            <div className="flex gap-2">
                                <ActionButton onClick={registerPasskey} disabled={busy}><Plus size={14} /> Tambahkan</ActionButton>
                                <button type="button" onClick={() => setAddingPasskey(false)} className="flex h-10 w-10 items-center justify-center rounded-[12px_12px_4px_12px] text-slate-500 hover:bg-white" aria-label="Batal menambah passkey"><X size={15} /></button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setAddingPasskey(true)}
                            disabled={!passkeySupported}
                            className="mt-4 flex w-full items-center justify-between rounded-[14px_14px_4px_14px] border border-slate-200 px-3.5 py-3 text-left text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50/40 hover:text-[#124E70] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                        >
                            <span className="inline-flex items-center gap-2"><Plus size={15} /> {passkeySupported ? "Tambah passkey" : "Passkey tidak tersedia di browser ini"}</span>
                            <ChevronRight size={15} />
                        </button>
                    )}
                </section>

                <section className="relative overflow-hidden rounded-[24px_24px_24px_7px] border border-slate-200/80 bg-white p-4 shadow-[0_24px_50px_-42px_rgba(15,23,42,.8)] sm:p-5">
                    <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-[#E33A2C] via-red-300/35 to-transparent" />
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                            <SectionIcon><Smartphone size={18} /></SectionIcon>
                            <div className="min-w-0">
                                <p className="text-[11px] font-medium text-[#15678D]">Faktor cadangan</p>
                                <h4 className="mt-0.5 text-lg font-semibold tracking-[-0.025em] text-[#07111F]">Aplikasi authenticator</h4>
                                <p className="mt-1 max-w-sm text-xs font-normal leading-5 text-slate-500">
                                    Kode enam digit yang berubah setiap 30 detik dan tetap bekerja tanpa jaringan.
                                </p>
                            </div>
                        </div>
                        <span className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1",
                            status.mfa.totp.enabled
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                                : "bg-slate-50 text-slate-500 ring-slate-100",
                        )}>
                            {status.mfa.totp.enabled ? "Aktif" : "Belum aktif"}
                        </span>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-4 border-y border-slate-100 py-3.5">
                        <div className="min-w-0">
                            <p className="text-[10px] font-normal text-slate-400">Status pemasangan</p>
                            <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                                {status.mfa.totp.enabled ? "Tersambung ke akun" : "Belum ada authenticator"}
                            </p>
                        </div>
                        <p className="shrink-0 text-right text-[10px] font-normal leading-4 text-slate-400">
                            {status.mfa.totp.enabled
                                ? <>Aktif sejak<br />{formatDate(status.mfa.totp.confirmed_at, "sebelumnya")}</>
                                : <>Siap dijadikan<br />faktor cadangan</>}
                        </p>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <ActionButton onClick={prepareTotp} disabled={busy}>
                            {status.mfa.totp.enabled ? <RefreshCw size={14} /> : <Plus size={14} />}
                            {status.mfa.totp.enabled ? "Ganti authenticator" : "Hubungkan authenticator"}
                        </ActionButton>
                        {status.mfa.totp.enabled && (
                            <ActionButton tone="danger" onClick={() => setRemoveTotpOpen(true)} disabled={busy || status.mfa.totp.can_remove === false}>
                                <Trash2 size={14} /> {status.mfa.totp.can_remove === false ? "Passkey diperlukan" : "Hapus"}
                            </ActionButton>
                        )}
                    </div>
                </section>
            </div>

            <section className="rounded-[22px_22px_6px_22px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_22px_46px_-42px_rgba(15,23,42,.75)] sm:px-5">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="flex min-w-0 gap-3">
                        <SectionIcon tone={status.mfa.recovery_codes.remaining <= 2 ? "red" : "blue"}><ShieldEllipsis size={18} /></SectionIcon>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-base font-semibold tracking-[-0.02em] text-[#07111F]">Kode pemulihan</h4>
                                <span className={cn(
                                    "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                                    status.mfa.recovery_codes.remaining <= 2
                                        ? "bg-rose-50 text-rose-600 ring-rose-100"
                                        : "bg-sky-50 text-sky-700 ring-sky-100",
                                )}>
                                    {status.mfa.recovery_codes.remaining} dari {status.mfa.recovery_codes.total} tersisa
                                </span>
                            </div>
                            <p className="mt-1 max-w-xl text-xs font-normal leading-5 text-slate-500">
                                Jalur darurat sekali pakai ketika faktor utama tidak tersedia. Kode lama baru dicabut setelah set baru diaktifkan.
                            </p>
                        </div>
                    </div>
                    <ActionButton tone="light" onClick={regenerateRecoveryCodes} disabled={busy}>
                        <RefreshCw size={14} /> Buat ulang kode
                    </ActionButton>
                </div>
            </section>

            <section className="overflow-hidden rounded-[22px_22px_22px_6px] border border-slate-200/80 bg-white shadow-[0_22px_46px_-42px_rgba(15,23,42,.75)]">
                <button
                    type="button"
                    onClick={() => setPasswordExpanded((value) => !value)}
                    className="group flex w-full items-center gap-3 p-4 text-left transition hover:bg-sky-50/35 sm:p-5"
                    aria-expanded={passwordExpanded}
                >
                    <SectionIcon><LockKeyhole size={18} /></SectionIcon>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-semibold tracking-[-0.02em] text-[#07111F]">Kata sandi akun</h4>
                            <span className="text-[10px] font-normal text-slate-400">Mencabut sesi lama</span>
                        </div>
                        <p className="mt-1 text-xs font-normal leading-5 text-slate-500">
                            Mengubah kata sandi akan mencabut sesi lama dan meminta login serta MFA kembali.
                        </p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px_12px_4px_12px] border border-slate-200 text-slate-400 transition group-hover:border-sky-200">
                        <ChevronRight size={17} className={cn("transition-transform", passwordExpanded && "rotate-90")} />
                    </span>
                </button>

                {passwordExpanded && (
                    <form onSubmit={updatePassword} className="border-t border-slate-100 bg-slate-50/45 p-4 sm:p-5">
                        <div className="grid gap-3 lg:grid-cols-3">
                            {[
                                ["current_password", "Kata sandi saat ini", "current-password"],
                                ["password", "Kata sandi baru", "new-password"],
                                ["password_confirmation", "Ulangi kata sandi baru", "new-password"],
                            ].map(([key, label, autoComplete]) => (
                                <label key={key} className="space-y-1.5">
                                    <span className="text-[11px] font-medium text-slate-500">{label}</span>
                                    <div className="relative">
                                        <input
                                            type={showPasswords ? "text" : "password"}
                                            value={passwordData[key as keyof typeof passwordData]}
                                            onChange={(event) => setPasswordData((current) => ({ ...current, [key]: event.target.value }))}
                                            autoComplete={autoComplete}
                                            className={cn(
                                                "h-11 w-full rounded-[13px_13px_4px_13px] border bg-white px-3 pr-10 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100",
                                                passwordErrors[key] ? "border-rose-300" : "border-slate-200",
                                            )}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPasswords((value) => !value)}
                                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[10px_10px_3px_10px] text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                            aria-label={showPasswords ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                                        >
                                            {showPasswords ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                    {passwordErrors[key] && <span className="block text-[11px] font-semibold text-rose-600">{passwordErrors[key]}</span>}
                                </label>
                            ))}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <ActionButton type="submit" disabled={busy}><LockKeyhole size={14} /> Perbarui kata sandi</ActionButton>
                        </div>
                    </form>
                )}
            </section>

            {busy && (
                <div className="pointer-events-none fixed bottom-5 right-5 z-[10020] inline-flex items-center gap-2 rounded-[14px_14px_4px_14px] bg-slate-950 px-4 py-3 text-xs font-semibold text-white shadow-2xl" role="status">
                    <LoaderCircle size={15} className="animate-spin" /> Menjaga perubahan tetap aman…
                </div>
            )}

            {stepUpOpen && (
                <div
                    className="fixed inset-0 z-[10010] flex items-end justify-center bg-slate-950/50 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-6 sm:py-6"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="step-up-title"
                        tabIndex={-1}
                        autoFocus
                        onKeyDown={(event) => {
                            if (event.key !== "Escape") return;
                            event.stopPropagation();
                            pendingActionRef.current = null;
                            setStepUpOpen(false);
                        }}
                        className="max-h-[calc(100dvh-24px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-[22px_22px_7px_22px] border border-white/70 bg-white font-bdo shadow-[0_30px_100px_rgba(15,23,42,.35)]"
                    >
                        <div className="bg-slate-950 px-5 py-4 text-white">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white/10 ring-1 ring-white/15"><ShieldCheck size={18} /></span>
                                    <div>
                                        <p className="text-[10px] font-medium text-sky-300">Verifikasi ulang</p>
                                        <h4 id="step-up-title" className="mt-1 font-bdo text-lg font-semibold tracking-[-0.02em]">Konfirmasi bahwa ini Anda</h4>
                                    </div>
                                </div>
                                <button type="button" onClick={() => { pendingActionRef.current = null; setStepUpOpen(false); }} className="flex h-9 w-9 items-center justify-center rounded-[12px] text-white/60 hover:bg-white/10 hover:text-white" aria-label="Tutup verifikasi"><X size={17} /></button>
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-3 border-y border-white/10 py-2 text-[10px] font-medium text-white/[.58]">
                                <span>Persetujuan satu tindakan</span>
                                <span className="inline-flex items-center gap-1.5 text-sky-300"><LockKeyhole size={12} /> Berlaku singkat</span>
                            </div>
                        </div>

                        <form onSubmit={submitFactorStep} className="p-5">
                            <p className="text-sm font-medium leading-6 text-slate-500">
                                Verifikasi dengan faktor aktif sebelum {pendingLabel}. Persetujuan ini hanya berlaku untuk tindakan tersebut dan langsung hangus setelah digunakan.
                            </p>
                                <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Metode verifikasi MFA">
                                    {availableStepMethods.map((method) => {
                                        const meta = {
                                            passkey: [KeyRound, "Passkey", "Wajah, sidik jari, PIN, atau security key"],
                                            totp: [Smartphone, "Authenticator", "Kode enam digit dari aplikasi"],
                                            recovery: [ShieldEllipsis, "Kode pemulihan", "Gunakan hanya ketika faktor utama tidak tersedia"],
                                        }[method] as [typeof KeyRound, string, string];
                                        const Icon = meta[0];
                                        return (
                                            <button
                                                key={method}
                                                type="button"
                                                role="radio"
                                                aria-checked={stepMethod === method}
                                                disabled={method === "passkey" && !passkeySupported}
                                                onClick={() => { setStepMethod(method); setStepCode(""); }}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-[14px_14px_4px_14px] border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                                                    stepMethod === method ? "border-sky-200 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 hover:bg-slate-50",
                                                )}
                                            >
                                                <Icon size={17} className={stepMethod === method ? "text-sky-700" : "text-slate-400"} />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-xs font-semibold text-slate-900">{meta[1]}</span>
                                                    <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">{meta[2]}</span>
                                                </span>
                                                {stepMethod === method && <Check size={15} className="text-sky-700" />}
                                            </button>
                                        );
                                    })}
                                </div>

                                {stepMethod !== "passkey" && (
                                    <label className="mt-4 block space-y-2">
                                        <span className="text-[11px] font-medium text-slate-500">
                                            {stepMethod === "totp" ? "Kode authenticator" : "Kode pemulihan"}
                                        </span>
                                        <input
                                            value={stepCode}
                                            onChange={(event) => setStepCode(event.target.value)}
                                            inputMode={stepMethod === "totp" ? "numeric" : "text"}
                                            autoComplete="one-time-code"
                                            autoFocus
                                            className="h-12 w-full rounded-[14px_14px_4px_14px] border border-slate-200 px-4 font-mono text-sm font-bold tracking-[.12em] text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                                        />
                                    </label>
                                )}
                            <div className="mt-4">
                                <ActionButton type="submit" disabled={busy || (stepMethod === "passkey" && !passkeySupported) || (stepMethod !== "passkey" && stepCode.trim().length < 6)}>
                                    <ShieldCheck size={15} /> Verifikasi dan lanjutkan
                                </ActionButton>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingPasskey && (
                <SimpleDialog title="Ubah nama passkey" description="Gunakan nama yang membantu Anda mengenali perangkat ini." onClose={() => setEditingPasskey(null)}>
                    <form onSubmit={savePasskeyName}>
                        <input value={renamedPasskey} onChange={(event) => setRenamedPasskey(event.target.value)} autoFocus maxLength={120} className="h-12 w-full rounded-[14px_14px_4px_14px] border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
                        <div className="mt-4 flex justify-end gap-2"><ActionButton tone="light" onClick={() => setEditingPasskey(null)}>Batal</ActionButton><ActionButton type="submit" disabled={busy || !renamedPasskey.trim()}>Simpan nama</ActionButton></div>
                    </form>
                </SimpleDialog>
            )}

            {removingPasskey && (
                <SimpleDialog title="Hapus passkey?" description={`“${removingPasskey.name}” tidak lagi dapat digunakan untuk masuk. Sistem akan menolak tindakan ini bila passkey tersebut adalah satu-satunya faktor.`} onClose={() => setRemovingPasskey(null)} tone="danger">
                    <div className="flex justify-end gap-2"><ActionButton tone="light" onClick={() => setRemovingPasskey(null)}>Batal</ActionButton><ActionButton tone="danger" onClick={removePasskey}>Hapus passkey</ActionButton></div>
                </SimpleDialog>
            )}

            {removeTotpOpen && (
                <SimpleDialog title="Hapus authenticator?" description="Kode dari aplikasi ini tidak lagi berlaku. Pastikan passkey lain tetap aktif agar akses akun tidak terputus." onClose={() => setRemoveTotpOpen(false)} tone="danger">
                    <div className="flex justify-end gap-2"><ActionButton tone="light" onClick={() => setRemoveTotpOpen(false)}>Batal</ActionButton><ActionButton tone="danger" onClick={removeTotp}>Hapus authenticator</ActionButton></div>
                </SimpleDialog>
            )}

            {totpOpen && (
                <SimpleDialog title={status.mfa.totp.enabled ? "Ganti authenticator" : "Hubungkan authenticator"} description="Pindai QR lalu masukkan kode enam digit. Authenticator lama tetap aktif sampai kode baru berhasil diverifikasi." onClose={() => { setTotpOpen(false); setTotpOptions(null); }}>
                    <form onSubmit={confirmTotp}>
                        <div className="grid gap-4 sm:grid-cols-[148px_1fr]">
                            <div className="grid aspect-square place-items-center rounded-[15px_15px_5px_15px] border border-slate-200 bg-white p-2">
                                {qrSource(totpOptions) ? <img src={qrSource(totpOptions) ?? ""} alt="Kode QR authenticator" className="h-full w-full object-contain" /> : <Smartphone size={32} className="text-slate-300" />}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-medium text-slate-400">Kunci manual</p>
                                <code className="mt-2 block break-all rounded-[12px] bg-slate-950 px-3 py-2.5 text-[11px] font-bold text-white">{totpOptions?.secret ?? "—"}</code>
                                <label className="mt-3 block space-y-1.5">
                                    <span className="text-[11px] font-medium text-slate-500">Kode authenticator</span>
                                    <input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus className="h-12 w-full rounded-[14px_14px_4px_14px] border border-slate-200 px-4 text-center font-mono text-lg font-bold tracking-[.22em] outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
                                </label>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end"><ActionButton type="submit" disabled={busy || totpCode.length !== 6}><Check size={15} /> Aktifkan authenticator</ActionButton></div>
                    </form>
                </SimpleDialog>
            )}

            {recoveryOpen && (
                <SimpleDialog title="Simpan kode pemulihan baru" description="Kode hanya ditampilkan kali ini. Kode baru belum aktif sampai Anda menyatakan sudah menyimpannya." onClose={cancelRecoveryRotation}>
                    <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Kode pemulihan baru">
                        {recoveryCodes.map((code, index) => (
                            <li key={code} className="flex items-center gap-2 rounded-[12px] bg-slate-950 px-3 py-2.5 font-mono text-xs font-bold text-white"><span className="text-white/35">{String(index + 1).padStart(2, "0")}</span><span>{code}</span></li>
                        ))}
                    </ol>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <ActionButton tone="light" onClick={() => void copyRecoveryCodes()}>{codesCopied ? <Check size={14} /> : <Copy size={14} />} {codesCopied ? "Tersalin" : "Salin kode"}</ActionButton>
                        <ActionButton tone="light" onClick={downloadRecoveryCodes}><Download size={14} /> Unduh .txt</ActionButton>
                    </div>
                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[14px] border border-slate-200 px-3 py-3 text-xs font-semibold leading-5 text-slate-600">
                        <input type="checkbox" checked={codesSaved} onChange={(event) => setCodesSaved(event.target.checked)} className="mt-0.5 rounded border-slate-300 text-sky-700 focus:ring-sky-200" />
                        Saya telah menyimpan kode ini di tempat aman dan memahami bahwa kode lama akan dicabut.
                    </label>
                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <ActionButton tone="light" onClick={cancelRecoveryRotation}>Batal, pertahankan kode lama</ActionButton>
                        <ActionButton onClick={() => void acknowledgeRecoveryCodes()} disabled={!codesSaved || busy}>Aktifkan kode baru <ArrowRight size={14} /></ActionButton>
                    </div>
                </SimpleDialog>
            )}
        </div>
    );
}

function SimpleDialog({
    title,
    description,
    children,
    onClose,
    tone = "default",
}: {
    title: string;
    description: string;
    children: ReactNode;
    onClose: () => void;
    tone?: "default" | "danger";
}) {
    return (
        <div
            className="fixed inset-0 z-[10010] flex items-end justify-center bg-slate-950/50 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-6 sm:py-6"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Tutup dialog" />
            <section
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                autoFocus
                onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.stopPropagation();
                    onClose();
                }}
                className="relative max-h-[calc(100dvh-24px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-[22px_22px_7px_22px] border border-white/70 bg-white p-5 font-bdo shadow-[0_30px_100px_rgba(15,23,42,.35)]"
                data-lenis-prevent="true"
            >
                <div className="mb-5 flex items-start gap-3">
                    <SectionIcon tone={tone === "danger" ? "red" : "blue"}>{tone === "danger" ? <AlertCircle size={18} /> : <ShieldCheck size={18} />}</SectionIcon>
                    <div className="min-w-0 flex-1">
                        <h4 className="font-bdo text-lg font-semibold tracking-[-0.02em] text-slate-950">{title}</h4>
                        <p className="mt-1 text-sm font-medium leading-6 text-slate-500">{description}</p>
                    </div>
                    <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Tutup"><X size={17} /></button>
                </div>
                {children}
            </section>
        </div>
    );
}
