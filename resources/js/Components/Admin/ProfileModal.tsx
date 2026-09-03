import { router, useForm, usePage } from "@inertiajs/react";
import {
    Camera,
    CheckCircle2,
    CircleHelp,
    LockKeyhole,
    Mail,
    Save,
    ShieldCheck,
    UserRound,
    X,
} from "lucide-react";
import {
    ChangeEvent,
    FormEventHandler,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import type { PageProps } from "@/types";
import { cn } from "@/lib/utils";
import AdminSecurityCenter from "./AdminSecurityCenter";

export type AdminProfileTab = "profile" | "security" | "account";

interface ProfileModalProps {
    initialTab?: AdminProfileTab;
    onClose: () => void;
}

const tabs: Array<{
    id: AdminProfileTab;
    label: string;
    icon: typeof UserRound;
}> = [
    { id: "profile", label: "Profil", icon: UserRound },
    { id: "security", label: "Keamanan", icon: LockKeyhole },
    { id: "account", label: "Akun", icon: CircleHelp },
];

function getInitials(name?: string | null): string {
    return (name ?? "Admin")
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

function safeRoute(name: string): string | undefined {
    try {
        return route(name);
    } catch {
        return undefined;
    }
}

export default function ProfileModal({
    initialTab = "profile",
    onClose,
}: ProfileModalProps) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user;
    const [activeTab, setActiveTab] = useState<AdminProfileTab>(initialTab);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement | null>(null);

    const profileForm = useForm<{
        _method: "patch";
        name: string;
        email: string;
        avatar: File | null;
    }>({
        _method: "patch",
        name: user?.name ?? "",
        email: user?.email ?? "",
        avatar: null,
    });

    const initials = getInitials(profileForm.data.name || user?.name);
    const role = user?.role ?? "Staff";
    const avatarUrl = useMemo(
        () => avatarPreview ?? user?.avatar_url ?? (user?.avatar ? `/storage/${user.avatar}` : null),
        [avatarPreview, user?.avatar, user?.avatar_url],
    );

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    useEffect(() => {
        return () => {
            if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        };
    }, [avatarPreview]);

    const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        if (!file) return;

        setAvatarPreview((currentPreview) => {
            if (currentPreview) URL.revokeObjectURL(currentPreview);
            return URL.createObjectURL(file);
        });
        profileForm.setData("avatar", file);
    };

    const submitProfile: FormEventHandler = (event) => {
        event.preventDefault();

        profileForm.post(route("admin.account.profile.update"), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                profileForm.setData("avatar", null);
                if (avatarInputRef.current) avatarInputRef.current.value = "";
            },
        });
    };

    const modal = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden px-3 py-4 sm:px-6 sm:py-6">
            <button
                type="button"
                className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
                onClick={onClose}
                aria-label="Close profile modal"
            />

            <section
                role="dialog"
                aria-modal="true"
                aria-label="Admin profile settings"
                className={cn(
                    "relative flex h-[calc(100dvh-32px)] w-full flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.3)] ring-1 ring-slate-950/5 transition-[max-width] duration-300 sm:h-[calc(100dvh-48px)]",
                    activeTab === "security"
                        ? "max-h-[820px] max-w-[1120px]"
                        : "max-h-[760px] max-w-4xl",
                )}
            >
                <div className="shrink-0 border-b border-slate-100 bg-gradient-to-br from-slate-950 via-navy-900 to-orange-800 px-5 py-4 text-white sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-4">
                            <button
                                type="button"
                                onClick={() => avatarInputRef.current?.click()}
                                className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/10 font-clash text-lg font-semibold ring-1 ring-white/20 transition-all hover:scale-[1.02] hover:ring-orange-200/70"
                                aria-label="Change avatar"
                            >
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt={user?.name ?? "Admin avatar"}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    initials
                                )}
                                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Camera size={20} />
                                </span>
                            </button>

                            <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-200">
                                    Account
                                </p>
                                <h2 className="mt-1 truncate font-clash text-2xl font-semibold">
                                    {profileForm.data.name || user?.name || "Admin Profile"}
                                </h2>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/70">
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                                        Active
                                    </span>
                                    <span className="rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">
                                        {role}
                                    </span>
                                    <span className="max-w-[220px] truncate rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">
                                        {profileForm.data.email || user?.email}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white/65 transition-colors hover:bg-white/10 hover:text-white"
                            aria-label="Close profile modal"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 overflow-hidden grid-cols-1 md:grid-cols-[220px_1fr]">
                    <aside className="shrink-0 border-b border-slate-100 bg-slate-50/80 p-3 md:border-b-0 md:border-r">
                        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200/70 md:grid-cols-1">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={cn(
                                            "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all md:justify-start",
                                            activeTab === tab.id
                                                ? "bg-slate-950 text-white shadow-[0_10px_28px_rgba(15,23,42,0.18)]"
                                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                                        )}
                                    >
                                        <Icon size={15} />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-4 hidden rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-medium leading-5 text-emerald-800 md:block">
                            <div className="mb-1 flex items-center gap-2 font-bold">
                                <ShieldCheck size={15} />
                                Session active
                            </div>
                            Online and protected.
                        </div>
                    </aside>

                    <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6" data-lenis-prevent="true">
                        {activeTab === "profile" && (
                            <form onSubmit={submitProfile} className="space-y-5">
                                <div>
                                    <h3 className="font-clash text-lg font-semibold text-slate-950">
                                        Profile information
                                    </h3>
                                </div>

                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/jpg"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                            Full name
                                        </span>
                                        <input
                                            type="text"
                                            value={profileForm.data.name}
                                            onChange={(event) => profileForm.setData("name", event.target.value)}
                                            autoComplete="name"
                                            className={cn(
                                                "w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100",
                                                profileForm.errors.name
                                                    ? "border-rose-300"
                                                    : "border-slate-200",
                                            )}
                                            required
                                        />
                                        {profileForm.errors.name && (
                                            <span className="block text-xs font-semibold text-rose-600">
                                                {profileForm.errors.name}
                                            </span>
                                        )}
                                    </label>

                                    <label className="space-y-2">
                                        <span className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                                            <span>Alamat email</span>
                                            <span className="normal-case tracking-normal text-slate-400">Dikelola Administrator</span>
                                        </span>
                                        <div className="relative">
                                            <Mail
                                                size={16}
                                                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                                            />
                                            <input
                                                type="email"
                                                value={profileForm.data.email}
                                                readOnly
                                                aria-readonly="true"
                                                autoComplete="email"
                                                className={cn(
                                                    "w-full cursor-default rounded-2xl border bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-600 shadow-sm outline-none",
                                                    profileForm.errors.email
                                                        ? "border-rose-300"
                                                        : "border-slate-200",
                                                )}
                                                required
                                            />
                                        </div>
                                        {profileForm.errors.email && (
                                            <span className="block text-xs font-semibold text-rose-600">
                                                {profileForm.errors.email}
                                            </span>
                                        )}
                                    </label>
                                </div>

                                {profileForm.errors.avatar && (
                                    <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                                        {profileForm.errors.avatar}
                                    </div>
                                )}

                                {user?.email_verified_at === null && safeRoute("verification.send") && (
                                    <div className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                                        <span>Email akun ini belum terverifikasi.</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const href = safeRoute("verification.send");
                                                if (href) {
                                                    router.post(href, {}, { preserveScroll: true });
                                                }
                                            }}
                                            className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-amber-700 shadow-sm ring-1 ring-amber-100 transition hover:bg-amber-100"
                                        >
                                            Kirim ulang verifikasi
                                        </button>
                                    </div>
                                )}

                                <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-h-5">
                                        {profileForm.recentlySuccessful && (
                                            <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600">
                                                <CheckCircle2 size={16} />
                                                Profile updated.
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={profileForm.processing}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-[0_14px_34px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Save size={16} />
                                        {profileForm.processing ? "Saving..." : "Save profile"}
                                    </button>
                                </div>
                            </form>
                        )}

                        {activeTab === "security" && <AdminSecurityCenter />}

                        {activeTab === "account" && (
                            <div className="space-y-5">
                                <div>
                                    <h3 className="font-clash text-lg font-semibold text-slate-950">
                                        Tata kelola akun staf
                                    </h3>
                                    <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                                        Penonaktifan akun, perubahan peran, dan pencabutan akses dikelola Administrator agar jejak audit organisasi tetap utuh.
                                    </p>
                                </div>

                                <div className="rounded-[20px] border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-slate-50 p-4 sm:p-5">
                                    <div className="flex items-start gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white text-sky-700 ring-1 ring-sky-100">
                                            <ShieldCheck size={18} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-clash text-base font-semibold text-slate-950">
                                                Akun tidak dapat dihapus sendiri
                                            </p>
                                            <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                                                Hubungi Administrator untuk menonaktifkan akun. Seluruh sesi, faktor MFA, dan hak akses akan dicabut melalui prosedur terkontrol tanpa menghapus histori operasional.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

        </div>
    );

    if (!mounted || typeof document === "undefined") return null;

    return createPortal(modal, document.body);
}
