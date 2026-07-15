import { useState, useEffect, useRef, FormEventHandler } from "react";
import {
    CalendarDays,
    Camera,
    Check,
    Eye,
    EyeOff,
    Lock,
    MapPin,
    Phone,
    ShieldCheck,
    User as UserIcon,
} from "lucide-react";
import { useForm, usePage } from "@inertiajs/react";
import { cn } from "@/lib/utils";
import type { PageProps } from "@/types";
import AccountModalShell, {
    PrimaryButton,
    SecondaryButton,
} from "./AccountModalShell";
import { Barcode, Serial } from "./PassKit";

interface Props {
    onClose: () => void;
}

/* Shared input shell — light, high-contrast, elder-friendly (48px tall) */
function fieldClasses(hasError?: boolean, hasIcon?: boolean) {
    return cn(
        "h-12 w-full rounded-xl border bg-white font-bdo text-[14px] text-navy-900 outline-none transition-all duration-200 placeholder:text-navy-900/30 hover:border-navy-900/25 focus:-translate-y-px",
        hasIcon ? "pl-11 pr-4" : "px-4",
        hasError
            ? "border-rose-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            : "border-navy-900/12 focus:border-navy-900/45 focus:ring-2 focus:ring-navy-900/10 focus:shadow-[0_8px_20px_-12px_rgba(11,30,59,0.45)]",
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return (
        <label className="mb-1.5 block font-bdo text-[12px] font-medium text-navy-900/60">
            {children}
        </label>
    );
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="mt-1.5 font-bdo text-[11px] text-rose-500">{message}</p>;
}

export default function ProfileModal({ onClose }: Props) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user!;

    const profileForm = useForm<{
        _method: "patch";
        name: string;
        birth_place: string;
        birth_date: string;
        phone_number: string;
        avatar: File | null;
    }>({
        _method: "patch",
        name: user.name,
        birth_place: user.birth_place ?? "",
        birth_date: user.birth_date ?? "",
        phone_number: user.phone_number ?? "",
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

    /* Revoke object URL when preview changes or on unmount */
    useEffect(() => {
        return () => {
            if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        };
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
        <AccountModalShell
            bannerGradient="from-navy-800 via-navy-900 to-navy-950"
            eyebrow="Akun Saya"
            title="Profil Saya"
            subtitle="Kelola informasi pribadi dan keamanan akun Anda."
            wordmark="Profil"
            accent="#D50000"
            onClose={onClose}
            footer={
                <div className="flex flex-col gap-2">
                    <PrimaryButton
                        type="submit"
                        form="profile-info-form"
                        disabled={profileForm.processing}
                    >
                        <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
                        {profileForm.processing
                            ? "Menyimpan..."
                            : "Simpan Perubahan"}
                    </PrimaryButton>
                    <SecondaryButton type="button" onClick={onClose}>
                        Tutup
                    </SecondaryButton>
                </div>
            }
        >
            {/* ── Avatar — overlaps banner edge, conic halo ── */}
            <div className="-mt-[64px] mb-7 flex flex-col items-center">
                <div className="kl-ring-host kl-stagger relative h-[104px] w-[104px]" style={{ ["--i" as string]: 0 }}>
                    {/* Rotating conic halo */}
                    <span className="kl-ring" aria-hidden="true" />
                    <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        className="group absolute inset-[7px] overflow-hidden rounded-full bg-navy-900 ring-4 ring-[#FAF9F7] shadow-[0_8px_20px_-8px_rgba(7,21,48,0.5)] transition-all duration-300 hover:scale-[1.02]"
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
                            <div className="flex h-full w-full items-center justify-center">
                                <span className="font-clash text-3xl font-bold leading-none text-white">
                                    {initials}
                                </span>
                            </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-navy-950/50 opacity-0 backdrop-blur-[2px] transition-all duration-300 group-hover:opacity-100">
                            <Camera className="h-6 w-6 text-white transition-transform duration-300 group-hover:scale-110" />
                        </div>
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="kl-stagger mt-3 font-bdo text-[12px] font-medium text-navy-900/50 transition-colors hover:text-navy-900"
                    style={{ ["--i" as string]: 1 }}
                >
                    {profileForm.data.avatar
                        ? profileForm.data.avatar.name
                        : "Klik untuk ganti foto"}
                </button>
                <input
                    ref={avatarInputRef}
                    type="file"
                    aria-label="Unggah foto profil"
                    accept="image/jpeg,image/png,image/jpg"
                    className="hidden"
                    onChange={handleAvatarChange}
                />
                {profileForm.errors.avatar && (
                    <FieldError message={profileForm.errors.avatar} />
                )}

                {/* Member identity — barcode + serial */}
                <div
                    className="kl-stagger mt-4 flex flex-col items-center gap-1.5"
                    style={{ ["--i" as string]: 2 }}
                >
                    <Barcode className="h-5 w-32 text-navy-900/30" />
                    <Serial className="text-[10px] font-semibold uppercase text-navy-900/40">
                        Member № UBSC-{String(user.id).padStart(5, "0")}
                    </Serial>
                </div>
            </div>

            {/* ── Section 01 — Profile info ── */}
            <form
                id="profile-info-form"
                onSubmit={submitProfile}
                className="space-y-4"
            >
                <div className="kl-stagger flex items-center gap-3" style={{ ["--i" as string]: 2 }}>
                    <span className="font-clash text-[11px] font-bold tracking-[0.1em] text-accent-red">
                        01
                    </span>
                    <span className="font-bdo text-[10px] font-bold uppercase tracking-[0.2em] text-navy-900/70">
                        Informasi Akun
                    </span>
                    <span className="kl-rule h-px flex-1 bg-gradient-to-r from-navy-900/15 to-transparent" style={{ ["--i" as string]: 3 }} />
                </div>

                <div>
                    <Label>Nama Lengkap</Label>
                    <div className="relative">
                        <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-navy-900/30" />
                        <input
                            type="text"
                            value={profileForm.data.name}
                            onChange={(e) =>
                                profileForm.setData("name", e.target.value)
                            }
                            className={fieldClasses(
                                !!profileForm.errors.name,
                                true,
                            )}
                            placeholder="Nama lengkap Anda"
                        />
                    </div>
                    <FieldError message={profileForm.errors.name} />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <Label>Tempat Lahir</Label>
                        <div className="relative">
                            <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-navy-900/30" />
                            <input
                                type="text"
                                value={profileForm.data.birth_place}
                                onChange={(e) =>
                                    profileForm.setData(
                                        "birth_place",
                                        e.target.value,
                                    )
                                }
                                placeholder="Kota kelahiran"
                                className={fieldClasses(
                                    !!profileForm.errors.birth_place,
                                    true,
                                )}
                            />
                        </div>
                        <FieldError message={profileForm.errors.birth_place} />
                    </div>

                    <div>
                        <Label>Tanggal Lahir</Label>
                        <div className="relative">
                            <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-navy-900/30" />
                            <input
                                type="date"
                                aria-label="Tanggal Lahir"
                                value={profileForm.data.birth_date}
                                onChange={(e) =>
                                    profileForm.setData(
                                        "birth_date",
                                        e.target.value,
                                    )
                                }
                                className={fieldClasses(
                                    !!profileForm.errors.birth_date,
                                    true,
                                )}
                            />
                        </div>
                        <FieldError message={profileForm.errors.birth_date} />
                    </div>
                </div>

                <div>
                    <Label>No. Telepon</Label>
                    <div className="relative">
                        <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-navy-900/30" />
                        <input
                            type="tel"
                            inputMode="tel"
                            value={profileForm.data.phone_number}
                            onChange={(e) =>
                                profileForm.setData(
                                    "phone_number",
                                    e.target.value,
                                )
                            }
                            placeholder="08xxxxxxxxxx"
                            className={fieldClasses(
                                !!profileForm.errors.phone_number,
                                true,
                            )}
                        />
                    </div>
                    <FieldError message={profileForm.errors.phone_number} />
                </div>

                {/* Email — locked */}
                <div>
                    <Label>
                        <span className="inline-flex items-center gap-2">
                            Email
                            <span className="inline-flex items-center gap-1 rounded-full bg-navy-900/[0.06] px-2 py-0.5 text-[10px] font-medium text-navy-900/40">
                                <Lock className="h-2.5 w-2.5" />
                                tidak dapat diubah
                            </span>
                        </span>
                    </Label>
                    <input
                        type="email"
                        aria-label="Email"
                        value={user.email}
                        disabled
                        readOnly
                        className="h-12 w-full cursor-not-allowed rounded-xl border border-navy-900/8 bg-navy-900/[0.03] px-4 font-bdo text-[14px] text-navy-900/45 outline-none"
                    />
                </div>

                {profileForm.recentlySuccessful && (
                    <div className="kl-stagger flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-2.5 ring-1 ring-emerald-500/15" style={{ ['--i' as string]: 0 }}>
                        <Check className="h-4 w-4 text-emerald-600" />
                        <p className="font-bdo text-[12px] font-medium text-emerald-700">
                            Profil berhasil diperbarui.
                        </p>
                    </div>
                )}
            </form>

            {/* ── Section 02 — Security ── */}
            <div className="mt-7 border-t border-navy-900/[0.07] pt-6">
                <div className="mb-4 flex items-center gap-3">
                    <span className="font-clash text-[11px] font-bold tracking-[0.1em] text-accent-red">
                        02
                    </span>
                    <span className="font-bdo text-[10px] font-bold uppercase tracking-[0.2em] text-navy-900/70">
                        Keamanan
                    </span>
                    <span className="h-px flex-1 bg-gradient-to-r from-navy-900/15 to-transparent" />
                </div>

                {user.is_google ? (
                    /* Google account — no password to change */
                    <div className="kl-glass-border kl-tactile flex items-start gap-3.5 rounded-2xl bg-white p-4 sm:p-5">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-navy-900/[0.07] bg-white shadow-[0_2px_8px_-4px_rgba(7,21,48,0.25)]">
                            <svg
                                className="h-5 w-5"
                                viewBox="0 0 48 48"
                                aria-hidden="true"
                            >
                                <path
                                    fill="#FFC107"
                                    d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.5z"
                                />
                                <path
                                    fill="#FF3D00"
                                    d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"
                                />
                                <path
                                    fill="#4CAF50"
                                    d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z"
                                />
                                <path
                                    fill="#1976D2"
                                    d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39.9 35.5 44 30.3 44 24c0-1.2-.1-2.4-.4-3.5z"
                                />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <p className="flex items-center gap-2 font-clash text-[14px] font-semibold text-navy-900">
                                Masuk dengan Google
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-bdo text-[10px] font-semibold text-emerald-600">
                                    Terhubung
                                </span>
                            </p>
                            <p className="mt-1.5 font-bdo text-[12.5px] leading-relaxed text-navy-900/55">
                                Akun Anda terhubung dengan Google, jadi tidak
                                memerlukan password. Cukup gunakan tombol{" "}
                                <span className="font-semibold text-navy-900/75">
                                    Login with Google
                                </span>{" "}
                                setiap kali masuk.
                            </p>
                        </div>
                    </div>
                ) : (
                    <form
                        onSubmit={submitPassword}
                        className="kl-glass-border kl-tactile rounded-2xl p-4 sm:p-5"
                    >
                        <div className="mb-4 flex items-start gap-2.5">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-navy-900/[0.05]">
                                <ShieldCheck className="h-4 w-4 text-navy-900/60" />
                            </div>
                            <p className="font-bdo text-[12px] leading-relaxed text-navy-900/55">
                                Demi keamanan, masukkan password lama Anda
                                sebelum menetapkan password baru.
                            </p>
                        </div>

                    <div className="space-y-4">
                        <div>
                            <Label>Password Saat Ini</Label>
                            <div className="relative">
                                <input
                                    type={showCurrent ? "text" : "password"}
                                    aria-label="Password Saat Ini"
                                    value={passwordForm.data.current_password}
                                    onChange={(e) =>
                                        passwordForm.setData(
                                            "current_password",
                                            e.target.value,
                                        )
                                    }
                                    className={cn(
                                        fieldClasses(
                                            !!passwordForm.errors
                                                .current_password,
                                        ),
                                        "pr-11",
                                    )}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrent((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-900/30 transition-colors hover:text-navy-900/60"
                                >
                                    {showCurrent ? (
                                        <EyeOff className="h-[18px] w-[18px]" />
                                    ) : (
                                        <Eye className="h-[18px] w-[18px]" />
                                    )}
                                </button>
                            </div>
                            <FieldError
                                message={passwordForm.errors.current_password}
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <Label>Password Baru</Label>
                                <div className="relative">
                                    <input
                                        type={showNew ? "text" : "password"}
                                        aria-label="Password Baru"
                                        value={passwordForm.data.password}
                                        onChange={(e) =>
                                            passwordForm.setData(
                                                "password",
                                                e.target.value,
                                            )
                                        }
                                        className={cn(
                                            fieldClasses(
                                                !!passwordForm.errors.password,
                                            ),
                                            "pr-11",
                                        )}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNew((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-900/30 transition-colors hover:text-navy-900/60"
                                    >
                                        {showNew ? (
                                            <EyeOff className="h-[18px] w-[18px]" />
                                        ) : (
                                            <Eye className="h-[18px] w-[18px]" />
                                        )}
                                    </button>
                                </div>
                                <FieldError
                                    message={passwordForm.errors.password}
                                />
                            </div>

                            <div>
                                <Label>Konfirmasi Password</Label>
                                <input
                                    type="password"
                                    aria-label="Konfirmasi Password"
                                    value={
                                        passwordForm.data.password_confirmation
                                    }
                                    onChange={(e) =>
                                        passwordForm.setData(
                                            "password_confirmation",
                                            e.target.value,
                                        )
                                    }
                                    className={fieldClasses(
                                        !!passwordForm.errors
                                            .password_confirmation,
                                    )}
                                />
                                <FieldError
                                    message={
                                        passwordForm.errors
                                            .password_confirmation
                                    }
                                />
                            </div>
                        </div>

                        {passwordForm.recentlySuccessful && (
                            <div className="kl-stagger flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-2.5 ring-1 ring-emerald-500/15" style={{ ['--i' as string]: 0 }}>
                                <Check className="h-4 w-4 text-emerald-600" />
                                <p className="font-bdo text-[12px] font-medium text-emerald-700">
                                    Password berhasil diperbarui.
                                </p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={passwordForm.processing}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-navy-900/12 bg-navy-900/[0.03] font-clash text-[14px] font-semibold text-navy-900 transition-all hover:bg-navy-900/[0.06] hover:border-navy-900/18 active:scale-[0.99] disabled:opacity-50"
                        >
                            <Lock className="h-4 w-4" />
                            {passwordForm.processing
                                ? "Memperbarui..."
                                : "Perbarui Password"}
                        </button>
                    </div>
                </form>
                )}
            </div>
        </AccountModalShell>
    );
}
