import { useEffect } from "react";
import { Clock, Dumbbell, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    onClose: () => void;
}

// TODO: Map this UI to the 'gym_memberships' and 'membership_packages' tables
// once the schema is implemented in future phases. Use dummy state for now.
const DUMMY_MEMBERSHIP = {
    isActive: false,
    packageName: null as string | null,
    expiresAt: null as string | null,
    daysRemaining: null as number | null,
};

export default function GymMembershipModal({ onClose }: Props) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const { isActive, packageName, expiresAt, daysRemaining } = DUMMY_MEMBERSHIP;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#0d1422] shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
                            <Dumbbell className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div>
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                                Keanggotaan
                            </p>
                            <h2 className="font-clash text-[16px] font-semibold text-white">
                                Membership Gym
                            </h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-white/30 transition-all hover:bg-white/[0.06] hover:text-white/70"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-6">
                    {/* Status row */}
                    <div className="mb-6 flex items-center justify-between">
                        <p className="font-bdo text-[12px] text-white/50">Status Keanggotaan</p>
                        <span
                            className={cn(
                                "rounded-full px-3 py-1 font-bdo text-[11px] font-medium",
                                isActive
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : "bg-slate-500/15 text-slate-400",
                            )}
                        >
                            {isActive ? "Aktif" : "Tidak Aktif"}
                        </span>
                    </div>

                    {isActive && packageName ? (
                        <div className="space-y-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                            <div>
                                <p className="mb-0.5 font-bdo text-[11px] text-white/40">Paket</p>
                                <p className="font-clash text-[15px] font-semibold text-white">{packageName}</p>
                            </div>
                            {expiresAt && (
                                <div>
                                    <p className="mb-0.5 font-bdo text-[11px] text-white/40">Berlaku Hingga</p>
                                    <p className="font-bdo text-[13px] text-white/80">{expiresAt}</p>
                                </div>
                            )}
                            {daysRemaining !== null && (
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-emerald-400" />
                                    <p className="font-bdo text-[13px] text-white/60">
                                        {daysRemaining} hari tersisa
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-8 text-center">
                            <Dumbbell className="mx-auto mb-3 h-8 w-8 text-white/15" />
                            <p className="font-bdo text-sm text-white/40">
                                Anda belum memiliki membership gym aktif.
                            </p>
                            <p className="mt-1 font-bdo text-[11px] text-white/25">
                                Hubungi resepsionis untuk informasi lebih lanjut.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
