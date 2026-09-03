import { Head } from '@inertiajs/react';
import { Passkeys } from '@laravel/passkeys';
import axios from 'axios';
import {
    ArrowRight,
    Check,
    Copy,
    Download,
    KeyRound,
    LifeBuoy,
    LockKeyhole,
    ShieldCheck,
    Smartphone,
    X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type MfaMode = 'enroll' | 'challenge';
type MfaMethod = 'passkey' | 'totp' | 'recovery';

interface MfaProps {
    mode: MfaMode;
    staffName: string;
    csrfToken: string;
    preauthRemainingSeconds: number;
    passkeyEnabled: boolean;
    totpEnabled: boolean;
    recoveryCodes?: string[];
    recovery_codes_version?: number | null;
}

interface ActionResponse {
    redirect?: string;
    recoveryCodes?: string[];
    recovery_codes?: string[];
    recovery_codes_version?: number | null;
    secondary_totp_enabled?: boolean;
}

interface TotpOptionsResponse extends ActionResponse {
    secret?: string;
    qrCode?: string;
    qr_code?: string;
    qrCodeSvg?: string;
    qr_code_svg?: string;
    otpauthUri?: string;
    otpauth_uri?: string;
}

const ROUTES = {
    passkeyRegisterOptions: '/ubsc-staff/mfa/passkey/register/options',
    passkeyRegister: '/ubsc-staff/mfa/passkey/register',
    passkeyVerifyOptions: '/ubsc-staff/mfa/passkey/verify/options',
    passkeyVerify: '/ubsc-staff/mfa/passkey/verify',
    totpOptions: '/ubsc-staff/mfa/totp/options',
    totpEnroll: '/ubsc-staff/mfa/totp/enroll',
    totpVerify: '/ubsc-staff/mfa/totp/verify',
    recovery: '/ubsc-staff/mfa/recovery',
    acknowledge: '/ubsc-staff/mfa/recovery-codes/acknowledge',
    cancel: '/ubsc-staff/mfa/cancel',
} as const;

const GENERIC_ERROR =
    'Verifikasi tidak dapat diselesaikan. Periksa kembali data Anda lalu coba lagi.';

const apiPost = async <T,>(url: string, payload: Record<string, unknown> = {}) => {
    const response = await axios.post<T>(url, payload, {
        withCredentials: true,
        withXSRFToken: true,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });

    return response.data;
};

const recoveryCodesFrom = (response: ActionResponse | undefined) =>
    response?.recoveryCodes ?? response?.recovery_codes ?? [];

const recoveryCodesVersionFrom = (response: ActionResponse | undefined) => {
    const version = response?.recovery_codes_version;

    return Number.isInteger(version) && Number(version) > 0
        ? Number(version)
        : null;
};

const continueFrom = (response?: ActionResponse) => {
    if (response?.redirect) {
        window.location.replace(response.redirect);
        return;
    }

    window.location.reload();
};

const suggestedDeviceName = () => {
    if (typeof navigator === 'undefined') return 'Perangkat utama';

    const agent = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(agent)) return 'iPhone atau iPad';
    if (/Macintosh|Mac OS X/i.test(agent)) return 'Mac';
    if (/Android/i.test(agent)) return 'Perangkat Android';
    if (/Windows/i.test(agent)) return 'PC Windows';

    return 'Perangkat utama';
};

const qrImageSource = (options: TotpOptionsResponse | null) => {
    if (!options) return null;

    const value =
        options.qrCodeSvg ?? options.qr_code_svg ?? options.qrCode ?? options.qr_code;

    if (!value) return null;
    if (value.trimStart().startsWith('<svg')) {
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(value)}`;
    }

    return value;
};

function Spinner() {
    return (
        <svg className="mfa-spinner" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M21 12a9 9 0 0 0-9-9" />
        </svg>
    );
}

export default function Mfa({
    mode,
    staffName,
    csrfToken,
    preauthRemainingSeconds,
    passkeyEnabled,
    totpEnabled,
    recoveryCodes = [],
    recovery_codes_version = null,
}: MfaProps) {
    const availableMethods = useMemo<MfaMethod[]>(() => {
        if (mode === 'enroll') return ['passkey', 'totp'];

        const methods: MfaMethod[] = [];
        if (passkeyEnabled) methods.push('passkey');
        if (totpEnabled) methods.push('totp');
        methods.push('recovery');

        return methods;
    }, [mode, passkeyEnabled, totpEnabled]);

    const [method, setMethod] = useState<MfaMethod>(availableMethods[0] ?? 'recovery');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [passkeySupported, setPasskeySupported] = useState(false);
    const [deviceName, setDeviceName] = useState('Perangkat utama');
    const [totpOptions, setTotpOptions] = useState<TotpOptionsResponse | null>(null);
    const [totpCode, setTotpCode] = useState('');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [codes, setCodes] = useState<string[]>(recoveryCodes);
    const [codesVersion, setCodesVersion] = useState<number | null>(
        Number.isInteger(recovery_codes_version) && Number(recovery_codes_version) > 0
            ? Number(recovery_codes_version)
            : null,
    );
    const [passkeyReady, setPasskeyReady] = useState(passkeyEnabled);
    const [secondaryTotpEnabled, setSecondaryTotpEnabled] = useState(totpEnabled);
    const [codesSaved, setCodesSaved] = useState(false);
    const [copied, setCopied] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const showingRecoveryCodes = codes.length > 0;
    const qrSource = qrImageSource(totpOptions);

    useEffect(() => {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
        if (meta) meta.content = csrfToken;
    }, [csrfToken]);

    useEffect(() => {
        const remaining = Math.max(0, preauthRemainingSeconds * 1000);
        const timeout = window.setTimeout(() => {
            Passkeys.cancel();
            setCodes([]);
            setCodesVersion(null);
            window.location.replace('/ubsc-staff/login');
        }, remaining + 250);

        return () => window.clearTimeout(timeout);
    }, [preauthRemainingSeconds]);

    useEffect(() => {
        const supported = Passkeys.isSupported() && window.isSecureContext;
        setPasskeySupported(supported);
        setDeviceName(suggestedDeviceName());

        if (!supported) {
            setMethod((current) => {
                if (current !== 'passkey') return current;

                return availableMethods.find((candidate) => candidate !== 'passkey')
                    ?? current;
            });
        }
    }, [availableMethods]);

    useEffect(() => {
        setError('');
        setNotice('');
        const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
        return () => window.clearTimeout(timer);
    }, [method]);

    const safelyRun = async (action: () => Promise<void>) => {
        if (busy) return;

        setBusy(true);
        setError('');
        setNotice('');

        try {
            await action();
        } catch (reason) {
            const redirect = axios.isAxiosError(reason)
                ? reason.response?.data?.redirect
                : null;

            if (typeof redirect === 'string' && redirect.startsWith('/')) {
                Passkeys.cancel();
                setCodes([]);
                setCodesVersion(null);
                window.location.replace(redirect);
                return;
            }

            setError(GENERIC_ERROR);
        } finally {
            setBusy(false);
        }
    };

    const receiveCompletion = (response?: ActionResponse) => {
        const nextCodes = recoveryCodesFrom(response);
        if (nextCodes.length > 0) {
            const nextVersion = recoveryCodesVersionFrom(response);

            if (nextVersion === null) {
                setCodes([]);
                setCodesVersion(null);
                setError(GENERIC_ERROR);
                return;
            }

            setCodes(nextCodes);
            setCodesVersion(nextVersion);
            setCodesSaved(false);
            return;
        }

        continueFrom(response);
    };

    const handlePasskey = () =>
        safelyRun(async () => {
            if (!Passkeys.isSupported()) {
                setError(
                    'Passkey tidak tersedia pada browser ini. Gunakan aplikasi authenticator atau kode pemulihan.',
                );
                return;
            }

            if (mode === 'enroll') {
                const response = (await Passkeys.register({
                    name: deviceName.trim() || suggestedDeviceName(),
                    routes: {
                        options: ROUTES.passkeyRegisterOptions,
                        submit: ROUTES.passkeyRegister,
                    },
                })) as ActionResponse;
                setPasskeyReady(true);
                receiveCompletion(response);
                return;
            }

            const response = (await Passkeys.verify({
                routes: {
                    options: ROUTES.passkeyVerifyOptions,
                    submit: ROUTES.passkeyVerify,
                },
            })) as ActionResponse;
            receiveCompletion(response);
        });

    const prepareTotp = () =>
        safelyRun(async () => {
            const response = await apiPost<TotpOptionsResponse>(ROUTES.totpOptions);
            setTotpOptions(response);
            setNotice('Authenticator siap dipasangkan. Masukkan kode enam digit untuk mengaktifkannya.');
            window.setTimeout(() => inputRef.current?.focus(), 40);
        });

    const submitTotp = (event: FormEvent) => {
        event.preventDefault();
        void safelyRun(async () => {
            const endpoint = mode === 'enroll' ? ROUTES.totpEnroll : ROUTES.totpVerify;
            const response = await apiPost<ActionResponse>(endpoint, {
                code: totpCode.replace(/\s/g, ''),
            });
            receiveCompletion(response);
        });
    };

    const submitSecondaryTotp = (event: FormEvent) => {
        event.preventDefault();
        void safelyRun(async () => {
            const response = await apiPost<ActionResponse>(ROUTES.totpEnroll, {
                code: totpCode.replace(/\s/g, ''),
            });
            const nextCodes = recoveryCodesFrom(response);

            if (nextCodes.length > 0) {
                const nextVersion = recoveryCodesVersionFrom(response);

                if (nextVersion === null) {
                    setCodes([]);
                    setCodesVersion(null);
                    setError(GENERIC_ERROR);
                    return;
                }

                setCodes(nextCodes);
                setCodesVersion(nextVersion);
                setCodesSaved(false);
            }

            setSecondaryTotpEnabled(response.secondary_totp_enabled ?? true);
            setTotpOptions(null);
            setTotpCode('');
            setNotice('Authenticator cadangan aktif. Simpan kode pemulihan lalu lanjutkan.');
        });
    };

    const submitRecovery = (event: FormEvent) => {
        event.preventDefault();
        void safelyRun(async () => {
            const response = await apiPost<ActionResponse>(ROUTES.recovery, {
                code: recoveryCode.trim(),
            });
            receiveCompletion(response);
        });
    };

    const copyCodes = async () => {
        try {
            await navigator.clipboard.writeText(codes.join('\n'));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setError('Kode belum dapat disalin. Unduh atau catat kode secara manual.');
        }
    };

    const downloadCodes = () => {
        const content = [
            'UB Sport Center — kode pemulihan admin',
            'Simpan secara aman. Setiap kode hanya dapat digunakan satu kali.',
            '',
            ...codes,
        ].join('\n');
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'ubsc-admin-recovery-codes.txt';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    const acknowledgeCodes = () =>
        safelyRun(async () => {
            const response = await apiPost<ActionResponse>(ROUTES.acknowledge, {
                acknowledged: true,
                recovery_codes_version: codesVersion,
            });
            continueFrom(response);
        });

    const cancel = () =>
        safelyRun(async () => {
            const response = await apiPost<ActionResponse>(ROUTES.cancel);
            setCodes([]);
            setCodesVersion(null);
            window.location.replace(response.redirect ?? '/ubsc-staff/login');
        });

    const selectMethod = (next: MfaMethod) => {
        if (busy || showingRecoveryCodes) return;
        Passkeys.cancel();
        setMethod(next);
    };

    return (
        <>
            <Head title={`${mode === 'enroll' ? 'Aktifkan MFA' : 'Verifikasi MFA'} — UBSC`} />

            <style dangerouslySetInnerHTML={{ __html: `
                *, *::before, *::after { box-sizing: border-box; }
                html, body, #app { min-height: 100%; }
                body { margin: 0; }
                button, input { font: inherit; }

                .mfa-page {
                    --mfa-accent: #e35336;
                    --mfa-accent-strong: #c43f28;
                    --mfa-ink: #150605;
                    min-height: 100vh;
                    min-height: 100svh;
                    position: relative;
                    display: grid;
                    grid-template-rows: auto 1fr auto;
                    overflow: hidden;
                    color: #fff;
                    background:
                        radial-gradient(ellipse 64% 54% at 76% 8%, rgba(227,83,54,.46), transparent 66%),
                        radial-gradient(ellipse 56% 60% at 10% 92%, rgba(104,25,18,.7), transparent 68%),
                        linear-gradient(145deg, #120403 0%, #32100c 38%, #711f16 68%, #170504 100%);
                    isolation: isolate;
                }
                .mfa-page::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    z-index: -2;
                    opacity: .32;
                    background-image:
                        linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px);
                    background-size: 66px 66px;
                    mask-image: linear-gradient(to bottom, #000 0%, transparent 86%);
                }
                .mfa-page::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    z-index: -1;
                    pointer-events: none;
                    opacity: .035;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.78' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
                }
                .mfa-orb {
                    position: absolute;
                    right: -11rem;
                    top: 15%;
                    width: 32rem;
                    aspect-ratio: 1;
                    border-radius: 50%;
                    background: radial-gradient(circle, rgba(255,123,93,.18), transparent 66%);
                    filter: blur(12px);
                    pointer-events: none;
                    animation: mfa-breathe 8s ease-in-out infinite;
                }

                .mfa-topbar, .mfa-footer {
                    width: 100%;
                    position: relative;
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 24px clamp(20px, 3vw, 48px);
                }
                .mfa-brand { display: flex; align-items: center; gap: 13px; }
                .mfa-logo { width: auto; height: 38px; object-fit: contain; filter: brightness(0) invert(1); }
                .mfa-brand-rule { width: 1px; height: 22px; background: rgba(255,255,255,.18); }
                .mfa-brand-copy,
                .mfa-top-step,
                .mfa-footer {
                    font-family: 'BDO Grotesk', sans-serif;
                    font-size: 10px;
                    color: rgba(255,255,255,.46);
                    letter-spacing: .08em;
                }
                .mfa-top-step { display: flex; align-items: center; gap: 8px; }
                .mfa-top-step::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #ff856c; box-shadow: 0 0 16px rgba(255,91,63,.8); }

                .mfa-main {
                    position: relative;
                    z-index: 2;
                    display: grid;
                    place-items: center;
                    padding: 12px 20px 24px;
                }
                .mfa-card {
                    width: min(100%, 670px);
                    overflow: hidden;
                    border-radius: 24px;
                    border: 1px solid rgba(255,255,255,.13);
                    background:
                        linear-gradient(145deg, rgba(255,255,255,.105), rgba(255,255,255,.035) 43%, rgba(0,0,0,.2)),
                        rgba(13,4,2,.58);
                    box-shadow: 0 40px 120px rgba(0,0,0,.48), inset 0 1px rgba(255,255,255,.12);
                    backdrop-filter: blur(28px) saturate(1.16);
                    -webkit-backdrop-filter: blur(28px) saturate(1.16);
                    animation: mfa-card-in .8s cubic-bezier(.16,1,.3,1) both;
                }
                .mfa-head {
                    position: relative;
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto;
                    align-items: end;
                    gap: 24px;
                    padding: clamp(26px, 5vw, 42px) clamp(24px, 5vw, 44px) 25px;
                    border-bottom: 1px solid rgba(255,255,255,.08);
                }
                .mfa-kicker {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    margin-bottom: 15px;
                    color: #ff9b86;
                    font: 600 10px/1.2 'BDO Grotesk', sans-serif;
                    letter-spacing: .12em;
                }
                .mfa-title {
                    max-width: 510px;
                    margin: 0;
                    font-family: 'Clash Display', sans-serif;
                    font-size: clamp(28px, 5vw, 42px);
                    font-weight: 500;
                    line-height: .98;
                    letter-spacing: -.045em;
                }
                .mfa-intro {
                    margin: 13px 0 0;
                    max-width: 510px;
                    color: rgba(255,255,255,.54);
                    font: 400 13px/1.52 'BDO Grotesk', sans-serif;
                }
                .mfa-staff { color: rgba(255,255,255,.92); font-weight: 600; }
                .mfa-security-mark {
                    width: 50px;
                    height: 50px;
                    display: grid;
                    place-items: center;
                    border-radius: 16px;
                    color: #ffad9b;
                    border: 1px solid rgba(255,255,255,.13);
                    background: rgba(255,255,255,.065);
                    box-shadow: inset 0 1px rgba(255,255,255,.1), 0 14px 32px rgba(0,0,0,.2);
                }

                .mfa-body { padding: 22px clamp(24px, 5vw, 44px) clamp(26px, 5vw, 40px); }
                .mfa-methods {
                    display: grid;
                    grid-template-columns: repeat(var(--method-count), minmax(0, 1fr));
                    gap: 6px;
                    padding: 5px;
                    margin-bottom: 24px;
                    border-radius: 16px;
                    background: rgba(255,255,255,.055);
                    border: 1px solid rgba(255,255,255,.075);
                }
                .mfa-method {
                    min-height: 43px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 9px 12px;
                    border: 0;
                    border-radius: 11px;
                    color: rgba(255,255,255,.46);
                    background: transparent;
                    cursor: pointer;
                    font: 500 12px/1.2 'BDO Grotesk', sans-serif;
                    transition: color .2s, background .2s, box-shadow .2s, transform .2s;
                }
                .mfa-method:hover { color: rgba(255,255,255,.82); }
                .mfa-method[aria-pressed='true'] {
                    color: #fff;
                    background: linear-gradient(135deg, rgba(227,83,54,.94), rgba(150,45,28,.94));
                    box-shadow: 0 8px 24px rgba(134,33,20,.28), inset 0 1px rgba(255,255,255,.18);
                }
                .mfa-method:focus-visible,
                .mfa-button:focus-visible,
                .mfa-text-button:focus-visible,
                .mfa-input:focus-visible,
                .mfa-check input:focus-visible + span {
                    outline: 2px solid rgba(255,180,162,.95);
                    outline-offset: 3px;
                }

                .mfa-panel { animation: mfa-panel-in .34s cubic-bezier(.16,1,.3,1) both; }
                .mfa-panel-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin: 0 0 7px;
                    font: 500 19px/1.15 'Clash Display', sans-serif;
                    letter-spacing: -.015em;
                }
                .mfa-panel-copy {
                    margin: 0 0 20px;
                    max-width: 540px;
                    color: rgba(255,255,255,.48);
                    font: 400 12.5px/1.55 'BDO Grotesk', sans-serif;
                }
                .mfa-field { display: grid; gap: 8px; margin-bottom: 15px; }
                .mfa-label {
                    color: rgba(255,255,255,.58);
                    font: 500 11px/1.2 'BDO Grotesk', sans-serif;
                }
                .mfa-input {
                    width: 100%;
                    min-height: 49px;
                    border: 1px solid rgba(255,255,255,.11);
                    border-radius: 13px;
                    outline: 0;
                    padding: 0 16px;
                    color: #fff;
                    background: rgba(255,255,255,.065);
                    font: 500 14px/1 'BDO Grotesk', sans-serif;
                    transition: border-color .2s, background .2s, box-shadow .2s;
                }
                .mfa-input::placeholder { color: rgba(255,255,255,.24); }
                .mfa-input:focus { border-color: rgba(255,132,106,.68); background: rgba(255,255,255,.09); box-shadow: 0 0 0 3px rgba(227,83,54,.13); }
                .mfa-code-input { letter-spacing: .22em; font-size: 17px; }

                .mfa-button {
                    min-height: 50px;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 0 17px 0 19px;
                    border: 0;
                    border-radius: 13px;
                    color: #fff;
                    background: linear-gradient(135deg, #df5437, #b23924 62%, #8b291b);
                    box-shadow: 0 12px 32px rgba(138,37,22,.34), inset 0 1px rgba(255,255,255,.2);
                    cursor: pointer;
                    font: 600 13px/1 'Clash Display', sans-serif;
                    letter-spacing: .015em;
                    transition: transform .18s, box-shadow .18s, opacity .18s;
                }
                .mfa-button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 16px 40px rgba(138,37,22,.45), inset 0 1px rgba(255,255,255,.22); }
                .mfa-button:active:not(:disabled) { transform: scale(.992); }
                .mfa-button:disabled { cursor: not-allowed; opacity: .52; }
                .mfa-button-content { display: inline-flex; align-items: center; gap: 9px; }
                .mfa-button-secondary {
                    color: rgba(255,255,255,.88);
                    background: rgba(255,255,255,.075);
                    border: 1px solid rgba(255,255,255,.1);
                    box-shadow: inset 0 1px rgba(255,255,255,.08);
                }
                .mfa-note {
                    display: flex;
                    align-items: flex-start;
                    gap: 9px;
                    margin-top: 14px;
                    color: rgba(255,255,255,.35);
                    font: 400 11px/1.5 'BDO Grotesk', sans-serif;
                }
                .mfa-note svg { flex: 0 0 auto; margin-top: 1px; }

                .mfa-alert {
                    display: flex;
                    align-items: flex-start;
                    gap: 9px;
                    margin-bottom: 17px;
                    padding: 11px 13px;
                    border-radius: 12px;
                    font: 500 11.5px/1.45 'BDO Grotesk', sans-serif;
                }
                .mfa-alert-error { color: #ffc1b3; border: 1px solid rgba(255,92,63,.2); background: rgba(176,41,23,.14); }
                .mfa-alert-ok { color: #bdf5d2; border: 1px solid rgba(84,213,138,.18); background: rgba(34,134,77,.13); }

                .mfa-totp-setup {
                    display: grid;
                    grid-template-columns: 126px minmax(0, 1fr);
                    gap: 18px;
                    align-items: center;
                    padding: 16px;
                    margin-bottom: 17px;
                    border-radius: 16px;
                    border: 1px solid rgba(255,255,255,.09);
                    background: rgba(0,0,0,.17);
                }
                .mfa-qr {
                    width: 126px;
                    aspect-ratio: 1;
                    display: grid;
                    place-items: center;
                    padding: 8px;
                    border-radius: 12px;
                    background: #fff;
                }
                .mfa-qr img { width: 100%; height: 100%; object-fit: contain; display: block; }
                .mfa-secret-label { color: rgba(255,255,255,.38); font: 500 10px/1.4 'BDO Grotesk', sans-serif; }
                .mfa-secret {
                    overflow-wrap: anywhere;
                    margin: 7px 0 9px;
                    color: rgba(255,255,255,.9);
                    font: 600 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
                    letter-spacing: .08em;
                }
                .mfa-secret-help { color: rgba(255,255,255,.38); font: 400 11px/1.45 'BDO Grotesk', sans-serif; }

                .mfa-backup {
                    margin: 17px 0 4px;
                    padding: 17px;
                    border-block: 1px solid rgba(255,255,255,.09);
                    background: linear-gradient(90deg, rgba(255,255,255,.035), transparent 78%);
                }
                .mfa-backup-head {
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    gap: 11px;
                    align-items: start;
                    margin-bottom: 14px;
                }
                .mfa-backup-icon {
                    width: 34px;
                    height: 34px;
                    display: grid;
                    place-items: center;
                    border-radius: 10px;
                    color: #ff9c87;
                    background: rgba(227,83,54,.11);
                    border: 1px solid rgba(255,125,98,.15);
                }
                .mfa-backup-title {
                    margin: 1px 0 4px;
                    color: rgba(255,255,255,.9);
                    font: 500 15px/1.2 'Clash Display', sans-serif;
                    letter-spacing: -.01em;
                }
                .mfa-backup-copy {
                    margin: 0;
                    color: rgba(255,255,255,.43);
                    font: 400 11.5px/1.48 'BDO Grotesk', sans-serif;
                }
                .mfa-backup-badge {
                    padding: 6px 8px;
                    border-radius: 999px;
                    color: #ffb09f;
                    background: rgba(227,83,54,.1);
                    border: 1px solid rgba(255,130,104,.16);
                    font: 600 9px/1 'BDO Grotesk', sans-serif;
                    letter-spacing: .05em;
                }
                .mfa-backup .mfa-totp-setup { margin-top: 2px; }
                .mfa-backup-skip {
                    margin: 10px 0 0;
                    color: rgba(255,255,255,.3);
                    font: 400 10.5px/1.45 'BDO Grotesk', sans-serif;
                }

                .mfa-vault {
                    padding: 2px 0 0;
                    animation: mfa-panel-in .35s cubic-bezier(.16,1,.3,1) both;
                }
                .mfa-vault-head { display: flex; gap: 13px; align-items: flex-start; margin-bottom: 20px; }
                .mfa-vault-icon {
                    width: 42px; height: 42px; flex: 0 0 auto;
                    display: grid; place-items: center;
                    border-radius: 13px;
                    color: #ff9c87;
                    background: rgba(227,83,54,.13);
                    border: 1px solid rgba(255,125,98,.17);
                }
                .mfa-vault-title { margin: 0 0 5px; font: 500 20px/1.1 'Clash Display', sans-serif; }
                .mfa-vault-copy { margin: 0; color: rgba(255,255,255,.46); font: 400 12px/1.5 'BDO Grotesk', sans-serif; }
                .mfa-codes {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 1px;
                    overflow: hidden;
                    margin: 0 0 13px;
                    padding: 1px;
                    list-style: none;
                    border-radius: 14px;
                    background: rgba(255,255,255,.1);
                }
                .mfa-code {
                    padding: 12px 14px;
                    color: rgba(255,255,255,.87);
                    background: rgba(13,5,3,.74);
                    text-align: center;
                    font: 600 12px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
                    letter-spacing: .08em;
                }
                .mfa-vault-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
                .mfa-text-button {
                    min-height: 41px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    border-radius: 11px;
                    border: 1px solid rgba(255,255,255,.1);
                    color: rgba(255,255,255,.72);
                    background: rgba(255,255,255,.055);
                    cursor: pointer;
                    font: 500 11.5px/1 'BDO Grotesk', sans-serif;
                    transition: color .2s, background .2s;
                }
                .mfa-text-button:hover { color: #fff; background: rgba(255,255,255,.09); }
                .mfa-check {
                    position: relative;
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    margin: 17px 0 14px;
                    cursor: pointer;
                    color: rgba(255,255,255,.58);
                    font: 400 11.5px/1.45 'BDO Grotesk', sans-serif;
                }
                .mfa-check input { position: absolute; opacity: 0; pointer-events: none; }
                .mfa-check-box {
                    width: 18px; height: 18px; flex: 0 0 auto;
                    display: grid; place-items: center;
                    border-radius: 5px;
                    border: 1px solid rgba(255,255,255,.2);
                    background: rgba(255,255,255,.06);
                    color: transparent;
                    transition: color .18s, background .18s, border-color .18s;
                }
                .mfa-check input:checked + .mfa-check-box { color: #fff; background: #d34b31; border-color: #e3654b; }

                .mfa-cancel {
                    display: block;
                    margin: 17px auto 0;
                    border: 0;
                    padding: 4px 8px;
                    color: rgba(255,255,255,.34);
                    background: transparent;
                    cursor: pointer;
                    font: 500 11px/1.4 'BDO Grotesk', sans-serif;
                    text-decoration: underline;
                    text-decoration-color: rgba(255,255,255,.18);
                    text-underline-offset: 4px;
                }
                .mfa-cancel:hover { color: rgba(255,255,255,.7); }
                .mfa-spinner { width: 17px; height: 17px; fill: none; animation: mfa-spin .7s linear infinite; }
                .mfa-spinner circle { stroke: currentColor; stroke-width: 3; opacity: .2; }
                .mfa-spinner path { stroke: currentColor; stroke-width: 3; stroke-linecap: round; }
                .mfa-footer { align-items: flex-end; font-size: 9px; color: rgba(255,255,255,.25); }

                @keyframes mfa-spin { to { transform: rotate(360deg); } }
                @keyframes mfa-breathe { 50% { transform: translate(-2rem, 1rem) scale(1.08); opacity: .76; } }
                @keyframes mfa-card-in { from { opacity: 0; transform: translateY(24px) scale(.975); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
                @keyframes mfa-panel-in { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }

                @media (max-width: 640px) {
                    .mfa-page { overflow: auto; }
                    .mfa-topbar { padding: 19px 18px; }
                    .mfa-logo { height: 33px; }
                    .mfa-brand-copy, .mfa-brand-rule { display: none; }
                    .mfa-top-step { font-size: 9px; }
                    .mfa-main { place-items: start center; padding: 9px 14px 20px; }
                    .mfa-card { border-radius: 20px; }
                    .mfa-head { grid-template-columns: minmax(0, 1fr) auto; gap: 14px; padding: 25px 22px 21px; }
                    .mfa-title { font-size: clamp(28px, 9vw, 36px); }
                    .mfa-intro { font-size: 12px; }
                    .mfa-security-mark { width: 43px; height: 43px; border-radius: 14px; }
                    .mfa-body { padding: 18px 22px 25px; }
                    .mfa-method { flex-direction: column; gap: 4px; min-height: 52px; padding: 7px 5px; font-size: 10px; }
                    .mfa-totp-setup { grid-template-columns: 104px minmax(0, 1fr); gap: 13px; padding: 12px; }
                    .mfa-qr { width: 104px; }
                    .mfa-backup { padding: 15px 0; }
                    .mfa-backup-head { grid-template-columns: auto minmax(0, 1fr); }
                    .mfa-backup-badge { grid-column: 2; justify-self: start; }
                    .mfa-codes { grid-template-columns: 1fr; }
                    .mfa-footer { padding: 0 18px 18px; }
                }
                @media (max-width: 390px) {
                    .mfa-top-step { max-width: 130px; text-align: right; }
                    .mfa-security-mark { display: none; }
                    .mfa-totp-setup { grid-template-columns: 1fr; }
                    .mfa-qr { width: min(150px, 100%); justify-self: center; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .mfa-orb, .mfa-card, .mfa-panel, .mfa-vault, .mfa-spinner { animation: none !important; }
                    .mfa-method, .mfa-button, .mfa-input { transition-duration: .01ms !important; }
                }
            ` }} />

            <div className="mfa-page">
                <div className="mfa-orb" aria-hidden="true" />

                <header className="mfa-topbar">
                    <div className="mfa-brand">
                        <img className="mfa-logo" src="/assets/brand/ubsc-logo-640.webp" alt="UB Sport Center" />
                        <span className="mfa-brand-rule" aria-hidden="true" />
                        <span className="mfa-brand-copy">UBSC secure staff access</span>
                    </div>
                    <span className="mfa-top-step">
                        {showingRecoveryCodes ? 'Simpan kode pemulihan' : mode === 'enroll' ? 'Aktivasi keamanan' : 'Verifikasi identitas'}
                    </span>
                </header>

                <main className="mfa-main">
                    <section className="mfa-card" aria-labelledby="mfa-title">
                        <header className="mfa-head">
                            <div>
                                <div className="mfa-kicker">
                                    <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" />
                                    Akses admin terlindungi
                                </div>
                                <h1 className="mfa-title" id="mfa-title">
                                    {showingRecoveryCodes
                                        ? 'Simpan akses pemulihan Anda'
                                        : mode === 'enroll'
                                          ? 'Aktifkan verifikasi dua langkah'
                                          : 'Konfirmasi identitas Anda'}
                                </h1>
                                <p className="mfa-intro">
                                    <span className="mfa-staff">{staffName}</span>
                                    {showingRecoveryCodes
                                        ? ', kode ini hanya ditampilkan sekali sebelum akses admin dibuka.'
                                        : mode === 'enroll'
                                          ? ', lindungi akun dengan passkey atau aplikasi authenticator sebelum melanjutkan.'
                                          : ', selesaikan satu pemeriksaan singkat untuk membuka ruang kerja admin.'}
                                </p>
                            </div>
                            <div className="mfa-security-mark" aria-hidden="true">
                                <LockKeyhole size={23} strokeWidth={1.55} />
                            </div>
                        </header>

                        <div className="mfa-body">
                            {error && (
                                <div className="mfa-alert mfa-alert-error" role="alert">
                                    <X size={15} strokeWidth={2} aria-hidden="true" />
                                    <span>{error}</span>
                                </div>
                            )}
                            {notice && !error && (
                                <div className="mfa-alert mfa-alert-ok" role="status" aria-live="polite">
                                    <Check size={15} strokeWidth={2} aria-hidden="true" />
                                    <span>{notice}</span>
                                </div>
                            )}

                            {showingRecoveryCodes ? (
                                <div className="mfa-vault">
                                    <div className="mfa-vault-head">
                                        <div className="mfa-vault-icon" aria-hidden="true">
                                            <LifeBuoy size={21} strokeWidth={1.6} />
                                        </div>
                                        <div>
                                            <h2 className="mfa-vault-title">Kode pemulihan satu kali</h2>
                                            <p className="mfa-vault-copy">
                                                Simpan secara offline. Setiap kode langsung hangus setelah digunakan dan tidak dapat ditampilkan kembali.
                                            </p>
                                        </div>
                                    </div>

                                    <ol className="mfa-codes" aria-label="Daftar kode pemulihan">
                                        {codes.map((code) => (
                                            <li className="mfa-code" key={code}>{code}</li>
                                        ))}
                                    </ol>

                                    <div className="mfa-vault-actions">
                                        <button type="button" className="mfa-text-button" onClick={() => void copyCodes()}>
                                            {copied ? <Check size={14} /> : <Copy size={14} />}
                                            {copied ? 'Tersalin' : 'Salin semua'}
                                        </button>
                                        <button type="button" className="mfa-text-button" onClick={downloadCodes}>
                                            <Download size={14} />
                                            Unduh .txt
                                        </button>
                                    </div>

                                    {passkeyReady && !secondaryTotpEnabled && (
                                        <section className="mfa-backup" aria-labelledby="mfa-backup-title">
                                            <div className="mfa-backup-head">
                                                <div className="mfa-backup-icon" aria-hidden="true">
                                                    <Smartphone size={17} strokeWidth={1.7} />
                                                </div>
                                                <div>
                                                    <h2 className="mfa-backup-title" id="mfa-backup-title">
                                                        Tambahkan authenticator cadangan
                                                    </h2>
                                                    <p className="mfa-backup-copy">
                                                        Tetap dapat masuk bila passkey utama sedang tidak tersedia.
                                                    </p>
                                                </div>
                                                <span className="mfa-backup-badge">Direkomendasikan</span>
                                            </div>

                                            {!totpOptions ? (
                                                <button
                                                    type="button"
                                                    className="mfa-button mfa-button-secondary"
                                                    disabled={busy}
                                                    onClick={() => void prepareTotp()}
                                                >
                                                    <span className="mfa-button-content">
                                                        {busy ? <Spinner /> : <Smartphone size={17} strokeWidth={1.7} />}
                                                        {busy ? 'Menyiapkan…' : 'Tambahkan authenticator'}
                                                    </span>
                                                    {!busy && <ArrowRight size={17} strokeWidth={1.7} aria-hidden="true" />}
                                                </button>
                                            ) : (
                                                <form onSubmit={submitSecondaryTotp}>
                                                    <div className="mfa-totp-setup">
                                                        {qrSource ? (
                                                            <div className="mfa-qr">
                                                                <img src={qrSource} alt="Kode QR untuk authenticator cadangan" />
                                                            </div>
                                                        ) : (
                                                            <div className="mfa-qr" aria-hidden="true">
                                                                <Smartphone size={34} color="#222" />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="mfa-secret-label">Tidak dapat memindai? Masukkan kunci ini:</div>
                                                            <div className="mfa-secret">{totpOptions.secret ?? 'Kunci tersedia di QR'}</div>
                                                            <div className="mfa-secret-help">Kode berubah setiap 30 detik. Pastikan waktu perangkat Anda otomatis.</div>
                                                        </div>
                                                    </div>
                                                    <div className="mfa-field">
                                                        <label className="mfa-label" htmlFor="secondary-totp-code">Kode authenticator</label>
                                                        <input
                                                            ref={inputRef}
                                                            id="secondary-totp-code"
                                                            className="mfa-input mfa-code-input"
                                                            value={totpCode}
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            autoComplete="one-time-code"
                                                            maxLength={8}
                                                            placeholder="000000"
                                                            required
                                                            onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ''))}
                                                        />
                                                    </div>
                                                    <button type="submit" className="mfa-button" disabled={busy || totpCode.length < 6}>
                                                        <span className="mfa-button-content">
                                                            {busy ? <Spinner /> : <ShieldCheck size={17} strokeWidth={1.7} />}
                                                            {busy ? 'Memeriksa kode…' : 'Aktifkan authenticator cadangan'}
                                                        </span>
                                                        {!busy && <ArrowRight size={17} strokeWidth={1.7} aria-hidden="true" />}
                                                    </button>
                                                </form>
                                            )}

                                            <p className="mfa-backup-skip">
                                                Opsional — Anda dapat melewati langkah ini dan melanjutkan setelah menyimpan kode pemulihan.
                                            </p>
                                        </section>
                                    )}

                                    <label className="mfa-check">
                                        <input
                                            type="checkbox"
                                            checked={codesSaved}
                                            onChange={(event) => setCodesSaved(event.target.checked)}
                                        />
                                        <span className="mfa-check-box" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
                                        <span>Saya sudah menyimpan kode ini di tempat aman dan memahami setiap kode hanya berlaku satu kali.</span>
                                    </label>

                                    <button
                                        type="button"
                                        className="mfa-button"
                                        disabled={!codesSaved || codesVersion === null || busy}
                                        onClick={() => void acknowledgeCodes()}
                                    >
                                        <span className="mfa-button-content">
                                            {busy ? <Spinner /> : <ShieldCheck size={17} strokeWidth={1.8} />}
                                            {busy ? 'Mengamankan akun…' : 'Selesai dan lanjutkan'}
                                        </span>
                                        {!busy && <ArrowRight size={17} strokeWidth={1.7} aria-hidden="true" />}
                                    </button>
                                    <button type="button" className="mfa-cancel" disabled={busy} onClick={() => void cancel()}>
                                        Batalkan dan kembali ke login
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div
                                        className="mfa-methods"
                                        style={{ '--method-count': availableMethods.length } as React.CSSProperties}
                                        role="group"
                                        aria-label="Metode verifikasi"
                                    >
                                        {availableMethods.includes('passkey') && (
                                            <button type="button" className="mfa-method" aria-pressed={method === 'passkey'} onClick={() => selectMethod('passkey')}>
                                                <KeyRound size={15} strokeWidth={1.8} aria-hidden="true" /> Passkey
                                            </button>
                                        )}
                                        {availableMethods.includes('totp') && (
                                            <button type="button" className="mfa-method" aria-pressed={method === 'totp'} onClick={() => selectMethod('totp')}>
                                                <Smartphone size={15} strokeWidth={1.8} aria-hidden="true" /> Authenticator
                                            </button>
                                        )}
                                        {availableMethods.includes('recovery') && (
                                            <button type="button" className="mfa-method" aria-pressed={method === 'recovery'} onClick={() => selectMethod('recovery')}>
                                                <LifeBuoy size={15} strokeWidth={1.8} aria-hidden="true" /> Pemulihan
                                            </button>
                                        )}
                                    </div>

                                    {method === 'passkey' && (
                                        <div className="mfa-panel" key="passkey">
                                            <h2 className="mfa-panel-title"><KeyRound size={20} strokeWidth={1.6} /> Gunakan passkey</h2>
                                            <p className="mfa-panel-copy">
                                                {mode === 'enroll'
                                                    ? 'Daftarkan sidik jari, pengenal wajah, PIN perangkat, atau security key. Rahasia biometrik tidak pernah dikirim ke UBSC.'
                                                    : 'Gunakan passkey yang telah terdaftar untuk verifikasi yang cepat dan tahan phishing.'}
                                            </p>

                                            {mode === 'enroll' && (
                                                <div className="mfa-field">
                                                    <label className="mfa-label" htmlFor="device-name">Nama perangkat</label>
                                                    <input
                                                        ref={inputRef}
                                                        id="device-name"
                                                        className="mfa-input"
                                                        value={deviceName}
                                                        maxLength={80}
                                                        autoComplete="off"
                                                        onChange={(event) => setDeviceName(event.target.value)}
                                                    />
                                                </div>
                                            )}

                                            <button type="button" className="mfa-button" disabled={busy || !passkeySupported} onClick={() => void handlePasskey()}>
                                                <span className="mfa-button-content">
                                                    {busy ? <Spinner /> : <KeyRound size={17} strokeWidth={1.7} />}
                                                    {busy ? 'Menunggu perangkat…' : mode === 'enroll' ? 'Aktifkan passkey' : 'Verifikasi dengan passkey'}
                                                </span>
                                                {!busy && <ArrowRight size={17} strokeWidth={1.7} aria-hidden="true" />}
                                            </button>
                                            <p className="mfa-note">
                                                <ShieldCheck size={14} strokeWidth={1.7} aria-hidden="true" />
                                                {passkeySupported
                                                    ? 'Direkomendasikan — paling kuat terhadap phishing dan tidak memakai kode yang dapat dicuri.'
                                                    : 'Browser ini belum mendukung passkey. Pilih aplikasi authenticator atau kode pemulihan.'}
                                            </p>
                                        </div>
                                    )}

                                    {method === 'totp' && (
                                        <div className="mfa-panel" key="totp">
                                            <h2 className="mfa-panel-title"><Smartphone size={20} strokeWidth={1.6} /> Aplikasi authenticator</h2>
                                            <p className="mfa-panel-copy">
                                                {mode === 'enroll'
                                                    ? 'Pasangkan Google Authenticator, Microsoft Authenticator, 1Password, atau aplikasi TOTP lain.'
                                                    : 'Masukkan kode aktif dari aplikasi authenticator Anda.'}
                                            </p>

                                            {mode === 'enroll' && !totpOptions ? (
                                                <button type="button" className="mfa-button mfa-button-secondary" disabled={busy} onClick={() => void prepareTotp()}>
                                                    <span className="mfa-button-content">
                                                        {busy ? <Spinner /> : <Smartphone size={17} strokeWidth={1.7} />}
                                                        {busy ? 'Menyiapkan…' : 'Siapkan authenticator'}
                                                    </span>
                                                    {!busy && <ArrowRight size={17} strokeWidth={1.7} />}
                                                </button>
                                            ) : (
                                                <form onSubmit={submitTotp}>
                                                    {mode === 'enroll' && totpOptions && (
                                                        <div className="mfa-totp-setup">
                                                            {qrSource ? (
                                                                <div className="mfa-qr"><img src={qrSource} alt="Kode QR untuk aplikasi authenticator" /></div>
                                                            ) : (
                                                                <div className="mfa-qr" aria-hidden="true"><Smartphone size={34} color="#222" /></div>
                                                            )}
                                                            <div>
                                                                <div className="mfa-secret-label">Tidak dapat memindai? Masukkan kunci ini:</div>
                                                                <div className="mfa-secret">{totpOptions.secret ?? 'Kunci tersedia di QR'}</div>
                                                                <div className="mfa-secret-help">Kode berubah setiap 30 detik. Pastikan waktu perangkat Anda otomatis.</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="mfa-field">
                                                        <label className="mfa-label" htmlFor="totp-code">Kode authenticator</label>
                                                        <input
                                                            ref={inputRef}
                                                            id="totp-code"
                                                            className="mfa-input mfa-code-input"
                                                            value={totpCode}
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            autoComplete="one-time-code"
                                                            maxLength={8}
                                                            placeholder="000000"
                                                            required
                                                            onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ''))}
                                                        />
                                                    </div>
                                                    <button type="submit" className="mfa-button" disabled={busy || totpCode.length < 6}>
                                                        <span className="mfa-button-content">
                                                            {busy ? <Spinner /> : <ShieldCheck size={17} strokeWidth={1.7} />}
                                                            {busy ? 'Memeriksa kode…' : mode === 'enroll' ? 'Aktifkan authenticator' : 'Verifikasi kode'}
                                                        </span>
                                                        {!busy && <ArrowRight size={17} strokeWidth={1.7} />}
                                                    </button>
                                                </form>
                                            )}
                                        </div>
                                    )}

                                    {method === 'recovery' && (
                                        <div className="mfa-panel" key="recovery">
                                            <h2 className="mfa-panel-title"><LifeBuoy size={20} strokeWidth={1.6} /> Gunakan kode pemulihan</h2>
                                            <p className="mfa-panel-copy">
                                                Gunakan salah satu kode yang disimpan saat MFA diaktifkan. Kode akan langsung hangus setelah berhasil digunakan.
                                            </p>
                                            <form onSubmit={submitRecovery}>
                                                <div className="mfa-field">
                                                    <label className="mfa-label" htmlFor="recovery-code">Kode pemulihan</label>
                                                    <input
                                                        ref={inputRef}
                                                        id="recovery-code"
                                                        className="mfa-input mfa-code-input"
                                                        value={recoveryCode}
                                                        autoComplete="one-time-code"
                                                        spellCheck={false}
                                                        required
                                                        placeholder="xxxx-xxxx-xxxx"
                                                        onChange={(event) => setRecoveryCode(event.target.value)}
                                                    />
                                                </div>
                                                <button type="submit" className="mfa-button" disabled={busy || recoveryCode.trim().length < 6}>
                                                    <span className="mfa-button-content">
                                                        {busy ? <Spinner /> : <LifeBuoy size={17} strokeWidth={1.7} />}
                                                        {busy ? 'Memeriksa kode…' : 'Gunakan kode pemulihan'}
                                                    </span>
                                                    {!busy && <ArrowRight size={17} strokeWidth={1.7} />}
                                                </button>
                                            </form>
                                        </div>
                                    )}

                                    <button type="button" className="mfa-cancel" disabled={busy} onClick={() => void cancel()}>
                                        Batalkan dan kembali ke login
                                    </button>
                                </>
                            )}
                        </div>
                    </section>
                </main>

                <footer className="mfa-footer">
                    <span>UB Sport Center · Admin security</span>
                    <span>Protected session</span>
                </footer>
            </div>
        </>
    );
}
