/**
 * AuthModal.tsx
 *
 * Import the companion CSS file once in your global stylesheet:
 *   @import "@/styles/auth-modal.css";
 * or add it to resources/css/app.css in your Laravel + Vite setup.
 *
 * Entrance effects are handled entirely by auth-modal.css —
 * no Tailwind transition utilities for transform/opacity on the
 * modal card itself so the two systems don't fight each other.
 */

import { useForm } from "@inertiajs/react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, X } from "lucide-react";
import {
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type FormEventHandler,
} from "react";
import InputError from "@/Components/InputError";
import AuthVisualPanel from "@/Components/Landing/AuthVisualPanel";
import useModalFocusTrap from "@/Components/Landing/useModalFocusTrap";
import { cn } from "@/lib/utils";

export type AuthView =
    | "login"
    | "register"
    | "forgot"
    | "forgot-sent"
    | "reset";

type AuthFieldErrors = Record<string, string | string[] | undefined>;

interface Props {
    open: boolean;
    initialView?: AuthView;
    /** @deprecated Use initialView. Kept for compatibility with older callers. */
    initialTab?: "login" | "register";
    returnTo?: string;
    resetToken?: string;
    resetEmail?: string;
    notice?: string | null;
    externalErrors?: AuthFieldErrors;
    onClose: () => void;
    stacked?: boolean;
}

const brandLogo = "/ubsc-blue.svg";

export const authFormLabelClass =
    "mb-[7px] block font-bdo text-[13px] font-medium leading-none text-[#1f2937] [@media(max-height:760px)]:lg:mb-[6px] [@media(max-height:760px)]:lg:text-[12px]";
export const authFormInputClass =
    "h-[42px] w-full rounded-[7px] border-0 bg-[#f7f7f7] px-[13px] font-bdo text-[15px] font-normal text-[#1f2937] shadow-none outline-none transition-[background-color,box-shadow,transform] duration-200 placeholder:text-[#8d8d8d] hover:bg-[#f3f5f6] focus:bg-white focus:ring-2 focus:ring-[#15678D]/25 lg:h-[40px] lg:text-[14px] [@media(max-height:760px)]:lg:h-[34px] [@media(max-height:760px)]:lg:text-[13px]";
export const authFormErrorRingClass = "ring-2 ring-red-500/35";

const labelCls = authFormLabelClass;
const inputCls = authFormInputClass;
const errorRing = authFormErrorRingClass;

const motionDelay = (ms: number) =>
    ({ "--auth-delay": `${ms}ms` }) as CSSProperties;

function currentReturnPath() {
    if (typeof window === "undefined") return "/";

    const url = new URL(window.location.href);
    const authView = url.searchParams.get("auth");

    url.searchParams.delete("auth");
    url.searchParams.delete("return_to");
    url.searchParams.delete("password_reset");

    if (authView === "reset") {
        url.searchParams.delete("token");
        url.searchParams.delete("email");
        url.hash = "";
    }

    return `${url.pathname}${url.search}${url.hash}`;
}

function fieldError(
    localError: string | undefined,
    externalError: string | string[] | undefined,
) {
    if (localError) return localError;
    if (Array.isArray(externalError)) return externalError[0];
    return externalError;
}

export function GoogleIcon() {
    return (
        <svg className="h-[27px] w-[27px]" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C4 20.54 7.7 23 12 23z"
            />
            <path
                fill="#FBBC05"
                d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
            />
            <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 4 3.46 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
        </svg>
    );
}

function PasswordField({
    value,
    onChange,
    placeholder,
    autoComplete,
    error,
    autoFocus = false,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    autoComplete: string;
    error?: string;
    autoFocus?: boolean;
}) {
    const [show, setShow] = useState(false);

    return (
        <div className="relative">
            <input
                data-modal-autofocus={autoFocus || undefined}
                type={show ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                autoComplete={autoComplete}
                required
                className={cn(inputCls, "pr-11", error && errorRing)}
            />
            <button
                type="button"
                onClick={() => setShow((current) => !current)}
                aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
                className="absolute right-[11px] top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[#0d3b2e] transition-colors hover:text-[#15678D]"
            >
                {show ? (
                    <EyeOff className="h-[15px] w-[15px]" />
                ) : (
                    <Eye className="h-[15px] w-[15px]" />
                )}
            </button>
        </div>
    );
}

function ContinueWithGoogle({ returnTo }: { returnTo: string }) {
    return (
        <div className="flex flex-col items-center">
            <p className="font-bdo text-[13px] font-normal leading-none text-[#a6a6a6] [@media(max-height:760px)]:lg:text-[12px]">
                or continue with
            </p>
            <button
                type="button"
                onClick={() => {
                    const encodedReturnTo = encodeURIComponent(returnTo);
                    window.location.href = `/auth/google?return_to=${encodedReturnTo}`;
                }}
                aria-label="Continue with Google"
                className="mt-[15px] flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white shadow-[0_8px_20px_rgba(0,34,68,0.08)] ring-1 ring-black/5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-[0_12px_28px_rgba(0,34,68,0.12)] [@media(max-height:760px)]:lg:mt-[10px] [@media(max-height:760px)]:lg:h-[32px] [@media(max-height:760px)]:lg:w-[32px]"
            >
                <GoogleIcon />
            </button>
        </div>
    );
}

function LoginForm({
    returnTo,
    notice,
    externalErrors,
    onForgotPassword,
    onAuthenticated,
}: {
    returnTo: string;
    notice?: string | null;
    externalErrors?: AuthFieldErrors;
    onForgotPassword: () => void;
    onAuthenticated: () => void;
}) {
    const { data, setData, post, processing, errors, reset, transform } = useForm({
        email: "",
        password: "",
        remember: false as boolean,
        return_to: returnTo,
    });
    const emailError = fieldError(errors.email, externalErrors?.email);
    const passwordError = fieldError(errors.password, externalErrors?.password);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        transform((current) => ({
            ...current,
            return_to: returnTo,
        }));
        post(route("login"), {
            preserveScroll: true,
            onSuccess: onAuthenticated,
            onFinish: () => reset("password"),
        });
    };

    return (
        <form
            onSubmit={submit}
            className="mt-[38px] w-full [@media(max-height:860px)]:lg:mt-[34px] [@media(max-height:760px)]:lg:mt-[26px]"
        >
            {notice && (
                <div
                    role="status"
                    className="auth-stagger mb-[17px] rounded-[7px] border border-emerald-600/15 bg-emerald-50 px-3 py-2.5 font-bdo text-[12px] leading-[1.45] text-emerald-800"
                    style={motionDelay(230)}
                >
                    {notice}
                </div>
            )}

            <div className="auth-stagger" style={motionDelay(260)}>
                <label className={labelCls}>Email</label>
                <input
                    data-modal-autofocus
                    type="email"
                    value={data.email}
                    onChange={(e) => setData("email", e.target.value)}
                    placeholder="Masukkan email"
                    autoComplete="username"
                    required
                    className={cn(inputCls, emailError && errorRing)}
                />
                <InputError message={emailError} className="mt-1 text-[11px]" />
            </div>

            <div
                className="auth-stagger mt-[17px] [@media(max-height:760px)]:lg:mt-[12px]"
                style={motionDelay(320)}
            >
                <label className={labelCls}>Password</label>
                <PasswordField
                    value={data.password}
                    onChange={(value) => setData("password", value)}
                    placeholder="Masukkan password"
                    autoComplete="current-password"
                    error={passwordError}
                />
                <InputError message={passwordError} className="mt-1 text-[11px]" />
            </div>

            <div
                className="auth-stagger mt-[12px] flex items-center justify-between [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(370)}
            >
                <label className="flex cursor-pointer items-center gap-[9px]">
                    <input
                        type="checkbox"
                        checked={data.remember}
                        onChange={(e) => setData("remember", e.target.checked)}
                        className="h-[13px] w-[13px] rounded-[4px] border border-[#1f2937] bg-white text-[#15678D] focus:ring-[#15678D]/30"
                    />
                    <span className="font-bdo text-[12px] font-normal leading-none text-[#555555]">
                        Ingat saya
                    </span>
                </label>
                <button
                    type="button"
                    onClick={onForgotPassword}
                    className="font-bdo text-[12px] font-medium leading-none text-[#244669] transition-colors hover:text-red-600"
                >
                    Lupa Password?
                </button>
            </div>

            <button
                type="submit"
                disabled={processing}
                className="auth-stagger mt-[34px] flex h-[48px] w-full items-center justify-center rounded-[11px] bg-gradient-to-r from-[#002244] to-[#15678D] font-bdo text-[15px] font-medium text-white shadow-[0_14px_24px_rgba(0,34,68,0.24)] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(0,34,68,0.28)] hover:opacity-95 disabled:translate-y-0 disabled:opacity-60 [@media(max-height:860px)]:lg:mt-[30px] [@media(max-height:760px)]:lg:mt-[22px] [@media(max-height:760px)]:lg:h-[41px] [@media(max-height:760px)]:lg:text-[14px]"
                style={motionDelay(420)}
            >
                {processing ? "Memproses..." : "Masuk"}
            </button>

            <div
                className="auth-stagger mt-[24px] [@media(max-height:860px)]:lg:mt-[20px] [@media(max-height:760px)]:lg:mt-[14px]"
                style={motionDelay(480)}
            >
                <ContinueWithGoogle returnTo={returnTo} />
            </div>
        </form>
    );
}

function RegisterForm({
    returnTo,
    onAuthenticated,
}: {
    returnTo: string;
    onAuthenticated: () => void;
}) {
    const { data, setData, transform, post, processing, errors, reset } =
        useForm({
            first_name: "",
            last_name: "",
            name: "",
            email: "",
            phone_number: "",
            password: "",
            password_confirmation: "",
            return_to: returnTo,
        });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const fullName = [data.first_name, data.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();

        transform((current) => ({
            ...current,
            name: fullName,
            password_confirmation: current.password,
            return_to: returnTo,
        }));
        post(route("register"), {
            preserveScroll: true,
            onSuccess: onAuthenticated,
            onFinish: () => reset("password", "password_confirmation"),
        });
    };

    return (
        <form
            onSubmit={submit}
            className="mt-[24px] w-full [@media(max-height:860px)]:lg:mt-[18px] [@media(max-height:760px)]:lg:mt-[13px]"
        >
            <div
                className="auth-stagger grid grid-cols-1 gap-[13px] sm:grid-cols-2 sm:gap-[22px] [@media(max-height:760px)]:lg:gap-[16px]"
                style={motionDelay(250)}
            >
                <div>
                    <label className={labelCls}>Nama Depan</label>
                    <input
                        data-modal-autofocus
                        type="text"
                        value={data.first_name}
                        onChange={(e) => setData("first_name", e.target.value)}
                        placeholder="Nama Depan"
                        autoComplete="given-name"
                        required
                        className={cn(inputCls, errors.name && errorRing)}
                    />
                </div>
                <div>
                    <label className={labelCls}>Nama Belakang</label>
                    <input
                        type="text"
                        value={data.last_name}
                        onChange={(e) => setData("last_name", e.target.value)}
                        placeholder="Nama Belakang"
                        autoComplete="family-name"
                        className={cn(inputCls, errors.name && errorRing)}
                    />
                </div>
            </div>
            <InputError message={errors.name} className="mt-1 text-[11px]" />

            <div
                className="auth-stagger mt-[14px] [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(310)}
            >
                <label className={labelCls}>Email</label>
                <input
                    type="email"
                    value={data.email}
                    onChange={(e) => setData("email", e.target.value)}
                    placeholder="Masukkan email"
                    autoComplete="username"
                    required
                    className={cn(inputCls, errors.email && errorRing)}
                />
                <InputError message={errors.email} className="mt-1 text-[11px]" />
            </div>

            <div
                className="auth-stagger mt-[14px] [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(360)}
            >
                <label className={labelCls}>No. Handphone</label>
                <input
                    type="tel"
                    value={data.phone_number}
                    onChange={(e) => setData("phone_number", e.target.value)}
                    placeholder="Masukkan nomor handphone"
                    autoComplete="tel"
                    className={cn(inputCls, errors.phone_number && errorRing)}
                />
                <InputError
                    message={errors.phone_number}
                    className="mt-1 text-[11px]"
                />
            </div>

            <div
                className="auth-stagger mt-[14px] [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(410)}
            >
                <label className={labelCls}>Password</label>
                <PasswordField
                    value={data.password}
                    onChange={(value) => {
                        setData("password", value);
                        setData("password_confirmation", value);
                    }}
                    placeholder="Masukkan Password"
                    autoComplete="new-password"
                    error={errors.password}
                />
                <InputError message={errors.password} className="mt-1 text-[11px]" />
            </div>

            <button
                type="submit"
                disabled={processing}
                className="auth-stagger mt-[22px] flex h-[48px] w-full items-center justify-center rounded-[11px] bg-gradient-to-r from-[#002244] to-[#15678D] font-bdo text-[15px] font-medium text-white shadow-[0_14px_24px_rgba(0,34,68,0.24)] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(0,34,68,0.28)] hover:opacity-95 disabled:translate-y-0 disabled:opacity-60 [@media(max-height:860px)]:lg:mt-[18px] [@media(max-height:760px)]:lg:mt-[14px] [@media(max-height:760px)]:lg:h-[41px] [@media(max-height:760px)]:lg:text-[14px]"
                style={motionDelay(460)}
            >
                {processing ? "Memproses..." : "Daftar"}
            </button>

            <div
                className="auth-stagger mt-[18px] [@media(max-height:860px)]:lg:mt-[13px] [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(510)}
            >
                <ContinueWithGoogle returnTo={returnTo} />
            </div>
        </form>
    );
}

function ForgotPasswordForm({
    returnTo,
    onSent,
}: {
    returnTo: string;
    onSent: (email: string) => void;
}) {
    const { data, setData, post, processing, errors } = useForm({
        email: "",
        return_to: returnTo,
    });

    const submit: FormEventHandler = (event) => {
        event.preventDefault();
        post(route("password.email"), {
            preserveScroll: true,
            onSuccess: () => onSent(data.email),
        });
    };

    return (
        <form
            onSubmit={submit}
            className="mt-[38px] w-full [@media(max-height:860px)]:lg:mt-[34px] [@media(max-height:760px)]:lg:mt-[26px]"
        >
            <div className="auth-stagger" style={motionDelay(260)}>
                <label className={labelCls}>Email akun</label>
                <input
                    data-modal-autofocus
                    type="email"
                    value={data.email}
                    onChange={(event) => setData("email", event.target.value)}
                    placeholder="Masukkan email terdaftar"
                    autoComplete="email"
                    required
                    className={cn(inputCls, errors.email && errorRing)}
                />
                <InputError message={errors.email} className="mt-1 text-[11px]" />
            </div>

            <p
                className="auth-stagger mt-[13px] font-bdo text-[11px] leading-[1.5] text-[#777777]"
                style={motionDelay(320)}
            >
                Demi keamanan, kami akan menampilkan pesan yang sama meskipun
                email tidak terdaftar.
            </p>

            <button
                type="submit"
                disabled={processing}
                className="auth-stagger mt-[30px] flex h-[48px] w-full items-center justify-center rounded-[11px] bg-gradient-to-r from-[#002244] to-[#15678D] font-bdo text-[15px] font-medium text-white shadow-[0_14px_24px_rgba(0,34,68,0.24)] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(0,34,68,0.28)] hover:opacity-95 disabled:translate-y-0 disabled:opacity-60 [@media(max-height:760px)]:lg:h-[41px] [@media(max-height:760px)]:lg:text-[14px]"
                style={motionDelay(380)}
            >
                {processing ? "Mengirim..." : "Kirim Link Reset"}
            </button>
        </form>
    );
}

function ForgotPasswordSent({
    email,
    onBackToLogin,
}: {
    email: string;
    onBackToLogin: () => void;
}) {
    return (
        <div className="mt-[34px] w-full">
            <div
                className="auth-stagger rounded-[11px] border border-[#15678D]/12 bg-[#f6fafc] px-5 py-5 text-left"
                style={motionDelay(260)}
            >
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-bdo text-[13px] font-semibold text-[#1f2937]">
                            Periksa kotak masuk Anda
                        </p>
                        <p className="mt-1 break-words font-bdo text-[12px] leading-[1.5] text-[#6b7280]">
                            Jika akun untuk {email || "email tersebut"} tersedia,
                            link penggantian password akan segera dikirim.
                        </p>
                    </div>
                </div>
            </div>

            <button
                type="button"
                onClick={onBackToLogin}
                className="auth-stagger mt-[26px] flex h-[46px] w-full items-center justify-center gap-2 rounded-[11px] border border-[#002244]/10 bg-white font-bdo text-[14px] font-medium text-[#002244] shadow-[0_10px_24px_rgba(0,34,68,0.08)] transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-[#f8fbfc] hover:shadow-[0_14px_28px_rgba(0,34,68,0.12)]"
                style={motionDelay(330)}
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Kembali ke Login
            </button>
        </div>
    );
}

function ResetPasswordForm({
    token,
    email,
    returnTo,
    onRequestNewLink,
}: {
    token: string;
    email: string;
    returnTo: string;
    onRequestNewLink: () => void;
}) {
    const { data, setData, post, processing, errors, reset } = useForm({
        token,
        email,
        password: "",
        password_confirmation: "",
        return_to: returnTo,
    });

    const submit: FormEventHandler = (event) => {
        event.preventDefault();
        post(route("password.store"), {
            preserveScroll: true,
            onFinish: () => reset("password", "password_confirmation"),
        });
    };

    if (!token || !email) {
        return (
            <div className="mt-[30px] w-full">
                <div
                    role="alert"
                    className="auth-stagger rounded-[11px] border border-amber-700/15 bg-amber-50 px-5 py-5 text-left"
                    style={motionDelay(250)}
                >
                    <p className="font-bdo text-[13px] font-semibold text-amber-950">
                        Link reset tidak lengkap
                    </p>
                    <p className="mt-1 font-bdo text-[12px] leading-[1.5] text-amber-900/70">
                        Demi keamanan akun, minta link baru lalu buka tautan
                        terbaru dari email Anda.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onRequestNewLink}
                    className="auth-stagger mt-[24px] flex h-[46px] w-full items-center justify-center rounded-[11px] bg-gradient-to-r from-[#002244] to-[#15678D] font-bdo text-[14px] font-medium text-white shadow-[0_14px_24px_rgba(0,34,68,0.20)] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(0,34,68,0.25)] hover:opacity-95"
                    style={motionDelay(320)}
                >
                    Minta Link Reset Baru
                </button>
            </div>
        );
    }

    return (
        <form
            onSubmit={submit}
            className="mt-[26px] w-full [@media(max-height:760px)]:lg:mt-[18px]"
        >
            <div className="auth-stagger" style={motionDelay(250)}>
                <label className={labelCls}>Email akun</label>
                <input
                    type="email"
                    value={data.email}
                    readOnly
                    autoComplete="username"
                    className={cn(
                        inputCls,
                        "cursor-default bg-[#f1f4f5] text-[#586166]",
                        errors.email && errorRing,
                    )}
                />
                <InputError message={errors.email} className="mt-1 text-[11px]" />
            </div>

            <div
                className="auth-stagger mt-[14px] [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(310)}
            >
                <label className={labelCls}>Password baru</label>
                <PasswordField
                    value={data.password}
                    onChange={(value) => setData("password", value)}
                    placeholder="Masukkan password baru"
                    autoComplete="new-password"
                    error={errors.password}
                    autoFocus
                />
                <InputError message={errors.password} className="mt-1 text-[11px]" />
            </div>

            <div
                className="auth-stagger mt-[14px] [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(370)}
            >
                <label className={labelCls}>Konfirmasi password</label>
                <PasswordField
                    value={data.password_confirmation}
                    onChange={(value) =>
                        setData("password_confirmation", value)
                    }
                    placeholder="Ulangi password baru"
                    autoComplete="new-password"
                    error={errors.password_confirmation}
                />
                <InputError
                    message={errors.password_confirmation}
                    className="mt-1 text-[11px]"
                />
            </div>

            <button
                type="submit"
                disabled={processing || !token || !email}
                className="auth-stagger mt-[24px] flex h-[48px] w-full items-center justify-center rounded-[11px] bg-gradient-to-r from-[#002244] to-[#15678D] font-bdo text-[15px] font-medium text-white shadow-[0_14px_24px_rgba(0,34,68,0.24)] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(0,34,68,0.28)] hover:opacity-95 disabled:translate-y-0 disabled:opacity-60 [@media(max-height:760px)]:lg:h-[41px] [@media(max-height:760px)]:lg:text-[14px]"
                style={motionDelay(430)}
            >
                {processing ? "Menyimpan..." : "Simpan Password Baru"}
            </button>
        </form>
    );
}

function AuthCopy({
    view,
    onSelectView,
    headingId,
}: {
    view: AuthView;
    onSelectView: (view: AuthView) => void;
    headingId: string;
}) {
    const copy: Record<
        AuthView,
        { heading: string; prefix: string; action?: string; actionView?: AuthView }
    > = {
        login: {
            heading: "Selamat Datang Kembali, Silahkan Masuk Ke Akun Anda",
            prefix: "Jika kamu belum memiliki akun ",
            action: "Daftar disini !",
            actionView: "register",
        },
        register: {
            heading: "Selamat Datang, Silahkan Buat Akun Sport Center Anda",
            prefix: "Jika kamu sudah memiliki akun ",
            action: "Masuk disini !",
            actionView: "login",
        },
        forgot: {
            heading: "Pulihkan Akses Ke Akun Sport Center Anda",
            prefix: "Ingat kembali password Anda? ",
            action: "Masuk disini !",
            actionView: "login",
        },
        "forgot-sent": {
            heading: "Instruksi Pemulihan Sedang Menuju Email Anda",
            prefix: "Link reset memiliki batas waktu demi keamanan akun.",
        },
        reset: {
            heading: "Buat Password Baru Untuk Akun Anda",
            prefix: "Ingin kembali tanpa mengganti password? ",
            action: "Masuk disini !",
            actionView: "login",
        },
    };
    const currentCopy = copy[view];

    return (
        <>
            <img
                src={brandLogo}
                alt="UB Sport Center"
                className="auth-stagger mx-auto h-[43px] w-[86px] object-contain [@media(max-height:760px)]:lg:h-[35px] [@media(max-height:760px)]:lg:w-[72px]"
                style={motionDelay(80)}
            />
            <h1
                id={headingId}
                className="auth-stagger section-two-headline-weight mt-[23px] max-w-[420px] font-bdo text-[23px] font-semibold leading-[1.16] tracking-[-0.058em] text-black [@media(max-height:860px)]:lg:mt-[19px] [@media(max-height:760px)]:lg:mt-[14px] [@media(max-height:760px)]:lg:text-[20px]"
                style={motionDelay(140)}
            >
                {currentCopy.heading}
            </h1>
            <p
                className="auth-stagger mt-[9px] font-bdo text-[14px] font-normal leading-none text-[#777777] [@media(max-height:760px)]:lg:text-[12px]"
                style={motionDelay(200)}
            >
                {currentCopy.prefix}
                {currentCopy.action && currentCopy.actionView && (
                    <button
                        type="button"
                        onClick={() => onSelectView(currentCopy.actionView!)}
                        className="font-semibold text-red-600 transition-colors hover:text-red-700"
                    >
                        {currentCopy.action}
                    </button>
                )}
            </p>
        </>
    );
}

export default function AuthModal({
    open,
    initialView,
    initialTab = "login",
    returnTo,
    resetToken = "",
    resetEmail = "",
    notice,
    externalErrors,
    onClose,
    stacked = false,
}: Props) {
    const requestedInitialView = initialView ?? initialTab;
    const [view, setView] = useState<AuthView>(requestedInitialView);
    const [recoveryEmail, setRecoveryEmail] = useState("");
    const [animationSettled, setAnimationSettled] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const headingId = useId();
    const resolvedReturnTo = returnTo || currentReturnPath();
    useModalFocusTrap(dialogRef, open);

    /**
     * openCount increments each time the modal opens.
     * Used as part of the form-flow key so that every open
     * remounts the form content → CSS entrance animations replay.
     */
    const [openCount, setOpenCount] = useState(0);

    useLayoutEffect(() => {
        if (!open) return;
        setView(requestedInitialView);
        setRecoveryEmail("");
    }, [open, requestedInitialView]);

    useEffect(() => {
        if (!open) return;
        const frame = window.requestAnimationFrame(() => {
            dialogRef.current
                ?.querySelector<HTMLElement>("[data-modal-autofocus]")
                ?.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [open, view]);

    // Track each open so stagger animations replay
    useEffect(() => {
        if (open) {
            setOpenCount((c) => c + 1);
            setAnimationSettled(false);
        } else {
            setAnimationSettled(false);
        }
    }, [open]);

    // ESC to close
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // Lock body scroll while open
    useEffect(() => {
        if (!open) return;

        const scrollY = window.scrollY;
        const prev = {
            position: document.body.style.position,
            top: document.body.style.top,
            left: document.body.style.left,
            right: document.body.style.right,
            width: document.body.style.width,
            overflow: document.body.style.overflow,
        };
        const prevHtmlOverflow = document.documentElement.style.overflow;

        document.documentElement.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = "0";
        document.body.style.right = "0";
        document.body.style.width = "100%";
        document.body.style.overflow = "hidden";

        return () => {
            document.documentElement.style.overflow = prevHtmlOverflow;
            document.body.style.position = prev.position;
            document.body.style.top = prev.top;
            document.body.style.left = prev.left;
            document.body.style.right = prev.right;
            document.body.style.width = prev.width;
            document.body.style.overflow = prev.overflow;
            window.scrollTo(0, scrollY);
        };
    }, [open]);

    return (
        /* Outer wrapper: only manages visibility & pointer-events.
           duration-150 gives a clean, quick fade-out on close.
           The premium entrance is handled by auth-modal.css.     */
        <div
            aria-hidden={!open}
            className={cn(
                "fixed inset-0 flex items-center justify-center overflow-hidden px-3 py-4 transition-opacity duration-150",
                stacked ? "z-[100010]" : "z-[200]",
                open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
        >
            {/* Backdrop */}
            <div
                aria-hidden="true"
                className={cn("absolute inset-0 bg-black/10", open && "auth-modal-backdrop-open")}
                onClick={onClose}
            />

            {/* Modal card
                NOTE: transition-transform and the translate/scale conditional
                have been removed — auth-modal.css owns all card transforms. */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
                tabIndex={-1}
                className={cn(
                    "relative z-10 flex max-h-[calc(100dvh_-_32px)] w-full max-w-[520px] flex-col overflow-hidden rounded-none bg-white shadow-[0_28px_80px_rgba(0,0,0,0.45)] lg:aspect-[1220/763] lg:h-auto lg:max-h-none lg:w-[min(1220px,calc(100vw_-_72px),calc((100dvh_-_72px)*1.599))] lg:max-w-none lg:flex-row xl:w-[min(1220px,calc(100vw_-_96px),calc((100dvh_-_72px)*1.599))] [@media(max-height:760px)]:lg:w-[min(1126px,calc(100vw_-_56px),calc((100dvh_-_56px)*1.599))]",
                    open && "auth-modal-open",
                    animationSettled && "auth-modal-settled",
                )}
                onAnimationEnd={(event) => {
                    if (event.currentTarget === event.target) {
                        setAnimationSettled(true);
                    }
                }}
            >
                <AuthVisualPanel active={open} />

                <section
                    data-lenis-prevent
                    className="auth-form-panel auth-form-scroll relative flex min-h-0 min-w-0 flex-1 justify-center overflow-y-auto overscroll-contain px-6 py-8 sm:px-10 lg:items-center lg:px-[46px] lg:py-[38px] xl:px-[50px] [@media(max-height:760px)]:lg:py-[24px]"
                >
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup modal"
                        className="auth-close absolute right-5 top-5 z-10 flex h-[25px] w-[25px] items-center justify-center rounded-full bg-white/90 text-[#4c585b] shadow-[0_8px_22px_rgba(0,34,68,0.10)] ring-1 ring-black/5 transition-[transform,background-color,color,box-shadow] duration-200 hover:scale-105 hover:bg-white hover:text-black hover:shadow-[0_10px_26px_rgba(0,34,68,0.16)] lg:right-[27px] lg:top-[25px]"
                    >
                        <X className="h-[17px] w-[17px]" />
                    </button>

                    <div className="auth-modal-content relative z-[1] my-auto w-full max-w-[430px] py-8 sm:py-10 lg:max-w-none lg:py-0">
                        {/*
                         * key = view + openCount
                         * · Changes on flow switch → form remounts → stagger replays
                         * · Changes on every open  → stagger replays fresh each time
                         */}
                        <div key={`${view}-${openCount}`} className="auth-modal-form-flow">
                            <AuthCopy
                                view={view}
                                headingId={headingId}
                                onSelectView={setView}
                            />
                            {view === "login" && (
                                <LoginForm
                                    returnTo={resolvedReturnTo}
                                    notice={notice}
                                    externalErrors={externalErrors}
                                    onForgotPassword={() => setView("forgot")}
                                    onAuthenticated={onClose}
                                />
                            )}
                            {view === "register" && (
                                <RegisterForm
                                    returnTo={resolvedReturnTo}
                                    onAuthenticated={onClose}
                                />
                            )}
                            {view === "forgot" && (
                                <ForgotPasswordForm
                                    returnTo={resolvedReturnTo}
                                    onSent={(email) => {
                                        setRecoveryEmail(email);
                                        setView("forgot-sent");
                                    }}
                                />
                            )}
                            {view === "forgot-sent" && (
                                <ForgotPasswordSent
                                    email={recoveryEmail}
                                    onBackToLogin={() => setView("login")}
                                />
                            )}
                            {view === "reset" && (
                                <ResetPasswordForm
                                    token={resetToken}
                                    email={resetEmail}
                                    returnTo={resolvedReturnTo}
                                    onRequestNewLink={() => setView("forgot")}
                                />
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
