    import { Head, router, useForm, usePage } from "@inertiajs/react";
    import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
    import {
        ArrowRight,
        BadgeCheck,
        CalendarRange,
        ChevronLeft,
        ChevronRight,
        CheckCircle2,
        Clock3,
        Eye,
        History,
        Plus,
        ReceiptText,
        RefreshCw,
        Star,
        Wallet,
        XCircle,
    } from "lucide-react";
    import { type FormEvent, type ReactNode, useMemo, useRef, useState } from "react";
    import DataTable from "@/Components/Admin/DataTable";
    import SlideOver from "@/Components/Admin/SlideOver";
    import AdminLayout from "@/Layouts/AdminLayout";
    import { cn } from "@/lib/utils";
    import type {
        AdminMembership,
        BookingTransaction,
        MembershipStatus,
        PageProps,
        PaymentStatus,
    } from "@/types";

    interface PlanOption {
        id: number;
        name: string;
        price: number;
        duration_months: number;
    }

    type Props = PageProps<{
        memberships: AdminMembership[];
        plans: PlanOption[];
    }>;

    const PAGE_STYLES = `
        @keyframes membershipFadeUp {
            from { opacity: 0; transform: translate3d(0, 18px, 0); }
            to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes membershipShine {
            0% { background-position: -160% center; }
            100% { background-position: 220% center; }
        }
        @keyframes membershipPulseDot {
            0%, 100% { opacity: .78; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.18); }
        }
        @keyframes membershipSweep {
            0% { transform: translateX(-120%); }
            100% { transform: translateX(180%); }
        }
        .membership-enter {
            animation: membershipFadeUp .56s cubic-bezier(.16,1,.3,1) both;
            will-change: transform, opacity;
        }
        .membership-title-shine {
            background: linear-gradient(120deg, #0f172a 35%, #cbd5e1 50%, #0f172a 65%);
            background-size: 200% auto;
            color: transparent;
            -webkit-background-clip: text;
            background-clip: text;
            animation: membershipShine 3s linear infinite;
        }
        .membership-live-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: #E35336;
            box-shadow: 0 0 0 1px rgba(255,255,255,.8), 0 0 14px rgba(227,83,54,.34);
            animation: membershipPulseDot 2.8s ease-in-out infinite;
        }
        .membership-card-glint { position: relative; }
        .membership-card-glint::before {
            content: "";
            position: absolute;
            left: 20px;
            right: 20px;
            top: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,.96), transparent);
            pointer-events: none;
            z-index: 2;
        }
        .membership-sheen { position: relative; overflow: hidden; }
        .membership-sheen::after {
            content: "";
            position: absolute;
            inset-block: 0;
            width: 52%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
            animation: membershipSweep 1.1s ease-out .35s forwards;
            pointer-events: none;
        }
        .membership-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: rgba(227,83,54,.32) transparent;
        }
        .membership-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .membership-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .membership-scrollbar::-webkit-scrollbar-thumb {
            border-radius: 999px;
            background: rgba(227,83,54,.3);
            border: 1px solid rgba(255,255,255,.82);
        }
        @media (prefers-reduced-motion: reduce) {
            .membership-enter,
            .membership-title-shine,
            .membership-live-dot,
            .membership-sheen::after {
                animation: none !important;
                opacity: 1 !important;
                transform: none !important;
            }
        }
    `;

    const inputBase =
        "h-10 w-full rounded-[15px] border border-slate-200 bg-white px-4 font-bdo text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#F8B5A8] focus:ring-4 focus:ring-[#E35336]/10";

    const labelBase =
        "mb-1.5 block font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500";

    const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
        active: "Aktif",
        expired: "Expired",
        cancelled: "Dibatalkan",
    };

    const MEMBERSHIP_STATUS_STYLE: Record<MembershipStatus, string> = {
        active: "border-emerald-200 bg-emerald-50 text-emerald-700",
        expired: "border-[#F8B5A8] bg-[#FFF7F5] text-[#B93D2A]",
        cancelled: "border-slate-200 bg-slate-50 text-slate-500",
    };

    const PAYMENT_STATUS_LABEL: Partial<Record<PaymentStatus, string>> = {
        PAID: "Lunas",
        EXPIRED: "Expired",
        FAILED: "Gagal",
    };

    const PAYMENT_STATUS_STYLE: Partial<Record<PaymentStatus, string>> = {
        PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
        EXPIRED: "border-amber-200 bg-amber-50 text-amber-700",
        FAILED: "border-rose-200 bg-rose-50 text-rose-600",
    };

    const MEMBERSHIP_CATEGORY_LEGEND = [
        {
            value: "warga_ub",
            label: "Warga UB",
            dot: "bg-sky-500",
            style: "border-sky-200 bg-sky-50 text-sky-700",
        },
        {
            value: "umum",
            label: "Umum",
            dot: "bg-emerald-500",
            style: "border-emerald-200 bg-emerald-50 text-emerald-700",
        },
    ] as const;

    function todayStr(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    function formatPrice(amount: number): string {
        return `Rp ${amount.toLocaleString("id-ID")}`;
    }

    function formatDate(dateStr: string): string {
        const [year, month, day] = dateStr.split("-").map(Number);

        return new Date(year, (month ?? 1) - 1, day ?? 1).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    }

    function formatDateDisplay(dateStr: string): string {
        const [year, month, day] = dateStr.split("-").map(Number);

        return new Date(year, (month ?? 1) - 1, day ?? 1).toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
        });
    }

    function shiftDate(dateStr: string, delta: number): string {
        const [year, month, day] = dateStr.split("-").map(Number);
        const date = new Date(year, (month ?? 1) - 1, day ?? 1);
        date.setDate(date.getDate() + delta);

        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function isMembershipActiveOnDate(membership: AdminMembership, dateStr: string): boolean {
        return membership.status === "active" && membership.start_date <= dateStr && membership.end_date >= dateStr;
    }

    function daysBetween(dateA: string, dateB: string): number {
        const [yearA, monthA, dayA] = dateA.split("-").map(Number);
        const [yearB, monthB, dayB] = dateB.split("-").map(Number);
        const a = new Date(yearA, (monthA ?? 1) - 1, dayA ?? 1);
        const b = new Date(yearB, (monthB ?? 1) - 1, dayB ?? 1);

        return Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
    }

    function addMonthsToDateStr(dateStr: string, months: number): string {
        const [year, month, day] = dateStr.split("-").map(Number);
        const date = new Date(year, (month ?? 1) - 1, day ?? 1);
        date.setMonth(date.getMonth() + months);

        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function daysUntil(dateStr: string): number {
        const today = new Date(todayStr());
        const target = new Date(dateStr);

        return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
    }

    function StatusBadge({ status }: { status: MembershipStatus }) {
        return (
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-bdo text-[11px] font-bold", MEMBERSHIP_STATUS_STYLE[status])}>
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                {MEMBERSHIP_STATUS_LABEL[status]}
            </span>
        );
    }

    function PaymentBadge({ tx }: { tx: BookingTransaction | null }) {
        if (!tx) {
            return (
                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-bdo text-[11px] font-bold text-slate-400">
                    Tanpa transaksi
                </span>
            );
        }

        return (
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-bdo text-[11px] font-bold", PAYMENT_STATUS_STYLE[tx.payment_status] ?? "border-slate-200 bg-slate-50 text-slate-500")}>
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                {PAYMENT_STATUS_LABEL[tx.payment_status] ?? "Tercatat"}
            </span>
        );
    }

    function MembershipCommandHero({
        memberships,
        filteredCount,
        plans,
        onCreate,
    }: {
        memberships: AdminMembership[];
        filteredCount: number;
        plans: PlanOption[];
        onCreate: () => void;
    }) {
        const active = memberships.filter((membership) => membership.status === "active").length;
        const expired = memberships.filter((membership) => membership.status === "expired").length;
        const cancelled = memberships.filter((membership) => membership.status === "cancelled").length;
        const expiringSoon = memberships.filter((membership) => membership.status === "active" && daysUntil(membership.end_date) <= 14).length;
        const paidAmount = memberships.reduce((sum, membership) => sum + (membership.transaction?.payment_status === "PAID" ? membership.transaction.amount : 0), 0);
        const activeShare = memberships.length > 0 ? Math.round((active / memberships.length) * 100) : 0;
        const planCount = plans.length;

        return (
            <section className="membership-enter membership-card-glint membership-sheen relative overflow-hidden rounded-[26px] border border-[#FFE0D8] bg-[linear-gradient(135deg,#E35336_0%,#C6422E_48%,#8F2E20_100%)] p-4 text-white shadow-2xl shadow-[#F8B5A8]/35 sm:p-5">
                <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border border-white/18" />
                <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-[#FFD5CD]/20 blur-3xl" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.06)_0,rgba(255,255,255,.06)_1px,transparent_1px,transparent_18px)]" />

                <div className="relative z-10 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.52fr)]">
                    <div className="flex min-w-0 flex-col justify-between gap-5">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/14 px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
                                <span className="membership-live-dot h-1.5 w-1.5 bg-white text-white" />
                                Membership control
                            </span>
                            <h2 className="mt-4 max-w-4xl font-clash text-[2rem] font-bold leading-[.95] tracking-tight sm:text-[2.55rem] xl:text-[3rem]">
                                Kelola masa aktif member dengan alur cepat dan presisi.
                            </h2>
                            <p className="mt-3 max-w-2xl font-bdo text-sm font-semibold leading-6 text-white/78">
                                Pantau anggota aktif, cek masa berlaku, buka detail pembayaran, dan perpanjang membership tanpa meninggalkan tabel.
                            </p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-4">
                            <HeroMetric label="Aktif" value={active} note={`${activeShare}% live`} />
                            <HeroMetric label="Segera habis" value={expiringSoon} note="<= 14 hari" />
                            <HeroMetric label="Paket" value={planCount} note="tersedia" />
                            <HeroMetric label="Revenue paid" value={formatPrice(paidAmount)} note={`${filteredCount} tampil`} compact />
                        </div>
                    </div>

                    <div className="rounded-[24px] border border-white/18 bg-white p-3 text-slate-950 shadow-[0_24px_50px_-36px_rgba(15,23,42,.55)]">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-[#B93D2A]">Status overview</p>
                                <h3 className="mt-1 font-clash text-xl font-semibold leading-tight">Member Lifecycle</h3>
                            </div>
                            <button
                                type="button"
                                onClick={onCreate}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-[15px] bg-[#E35336] px-3 font-clash text-xs font-semibold text-white shadow-[0_14px_24px_-18px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 hover:bg-[#B93D2A]"
                            >
                                <Plus size={14} />
                                Tambah
                            </button>
                        </div>

                        <div className="mt-4 space-y-2.5">
                            <LifecycleRow label="Aktif" value={active} total={memberships.length} color="#10B981" />
                            <LifecycleRow label="Expired" value={expired} total={memberships.length} color="#E35336" />
                            <LifecycleRow label="Batal" value={cancelled} total={memberships.length} color="#64748B" />
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    function HeroMetric({ label, value, note, compact = false }: { label: string; value: string | number; note: string; compact?: boolean }) {
        return (
            <div className="rounded-[18px] border border-white/18 bg-white/12 p-3 backdrop-blur">
                <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-[#FFD5CD]">{label}</p>
                <p className={cn("mt-1 truncate font-clash font-bold text-white", compact ? "text-lg" : "text-2xl")}>{value}</p>
                <p className="mt-0.5 font-bdo text-[10px] font-semibold text-white/62">{note}</p>
            </div>
        );
    }

    function LifecycleRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
        const width = total > 0 ? Math.max(4, Math.round((value / total) * 100)) : 0;

        return (
            <div className="rounded-[16px] border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                    <p className="font-bdo text-[11px] font-bold text-slate-600">{label}</p>
                    <p className="font-clash text-sm font-bold text-slate-950">{value}</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}, #F08C78)` }} />
                </div>
            </div>
        );
    }

    function MembershipBookingStyleControls({
        memberships,
        filteredCount,
        dateStr,
        setDateStr,
        onCreate,
    }: {
        memberships: AdminMembership[];
        filteredCount: number;
        dateStr: string;
        setDateStr: (value: string | ((previous: string) => string)) => void;
        onCreate: () => void;
    }) {
        const datePickerRef = useRef<HTMLInputElement>(null);
        const activeOnDate = memberships.filter((membership) => isMembershipActiveOnDate(membership, dateStr)).length;
        const expiringSoon = memberships.filter((membership) => {
            if (!isMembershipActiveOnDate(membership, dateStr)) return false;
            const days = daysBetween(dateStr, membership.end_date);
            return days >= 0 && days <= 14;
        }).length;
        const expired = memberships.filter((membership) => membership.status === "expired").length;
        return (
            <div className="flex flex-col gap-4">
                <section className="membership-enter membership-card-glint overflow-hidden rounded-[26px] border border-[#FFE0D8] bg-[linear-gradient(135deg,#ffffff_0%,#FFF8F6_62%,#FFF1EE_100%)] p-3 shadow-[0_20px_46px_-38px_rgba(185,61,42,.34)] sm:p-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_54%,#B93D2A_100%)] text-white shadow-[0_16px_26px_-20px_rgba(227,83,54,.95)]">
                                    <BadgeCheck size={18} />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-[#B93D2A]">Ringkasan Membership</p>
                                    <h2 className="font-clash text-base font-semibold leading-tight text-slate-950 sm:text-lg">Status anggota pada tanggal terpilih</h2>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={onCreate}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_54%,#B93D2A_100%)] px-5 font-clash text-sm font-semibold text-white shadow-[0_18px_30px_-24px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 sm:min-w-[190px]"
                            >
                                <Plus size={17} />
                                Tambah Membership
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                            <MembershipMetric icon={<CheckCircle2 size={16} />} value={activeOnDate} label="Aktif" note="berlaku di tanggal ini" tone="emerald" />
                            <MembershipMetric icon={<Clock3 size={16} />} value={expiringSoon} label="Segera habis" note="maksimal 14 hari lagi" tone="amber" />
                            <MembershipMetric icon={<XCircle size={16} />} value={expired} label="Expired" note="masa aktif berakhir" tone="rose" />
                            <MembershipMetric icon={<BadgeCheck size={16} />} value={filteredCount} label="Ditampilkan" note="anggota sesuai tanggal" tone="sky" />
                        </div>
                    </div>
                </section>

                <section className="membership-enter membership-card-glint rounded-[26px] border border-[#FFE0D8] bg-white p-3 shadow-[0_20px_46px_-40px_rgba(185,61,42,.32)] sm:p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex min-w-0 flex-col gap-2">
                            <p className="px-1 font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-[#B93D2A]">Tanggal acuan</p>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="flex w-full items-center gap-1.5 rounded-[18px] border border-[#F8B5A8] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_54%,#B93D2A_100%)] p-1.5 shadow-[0_16px_28px_-22px_rgba(227,83,54,.95)] sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={() => setDateStr((date) => shiftDate(date, -1))}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white/14 text-white shadow-sm ring-1 ring-white/25 transition hover:-translate-y-0.5 hover:bg-white/24 hover:ring-white/45"
                                        aria-label="Hari sebelumnya"
                                    >
                                        <ChevronLeft size={17} />
                                    </button>
                                    <button
                                        type="button"
                                        className="group flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] bg-white px-3 text-center shadow-sm ring-1 ring-white/60 transition hover:-translate-y-0.5 hover:bg-[#FFF7F5] sm:min-w-[230px] sm:px-4"
                                        onClick={() => datePickerRef.current?.showPicker?.()}
                                    >
                                        <CalendarRange size={16} className="shrink-0 text-[#E35336] transition-transform group-hover:scale-110" />
                                        <span className="truncate font-clash text-sm font-semibold text-[#7A2F23]">
                                            {formatDateDisplay(dateStr)}
                                        </span>
                                    </button>
                                    <input
                                        ref={datePickerRef}
                                        type="date"
                                        value={dateStr}
                                        onChange={(event) => {
                                            if (event.target.value) setDateStr(event.target.value);
                                        }}
                                        className="sr-only"
                                        aria-label="Pilih tanggal acuan membership"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setDateStr((date) => shiftDate(date, 1))}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white/14 text-white shadow-sm ring-1 ring-white/25 transition hover:-translate-y-0.5 hover:bg-white/24 hover:ring-white/45"
                                        aria-label="Hari berikutnya"
                                    >
                                        <ChevronRight size={17} />
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDateStr(todayStr())}
                                    className="w-full rounded-[14px] border border-[#F8B5A8] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_54%,#B93D2A_100%)] px-4 py-2.5 font-bdo text-[13px] font-bold uppercase tracking-wide text-white shadow-[0_16px_28px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 hover:brightness-105 sm:w-auto"
                                >
                                    Hari ini
                                </button>
                            </div>
                        </div>

                        <div className="ml-auto flex w-full flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50 p-2 sm:w-auto">
                            <span className="px-1 font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                Tipe
                            </span>
                            <div className="grid grid-cols-2 gap-1.5">
                                {MEMBERSHIP_CATEGORY_LEGEND.map((item) => (
                                    <span key={item.value} className={cn("inline-flex min-h-10 items-center gap-2 rounded-[14px] border px-3 py-2 font-bdo text-[11px] font-bold shadow-sm transition hover:-translate-y-0.5", item.style)}>
                                        <span className={cn("h-2.5 w-2.5 rounded-full shadow-sm ring-2 ring-white", item.dot)} />
                                        {item.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    function MembershipMetric({
        icon,
        value,
        label,
        note,
        tone,
    }: {
        icon: ReactNode;
        value: number;
        label: string;
        note: string;
        tone: "emerald" | "amber" | "rose" | "sky";
    }) {
        const styles = {
            emerald: "border-emerald-200 bg-[linear-gradient(135deg,#ffffff_0%,#ECFDF5_100%)] text-emerald-700",
            amber: "border-amber-200 bg-[linear-gradient(135deg,#ffffff_0%,#FFFBEB_100%)] text-amber-700",
            rose: "border-rose-200 bg-[linear-gradient(135deg,#ffffff_0%,#FFF1F2_100%)] text-rose-600",
            sky: "border-sky-200 bg-[linear-gradient(135deg,#ffffff_0%,#F0F9FF_100%)] text-sky-700",
        }[tone];

        return (
            <article className={cn("flex min-w-0 items-center gap-3 rounded-[18px] border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", styles)}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white shadow-sm ring-1 ring-current/10">
                    {icon}
                </span>
                <span className="min-w-0">
                    <span className="block font-clash text-2xl font-bold leading-none text-slate-950">{value}</span>
                    <span className="mt-1 block truncate font-bdo text-[10px] font-bold uppercase tracking-wide text-current">{label}</span>
                    <span className="mt-0.5 hidden truncate font-bdo text-[10px] font-semibold text-slate-400 sm:block">{note}</span>
                </span>
            </article>
        );
    }

    function IconTile({ children, className }: { children: ReactNode; className?: string }) {
        return (
            <div
                className={cn(
                    "relative flex shrink-0 items-center justify-center rounded-[15px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_14px_26px_-22px_rgba(227,83,54,.95)]",
                    className,
                )}
            >
                {children}
                <span className="pointer-events-none absolute left-2 right-2 top-1.5 h-1 rounded-full bg-white/35 blur-[1px]" />
            </div>
        );
    }

    function CreateMembershipForm({ plans, onClose }: { plans: PlanOption[]; onClose: () => void }) {
        const { data, setData, post, processing, errors } = useForm({
            customer_name: "",
            membership_plan_id: "",
            start_date: todayStr(),
            end_date: "",
            amount: "",
        });

        const selectedPlan = plans.find((plan) => String(plan.id) === data.membership_plan_id);

        const handlePlanChange = (planId: string) => {
            setData("membership_plan_id", planId);
            const plan = plans.find((item) => String(item.id) === planId);

            if (plan && data.start_date) {
                setData("end_date", addMonthsToDateStr(data.start_date, plan.duration_months));
            }
        };

        const handleStartDateChange = (dateStr: string) => {
            setData("start_date", dateStr);

            if (selectedPlan && dateStr) {
                setData("end_date", addMonthsToDateStr(dateStr, selectedPlan.duration_months));
            }
        };

        const submit = (event: FormEvent) => {
            event.preventDefault();
            post(route("admin.memberships.store"), { onSuccess: onClose, preserveScroll: true });
        };

        return (
            <form onSubmit={submit} className="flex flex-col gap-4">
                <section className="membership-card-glint rounded-[22px] border border-[#F8B5A8]/70 bg-[#FFF7F5] p-3.5">
                    <div className="flex items-center gap-3">
                        <IconTile className="h-9 w-9">
                            <BadgeCheck size={16} />
                        </IconTile>
                        <div>
                            <p className="font-clash text-sm font-semibold text-slate-950">Membership baru</p>
                            <p className="font-bdo text-xs font-medium text-slate-500">Pilih paket, tanggal mulai, lalu sistem bantu isi tanggal selesai.</p>
                        </div>
                    </div>
                </section>

                <div>
                    <label htmlFor="customer_name" className={labelBase}>Nama member</label>
                    <input
                        id="customer_name"
                        type="text"
                        value={data.customer_name}
                        onChange={(event) => setData("customer_name", event.target.value)}
                        placeholder="Nama lengkap member"
                        className={inputBase}
                        required
                    />
                    {errors.customer_name && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.customer_name}</p>}
                </div>

                <div>
                    <label htmlFor="membership_plan_id" className={labelBase}>Paket membership</label>
                    <select
                        id="membership_plan_id"
                        value={data.membership_plan_id}
                        onChange={(event) => handlePlanChange(event.target.value)}
                        className={inputBase}
                    >
                        <option value="">Tanpa paket, isi manual</option>
                        {plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                                {plan.name} - {formatPrice(plan.price)}
                            </option>
                        ))}
                    </select>
                    {errors.membership_plan_id && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.membership_plan_id}</p>}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label htmlFor="start_date" className={labelBase}>Tanggal mulai</label>
                        <input
                            id="start_date"
                            type="date"
                            value={data.start_date}
                            onChange={(event) => handleStartDateChange(event.target.value)}
                            className={inputBase}
                        />
                        {errors.start_date && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.start_date}</p>}
                    </div>
                    <div>
                        <label htmlFor="end_date" className={labelBase}>Tanggal selesai</label>
                        <input
                            id="end_date"
                            type="date"
                            value={data.end_date}
                            min={data.start_date || todayStr()}
                            onChange={(event) => setData("end_date", event.target.value)}
                            readOnly={!!selectedPlan}
                            className={cn(inputBase, selectedPlan && "cursor-not-allowed bg-slate-50 text-slate-500")}
                        />
                        {selectedPlan && (
                            <p className="mt-1.5 font-bdo text-[11px] font-semibold text-[#B93D2A]">
                                Otomatis {selectedPlan.duration_months} bulan dari tanggal mulai.
                            </p>
                        )}
                        {errors.end_date && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.end_date}</p>}
                    </div>
                </div>

                {selectedPlan ? (
                    <section className="rounded-[20px] border border-[#F8B5A8]/70 bg-white p-3.5 shadow-sm">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Nominal paket</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                            <div>
                                <p className="font-clash text-lg font-bold text-slate-950">{formatPrice(selectedPlan.price)}</p>
                                <p className="font-bdo text-xs font-medium text-slate-500">{selectedPlan.name}</p>
                            </div>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-bdo text-[11px] font-bold text-emerald-700">
                                Otomatis
                            </span>
                        </div>
                    </section>
                ) : (
                    <div>
                        <label htmlFor="amount" className={labelBase}>Nominal manual</label>
                        <input
                            id="amount"
                            type="number"
                            value={data.amount}
                            min="0"
                            step="1000"
                            placeholder="0"
                            onChange={(event) => setData("amount", event.target.value)}
                            className={inputBase}
                        />
                        {errors.amount && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.amount}</p>}
                    </div>
                )}

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-[15px] bg-slate-100 px-5 py-2.5 font-clash text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                    >
                        Batal
                    </button>
                    <button
                        type="submit"
                        disabled={processing}
                        className="inline-flex flex-[1.5] items-center justify-center gap-2 rounded-[15px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 py-2.5 font-clash text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                        {processing ? "Menyimpan..." : "Buat membership"}
                        <ArrowRight size={15} />
                    </button>
                </div>
            </form>
        );
    }

    function RenewMembershipForm({
        membership,
        plans,
        onClose,
    }: {
        membership: AdminMembership;
        plans: PlanOption[];
        onClose: () => void;
    }) {
        const fallbackPlanId = membership.membership_plan_id ?? plans[0]?.id ?? "";
        const { data, setData, post, processing, errors } = useForm({
            membership_plan_id: String(fallbackPlanId),
            amount: "",
        });

        const selectedPlan = plans.find((plan) => String(plan.id) === data.membership_plan_id);
        const nextStartDate = (() => {
            const [year, month, day] = membership.end_date.split("-").map(Number);
            const date = new Date(year, (month ?? 1) - 1, (day ?? 1) + 1);

            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        })();
        const nextEndDate = selectedPlan ? addMonthsToDateStr(nextStartDate, selectedPlan.duration_months) : null;

        const submit = (event: FormEvent) => {
            event.preventDefault();
            post(route("admin.memberships.renew", membership.id), { onSuccess: onClose, preserveScroll: true });
        };

        return (
            <form onSubmit={submit} className="flex flex-col gap-4">
                <section className="membership-card-glint rounded-[22px] border border-[#F8B5A8]/70 bg-[#FFF7F5] p-3.5">
                    <div className="flex items-center gap-3">
                        <IconTile className="h-9 w-9">
                            <RefreshCw size={16} />
                        </IconTile>
                        <div>
                            <p className="font-clash text-sm font-semibold text-slate-950">Perpanjang membership</p>
                            <p className="font-bdo text-xs font-medium text-slate-500">
                                Masa aktif baru dimulai setelah periode lama selesai, jadi sisa hari member tidak hilang.
                            </p>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailLine icon={<CalendarRange size={15} />} label="Mulai baru" value={formatDate(nextStartDate)} />
                    <DetailLine icon={<Clock3 size={15} />} label="Sampai" value={nextEndDate ? formatDate(nextEndDate) : "Pilih paket"} />
                </div>

                <div>
                    <label htmlFor="renew_membership_plan_id" className={labelBase}>Paket perpanjangan</label>
                    <select
                        id="renew_membership_plan_id"
                        value={data.membership_plan_id}
                        onChange={(event) => setData("membership_plan_id", event.target.value)}
                        className={inputBase}
                        required
                    >
                        {plans.length === 0 && <option value="">Belum ada paket</option>}
                        {plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                                {plan.name} - {formatPrice(plan.price)}
                            </option>
                        ))}
                    </select>
                    {errors.membership_plan_id && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.membership_plan_id}</p>}
                    {errors.amount && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.amount}</p>}
                </div>

                {selectedPlan && (
                    <section className="rounded-[20px] border border-[#F8B5A8]/70 bg-white p-3.5 shadow-sm">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Nominal paket</p>
                        <p className="mt-2 font-clash text-lg font-bold text-slate-950">{formatPrice(selectedPlan.price)}</p>
                        <p className="font-bdo text-xs font-medium text-slate-500">{selectedPlan.duration_months} bulan masa aktif</p>
                    </section>
                )}

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-[15px] bg-slate-100 px-5 py-2.5 font-clash text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                    >
                        Batal
                    </button>
                    <button
                        type="submit"
                        disabled={processing || plans.length === 0}
                        className="inline-flex flex-[1.5] items-center justify-center gap-2 rounded-[15px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 py-2.5 font-clash text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                        {processing ? "Menyimpan..." : "Perpanjang"}
                        <ArrowRight size={15} />
                    </button>
                </div>
            </form>
        );
    }

    function DetailLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
        return (
            <div className="flex items-start gap-3 rounded-[16px] bg-white/82 px-3 py-2.5 ring-1 ring-[#F8B5A8]/45">
                <span className="mt-0.5 text-[#E35336]">{icon}</span>
                <span className="min-w-0">
                    <span className="block font-bdo text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
                    <span className="mt-0.5 block font-bdo text-[13px] font-semibold text-slate-800">{value}</span>
                </span>
            </div>
        );
    }

    function actionLabel(action: string): string {
        const labels: Record<string, string> = {
            created: "Dibuat",
            renewed: "Diperpanjang",
            status_changed: "Status diubah",
            cancelled: "Dibatalkan",
            payment_confirmed: "Pembayaran lunas",
        };

        return labels[action] ?? action;
    }

    function MembershipDetail({
        membership,
        plans,
        onClose,
    }: {
        membership: AdminMembership;
        plans: PlanOption[];
        onClose: () => void;
    }) {
        const remainingDays = daysUntil(membership.end_date);
        const [showRenew, setShowRenew] = useState(false);

        const handleUpdateStatus = (status: MembershipStatus) => {
            router.patch(route("admin.memberships.update", membership.id), { status }, { onSuccess: onClose, preserveScroll: true });
        };

        const handleCancel = () => {
            if (!confirm(`Batalkan membership #${membership.id}?`)) return;
            router.delete(route("admin.memberships.destroy", membership.id), { onSuccess: onClose, preserveScroll: true });
        };

        if (showRenew) {
            return (
                <RenewMembershipForm
                    membership={membership}
                    plans={plans}
                    onClose={() => {
                        setShowRenew(false);
                        onClose();
                    }}
                />
            );
        }

        return (
            <div className="membership-scrollbar flex max-h-[calc(100vh-150px)] flex-col gap-4 overflow-y-auto pr-1">
                <section className="membership-card-glint overflow-hidden rounded-[24px] border border-[#F8B5A8]/70 bg-[linear-gradient(135deg,#FFF7F5_0%,#ffffff_100%)] shadow-sm">
                    <div className="p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.18em] text-[#B93D2A]">Membership #{String(membership.id).padStart(5, "0")}</p>
                                <h2 className="mt-2 truncate font-clash text-xl font-semibold leading-tight text-slate-950">{membership.customer_name}</h2>
                                <p className="mt-1 font-bdo text-xs font-semibold text-slate-500">{membership.customer_phone ?? "Tanpa nomor telepon"}</p>
                            </div>
                            <StatusBadge status={membership.status} />
                        </div>

                        <div className="mt-4 grid gap-2">
                            <DetailLine icon={<Star size={15} />} label="Paket" value={membership.plan_name ?? "Manual"} />
                            <DetailLine icon={<CalendarRange size={15} />} label="Periode" value={`${formatDate(membership.start_date)} - ${formatDate(membership.end_date)}`} />
                            <DetailLine
                                icon={<Clock3 size={15} />}
                                label="Sisa waktu"
                                value={membership.status === "active" ? (remainingDays > 0 ? `${remainingDays} hari lagi` : "Berakhir hari ini") : MEMBERSHIP_STATUS_LABEL[membership.status]}
                            />
                        </div>
                    </div>
                </section>

                {membership.renewed_from_label && (
                    <section className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Perpanjangan dari</p>
                        <p className="mt-2 font-bdo text-sm font-semibold text-slate-700">{membership.renewed_from_label}</p>
                    </section>
                )}

                <section className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Pembayaran</p>
                        <PaymentBadge tx={membership.transaction} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-slate-50 px-3 py-1 font-clash text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                            {membership.transaction ? formatPrice(membership.transaction.amount) : "Belum ada nominal"}
                        </span>
                        {membership.transaction?.paid_at && (
                            <span className="font-bdo text-xs font-medium text-slate-500">Dibayar pada {membership.transaction.paid_at}</span>
                        )}
                    </div>
                </section>

                <section className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <ReceiptText size={15} className="text-[#E35336]" />
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Invoice / receipt</p>
                    </div>
                    <div className="mt-3 grid gap-2">
                        <DetailLine
                            icon={<ReceiptText size={15} />}
                            label="Invoice ID"
                            value={membership.transaction?.xendit_invoice_id ?? membership.transaction?.receipt_number ?? (membership.transaction ? `TRX-${membership.transaction.id}` : "-")}
                        />
                        <DetailLine
                            icon={<Wallet size={15} />}
                            label="Nominal"
                            value={membership.transaction ? formatPrice(membership.transaction.amount) : "-"}
                        />
                        <DetailLine
                            icon={<Star size={15} />}
                            label="Paket dibeli"
                            value={membership.plan_name ?? "Manual"}
                        />
                    </div>
                </section>

                <section className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <History size={15} className="text-[#E35336]" />
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Riwayat membership</p>
                    </div>
                    <div className="mt-3 grid gap-2">
                        {(membership.histories ?? []).length === 0 ? (
                            <p className="rounded-[16px] bg-slate-50 px-3 py-3 font-bdo text-xs font-semibold text-slate-400">
                                Riwayat baru akan tercatat mulai dari perubahan berikutnya.
                            </p>
                        ) : (
                            (membership.histories ?? []).map((history) => (
                                <div key={history.id} className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-clash text-sm font-semibold text-slate-900">{actionLabel(history.action)}</p>
                                            <p className="mt-0.5 font-bdo text-[11px] font-semibold text-slate-500">
                                                {history.plan_name} - {formatDate(history.start_date)} sampai {formatDate(history.end_date)}
                                            </p>
                                            {history.renewed_from_label && (
                                                <p className="mt-1 font-bdo text-[11px] font-semibold text-[#B93D2A]">
                                                    Dari {history.renewed_from_label}
                                                </p>
                                            )}
                                        </div>
                                        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 font-bdo text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                                            {history.receipt_number ?? "-"}
                                        </span>
                                    </div>
                                    <p className="mt-2 font-bdo text-[11px] font-medium text-slate-400">
                                        Oleh {history.actor_name ?? history.actor_type} - {history.created_at ?? "-"}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                <section className="grid gap-2">
                    {membership.status !== "cancelled" && (
                        <button
                            type="button"
                            onClick={() => setShowRenew(true)}
                            className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-4 py-2.5 font-clash text-sm font-semibold text-white transition hover:-translate-y-0.5"
                        >
                            <RefreshCw size={16} />
                            Perpanjang membership
                        </button>
                    )}
                    {membership.status === "active" && (
                        <button
                            type="button"
                            onClick={() => handleUpdateStatus("expired")}
                            className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-[#F8B5A8]/80 bg-[#FFF7F5] px-4 py-2.5 font-clash text-sm font-semibold text-[#B93D2A] transition hover:bg-white"
                        >
                            <XCircle size={16} />
                            Tandai expired
                        </button>
                    )}
                    {membership.status !== "cancelled" && (
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-2.5 font-clash text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                        >
                            <XCircle size={16} />
                            Batalkan membership
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-[16px] bg-slate-100 px-4 py-2.5 font-clash text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                    >
                        Tutup
                    </button>
                </section>
            </div>
        );
    }

    const listHelper = createColumnHelper<AdminMembership>();

    function ListView({ memberships, onSelect }: { memberships: AdminMembership[]; onSelect: (membership: AdminMembership) => void }) {
        const columns = [
            listHelper.accessor("id", {
                header: "ID",
                cell: (info) => (
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-bdo text-xs font-bold text-slate-500">
                        #{String(info.getValue()).padStart(5, "0")}
                    </span>
                ),
            }),
            listHelper.accessor("customer_name", {
                header: "Member",
                enableSorting: true,
                cell: ({ row }) => {
                    const membership = row.original;

                    return (
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[#FFF7F5] font-clash text-sm font-bold text-[#B93D2A] ring-1 ring-[#F8B5A8]/70">
                                {membership.customer_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate font-clash text-sm font-semibold text-slate-900">{membership.customer_name}</p>
                                <p className="mt-0.5 truncate font-bdo text-[11px] font-medium text-slate-400">{membership.customer_phone ?? "Tanpa nomor"}</p>
                            </div>
                        </div>
                    );
                },
            }),
            listHelper.display({
                id: "period",
                header: "Periode",
                cell: ({ row }) => {
                    const membership = row.original;

                    return (
                        <div>
                            <p className="font-bdo text-xs font-bold text-slate-700">{formatDate(membership.start_date)}</p>
                            <p className="mt-0.5 font-bdo text-[11px] font-medium text-slate-400">s/d {formatDate(membership.end_date)}</p>
                        </div>
                    );
                },
            }),
            listHelper.accessor("plan_name", {
                header: "Paket",
                cell: (info) => {
                    const value = info.getValue();

                    return value ? (
                        <span className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border border-[#F8B5A8]/70 bg-[#FFF7F5] px-3 py-1 font-bdo text-[11px] font-bold text-[#B93D2A]">
                            <Star size={12} />
                            <span className="truncate">{value}</span>
                        </span>
                    ) : (
                        <span className="font-bdo text-xs font-semibold text-slate-400">Manual</span>
                    );
                },
            }),
            listHelper.accessor("status", {
                header: "Status",
                cell: (info) => <StatusBadge status={info.getValue()} />,
            }),
            listHelper.display({
                id: "payment",
                header: "Bayar",
                cell: ({ row }) => <PaymentBadge tx={row.original.transaction} />,
            }),
            listHelper.display({
                id: "amount",
                header: "Nominal",
                cell: ({ row }) => (
                    <span className="font-clash text-sm font-semibold text-slate-900">
                        {row.original.transaction ? formatPrice(row.original.transaction.amount) : "-"}
                    </span>
                ),
            }),
            listHelper.display({
                id: "actions",
                header: "",
                cell: ({ row }) => (
                    <button
                        type="button"
                        onClick={() => onSelect(row.original)}
                        className="flex h-9 w-9 items-center justify-center rounded-[14px] border border-slate-200 bg-white text-slate-500 transition hover:border-[#F8B5A8] hover:bg-[#FFF7F5] hover:text-[#B93D2A]"
                        aria-label={`Lihat membership ${row.original.id}`}
                    >
                        <Eye size={16} />
                    </button>
                ),
            }),
        ];

        return (
            <section className="membership-enter membership-card-glint overflow-hidden rounded-[24px] border border-[#FFE0D8] bg-white p-2 shadow-[0_20px_46px_-38px_rgba(185,61,42,.5)]">
                <DataTable
                    columns={columns as ColumnDef<AdminMembership, unknown>[]}
                    data={memberships}
                    searchColumn="customer_name"
                    searchPlaceholder="Cari nama member..."
                    emptyMessage="Belum ada membership."
                />
            </section>
        );
    }

    export default function MembershipsIndex() {
        const { memberships, plans } = usePage<Props>().props;
        const [selected, setSelected] = useState<AdminMembership | null>(null);
        const [showCreate, setShowCreate] = useState(false);
        const [dateStr, setDateStr] = useState(todayStr());

        const filteredMemberships = useMemo(
            () => memberships.filter((membership) => isMembershipActiveOnDate(membership, dateStr)),
            [dateStr, memberships],
        );

        return (
            <AdminLayout
                header={
                    <div className="membership-enter flex flex-col gap-0.5 pt-3">
                        <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
                        <span className="font-bdo text-[10px] font-medium tracking-wide text-[#E35336]">
                            Manajemen Keanggotaan
                        </span>
                        <h1 className="font-clash text-2xl font-bold uppercase tracking-tight xl:text-3xl">
                            <span className="membership-title-shine">Memberships</span>
                        </h1>
                    </div>
                }
            >
                <Head title="Memberships" />

                <div className="flex flex-col gap-4 overflow-x-hidden pb-16 pt-3">
                    <MembershipBookingStyleControls
                        memberships={memberships}
                        filteredCount={filteredMemberships.length}
                        dateStr={dateStr}
                        setDateStr={setDateStr}
                        onCreate={() => setShowCreate(true)}
                    />

                    <ListView memberships={filteredMemberships} onSelect={setSelected} />
                </div>

                <SlideOver
                    isOpen={selected !== null}
                    onClose={() => setSelected(null)}
                    title={<span className="font-clash text-xl font-bold">Detail Membership</span>}
                    description={
                        selected ? (
                            <span className="font-bdo text-sm font-semibold text-[#B93D2A]">
                                {selected.customer_name} - {formatDate(selected.start_date)} sampai {formatDate(selected.end_date)}
                            </span>
                        ) : undefined
                    }
                >
                    {selected && <MembershipDetail key={selected.id} membership={selected} plans={plans} onClose={() => setSelected(null)} />}
                </SlideOver>

                <SlideOver
                    isOpen={showCreate}
                    onClose={() => setShowCreate(false)}
                    title={<span className="font-clash text-xl font-bold">Tambah Membership</span>}
                    description={<span className="font-bdo text-sm text-slate-500">Daftarkan anggota baru dengan alur cepat.</span>}
                >
                    {showCreate && <CreateMembershipForm plans={plans} onClose={() => setShowCreate(false)} />}
                </SlideOver>
            </AdminLayout>
        );
    }
