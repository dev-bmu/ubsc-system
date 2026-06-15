import { router, useForm, usePage } from "@inertiajs/react";
import {
    AlertTriangle,
    Camera,
    CheckCircle2,
    Eye,
    EyeOff,
    LockKeyhole,
    Mail,
    Save,
    ShieldCheck,
    Trash2,
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

export type AdminProfileTab = "profile" | "security" | "danger";

interface ProfileModalProps {
    initialTab?: AdminProfileTab;
    onClose: () => void;
}

const tabs: Array<{
    id: AdminProfileTab;
    label: string;
    icon: typeof UserRound;
}> = [
    { id: "profile", label: "Profile", icon: UserRound },
    { id: "security", label: "Security", icon: LockKeyhole },
    { id: "danger", label: "Danger", icon: AlertTriangle },
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
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [mounted, setMounted] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement | null>(null);
    const deletePasswordRef = useRef<HTMLInputElement | null>(null);

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

    const passwordForm = useForm({
        current_password: "",
        password: "",
        password_confirmation: "",
    });

    const deleteForm = useForm({
        password: "",
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

        profileForm.post(route("profile.update"), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                profileForm.setData("avatar", null);
                if (avatarInputRef.current) avatarInputRef.current.value = "";
            },
        });
    };

    const submitPassword: FormEventHandler = (event) => {
        event.preventDefault();

        passwordForm.put(route("password.update"), {
            preserveScroll: true,
            onSuccess: () => passwordForm.reset(),
        });
    };

    const submitDelete: FormEventHandler = (event) => {
        event.preventDefault();

        deleteForm.delete(route("profile.destroy"), {
            preserveScroll: true,
            onError: () => deletePasswordRef.current?.focus(),
            onFinish: () => deleteForm.reset("password"),
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
                className="relative flex h-[calc(100dvh-32px)] max-h-[760px] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.3)] ring-1 ring-slate-950/5 sm:h-[calc(100dvh-48px)]"
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

                    <div className="min-h-0 overflow-y-auto p-4 sm:p-6" data-lenis-prevent="true">
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
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                            Email address
                                        </span>
                                        <div className="relative">
                                            <Mail
                                                size={16}
                                                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                                            />
                                            <input
                                                type="email"
                                                value={profileForm.data.email}
                                                onChange={(event) => profileForm.setData("email", event.target.value)}
                                                autoComplete="email"
                                                className={cn(
                                                    "w-full rounded-2xl border bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100",
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

                        {activeTab === "security" && (
                            <form onSubmit={submitPassword} className="space-y-5">
                                <div>
                                    <h3 className="font-clash text-lg font-semibold text-slate-950">
                                        Password & security
                                    </h3>
                                    <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                                        Update password admin menggunakan validasi password existing.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <label className="block space-y-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                            Current password
                                        </span>
                                        <div className="relative">
                                            <input
                                                type={showCurrentPassword ? "text" : "password"}
                                                value={passwordForm.data.current_password}
                                                onChange={(event) =>
                                                    passwordForm.setData("current_password", event.target.value)
                                                }
                                                autoComplete="current-password"
                                                className={cn(
                                                    "w-full rounded-2xl border bg-white px-4 py-3 pr-12 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100",
                                                    passwordForm.errors.current_password
                                                        ? "border-rose-300"
                                                        : "border-slate-200",
                                                )}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrentPassword((value) => !value)}
                                                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                                aria-label="Toggle current password visibility"
                                            >
                                                {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        {passwordForm.errors.current_password && (
                                            <span className="block text-xs font-semibold text-rose-600">
                                                {passwordForm.errors.current_password}
                                            </span>
                                        )}
                                    </label>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <label className="space-y-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                                New password
                                            </span>
                                            <div className="relative">
                                                <input
                                                    type={showNewPassword ? "text" : "password"}
                                                    value={passwordForm.data.password}
                                                    onChange={(event) =>
                                                        passwordForm.setData("password", event.target.value)
                                                    }
                                                    autoComplete="new-password"
                                                    className={cn(
                                                        "w-full rounded-2xl border bg-white px-4 py-3 pr-12 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100",
                                                        passwordForm.errors.password
                                                            ? "border-rose-300"
                                                            : "border-slate-200",
                                                    )}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNewPassword((value) => !value)}
                                                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                                    aria-label="Toggle new password visibility"
                                                >
                                                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                            {passwordForm.errors.password && (
                                                <span className="block text-xs font-semibold text-rose-600">
                                                    {passwordForm.errors.password}
                                                </span>
                                            )}
                                        </label>

                                        <label className="space-y-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                                Confirm password
                                            </span>
                                            <input
                                                type="password"
                                                value={passwordForm.data.password_confirmation}
                                                onChange={(event) =>
                                                    passwordForm.setData("password_confirmation", event.target.value)
                                                }
                                                autoComplete="new-password"
                                                className={cn(
                                                    "w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100",
                                                    passwordForm.errors.password_confirmation
                                                        ? "border-rose-300"
                                                        : "border-slate-200",
                                                )}
                                            />
                                            {passwordForm.errors.password_confirmation && (
                                                <span className="block text-xs font-semibold text-rose-600">
                                                    {passwordForm.errors.password_confirmation}
                                                </span>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-h-5">
                                        {passwordForm.recentlySuccessful && (
                                            <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600">
                                                <CheckCircle2 size={16} />
                                                Password updated.
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={passwordForm.processing}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-[0_14px_34px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <LockKeyhole size={16} />
                                        {passwordForm.processing ? "Updating..." : "Update password"}
                                    </button>
                                </div>
                            </form>
                        )}

                        {activeTab === "danger" && (
                            <div className="space-y-5">
                                <div>
                                    <h3 className="font-clash text-lg font-semibold text-slate-950">
                                        Danger zone
                                    </h3>
                                    <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                                        Fitur ini sama seperti halaman profile lama: akun akan dihapus permanen setelah password valid.
                                    </p>
                                </div>

                                <div className="rounded-3xl border border-rose-100 bg-rose-50/70 p-4">
                                    <div className="flex items-start gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-rose-600 ring-1 ring-rose-100">
                                            <Trash2 size={18} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-clash text-base font-semibold text-rose-950">
                                                Delete account
                                            </p>
                                            <p className="mt-1 text-sm font-medium leading-6 text-rose-700/80">
                                                Setelah akun dihapus, sesi akan logout dan data akun tidak bisa dikembalikan dari modal ini.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => setShowDeleteConfirm(true)}
                                                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(225,29,72,0.2)] transition hover:-translate-y-0.5 hover:bg-rose-700"
                                            >
                                                <Trash2 size={16} />
                                                Delete account
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6">
                    <button
                        type="button"
                        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
                        onClick={() => {
                            setShowDeleteConfirm(false);
                            deleteForm.clearErrors();
                            deleteForm.reset();
                        }}
                        aria-label="Cancel delete account"
                    />
                    <form
                        onSubmit={submitDelete}
                        className="relative w-full max-w-md rounded-3xl border border-white/70 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
                    >
                        <div className="flex items-start gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                                <AlertTriangle size={20} />
                            </span>
                            <div>
                                <h4 className="font-clash text-lg font-semibold text-slate-950">
                                    Confirm account deletion
                                </h4>
                                <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                                    Masukkan password akun untuk menghapus akun secara permanen.
                                </p>
                            </div>
                        </div>

                        <input
                            ref={deletePasswordRef}
                            type="password"
                            value={deleteForm.data.password}
                            onChange={(event) => deleteForm.setData("password", event.target.value)}
                            placeholder="Current password"
                            className={cn(
                                "mt-5 w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100",
                                deleteForm.errors.password ? "border-rose-300" : "border-slate-200",
                            )}
                            autoComplete="current-password"
                        />
                        {deleteForm.errors.password && (
                            <p className="mt-2 text-xs font-semibold text-rose-600">
                                {deleteForm.errors.password}
                            </p>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDeleteConfirm(false);
                                    deleteForm.clearErrors();
                                    deleteForm.reset();
                                }}
                                className="rounded-2xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={deleteForm.processing}
                                className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {deleteForm.processing ? "Deleting..." : "Delete permanently"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );

    if (!mounted || typeof document === "undefined") return null;

    return createPortal(modal, document.body);
}
