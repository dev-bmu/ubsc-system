import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler, useState, useEffect } from 'react';

interface LoginProps {
    status?: string;
}

// ── Live Clock ────────────────────────────────────────────────────────────────

function LiveClock() {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    const pad  = (n: number) => String(n).padStart(2, '0');
    const h12  = time.getHours() % 12 || 12;
    const ampm = time.getHours() >= 12 ? 'PM' : 'AM';
    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const dateStr = `${MONTHS[time.getMonth()]} ${pad(time.getDate())}, ${time.getFullYear()}`;
    return (
        <div className="u-clock">
            <div className="u-clock-time">{pad(h12)}:{pad(time.getMinutes())}:{pad(time.getSeconds())} {ampm}</div>
            <div className="u-clock-date">{dateStr}</div>
        </div>
    );
}

// ── Eye Icon ──────────────────────────────────────────────────────────────────

function EyeOpen() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
        </svg>
    );
}

function EyeClosed() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
    );
}

// ── Main Login Component ──────────────────────────────────────────────────────

export default function Login({ status }: LoginProps) {
    const { data, setData, post, processing, errors, reset } = useForm({
        email:    '',
        password: '',
        remember: false as boolean,
    });
    const [showPassword, setShowPassword] = useState(false);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('ubsc-staff.login'), { onFinish: () => reset('password') });
    };

    return (
        <>
            <Head title="Staff Portal — UBSC" />

            <style>{`
                *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

                /* ── Page ── */
                .u-page {
                    --terracotta: #e35336;
                    --terracotta-strong: #c93f2b;
                    --terracotta-deep: #7f2419;
                    --terracotta-ink: #2b0b08;
                    --terracotta-soft: #ffb2a3;
                    --terracotta-glow: rgba(227,83,54,0.34);
                    min-height: 100vh; min-height: 100svh;
                    display: flex; flex-direction: column;
                    position: relative; overflow: hidden;
                    background:
                        radial-gradient(ellipse 70% 55% at 68% 16%, rgba(227,83,54,0.54) 0%, transparent 62%),
                        radial-gradient(ellipse 58% 48% at 13% 76%, rgba(127,36,25,0.68) 0%, transparent 56%),
                        radial-gradient(ellipse 78% 60% at 50% 48%, rgba(201,63,43,0.46) 0%, transparent 72%),
                        linear-gradient(175deg, #160504 0%, #3f120d 28%, #8f2e20 56%, #4e1710 78%, #160504 100%);
                }

                /* Film grain */
                .u-grain {
                    position: absolute; inset: 0; pointer-events: none; z-index: 1; opacity: 0.04;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23g)'/%3E%3C/svg%3E");
                    background-size: 180px;
                }

                /* Grid */
                .u-grid {
                    position: absolute; inset: 0; pointer-events: none; z-index: 1;
                    background-image:
                        linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px);
                    background-size: 64px 64px;
                }

                /* Ambient glows */
                .u-glow-a {
                    position: absolute; top: -140px; right: -100px;
                    width: 560px; height: 560px; border-radius: 50%;
                    background: radial-gradient(circle, var(--terracotta-glow) 0%, transparent 65%);
                    pointer-events: none; z-index: 1;
                    animation: uGlowA 7s ease-in-out infinite;
                }
                @keyframes uGlowA {
                    0%,100% { opacity: .7; transform: scale(1)   translateY(0px);   }
                    50%     { opacity: 1;  transform: scale(1.1) translateY(-20px); }
                }
                .u-glow-b {
                    position: absolute; bottom: -120px; left: -80px;
                    width: 440px; height: 440px; border-radius: 50%;
                    background: radial-gradient(circle, rgba(127,36,25,0.46) 0%, transparent 65%);
                    pointer-events: none; z-index: 1;
                    animation: uGlowB 9s ease-in-out 1s infinite;
                }
                @keyframes uGlowB {
                    0%,100% { opacity: .6; transform: scale(1);   }
                    50%     { opacity: .9; transform: scale(1.08); }
                }

                /* ── Top Bar ── */
                .u-topbar {
                    position: relative; z-index: 20;
                    display: flex; align-items: flex-start; justify-content: space-between;
                    padding: 22px 24px; flex-shrink: 0;
                    animation: uSlideDown 0.7s cubic-bezier(0.16,1,0.3,1) both;
                }
                @keyframes uSlideDown {
                    from { opacity: 0; transform: translateY(-20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @media (min-width: 640px)  { .u-topbar { padding: 28px 36px; } }
                @media (min-width: 1024px) { .u-topbar { padding: 32px 48px; } }

                .u-brand { display: flex; align-items: center; gap: 12px; }
                .u-logo-wrap {
                    height: 36px; display: flex; align-items: center;
                    filter: brightness(0) invert(1);
                    opacity: 0.88;
                    transition: opacity 0.2s;
                }
                .u-logo-wrap:hover { opacity: 1; }
                .u-logo-img { height: 100%; width: auto; display: block; object-fit: contain; }

                .u-brand-sep {
                    width: 1px; height: 20px;
                    background: rgba(255,255,255,0.18);
                }
                .u-brand-name {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 10px; font-weight: 700;
                    letter-spacing: 0.2em; text-transform: uppercase;
                    color: rgba(255,255,255,0.5);
                }

                .u-clock { text-align: right; line-height: 1.35; user-select: none;
                    animation: uSlideDown 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s both;
                }
                .u-clock-time {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 11px; letter-spacing: 0.1em; color: rgba(255,255,255,0.52);
                }
                @media (min-width: 640px) { .u-clock-time { font-size: 12px; } }
                .u-clock-date {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 9px; letter-spacing: 0.1em;
                    color: rgba(255,255,255,0.28); margin-top: 2px;
                }

                /* ── Left Sidebar (desktop) ── */
                .u-sidebar {
                    display: none; position: absolute;
                    left: 48px; top: 50%; transform: translateY(-50%);
                    z-index: 20; flex-direction: column; gap: 18px;
                    animation: uFadeLeft 1s cubic-bezier(0.16,1,0.3,1) 0.4s both;
                }
                @keyframes uFadeLeft {
                    from { opacity: 0; transform: translateY(-50%) translateX(-16px); }
                    to   { opacity: 1; transform: translateY(-50%) translateX(0); }
                }
                @media (min-width: 1200px) { .u-sidebar { display: flex; } }
                .u-sidebar-tick { width: 1px; height: 32px; background: rgba(255,255,255,0.12); margin-bottom: 6px; }
                .u-sidebar-item {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 9px; font-weight: 700;
                    letter-spacing: 0.22em; text-transform: uppercase;
                    color: rgba(255,255,255,0.2);
                    transition: color 0.3s;
                }
                .u-sidebar-item:hover { color: rgba(255,255,255,0.45); }

                /* ── Main ── */
                .u-main {
                    position: relative; z-index: 20;
                    flex: 1; display: flex; align-items: center; justify-content: center;
                    padding: 8px 20px 20px;
                }
                @media (min-width: 640px)  { .u-main { padding: 16px 36px 28px; } }
                @media (min-width: 1024px) { .u-main { padding: 0 48px 24px; } }
                @media (min-width: 1200px) { .u-main { justify-content: center; padding-left: 80px; } }
                .u-wrap { width: 100%; max-width: 440px; }

                /* ── Card ── */
                .u-card {
                    position: relative; border-radius: 26px; overflow: hidden;
                    background:
                        linear-gradient(160deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 45%, rgba(0,0,0,0.22) 100%),
                        rgba(12,4,1,0.5);
                    backdrop-filter: blur(32px) saturate(1.2);
                    -webkit-backdrop-filter: blur(32px) saturate(1.2);
                    border: 1px solid rgba(255,255,255,0.12);
                    box-shadow:
                        0 60px 140px rgba(0,0,0,0.6),
                        0 16px 48px rgba(0,0,0,0.4),
                        inset 0 1px 0 rgba(255,255,255,0.11),
                        inset 0 -1px 0 rgba(0,0,0,0.28);
                    animation: uCardIn 1s cubic-bezier(0.16,1,0.3,1) 0.15s both;
                }
                @keyframes uCardIn {
                    from {
                        opacity: 0;
                        transform: translateY(48px) scale(0.95);
                        filter: blur(4px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                        filter: blur(0px);
                    }
                }
                .u-card::before {
                    content: ''; position: absolute;
                    top: 0; left: 12%; right: 12%; height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.24), transparent);
                    z-index: 1;
                }

                /* ── Card Header ── */
                .u-card-hd {
                    padding: 32px 32px 0;
                    animation: uFadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.4s both;
                }
                @media (min-width: 640px) { .u-card-hd { padding: 40px 40px 0; } }
                @keyframes uFadeUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }

                /* Asterisk */
                .u-mark {
                    display: inline-block; margin-bottom: 20px;
                    opacity: 0.72;
                    animation: uMarkSpin 6s ease-in-out infinite 0.8s;
                }
                @keyframes uMarkSpin {
                    0%,100% { transform: scale(1)    rotate(0deg);  opacity: 0.72; }
                    50%     { transform: scale(1.12) rotate(20deg); opacity: 0.95; }
                }

                /* ── SHINY HEADING — signature effect ── */
                .u-heading {
                    font-family: 'Clash Display', sans-serif;
                    font-size: clamp(22px, 4.5vw, 28px);
                    font-weight: 500;
                    line-height: 1.22;
                    letter-spacing: -0.025em;
                    margin-bottom: 10px;
                }
                .u-heading-shiny {
                    /* Shiny shimmer on the first line */
                    display: inline-block;
                    background: linear-gradient(
                        110deg,
                        #fff 0%,
                        #fff 30%,
                        rgba(255,200,140,1) 45%,
                        #fff 55%,
                        #fff 70%,
                        rgba(255,200,140,0.7) 82%,
                        #fff 95%
                    );
                    background-size: 250% auto;
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                    animation: uShinyText 3.5s linear infinite 1.2s;
                }
                @keyframes uShinyText {
                    0%   { background-position: -100% center; }
                    100% { background-position: 250% center; }
                }
                .u-heading-dim {
                    display: block;
                    color: rgba(255,255,255,0.4);
                }

                .u-subtext {
                    font-family: 'BDO Grotesk', sans-serif;
                    font-size: 12.5px; color: rgba(255,255,255,0.3);
                    letter-spacing: 0.02em; line-height: 1.5;
                    margin-bottom: 28px;
                    padding-bottom: 24px;
                    border-bottom: 1px solid rgba(255,255,255,0.07);
                }

                /* ── Card Body ── */
                .u-card-bd {
                    padding: 24px 32px 32px;
                    animation: uFadeUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.55s both;
                }
                @media (min-width: 640px) { .u-card-bd { padding: 28px 40px 40px; } }

                /* ── Alerts ── */
                .u-alert {
                    border-radius: 14px; padding: 13px 16px; margin-bottom: 20px;
                    font-family: 'BDO Grotesk', sans-serif; font-size: 13px; line-height: 1.5;
                    animation: uCardIn 0.4s cubic-bezier(0.16,1,0.3,1) both;
                }
                .u-alert-ok  { background: rgba(34,197,94,0.1);  border: 1px solid rgba(34,197,94,0.2);  color: #86efac; }
                .u-alert-err { background: rgba(239,68,68,0.1);  border: 1px solid rgba(239,68,68,0.22); color: #fca5a5; }

                /* ── Form ── */
                .u-form { display: flex; flex-direction: column; gap: 18px; }

                .u-field { display: flex; flex-direction: column; gap: 7px;
                    animation: uFadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both;
                }
                .u-field:nth-child(1) { animation-delay: 0.65s; }
                .u-field:nth-child(2) { animation-delay: 0.75s; }
                .u-field:nth-child(3) { animation-delay: 0.82s; }
                .u-field:nth-child(4) { animation-delay: 0.88s; }

                .u-label {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 9px; font-weight: 700;
                    letter-spacing: 0.22em; text-transform: uppercase;
                    color: rgba(255,255,255,0.36); display: block;
                }

                /* Input wrapper for eye icon */
                .u-input-wrap { position: relative; display: flex; align-items: center; }

                .u-input {
                    display: block; width: 100%;
                    border-radius: 14px;
                    border: 1px solid rgba(255,255,255,0.1);
                    background: rgba(255,255,255,0.065);
                    padding: 14px 18px;
                    font-family: 'BDO Grotesk', sans-serif;
                    font-size: 14px; color: white;
                    outline: none;
                    transition: border 0.22s, background 0.22s, box-shadow 0.22s;
                    -webkit-appearance: none; appearance: none;
                }
                /* Extra right padding when eye button present */
                .u-input.has-eye { padding-right: 50px; }
                .u-input::placeholder { color: rgba(255,255,255,0.18); }
                .u-input:focus {
                    border-color: rgba(196,85,32,0.65);
                    background: rgba(255,255,255,0.09);
                    box-shadow: 0 0 0 3px rgba(196,85,32,0.18), 0 2px 12px rgba(0,0,0,0.2);
                }
                .u-input:-webkit-autofill,
                .u-input:-webkit-autofill:hover,
                .u-input:-webkit-autofill:focus {
                    -webkit-box-shadow: 0 0 0 999px rgba(22,8,2,0.92) inset;
                    -webkit-text-fill-color: white;
                    caret-color: white;
                    transition: background-color 5000s;
                }

                /* ── Eye Toggle Button ── */
                .u-eye-btn {
                    position: absolute; right: 14px;
                    display: flex; align-items: center; justify-content: center;
                    width: 28px; height: 28px;
                    background: none; border: none; cursor: pointer;
                    color: rgba(255,255,255,0.32);
                    transition: color 0.2s, transform 0.2s;
                    border-radius: 8px;
                    flex-shrink: 0;
                }
                .u-eye-btn:hover { color: rgba(255,255,255,0.7); transform: scale(1.1); }
                .u-eye-btn:active { transform: scale(0.95); }

                /* ── Checkbox ── */
                .u-check-row { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
                .u-checkbox {
                    width: 16px; height: 16px; border-radius: 5px;
                    border: 1px solid rgba(255,255,255,0.22);
                    background: rgba(255,255,255,0.07);
                    accent-color: #C4511F; cursor: pointer; flex-shrink: 0;
                }
                .u-check-label {
                    font-family: 'BDO Grotesk', sans-serif;
                    font-size: 13px; color: rgba(255,255,255,0.37);
                    cursor: pointer; user-select: none;
                }

                /* ── Divider ── */
                .u-divider { height: 1px; background: rgba(255,255,255,0.07); margin: 20px 0; }

                /* ── Submit Button ── */
                .u-btn {
                    position: relative; overflow: hidden; width: 100%;
                    border-radius: 14px; padding: 15px 24px;
                    font-family: 'Clash Display', sans-serif;
                    font-size: 14px; font-weight: 600; letter-spacing: 0.06em;
                    color: white;
                    background: linear-gradient(135deg, #C85820 0%, #9A3D14 60%, #7E2E0E 100%);
                    border: none; cursor: pointer;
                    transition: transform 0.18s, box-shadow 0.18s, opacity 0.18s;
                    box-shadow:
                        0 8px 28px rgba(180,65,18,0.42),
                        0 2px 8px rgba(0,0,0,0.25),
                        inset 0 1px 0 rgba(255,255,255,0.2);
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                }
                /* Sheen sweep */
                .u-btn::before {
                    content: ''; position: absolute; top: 0; bottom: 0; left: -80%; width: 50%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
                    animation: uSheen 3.2s ease-in-out 1s infinite;
                }
                @keyframes uSheen { 0% { left: -80%; } 100% { left: 120%; } }
                .u-btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 14px 38px rgba(180,65,18,0.55), 0 4px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.22);
                }
                .u-btn:active:not(:disabled) { transform: scale(0.985); }
                .u-btn:disabled { opacity: 0.58; cursor: not-allowed; transform: none; }

                .u-spinner { animation: uSpin 0.75s linear infinite; flex-shrink: 0; }
                @keyframes uSpin { to { transform: rotate(360deg); } }

                /* ── Back Link ── */
                .u-back {
                    display: block; text-align: center; margin-top: 22px;
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 9.5px; font-weight: 600;
                    letter-spacing: 0.18em; text-transform: uppercase;
                    color: rgba(255,255,255,0.22); text-decoration: none;
                    transition: color 0.22s;
                    animation: uFadeUp 1s cubic-bezier(0.16,1,0.3,1) 1s both;
                }
                .u-back:hover { color: rgba(255,255,255,0.52); }

                /* ── Footer ── */
                .u-footer {
                    position: relative; z-index: 20;
                    display: flex; justify-content: space-between; align-items: flex-end;
                    padding: 0 24px 20px; flex-shrink: 0;
                    animation: uSlideDown 0.8s cubic-bezier(0.16,1,0.3,1) 0.3s both;
                    /* reuse slideDown but reversed via filter */
                }
                @media (min-width: 640px)  { .u-footer { padding: 0 36px 28px; } }
                @media (min-width: 1024px) { .u-footer { padding: 0 48px 32px; } }
                .u-footer-txt {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 8px; font-weight: 600;
                    letter-spacing: 0.15em; text-transform: uppercase;
                    color: rgba(255,255,255,0.18); line-height: 2;
                }

                /* Mobile tweaks */
                @media (max-width: 639px) {
                    .u-card-hd { padding: 28px 28px 0; }
                    .u-card-bd { padding: 22px 28px 28px; }
                    .u-heading { font-size: 22px; }
                    .u-brand-sep, .u-brand-name { display: none; }
                }
            `}</style>

            <div className="u-page">
                <div className="u-grain"  aria-hidden="true" />
                <div className="u-grid"   aria-hidden="true" />
                <div className="u-glow-a" aria-hidden="true" />
                <div className="u-glow-b" aria-hidden="true" />

                {/* Top Bar */}
                <header className="u-topbar">
                    <div className="u-brand">
                        <div className="u-logo-wrap">
                            <img
                                src="/UBSC PRO.png"
                                alt="UBSC PRO"
                                className="u-logo-img"
                            />
                        </div>
                        <div className="u-brand-sep" aria-hidden="true" />
                        <span className="u-brand-name">UB Sport System</span>
                    </div>
                    <LiveClock />
                </header>

                {/* Left sidebar — desktop decorative */}
                <nav className="u-sidebar" aria-hidden="true">
                    <div className="u-sidebar-tick" />
                    {['Staff Portal', 'Secure Access', 'Admin Area', 'UBSC PRO', 'Private'].map(l => (
                        <span key={l} className="u-sidebar-item">{l}</span>
                    ))}
                </nav>

                {/* Main */}
                <main className="u-main">
                    <div className="u-wrap">
                        <div className="u-card">
                            {/* Header */}
                            <div className="u-card-hd">
                                {/* Asterisk mark */}
                                <div className="u-mark" aria-hidden="true">
                                    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Ball body */}
        <circle cx="17" cy="17" r="15" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5"/>
        {/* Felt seam curves — left arc */}
        <path
            d="M 7 7 C 10 14, 10 20, 7 27"
            stroke="rgba(255,255,255,0.75)"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
        />
        {/* Felt seam curves — right arc */}
        <path
            d="M 27 7 C 24 14, 24 20, 27 27"
            stroke="rgba(255,255,255,0.75)"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
        />
        {/* Inner glow highlight */}
        <ellipse cx="13" cy="12" rx="4" ry="2.5" fill="rgba(255,255,255,0.1)" transform="rotate(-20 13 12)"/>
    </svg>
                                </div>

                                <h1 className="u-heading">
                                    {/* Shiny shimmer on "Sign in to your" */}
                                    <span className="u-heading-shiny text-3xl">Selamat Datang di</span>
                                    <em className="u-heading-dim text-2xl">Portal Pegawai UB Sport Center</em>
                                </h1>

                                <p className="u-subtext">
                                    UBSC PRO — Admin Dashboard &amp; Management System
                                </p>
                            </div>

                            {/* Body */}
                            <div className="u-card-bd">
                                {status    && <div className="u-alert u-alert-ok">{status}</div>}
                                {errors.email && <div className="u-alert u-alert-err">{errors.email}</div>}
                                {errors.password && <div className="u-alert u-alert-err">{errors.password}</div>}

                                <form onSubmit={submit} className="u-form">
                                    {/* Email */}
                                    <div className="u-field">
                                        <label htmlFor="email" className="u-label">Email Address</label>
                                        <div className="u-input-wrap">
                                            <input
                                                id="email"
                                                type="email"
                                                name="email"
                                                value={data.email}
                                                autoComplete="username"
                                                autoFocus
                                                required
                                                onChange={(e) => setData('email', e.target.value)}
                                                className="u-input"
                                                placeholder="your@email.com"
                                            />
                                        </div>
                                    </div>

                                    {/* Password + eye toggle */}
                                    <div className="u-field">
                                        <label htmlFor="password" className="u-label">Password</label>
                                        <div className="u-input-wrap">
                                            <input
                                                id="password"
                                                type={showPassword ? 'text' : 'password'}
                                                name="password"
                                                value={data.password}
                                                autoComplete="current-password"
                                                required
                                                onChange={(e) => setData('password', e.target.value)}
                                                className="u-input has-eye"
                                                placeholder="••••••••••••"
                                            />
                                            <button
                                                type="button"
                                                className="u-eye-btn"
                                                onClick={() => setShowPassword(v => !v)}
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                tabIndex={-1}
                                            >
                                                {showPassword ? <EyeClosed /> : <EyeOpen />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Remember me */}
                                    <div className="u-field">
                                        <div className="u-check-row">
                                            <input
                                                id="remember"
                                                type="checkbox"
                                                checked={data.remember}
                                                onChange={(e) => setData('remember', e.target.checked)}
                                                className="u-checkbox"
                                            />
                                            <label htmlFor="remember" className="u-check-label">
                                                Keep me signed in
                                            </label>
                                        </div>
                                    </div>

                                    <div className="u-divider" aria-hidden="true" />

                                    {/* Submit */}
                                    <div className="u-field">
                                        <button type="submit" disabled={processing} className="u-btn">
                                            {processing ? (
                                                <>
                                                    <svg className="u-spinner" width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }} />
                                                        <path fill="currentColor" style={{ opacity: 0.75 }} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                    </svg>
                                                    Signing in…
                                                </>
                                            ) : 'Masuk →'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <Link href="/" className="u-back">← Kembali ke website</Link>
                    </div>
                </main>

                {/* Footer */}
                <footer className="u-footer">
                    <p className="u-footer-txt">
                        UB Sport Center<br />
                        Staff Access System<br />
                        Secure — Private
                    </p>
                    <p className="u-footer-txt" style={{ textAlign: 'right' }}>
                        © {new Date().getFullYear()} UBSC PRO<br />
                        Admin System
                    </p>
                </footer>
            </div>
        </>
    );
}
