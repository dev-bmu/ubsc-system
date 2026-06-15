import { useState, useEffect, useRef, FormEventHandler } from "react";
import { CalendarDays, Camera, Eye, EyeOff, MapPin, User, X } from "lucide-react";
import { useForm, usePage } from "@inertiajs/react";
import { cn } from "@/lib/utils";
import type { PageProps } from "@/types";

interface Props {
    onClose: () => void;
}

export default function ProfileModal({ onClose }: Props) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user!;

    const profileForm = useForm<{
        _method: "patch";
        name: string;
        birth_place: string;
        birth_date: string;
        avatar: File | null;
    }>({
        _method: "patch",
        name: user.name,
        birth_place: user.birth_place ?? "",
        birth_date: user.birth_date ?? "",
        avatar: null,
    });

    const passwordForm = useForm({
        current_password: "",
        password: "",
        password_confirmation: "",
    });

    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [avatarFailed, setAvatarFailed] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    /* Body scroll lock */
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    /* Escape to close */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    /* Revoke object URL when preview changes or on unmount */
    useEffect(() => {
        return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); };
    }, [avatarPreview]);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        if (!file) return;
        setAvatarPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });
        profileForm.setData("avatar", file);
    };

    const submitProfile: FormEventHandler = (e) => {
        e.preventDefault();
        profileForm.post(route("profile.update"), {
            forceFormData: true,
            preserveScroll: true,
            preserveState: true,
        });
    };

    const submitPassword: FormEventHandler = (e) => {
        e.preventDefault();
        passwordForm.put(route("password.update"), {
            preserveScroll: true,
            preserveState: true,
            onSuccess: () => passwordForm.reset(),
        });
    };

    const initials = user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    const displayAvatar = avatarPreview ?? user.avatar_url ?? user.avatar ?? null;

    useEffect(() => {
        setAvatarFailed(false);
    }, [displayAvatar]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#0d1422] shadow-2xl">
                {/* Header */}
                <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.07] px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/10">
                            <User className="h-4 w-4 text-orange-400" />
                        </div>
                        <div>
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.18em] text-orange-400">
                                Akun Saya
                            </p>
                            <h2 className="font-clash text-[16px] font-semibold text-white">
                                Profil Saya
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

                {/* Scrollable body — inner scroll, overscroll contained */}
                <div className="max-h-[85vh] space-y-8 overflow-y-auto overscroll-contain px-6 py-6">

                    {/* Avatar upload */}
                    <div className="flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            className="group relative h-20 w-20 overflow-hidden rounded-full ring-2 ring-white/10 transition-all hover:ring-orange-400/40"
                            title="Ganti foto profil"
                        >
                            {displayAvatar && !avatarFailed ? (
                                <img
                                    src={displayAvatar}
                                    alt="Avatar"
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={() => setAvatarFailed(true)}
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center bg-navy-900">
                                    <span className="font-clash text-2xl font-bold leading-none text-white">
                                        {initials}
                                    </span>
                                </div>
                            )}
                            {/* Hover overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                <Camera className="h-5 w-5 text-white" />
                            </div>
                        </button>
                        <p className="font-bdo text-[11px] text-white/30">
                            {profileForm.data.avatar ? profileForm.data.avatar.name : "Klik untuk ganti foto"}
                        </p>
                        <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/jpg"
                            className="hidden"
                            onChange={handleAvatarChange}
                        />
                        {profileForm.errors.avatar && (
                            <p className="font-bdo text-[11px] text-rose-400">{profileForm.errors.avatar}</p>
                        )}
                    </div>

                    {/* Section 1 — Profile info */}
                    <form onSubmit={submitProfile} className="space-y-4">
                        <p className="font-bdo text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
                            Informasi Profil
                        </p>

                        <div className="space-y-1.5">
                            <label className="font-bdo text-[12px] text-white/60">Nama Lengkap</label>
                            <input
                                type="text"
                                value={profileForm.data.name}
                                onChange={(e) => profileForm.setData("name", e.target.value)}
                                className={cn(
                                    "w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 font-bdo text-sm text-white outline-none transition-colors focus:bg-white/[0.07]",
                                    profileForm.errors.name
                                        ? "border-rose-500/50 focus:border-rose-500/50"
                                        : "border-white/[0.08] focus:border-orange-400/40",
                                )}
                            />
                            {profileForm.errors.name && (
                                <p className="font-bdo text-[11px] text-rose-400">{profileForm.errors.name}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="font-bdo text-[12px] text-white/60">Tempat Lahir</label>
                                <div className="relative">
                                    <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                                    <input
                                        type="text"
                                        value={profileForm.data.birth_place}
                                        onChange={(e) => profileForm.setData("birth_place", e.target.value)}
                                        placeholder="Kota kelahiran"
                                        className={cn(
                                            "w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 pl-10 font-bdo text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:bg-white/[0.07]",
                                            profileForm.errors.birth_place
                                                ? "border-rose-500/50 focus:border-rose-500/50"
                                                : "border-white/[0.08] focus:border-orange-400/40",
                                        )}
                                    />
                                </div>
                                {profileForm.errors.birth_place && (
                                    <p className="font-bdo text-[11px] text-rose-400">{profileForm.errors.birth_place}</p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bdo text-[12px] text-white/60">Tanggal Lahir</label>
                                <div className="relative">
                                    <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                                    <input
                                        type="date"
                                        value={profileForm.data.birth_date}
                                        onChange={(e) => profileForm.setData("birth_date", e.target.value)}
                                        className={cn(
                                            "w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 pl-10 font-bdo text-sm text-white outline-none transition-colors focus:bg-white/[0.07]",
                                            profileForm.errors.birth_date
                                                ? "border-rose-500/50 focus:border-rose-500/50"
                                                : "border-white/[0.08] focus:border-orange-400/40",
                                        )}
                                    />
                                </div>
                                {profileForm.errors.birth_date && (
                                    <p className="font-bdo text-[11px] text-rose-400">{profileForm.errors.birth_date}</p>
                                )}
                            </div>
                        </div>

                        {/* Email — read-only, cannot be changed after registration */}
                        <div className="space-y-1.5">
                            <label className="font-bdo text-[12px] text-white/60">
                                Email
                                <span className="ml-2 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/30">
                                    tidak dapat diubah
                                </span>
                            </label>
                            <input
                                type="email"
                                value={user.email}
                                disabled
                                readOnly
                                className="w-full cursor-not-allowed rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-2.5 font-bdo text-sm text-white/40 outline-none"
                            />
                        </div>

                        {profileForm.recentlySuccessful && (
                            <p className="font-bdo text-[12px] text-emerald-400">Profil berhasil diperbarui.</p>
                        )}

                        <button
                            type="submit"
                            disabled={profileForm.processing}
                            className="w-full rounded-xl bg-orange-500 py-2.5 font-clash text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                            {profileForm.processing ? "Menyimpan..." : "Simpan Perubahan"}
                        </button>
                    </form>

                    <div className="h-px bg-white/[0.06]" />

                    {/* Section 2 — Change password */}
                    <form onSubmit={submitPassword} className="space-y-4">
                        <p className="font-bdo text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
                            Ganti Password
                        </p>

                        <div className="space-y-1.5">
                            <label className="font-bdo text-[12px] text-white/60">Password Saat Ini</label>
                            <div className="relative">
                                <input
                                    type={showCurrent ? "text" : "password"}
                                    value={passwordForm.data.current_password}
                                    onChange={(e) => passwordForm.setData("current_password", e.target.value)}
                                    className={cn(
                                        "w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 pr-10 font-bdo text-sm text-white outline-none transition-colors focus:bg-white/[0.07]",
                                        passwordForm.errors.current_password
                                            ? "border-rose-500/50 focus:border-rose-500/50"
                                            : "border-white/[0.08] focus:border-orange-400/40",
                                    )}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrent((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                                >
                                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {passwordForm.errors.current_password && (
                                <p className="font-bdo text-[11px] text-rose-400">{passwordForm.errors.current_password}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bdo text-[12px] text-white/60">Password Baru</label>
                            <div className="relative">
                                <input
                                    type={showNew ? "text" : "password"}
                                    value={passwordForm.data.password}
                                    onChange={(e) => passwordForm.setData("password", e.target.value)}
                                    className={cn(
                                        "w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 pr-10 font-bdo text-sm text-white outline-none transition-colors focus:bg-white/[0.07]",
                                        passwordForm.errors.password
                                            ? "border-rose-500/50 focus:border-rose-500/50"
                                            : "border-white/[0.08] focus:border-orange-400/40",
                                    )}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                                >
                                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {passwordForm.errors.password && (
                                <p className="font-bdo text-[11px] text-rose-400">{passwordForm.errors.password}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bdo text-[12px] text-white/60">Konfirmasi Password Baru</label>
                            <input
                                type="password"
                                value={passwordForm.data.password_confirmation}
                                onChange={(e) => passwordForm.setData("password_confirmation", e.target.value)}
                                className={cn(
                                    "w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 font-bdo text-sm text-white outline-none transition-colors focus:bg-white/[0.07]",
                                    passwordForm.errors.password_confirmation
                                        ? "border-rose-500/50 focus:border-rose-500/50"
                                        : "border-white/[0.08] focus:border-orange-400/40",
                                )}
                            />
                            {passwordForm.errors.password_confirmation && (
                                <p className="font-bdo text-[11px] text-rose-400">{passwordForm.errors.password_confirmation}</p>
                            )}
                        </div>

                        {passwordForm.recentlySuccessful && (
                            <p className="font-bdo text-[12px] text-emerald-400">Password berhasil diperbarui.</p>
                        )}

                        <button
                            type="submit"
                            disabled={passwordForm.processing}
                            className="w-full rounded-xl bg-white/[0.06] py-2.5 font-clash text-[13px] font-semibold text-white transition-all hover:bg-white/[0.1] disabled:opacity-50"
                        >
                            {passwordForm.processing ? "Memperbarui..." : "Perbarui Password"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
