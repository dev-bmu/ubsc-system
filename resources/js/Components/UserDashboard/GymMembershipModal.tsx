import { useEffect, useState } from "react";
import { Dumbbell, MessageCircle, Sparkles } from "lucide-react";
import axios from "axios";
import { usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import AccountModalShell, { PrimaryButton } from "./AccountModalShell";
import {
    Guilloche,
    Microtext,
    Barcode,
    FoilText,
    Serial,
    NumberReel,
} from "./PassKit";

interface Props {
    onClose: () => void;
}

interface TransactionItem {
    id: number;
    type: "booking" | "membership";
    payment_status: "UNPAID" | "PAID" | "EXPIRED" | "FAILED";
    created_at: string;
    membership_plan: string | null;
    membership_status: "active" | "expired" | "cancelled" | null;
    membership_period: { start_date: string | null; end_date: string | null } | null;
}

interface ActiveMembership {
    plan: string;
    startDate: string | null;
    endDate: string | null;
    daysRemaining: number;
    progress: number; // 0..1 elapsed
}

const WHATSAPP_URL = "https://wa.me/6285280809080";

function formatLongDate(dateStr: string | null) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

function deriveActive(transactions: TransactionItem[]): ActiveMembership | null {
    const memberships = transactions.filter(
        (t) => t.type === "membership" && t.membership_status === "active",
    );
    if (memberships.length === 0) return null;

    // Most recent active membership
    const m = memberships.sort(
        (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];

    const start = m.membership_period?.start_date
        ? new Date(m.membership_period.start_date)
        : null;
    const end = m.membership_period?.end_date
        ? new Date(m.membership_period.end_date)
        : null;

    const now = new Date();
    let daysRemaining = 0;
    let progress = 0;
    if (end) {
        daysRemaining = Math.max(
            0,
            Math.ceil((end.getTime() - now.getTime()) / 86_400_000),
        );
    }
    if (start && end && end.getTime() > start.getTime()) {
        progress = Math.min(
            1,
            Math.max(
                0,
                (now.getTime() - start.getTime()) /
                    (end.getTime() - start.getTime()),
            ),
        );
    }

    return {
        plan: m.membership_plan ?? "Membership",
        startDate: m.membership_period?.start_date ?? null,
        endDate: m.membership_period?.end_date ?? null,
        daysRemaining,
        progress,
    };
}

export default function GymMembershipModal({ onClose }: Props) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user!;

    const [membership, setMembership] = useState<ActiveMembership | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        axios
            .get("/user/transactions")
            .then((res) => {
                if (active) setMembership(deriveActive(res.data));
            })
            .catch(() => {
                if (active) setMembership(null);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    return (
        <AccountModalShell
            bannerGradient="from-navy-900 via-[#3a1220] to-accent-red"
            eyebrow="Keanggotaan"
            title="Membership Gym"
            subtitle="Status keanggotaan gym Anda di UB Sport Center."
            wordmark="Member"
            accent="#D50000"
            maxWidthClass="sm:max-w-md"
            onClose={onClose}
            footer={
                membership ? undefined : (
                    <div className="flex flex-col gap-2">
                        <PrimaryButton
                            type="button"
                            onClick={() => {
                                window.location.href = "/pricing";
                            }}
                        >
                            <Sparkles className="h-[18px] w-[18px]" />
                            Lihat Paket Membership
                        </PrimaryButton>
                        <button
                            type="button"
                            onClick={() => window.open(WHATSAPP_URL, "_blank")}
                            className="flex h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-navy-900/12 bg-white font-clash text-[14px] font-semibold text-navy-900 transition-all hover:bg-navy-900/[0.03] active:scale-[0.99]"
                        >
                            <MessageCircle className="h-[18px] w-[18px]" />
                            Hubungi Resepsionis
                        </button>
                    </div>
                )
            }
        >
            {/* ── Loading ── */}
            {loading && (
                <div className="space-y-4">
                    <div className="account-skeleton h-44 w-full rounded-3xl" />
                    <div className="account-skeleton h-12 w-full rounded-2xl" />
                </div>
            )}

            {/* ── Active membership card ── */}
            {!loading && membership && (
                <div className="space-y-5">
                    <div
                        className="pass-foil-host kl-stagger relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950"
                        style={{ ["--i" as string]: 0, boxShadow: '0 20px 48px -16px rgba(7,21,48,0.7)' }}
                    >
                        {/* Guilloché engraving */}
                        <Guilloche />
                        {/* One-shot specular sheen on reveal */}
                        <div className="kl-sheen-bar" aria-hidden="true" />
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />

                        {/* Microtext top edge */}
                        <Microtext
                            className="relative pt-3 text-white/30"
                            text="UB Sport Center · Gym Membership"
                        />

                        <div className="relative px-5 pb-5 pt-3">
                            {/* Top row: brand + ACTIVE stamp */}
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10">
                                        <Dumbbell className="h-[18px] w-[18px] text-white" />
                                    </div>
                                    <FoilText className="font-clash text-[15px] font-bold uppercase tracking-tight">
                                        UB Sport Center
                                    </FoilText>
                                </div>
                                <span className="pass-stamp inline-flex items-center gap-1.5 px-2.5 py-1 font-clash text-[11px] font-bold uppercase text-emerald-300">
                                    <span
                                        className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                                        style={{
                                            animation:
                                                "kl-dot-pulse 2.4s ease-in-out infinite",
                                        }}
                                    />
                                    Valid
                                </span>
                            </div>

                            {/* Tier name (foil) + member */}
                            <div className="mt-6">
                                <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
                                    Paket
                                </p>
                                <FoilText className="mt-1 block font-clash text-[28px] font-bold uppercase leading-none tracking-tight">
                                    {membership.plan}
                                </FoilText>
                                <p className="mt-2 font-bdo text-[13px] text-white/60">
                                    {user.name}
                                </p>
                            </div>

                            {/* Days remaining — odometer reel */}
                            <div className="mt-6 flex items-end justify-between">
                                <div>
                                    <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.24em] text-white/40">
                                        Sisa Hari
                                    </p>
                                    <div className="mt-1 flex items-baseline gap-1.5">
                                        <NumberReel
                                            value={membership.daysRemaining}
                                            className="font-clash text-[40px] font-bold leading-none text-white"
                                        />
                                        <span className="font-bdo text-[12px] text-white/45">
                                            hari
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bdo text-[10px] uppercase tracking-[0.2em] text-white/35">
                                        Berlaku s/d
                                    </p>
                                    <p className="mt-1 font-clash text-[13px] font-semibold text-white/80">
                                        {formatLongDate(membership.endDate)}
                                    </p>
                                </div>
                            </div>

                            {/* Progress */}
                            <div className="relative mt-4">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
                                    <div
                                        className="kl-progress-fill h-full rounded-full bg-gradient-to-r from-accent-red to-rose-400"
                                        style={{
                                            ["--kl-pct" as string]: `${Math.round(membership.progress * 100)}%`,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Barcode + serial footer */}
                            <div className="mt-5 flex items-center justify-between gap-4">
                                <Barcode className="h-9 flex-1 text-white/70" />
                                <Serial className="shrink-0 text-[10px] font-semibold uppercase text-white/45">
                                    № UBSC-{String(membership.daysRemaining).padStart(3, "0")}
                                </Serial>
                            </div>
                        </div>
                    </div>

                    {/* Period detail */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="kl-stagger kl-tactile rounded-2xl border border-navy-900/[0.07] bg-white px-4 py-3.5" style={{ ["--i" as string]: 1 }}>
                            <p className="font-bdo text-[11px] text-navy-900/45">
                                Mulai
                            </p>
                            <p className="mt-1 font-clash text-[14px] font-semibold text-navy-900">
                                {formatLongDate(membership.startDate)}
                            </p>
                        </div>
                        <div className="kl-stagger kl-tactile rounded-2xl border border-navy-900/[0.07] bg-white px-4 py-3.5" style={{ ["--i" as string]: 2 }}>
                            <p className="font-bdo text-[11px] text-navy-900/45">
                                Berakhir
                            </p>
                            <p className="mt-1 font-clash text-[14px] font-semibold text-navy-900">
                                {formatLongDate(membership.endDate)}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => window.open(WHATSAPP_URL, "_blank")}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-navy-900/12 bg-white font-clash text-[14px] font-semibold text-navy-900 transition-all hover:bg-navy-900/[0.04] hover:border-navy-900/18 active:scale-[0.99]"
                    >
                        <MessageCircle className="h-[18px] w-[18px]" />
                        Perpanjang via Resepsionis
                    </button>
                </div>
            )}

            {/* ── Empty / inactive ── */}
            {!loading && !membership && (
                <div className="kl-stagger flex flex-col items-center rounded-3xl border border-navy-900/[0.07] bg-white px-6 py-12 text-center" style={{ ["--i" as string]: 0 }}>
                    <div
                        className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900/[0.05]"
                        style={{ animation: "kl-pop-in 0.6s cubic-bezier(0.34,1.56,0.64,1) both" }}
                    >
                        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-accent-red/10 blur-xl" />
                        <Dumbbell className="relative h-8 w-8 text-navy-900/40" />
                    </div>
                    <p className="font-clash text-[16px] font-semibold text-navy-900">
                        Belum ada membership aktif
                    </p>
                    <p className="mt-1.5 max-w-[18rem] font-bdo text-[13px] leading-relaxed text-navy-900/50">
                        Jadikan latihan Anda lebih hemat dan fleksibel dengan
                        paket membership UB Sport Center.
                    </p>
                </div>
            )}
        </AccountModalShell>
    );
}
