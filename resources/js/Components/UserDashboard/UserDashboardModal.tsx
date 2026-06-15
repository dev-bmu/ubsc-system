import {
    type ChangeEvent,
    type FormEventHandler,
    type ReactNode,
    type RefObject,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Link, useForm, usePage } from "@inertiajs/react";
import axios from "axios";
import { motion } from "framer-motion";
import {
    AlertCircle,
    ArrowRight,
    BadgeCheck,
    CalendarDays,
    Camera,
    CheckCircle2,
    Clock,
    CreditCard,
    Dumbbell,
    ExternalLink,
    Eye,
    EyeOff,
    HelpCircle,
    Loader2,
    LockKeyhole,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    ShieldCheck,
    Sparkles,
    User as UserIcon,
    Wallet,
    X,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PageProps } from "@/types";

export type UserDashboardSection =
    | "overview"
    | "profile"
    | "history"
    | "support"
    | "membership";

interface Props {
    initialSection?: UserDashboardSection;
    onClose: () => void;
}

interface TransactionItem {
    id: number;
    receipt_number?: string | null;
    amount: number;
    payment_status: "UNPAID" | "PAID" | "EXPIRED" | "FAILED";
    checkout_url: string | null;
    paid_at: string | null;
    created_at: string;
    type?: "booking" | "membership";
    facility_name: string;
    booking_date: string | null;
    membership_plan?: string | null;
    membership_status?: "active" | "expired" | "cancelled" | "pending" | string | null;
    membership_period?: {
        start_date: string | null;
        end_date: string | null;
    } | null;
}

interface SectionItem {
    id: UserDashboardSection;
    label: string;
    shortLabel: string;
    eyebrow: string;
    description: string;
    icon: LucideIcon;
    tone: string;
}

const SECTION_ITEMS: SectionItem[] = [
    {
        id: "overview",
        label: "Pusat Akun",
        shortLabel: "Akun",
        eyebrow: "Ringkasan",
        description: "Lihat semua akses penting dalam satu tempat.",
        icon: Sparkles,
        tone: "from-[#0E3A5A] to-[#092034]",
    },
    {
        id: "profile",
        label: "My Profile",
        shortLabel: "Profil",
        eyebrow: "Profil",
        description: "Kelola data pribadi dan keamanan akun.",
        icon: UserIcon,
        tone: "from-[#12395E] to-[#0B1726]",
    },
    {
        id: "history",
        label: "Payment History",
        shortLabel: "Pembayaran",
        eyebrow: "Transaksi",
        description: "Pantau pembayaran booking dan membership.",
        icon: CreditCard,
        tone: "from-[#0B4C5F] to-[#061927]",
    },
    {
        id: "support",
        label: "Pusat Bantuan",
        shortLabel: "Bantuan",
        eyebrow: "Support",
        description: "Hubungi tim UBSC saat butuh bantuan.",
        icon: MessageCircle,
        tone: "from-[#143C2F] to-[#061917]",
    },
    {
        id: "membership",
        label: "My Membership",
        shortLabel: "Membership",
        eyebrow: "Gym",
        description: "Cek status paket gym dan masa berlaku.",
        icon: Dumbbell,
        tone: "from-[#641A19] to-[#121019]",
    },
];

const STATUS_CONFIG: Record<
    TransactionItem["payment_status"],
    { label: string; className: string; icon: LucideIcon }
> = {
    PAID: {
        label: "Lunas",
        className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
        icon: CheckCircle2,
    },
    UNPAID: {
        label: "Belum Bayar",
        className: "border-[#0E6388]/25 bg-[#0E6388]/10 text-[#0E6388]",
        icon: Clock,
    },
    EXPIRED: {
        label: "Kedaluwarsa",
        className: "border-slate-400/30 bg-slate-500/10 text-slate-500",
        icon: AlertCircle,
    },
    FAILED: {
        label: "Gagal",
        className: "border-[#FF0000]/25 bg-[#FF0000]/10 text-[#D90000]",
        icon: AlertCircle,
    },
};

const identityLabel: Record<string, string> = {
    unverified: "Belum Verifikasi",
    pending: "Menunggu Review",
    verified: "Terverifikasi",
    rejected: "Ditolak",
};

function formatRupiah(amount: number) {
    return "Rp " + new Intl.NumberFormat("id-ID").format(amount);
}

function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function parseDateOnly(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    return new Date(`${dateStr}T12:00:00`);
}

function daysUntil(dateStr: string | null | undefined) {
    const date = parseDateOnly(dateStr);
    if (!date) return null;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function whatsappUrl(message: string) {
    return `https://api.whatsapp.com/send/?phone=6285280809080&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;
}

export default function UserDashboardModal({
    initialSection = "overview",
    onClose,
}: Props) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user!;
    const [activeSection, setActiveSection] =
        useState<UserDashboardSection>(initialSection);
    const [transactions, setTransactions] = useState<TransactionItem[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(true);
    const [transactionError, setTransactionError] = useState<string | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [avatarFailed, setAvatarFailed] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);

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

    useEffect(() => {
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = "";
            document.documentElement.style.overflow = "";
        };
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        return () => {
            if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        };
    }, [avatarPreview]);

    useEffect(() => {
        axios
            .get("/user/transactions")
            .then((response) => setTransactions(response.data))
            .catch(() => setTransactionError("Data transaksi belum bisa dimuat."))
            .finally(() => setLoadingTransactions(false));
    }, []);

    const displayAvatar = avatarPreview ?? user.avatar_url ?? user.avatar ?? null;

    useEffect(() => {
        setAvatarFailed(false);
    }, [displayAvatar]);

    const initials = useMemo(
        () =>
            user.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase(),
        [user.name],
    );

    const profileCompletion = useMemo(() => {
        const fields = [
            Boolean(user.name),
            Boolean(user.email),
            Boolean(user.birth_place),
            Boolean(user.birth_date),
            Boolean(user.avatar_url ?? user.avatar),
        ];
        return Math.round(
            (fields.filter(Boolean).length / Math.max(fields.length, 1)) * 100,
        );
    }, [user]);

    const paidTransactions = transactions.filter(
        (transaction) => transaction.payment_status === "PAID",
    );
    const unpaidTransactions = transactions.filter(
        (transaction) => transaction.payment_status === "UNPAID",
    );
    const latestMembership = transactions.find(
        (transaction) => transaction.type === "membership",
    );
    const latestPaidMembership = transactions.find(
        (transaction) =>
            transaction.type === "membership" &&
            transaction.payment_status === "PAID",
    );
    const membershipDaysRemaining = daysUntil(
        latestPaidMembership?.membership_period?.end_date,
    );
    const hasActiveMembership =
        Boolean(latestPaidMembership) &&
        (latestPaidMembership?.membership_status
            ? latestPaidMembership.membership_status === "active"
            : true) &&
        (membershipDaysRemaining === null || membershipDaysRemaining >= 0);

    const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        if (!file) return;

        setAvatarPreview((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return URL.createObjectURL(file);
        });
        profileForm.setData("avatar", file);
    };

    const submitProfile: FormEventHandler = (event) => {
        event.preventDefault();
        profileForm.post(route("profile.update"), {
            forceFormData: true,
            preserveScroll: true,
            preserveState: true,
        });
    };

    const submitPassword: FormEventHandler = (event) => {
        event.preventDefault();
        passwordForm.put(route("password.update"), {
            preserveScroll: true,
            preserveState: true,
            onSuccess: () => passwordForm.reset(),
        });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4">
            <motion.div
                aria-hidden="true"
                className="absolute inset-0 bg-[#02040A]/75 backdrop-blur-[5px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={onClose}
            />

            <motion.section
                role="dialog"
                aria-modal="true"
                aria-label="Pusat akun UB Sport Center"
                data-lenis-prevent
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 flex h-[calc(100vh-16px)] w-full max-w-[1120px] flex-col overflow-hidden rounded-[24px] border border-white/15 bg-[#F3F6F9] font-bdo shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:h-[min(790px,calc(100vh-32px))]"
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-white/90 text-slate-500 shadow-[0_10px_30px_rgba(0,0,0,0.14)] transition hover:-translate-y-0.5 hover:bg-white hover:text-slate-950 sm:right-4 sm:top-4"
                    aria-label="Tutup pusat akun"
                >
                    <X className="h-5 w-5" />
                </button>

                <aside className="relative shrink-0 overflow-hidden bg-[#07111F] text-white">
                    <div
                        className="absolute inset-0 opacity-35"
                        style={{
                            backgroundImage:
                                "linear-gradient(180deg, rgba(4,10,20,0.08), rgba(4,10,20,0.94)), url('/assets/images/ub-sport-center-gym-footer.avif')",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                        }}
                    />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(18,104,149,0.45),transparent_34%),linear-gradient(180deg,rgba(5,14,27,0.30),rgba(5,9,17,0.96))]" />

                    <div className="relative z-[1] p-4 sm:p-5 lg:p-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div className="flex items-center gap-3 pr-12">
                                <img
                                    src="/UBSC.svg"
                                    alt="UB Sport Center"
                                    className="h-9 w-auto object-contain"
                                />
                                <div className="h-8 w-px bg-white/15" />
                                <div>
                                    <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                                        Member Area
                                    </p>
                                    <p className="font-bdo text-sm font-semibold text-white">
                                        UBSC Account
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 lg:w-[360px]">
                                <MiniStat label="Profil" value={`${profileCompletion}%`} />
                                <MiniStat label="Lunas" value={String(paidTransactions.length)} />
                                <MiniStat
                                    label="Member"
                                    value={hasActiveMembership ? "Aktif" : "Nonaktif"}
                                />
                            </div>
                        </div>

                        <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.08] p-3 shadow-[0_18px_45px_rgba(0,0,0,0.25)] backdrop-blur-xl lg:max-w-[520px]">
                            <div className="flex items-center gap-3">
                                <Avatar
                                    src={displayAvatar}
                                    initials={initials}
                                    failed={avatarFailed}
                                    onError={() => setAvatarFailed(true)}
                                    className="h-14 w-14 rounded-2xl"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-bdo text-base font-semibold leading-tight text-white">
                                        {user.name}
                                    </p>
                                    <p className="mt-1 truncate font-bdo text-xs text-white/55">
                                        {user.email}
                                    </p>
                                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 font-bdo text-[10px] font-semibold text-white/75">
                                        <ShieldCheck className="h-3.5 w-3.5 text-[#7DC7E8]" />
                                        {identityLabel[user.identity_status ?? "unverified"] ??
                                            "Member"}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <nav className="mt-4 overflow-x-auto pb-1">
                            <div className="flex gap-2">
                                {SECTION_ITEMS.map((item) => (
                                    <SectionButton
                                        key={item.id}
                                        item={item}
                                        active={activeSection === item.id}
                                        onClick={() => setActiveSection(item.id)}
                                    />
                                ))}
                            </div>
                        </nav>

                    </div>
                </aside>

                <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div
                        data-lenis-prevent
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-7 sm:py-6"
                    >
                        <motion.div
                            key={activeSection}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        >
                            {activeSection === "overview" && (
                                <OverviewSection
                                    userName={user.name}
                                    profileCompletion={profileCompletion}
                                    paidTransactions={paidTransactions.length}
                                    unpaidTransactions={unpaidTransactions.length}
                                    hasActiveMembership={hasActiveMembership}
                                    latestMembership={latestPaidMembership}
                                    onSelect={setActiveSection}
                                />
                            )}

                            {activeSection === "profile" && (
                                <ProfileSection
                                    userEmail={user.email}
                                    displayAvatar={displayAvatar}
                                    avatarFailed={avatarFailed}
                                    initials={initials}
                                    avatarInputRef={avatarInputRef}
                                    profileForm={profileForm}
                                    passwordForm={passwordForm}
                                    showCurrent={showCurrent}
                                    showNew={showNew}
                                    showConfirm={showConfirm}
                                    onAvatarError={() => setAvatarFailed(true)}
                                    onAvatarChange={handleAvatarChange}
                                    onSubmitProfile={submitProfile}
                                    onSubmitPassword={submitPassword}
                                    onToggleCurrent={() => setShowCurrent((value) => !value)}
                                    onToggleNew={() => setShowNew((value) => !value)}
                                    onToggleConfirm={() => setShowConfirm((value) => !value)}
                                />
                            )}

                            {activeSection === "history" && (
                                <PaymentHistorySection
                                    loading={loadingTransactions}
                                    error={transactionError}
                                    transactions={transactions}
                                />
                            )}

                            {activeSection === "support" && <SupportSection />}

                            {activeSection === "membership" && (
                                <MembershipSection
                                    loading={loadingTransactions}
                                    error={transactionError}
                                    latestMembership={latestMembership}
                                    latestPaidMembership={latestPaidMembership}
                                    hasActiveMembership={hasActiveMembership}
                                    daysRemaining={membershipDaysRemaining}
                                    transactions={transactions.filter(
                                        (transaction) => transaction.type === "membership",
                                    )}
                                />
                            )}
                        </motion.div>
                    </div>
                </main>
            </motion.section>
        </div>
    );
}

function Avatar({
    src,
    initials,
    failed,
    onError,
    className,
}: {
    src: string | null;
    initials: string;
    failed: boolean;
    onError: () => void;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "relative flex shrink-0 items-center justify-center overflow-hidden bg-[#0C1B2F]",
                className,
            )}
        >
            {src && !failed ? (
                <img
                    src={src}
                    alt="Avatar pengguna"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={onError}
                />
            ) : (
                <span className="font-bdo text-lg font-semibold text-white">
                    {initials}
                </span>
            )}
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-[14px] border border-white/10 bg-white/[0.07] px-2.5 py-2.5">
            <p className="font-bdo text-sm font-semibold leading-none text-white">
                {value}
            </p>
            <p className="mt-1 font-bdo text-[10px] text-white/42">{label}</p>
        </div>
    );
}

function SectionButton({
    item,
    active,
    onClick,
}: {
    item: SectionItem;
    active: boolean;
    onClick: () => void;
}) {
    const Icon = item.icon;

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "group flex min-w-[190px] items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition lg:min-w-0",
                active
                    ? "border-white/20 bg-white text-[#07111F] shadow-[0_16px_35px_rgba(0,0,0,0.24)]"
                    : "border-white/8 bg-white/[0.04] text-white hover:border-white/16 hover:bg-white/[0.08]",
            )}
        >
            <span
                className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    active ? "bg-[#07111F] text-white" : "bg-white/8 text-white/70",
                )}
            >
                <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
                <span className="block truncate font-bdo text-sm font-semibold">
                    {item.shortLabel}
                </span>
                <span
                    className={cn(
                        "mt-0.5 block truncate font-bdo text-[11px]",
                        active ? "text-slate-500" : "text-white/42",
                    )}
                >
                    {item.eyebrow}
                </span>
            </span>
        </button>
    );
}

function OverviewSection({
    userName,
    profileCompletion,
    paidTransactions,
    unpaidTransactions,
    hasActiveMembership,
    latestMembership,
    onSelect,
}: {
    userName: string;
    profileCompletion: number;
    paidTransactions: number;
    unpaidTransactions: number;
    hasActiveMembership: boolean;
    latestMembership?: TransactionItem;
    onSelect: (section: UserDashboardSection) => void;
}) {
    return (
        <div className="space-y-5">
            <div className="relative overflow-hidden rounded-[22px] bg-[#07111F] p-5 text-white shadow-[0_18px_45px_rgba(7,17,31,0.22)] sm:p-6">
                <div
                    className="absolute inset-0 opacity-50"
                    style={{
                        backgroundImage:
                            "linear-gradient(90deg,rgba(7,17,31,0.78),rgba(7,17,31,0.3)), url('/assets/images/fasilitas-tenis-ub-sport-center.avif')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                <div className="relative z-[1] max-w-xl">
                    <p className="font-bdo text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">
                        Selamat datang
                    </p>
                    <h3 className="mt-2 font-bdo text-[clamp(1.45rem,3.5vw,2.7rem)] font-semibold leading-[1.02]">
                        {userName.split(" ")[0]}, semua kebutuhan akun ada di sini.
                    </h3>
                    <p className="mt-3 font-bdo text-sm leading-relaxed text-white/68">
                        Pilih menu yang Anda perlukan. Tidak perlu mencari-cari
                        halaman lain untuk profil, pembayaran, bantuan, atau
                        membership.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <a
                            href="/booking"
                            className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 font-bdo text-sm font-semibold text-[#07111F] transition hover:-translate-y-0.5"
                        >
                            Booking Sekarang
                            <ArrowRight className="h-4 w-4" />
                        </a>
                        <button
                            type="button"
                            onClick={() => onSelect("support")}
                            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 font-bdo text-sm font-semibold text-white transition hover:bg-white/15"
                        >
                            <MessageCircle className="h-4 w-4" />
                            Bantuan
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <StatusCard
                    icon={BadgeCheck}
                    label="Kelengkapan Profil"
                    value={`${profileCompletion}%`}
                    description="Lengkapi profil untuk proses layanan yang lebih cepat."
                />
                <StatusCard
                    icon={Wallet}
                    label="Pembayaran Lunas"
                    value={String(paidTransactions)}
                    description={
                        unpaidTransactions > 0
                            ? `${unpaidTransactions} transaksi perlu dibayar.`
                            : "Tidak ada tagihan aktif saat ini."
                    }
                />
                <StatusCard
                    icon={Dumbbell}
                    label="Membership Gym"
                    value={hasActiveMembership ? "Aktif" : "Belum Aktif"}
                    description={
                        hasActiveMembership
                            ? `${latestMembership?.membership_plan ?? "Paket gym"} sedang berjalan.`
                            : "Aktifkan paket agar akses gym lebih mudah."
                    }
                />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {SECTION_ITEMS.filter((item) => item.id !== "overview").map((item) => (
                    <ActionTile key={item.id} item={item} onClick={() => onSelect(item.id)} />
                ))}
            </div>
        </div>
    );
}

function StatusCard({
    icon: Icon,
    label,
    value,
    description,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    description: string;
}) {
    return (
        <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                    <Icon className="h-[18px] w-[18px]" />
                </div>
                <p className="font-bdo text-xl font-semibold text-slate-950">
                    {value}
                </p>
            </div>
            <p className="mt-4 font-bdo text-sm font-semibold text-slate-950">
                {label}
            </p>
            <p className="mt-1 font-bdo text-xs leading-relaxed text-slate-500">
                {description}
            </p>
        </div>
    );
}

function ActionTile({
    item,
    onClick,
}: {
    item: SectionItem;
    onClick: () => void;
}) {
    const Icon = item.icon;

    return (
        <button
            type="button"
            onClick={onClick}
            className="group relative overflow-hidden rounded-[18px] border border-slate-200 bg-white p-4 text-left shadow-[0_14px_35px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-slate-300"
        >
            <div
                className={cn(
                    "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
                    item.tone,
                )}
            />
            <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                        <Icon className="h-5 w-5" />
                    </span>
                    <span>
                        <span className="font-bdo text-base font-semibold text-slate-950">
                            {item.label}
                        </span>
                        <span className="mt-1 block font-bdo text-sm leading-relaxed text-slate-500">
                            {item.description}
                        </span>
                    </span>
                </div>
                <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#FF0000]" />
            </div>
        </button>
    );
}

function ProfileSection({
    userEmail,
    displayAvatar,
    avatarFailed,
    initials,
    avatarInputRef,
    profileForm,
    passwordForm,
    showCurrent,
    showNew,
    showConfirm,
    onAvatarError,
    onAvatarChange,
    onSubmitProfile,
    onSubmitPassword,
    onToggleCurrent,
    onToggleNew,
    onToggleConfirm,
}: {
    userEmail: string;
    displayAvatar: string | null;
    avatarFailed: boolean;
    initials: string;
    avatarInputRef: RefObject<HTMLInputElement>;
    profileForm: ReturnType<typeof useForm<{
        _method: "patch";
        name: string;
        birth_place: string;
        birth_date: string;
        avatar: File | null;
    }>>;
    passwordForm: ReturnType<typeof useForm<{
        current_password: string;
        password: string;
        password_confirmation: string;
    }>>;
    showCurrent: boolean;
    showNew: boolean;
    showConfirm: boolean;
    onAvatarError: () => void;
    onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onSubmitProfile: FormEventHandler;
    onSubmitPassword: FormEventHandler;
    onToggleCurrent: () => void;
    onToggleNew: () => void;
    onToggleConfirm: () => void;
}) {
    return (
        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
                <p className="font-bdo text-[11px] font-bold uppercase tracking-[0.2em] text-[#FF0000]">
                    Foto Profil
                </p>
                <div className="mt-5 flex flex-col items-center text-center">
                    <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        className="group relative h-28 w-28 overflow-hidden rounded-[24px] bg-[#07111F] shadow-[0_18px_35px_rgba(7,17,31,0.24)] ring-1 ring-slate-200 transition hover:-translate-y-0.5"
                    >
                        <Avatar
                            src={displayAvatar}
                            initials={initials}
                            failed={avatarFailed}
                            onError={onAvatarError}
                            className="h-full w-full rounded-[24px]"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
                            <Camera className="h-6 w-6 text-white" />
                        </span>
                    </button>
                    <p className="mt-4 font-bdo text-base font-semibold text-slate-950">
                        Ganti foto dengan mudah
                    </p>
                    <p className="mt-1 max-w-[220px] font-bdo text-xs leading-relaxed text-slate-500">
                        Gunakan foto jelas agar staff lebih mudah mengenali akun
                        Anda saat layanan.
                    </p>
                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/jpg"
                        className="hidden"
                        onChange={onAvatarChange}
                    />
                    {profileForm.data.avatar && (
                        <p className="mt-3 line-clamp-2 font-bdo text-xs text-slate-500">
                            {profileForm.data.avatar.name}
                        </p>
                    )}
                    {profileForm.errors.avatar && (
                        <p className="mt-2 font-bdo text-xs text-[#D90000]">
                            {profileForm.errors.avatar}
                        </p>
                    )}
                </div>
            </section>

            <div className="space-y-5">
                <form
                    onSubmit={onSubmitProfile}
                    className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)] sm:p-6"
                >
                    <SectionHeading
                        icon={UserIcon}
                        title="Informasi Pribadi"
                        description="Pastikan data mudah dibaca dan sesuai identitas Anda."
                    />

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <Field
                            label="Nama Lengkap"
                            error={profileForm.errors.name}
                            className="sm:col-span-2"
                        >
                            <input
                                type="text"
                                value={profileForm.data.name}
                                onChange={(event) =>
                                    profileForm.setData("name", event.target.value)
                                }
                                className={inputClass(Boolean(profileForm.errors.name))}
                            />
                        </Field>

                        <Field
                            label="Tempat Lahir"
                            error={profileForm.errors.birth_place}
                        >
                            <div className="relative">
                                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={profileForm.data.birth_place}
                                    placeholder="Kota kelahiran"
                                    onChange={(event) =>
                                        profileForm.setData(
                                            "birth_place",
                                            event.target.value,
                                        )
                                    }
                                    className={inputClass(
                                        Boolean(profileForm.errors.birth_place),
                                        "pl-11",
                                    )}
                                />
                            </div>
                        </Field>

                        <Field
                            label="Tanggal Lahir"
                            error={profileForm.errors.birth_date}
                        >
                            <div className="relative">
                                <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="date"
                                    value={profileForm.data.birth_date}
                                    onChange={(event) =>
                                        profileForm.setData(
                                            "birth_date",
                                            event.target.value,
                                        )
                                    }
                                    className={inputClass(
                                        Boolean(profileForm.errors.birth_date),
                                        "pl-11",
                                    )}
                                />
                            </div>
                        </Field>

                        <Field label="Email" className="sm:col-span-2">
                            <div className="relative">
                                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="email"
                                    value={userEmail}
                                    readOnly
                                    disabled
                                    className={cn(
                                        inputClass(false, "pl-11"),
                                        "cursor-not-allowed bg-slate-100 text-slate-500",
                                    )}
                                />
                            </div>
                        </Field>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {profileForm.recentlySuccessful ? (
                            <p className="font-bdo text-sm font-semibold text-emerald-600">
                                Profil berhasil diperbarui.
                            </p>
                        ) : (
                            <p className="font-bdo text-xs text-slate-500">
                                Email dikunci untuk menjaga konsistensi akun.
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={profileForm.processing}
                            className="inline-flex h-12 items-center justify-center rounded-xl bg-[#07111F] px-6 font-bdo text-sm font-semibold text-white shadow-[0_14px_28px_rgba(7,17,31,0.20)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-55"
                        >
                            {profileForm.processing ? "Menyimpan..." : "Simpan Profil"}
                        </button>
                    </div>
                </form>

                <form
                    onSubmit={onSubmitPassword}
                    className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)] sm:p-6"
                >
                    <SectionHeading
                        icon={LockKeyhole}
                        title="Keamanan Akun"
                        description="Gunakan password kuat dan jangan bagikan kepada siapa pun."
                    />

                    <div className="mt-5 grid gap-4">
                        <PasswordField
                            label="Password Saat Ini"
                            value={passwordForm.data.current_password}
                            show={showCurrent}
                            error={passwordForm.errors.current_password}
                            onToggle={onToggleCurrent}
                            onChange={(value) =>
                                passwordForm.setData("current_password", value)
                            }
                        />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <PasswordField
                                label="Password Baru"
                                value={passwordForm.data.password}
                                show={showNew}
                                error={passwordForm.errors.password}
                                onToggle={onToggleNew}
                                onChange={(value) =>
                                    passwordForm.setData("password", value)
                                }
                            />
                            <PasswordField
                                label="Konfirmasi Password"
                                value={passwordForm.data.password_confirmation}
                                show={showConfirm}
                                error={passwordForm.errors.password_confirmation}
                                onToggle={onToggleConfirm}
                                onChange={(value) =>
                                    passwordForm.setData(
                                        "password_confirmation",
                                        value,
                                    )
                                }
                            />
                        </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {passwordForm.recentlySuccessful ? (
                            <p className="font-bdo text-sm font-semibold text-emerald-600">
                                Password berhasil diperbarui.
                            </p>
                        ) : (
                            <p className="font-bdo text-xs text-slate-500">
                                Minimal 8 karakter lebih aman untuk digunakan.
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={passwordForm.processing}
                            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 font-bdo text-sm font-semibold text-slate-950 shadow-[0_12px_24px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-slate-300 disabled:translate-y-0 disabled:opacity-55"
                        >
                            {passwordForm.processing
                                ? "Memperbarui..."
                                : "Perbarui Password"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function SectionHeading({
    icon: Icon,
    title,
    description,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#07111F] text-white">
                <Icon className="h-[18px] w-[18px]" />
            </div>
            <div>
                <h3 className="font-bdo text-lg font-semibold leading-tight text-slate-950">
                    {title}
                </h3>
                <p className="mt-1 font-bdo text-sm leading-relaxed text-slate-500">
                    {description}
                </p>
            </div>
        </div>
    );
}

function Field({
    label,
    error,
    className,
    children,
}: {
    label: string;
    error?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <label className={cn("block", className)}>
            <span className="mb-2 block font-bdo text-sm font-semibold text-slate-700">
                {label}
            </span>
            {children}
            {error && (
                <span className="mt-1.5 block font-bdo text-xs text-[#D90000]">
                    {error}
                </span>
            )}
        </label>
    );
}

function inputClass(error: boolean, extra?: string) {
    return cn(
        "h-12 w-full rounded-xl border bg-[#F7F9FB] px-4 font-bdo text-[15px] text-slate-950 outline-none transition placeholder:text-slate-400 focus:bg-white",
        error
            ? "border-[#FF0000] focus:border-[#D90000]"
            : "border-slate-200 focus:border-[#0E6388] focus:ring-4 focus:ring-[#0E6388]/10",
        extra,
    );
}

function PasswordField({
    label,
    value,
    show,
    error,
    onToggle,
    onChange,
}: {
    label: string;
    value: string;
    show: boolean;
    error?: string;
    onToggle: () => void;
    onChange: (value: string) => void;
}) {
    return (
        <Field label={label} error={error}>
            <div className="relative">
                <input
                    type={show ? "text" : "password"}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className={inputClass(Boolean(error), "pr-12")}
                />
                <button
                    type="button"
                    onClick={onToggle}
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
                >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
        </Field>
    );
}

function PaymentHistorySection({
    loading,
    error,
    transactions,
}: {
    loading: boolean;
    error: string | null;
    transactions: TransactionItem[];
}) {
    const totalPaid = transactions
        .filter((transaction) => transaction.payment_status === "PAID")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    const unpaid = transactions.filter(
        (transaction) => transaction.payment_status === "UNPAID",
    ).length;

    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
                <StatusCard
                    icon={CreditCard}
                    label="Total Transaksi"
                    value={String(transactions.length)}
                    description="Riwayat booking dan membership terbaru."
                />
                <StatusCard
                    icon={Clock}
                    label="Perlu Dibayar"
                    value={String(unpaid)}
                    description="Selesaikan pembayaran agar jadwal aman."
                />
                <StatusCard
                    icon={Wallet}
                    label="Sudah Lunas"
                    value={formatRupiah(totalPaid)}
                    description="Akumulasi pembayaran yang berhasil."
                />
            </div>

            <section className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <h3 className="font-bdo text-lg font-semibold text-slate-950">
                            Daftar Transaksi
                        </h3>
                        <p className="mt-1 font-bdo text-sm text-slate-500">
                            Informasi status dibuat ringkas agar mudah dipahami.
                        </p>
                    </div>
                </div>

                {loading && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
                    </div>
                )}

                {!loading && error && (
                    <EmptyState
                        icon={AlertCircle}
                        title="Transaksi belum bisa dimuat"
                        description={error}
                    />
                )}

                {!loading && !error && transactions.length === 0 && (
                    <EmptyState
                        icon={CreditCard}
                        title="Belum ada transaksi"
                        description="Setelah booking atau membeli membership, riwayatnya akan tampil di sini."
                    />
                )}

                {!loading && !error && transactions.length > 0 && (
                    <ul className="divide-y divide-slate-100">
                        {transactions.map((transaction) => (
                            <TransactionRow
                                key={transaction.id}
                                transaction={transaction}
                            />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

function TransactionRow({ transaction }: { transaction: TransactionItem }) {
    const status = STATUS_CONFIG[transaction.payment_status] ?? STATUS_CONFIG.FAILED;
    const StatusIcon = status.icon;
    const isMembership = transaction.type === "membership";
    const title = isMembership
        ? transaction.membership_plan ?? "Membership Gym"
        : transaction.facility_name || "Booking Fasilitas";
    const date = isMembership
        ? `${formatDate(transaction.membership_period?.start_date)} - ${formatDate(
              transaction.membership_period?.end_date,
          )}`
        : formatDate(transaction.booking_date ?? transaction.created_at);

    return (
        <li className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
                <div
                    className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                        isMembership
                            ? "bg-[#FF0000]/10 text-[#E00000]"
                            : "bg-[#0E6388]/10 text-[#0E6388]",
                    )}
                >
                    {isMembership ? (
                        <Dumbbell className="h-5 w-5" />
                    ) : (
                        <CreditCard className="h-5 w-5" />
                    )}
                </div>
                <div className="min-w-0">
                    <p className="truncate font-bdo text-base font-semibold text-slate-950">
                        {title}
                    </p>
                    <p className="mt-1 font-bdo text-sm text-slate-500">{date}</p>
                    <p className="mt-1 font-bdo text-xs text-slate-400">
                        {transaction.receipt_number ?? `UBSC-${transaction.id}`}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span
                    className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 font-bdo text-xs font-semibold",
                        status.className,
                    )}
                >
                    <StatusIcon className="h-3.5 w-3.5" />
                    {status.label}
                </span>
                <span className="inline-flex h-9 items-center rounded-full bg-slate-100 px-3 font-bdo text-sm font-semibold text-slate-950">
                    {formatRupiah(transaction.amount)}
                </span>
                {transaction.payment_status === "UNPAID" && transaction.checkout_url && (
                    <a
                        href={transaction.checkout_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#FF0000] px-3 font-bdo text-sm font-semibold text-white transition hover:-translate-y-0.5"
                    >
                        Bayar
                        <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                )}
            </div>
        </li>
    );
}

function SupportSection() {
    return (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
            <section className="relative overflow-hidden rounded-[22px] bg-[#07111F] p-5 text-white shadow-[0_18px_45px_rgba(7,17,31,0.22)] sm:p-6">
                <div
                    className="absolute inset-0 opacity-55"
                    style={{
                        backgroundImage:
                            "linear-gradient(90deg,rgba(7,17,31,0.88),rgba(7,17,31,0.30)), url('/assets/images/ub-sport-center-kantor-pusat-malang.avif')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                <div className="relative z-[1] max-w-xl">
                    <p className="font-bdo text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">
                        Bantuan UBSC
                    </p>
                    <h3 className="mt-2 font-bdo text-[clamp(1.55rem,3.5vw,2.65rem)] font-semibold leading-[1.02]">
                        Hubungi tim kami tanpa ribet.
                    </h3>
                    <p className="mt-3 font-bdo text-sm leading-relaxed text-white/70">
                        Untuk pertanyaan booking, pembayaran, membership, atau
                        akses fasilitas, gunakan tombol utama di bawah.
                    </p>
                    <a
                        href={whatsappUrl(
                            "Halo UB Sport Center, saya membutuhkan bantuan terkait layanan UBSC.",
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 font-bdo text-sm font-semibold text-[#07111F] transition hover:-translate-y-0.5"
                    >
                        <MessageCircle className="h-4 w-4" />
                        Chat WhatsApp
                    </a>
                </div>
            </section>

            <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
                <h3 className="font-bdo text-lg font-semibold text-slate-950">
                    Kontak Resmi
                </h3>
                <div className="mt-4 space-y-3">
                    <ContactItem icon={Mail} label="Email" value="contact@ubsportcenter.co.id" />
                    <ContactItem icon={Phone} label="Telepon" value="0341 579956" />
                    <ContactItem icon={MapPin} label="Lokasi" value="Jl. Terusan Cibogo No.1, Malang" />
                </div>
            </section>

            <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)] xl:col-span-2">
                <SectionHeading
                    icon={HelpCircle}
                    title="Alur bantuan yang mudah"
                    description="Pengguna cukup memilih topik, mengirim pesan, lalu staff akan mengarahkan langkah berikutnya."
                />
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <HelpStep number="01" title="Jelaskan kebutuhan" text="Tulis apakah terkait booking, pembayaran, akun, atau membership." />
                    <HelpStep number="02" title="Lampirkan bukti" text="Jika ada transaksi, sertakan nomor receipt atau screenshot pembayaran." />
                    <HelpStep number="03" title="Tunggu arahan" text="Staff akan memberi instruksi yang paling sesuai dengan kondisi Anda." />
                </div>
            </section>
        </div>
    );
}

function ContactItem({
    icon: Icon,
    label,
    value,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
}) {
    return (
        <div className="flex gap-3 rounded-[14px] border border-slate-100 bg-slate-50 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
                <span className="block font-bdo text-xs font-semibold text-slate-500">
                    {label}
                </span>
                <span className="block break-words font-bdo text-sm font-semibold text-slate-950">
                    {value}
                </span>
            </span>
        </div>
    );
}

function HelpStep({
    number,
    title,
    text,
}: {
    number: string;
    title: string;
    text: string;
}) {
    return (
        <div className="rounded-[16px] border border-slate-200 bg-[#F7F9FB] p-4">
            <p className="font-bdo text-sm font-semibold text-[#FF0000]">
                {number}
            </p>
            <p className="mt-3 font-bdo text-base font-semibold text-slate-950">
                {title}
            </p>
            <p className="mt-1 font-bdo text-sm leading-relaxed text-slate-500">
                {text}
            </p>
        </div>
    );
}

function MembershipSection({
    loading,
    error,
    latestMembership,
    latestPaidMembership,
    hasActiveMembership,
    daysRemaining,
    transactions,
}: {
    loading: boolean;
    error: string | null;
    latestMembership?: TransactionItem;
    latestPaidMembership?: TransactionItem;
    hasActiveMembership: boolean;
    daysRemaining: number | null;
    transactions: TransactionItem[];
}) {
    if (loading) {
        return (
            <div className="flex min-h-[320px] items-center justify-center rounded-[20px] border border-slate-200 bg-white">
                <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
            </div>
        );
    }

    if (error) {
        return (
            <EmptyState
                icon={AlertCircle}
                title="Membership belum bisa dimuat"
                description={error}
            />
        );
    }

    const membership = latestPaidMembership ?? latestMembership;

    return (
        <div className="space-y-5">
            <section className="relative overflow-hidden rounded-[22px] bg-[#07111F] p-5 text-white shadow-[0_18px_45px_rgba(7,17,31,0.22)] sm:p-6">
                <div
                    className="absolute inset-0 opacity-60"
                    style={{
                        backgroundImage:
                            "linear-gradient(90deg,rgba(7,17,31,0.88),rgba(7,17,31,0.25)), url('/assets/images/gym-konten-1-olahraga-ub-sport-center.avif')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                <div className="relative z-[1] max-w-xl">
                    <p className="font-bdo text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">
                        Status Membership
                    </p>
                    <h3 className="mt-2 font-bdo text-[clamp(1.55rem,3.5vw,2.65rem)] font-semibold leading-[1.02]">
                        {hasActiveMembership
                            ? "Membership gym Anda aktif."
                            : "Membership gym belum aktif."}
                    </h3>
                    <p className="mt-3 font-bdo text-sm leading-relaxed text-white/70">
                        {hasActiveMembership
                            ? "Gunakan informasi ini saat konfirmasi layanan atau pengecekan akses gym."
                            : "Mulai dari paket yang sesuai kebutuhan, lalu staff akan membantu aktivasi."}
                    </p>
                    {!hasActiveMembership && (
                        <div className="mt-6 flex flex-wrap gap-2">
                            <a
                                href="/pricing"
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 font-bdo text-sm font-semibold text-[#07111F] transition hover:-translate-y-0.5"
                            >
                                Lihat Paket
                                <ArrowRight className="h-4 w-4" />
                            </a>
                            <a
                                href={whatsappUrl(
                                    "Halo UB Sport Center, saya ingin bertanya tentang membership gym.",
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 font-bdo text-sm font-semibold text-white transition hover:bg-white/15"
                            >
                                <MessageCircle className="h-4 w-4" />
                                Tanya Admin
                            </a>
                        </div>
                    )}
                </div>
            </section>

            {membership ? (
                <div className="grid gap-3 sm:grid-cols-3">
                    <StatusCard
                        icon={Dumbbell}
                        label="Paket"
                        value={membership.membership_plan ?? "Manual"}
                        description="Paket membership terakhir yang tercatat."
                    />
                    <StatusCard
                        icon={CalendarDays}
                        label="Masa Berlaku"
                        value={formatDate(membership.membership_period?.end_date)}
                        description={`${formatDate(
                            membership.membership_period?.start_date,
                        )} sampai ${formatDate(
                            membership.membership_period?.end_date,
                        )}`}
                    />
                    <StatusCard
                        icon={Clock}
                        label="Sisa Hari"
                        value={
                            hasActiveMembership && daysRemaining !== null
                                ? `${Math.max(daysRemaining, 0)}`
                                : "-"
                        }
                        description={
                            hasActiveMembership
                                ? "Segera perpanjang sebelum masa aktif habis."
                                : "Belum ada paket aktif saat ini."
                        }
                    />
                </div>
            ) : (
                <EmptyState
                    icon={Dumbbell}
                    title="Belum ada catatan membership"
                    description="Riwayat membership akan muncul setelah pendaftaran atau aktivasi paket."
                />
            )}

            {transactions.length > 0 && (
                <section className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <h3 className="font-bdo text-lg font-semibold text-slate-950">
                            Riwayat Membership
                        </h3>
                    </div>
                    <ul className="divide-y divide-slate-100">
                        {transactions.map((transaction) => (
                            <TransactionRow
                                key={transaction.id}
                                transaction={transaction}
                            />
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function EmptyState({
    icon: Icon,
    title,
    description,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
}) {
    return (
        <div className="rounded-[20px] border border-slate-200 bg-white px-5 py-14 text-center shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Icon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-bdo text-lg font-semibold text-slate-950">
                {title}
            </h3>
            <p className="mx-auto mt-2 max-w-md font-bdo text-sm leading-relaxed text-slate-500">
                {description}
            </p>
        </div>
    );
}
