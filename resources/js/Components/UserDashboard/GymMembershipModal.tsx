import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
    CircleAlert,
    Dumbbell,
    MessageCircleMore,
    RefreshCcw,
    Sparkles,
} from "lucide-react";
import axios from "axios";
import { usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import AccountModalShell, { PrimaryButton } from "./AccountModalShell";
import "./GymMembershipModal.css";

interface Props {
    onClose: () => void;
}

type MembershipStatus =
    | "active"
    | "scheduled"
    | "expired"
    | "cancelled"
    | "awaiting_payment"
    | "archived";

interface MembershipRecord {
    id: number | null;
    plan_name: string;
    image_url?: string | null;
    status: MembershipStatus;
    stored_status: string | null;
    payment_status: string | null;
    receipt_number: string | null;
    start_date: string | null;
    end_date: string | null;
    starts_at: string | null;
    expires_at: string | null;
    next_transition_at: string | null;
    days_remaining: number;
    progress: number;
}

interface MembershipResponse {
    current: MembershipRecord | null;
    scheduled: MembershipRecord | null;
    latest: MembershipRecord | null;
    meta: {
        server_now: string;
        next_transition_at: string | null;
    };
}

const WHATSAPP_URL = `https://wa.me/6285280809080?text=${encodeURIComponent(
    "Halo tim UB Sport Center, saya ingin berkonsultasi mengenai membership gym saya.",
)}`;
const FALLBACK_PLAN_IMAGE =
    "/assets/images/poster-gym-konten-program-ub-sport-center.avif";

function dateValue(primary: string | null, fallback: string | null) {
    const value = primary ?? fallback;
    if (!value) return null;
    return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function formatLongDate(dateStr: string | null) {
    if (!dateStr) return "Belum ditentukan";
    const date = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "Belum ditentukan";

    return date.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function formatUpdatedTime(value: string | undefined) {
    if (!value) return "Diperbarui otomatis";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Diperbarui otomatis";

    return `Diperbarui ${date.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
    })}`;
}

function durationLabel(start: string | null, end: string | null) {
    if (!start || !end) return "Periode fleksibel";
    const startAt = new Date(`${start}T12:00:00`).getTime();
    const endAt = new Date(`${end}T12:00:00`).getTime();

    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) {
        return "Periode fleksibel";
    }

    const days = Math.max(1, Math.round((endAt - startAt) / 86_400_000) + 1);
    if (days >= 330) return `${Math.max(1, Math.round(days / 365))} tahun`;
    if (days >= 28) return `${Math.max(1, Math.round(days / 30))} bulan`;
    return `${days} hari`;
}

function stateLabel(status: MembershipStatus) {
    return {
        active: "Aktif",
        scheduled: "Terjadwal",
        expired: "Berakhir",
        cancelled: "Dibatalkan",
        awaiting_payment: "Menunggu pembayaran",
        archived: "Tersimpan",
    }[status];
}

function accessPeriodCopy(membership: MembershipRecord) {
    if (membership.status === "active") {
        const days = Math.max(0, membership.days_remaining);
        return {
            value: days === 0 ? "Hari terakhir" : `${days} hari`,
            label: days === 0 ? "Akses berakhir hari ini" : "Sisa masa akses",
        };
    }

    if (membership.status === "scheduled") {
        return { value: "Terjadwal", label: "Aktif pada tanggal mulai" };
    }

    if (membership.status === "awaiting_payment") {
        return { value: "Menunggu", label: "Aktif setelah pembayaran" };
    }

    if (membership.status === "cancelled") {
        return { value: "Dibatalkan", label: "Periode tidak dilanjutkan" };
    }

    if (membership.status === "expired") {
        return { value: "Selesai", label: "Masa akses telah berakhir" };
    }

    return { value: "Tersimpan", label: "Credential berada di arsip" };
}

function membershipNote(status: MembershipStatus) {
    if (status === "active") {
        return "Perpanjangan dapat dipilih lebih awal. Periode baru dimulai setelah akses aktif ini berakhir.";
    }
    if (status === "scheduled") {
        return "Akses akan aktif otomatis pada tanggal mulai tanpa tindakan tambahan.";
    }
    if (status === "awaiting_payment") {
        return "Membership dijadwalkan setelah pembayaran berhasil dikonfirmasi.";
    }
    if (status === "cancelled") {
        return "Riwayat paket tetap tersimpan. Tim membership siap membantu bila diperlukan.";
    }
    return "Riwayat pembayaran tetap tersimpan. Anda dapat memilih paket baru kapan saja.";
}

function MembershipImage({
    src,
    planName,
}: {
    src?: string | null;
    planName: string;
}) {
    const [imageSrc, setImageSrc] = useState(src || FALLBACK_PLAN_IMAGE);

    useEffect(() => {
        setImageSrc(src || FALLBACK_PLAN_IMAGE);
    }, [src]);

    return (
        <img
            src={imageSrc}
            alt={`Visual paket ${planName}`}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(event) => {
                if (imageSrc !== FALLBACK_PLAN_IMAGE) {
                    setImageSrc(FALLBACK_PLAN_IMAGE);
                    return;
                }
                event.currentTarget.hidden = true;
            }}
        />
    );
}

type ProgressStyle = CSSProperties & { "--progress": string };

export default function GymMembershipModal({ onClose }: Props) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user!;
    const [payload, setPayload] = useState<MembershipResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const requestSequence = useRef(0);
    const lastRevalidationAt = useRef(0);
    const hasLoaded = useRef(false);

    const loadMembership = useCallback(async () => {
        const sequence = ++requestSequence.current;
        if (!hasLoaded.current) {
            setLoading(true);
            setError(null);
        }

        try {
            const response =
                await axios.get<MembershipResponse>("/user/membership");
            if (sequence === requestSequence.current) {
                setPayload(response.data);
                setError(null);
                hasLoaded.current = true;
            }
        } catch {
            if (sequence === requestSequence.current && !hasLoaded.current) {
                setError(
                    "Data membership belum berhasil dimuat. Data Anda tetap aman dan tidak berubah.",
                );
            }
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    }, []);

    useEffect(() => void loadMembership(), [loadMembership]);

    useEffect(() => {
        const revalidate = () => {
            if (document.visibilityState !== "visible") return;
            const now = Date.now();
            if (now - lastRevalidationAt.current < 750) return;
            lastRevalidationAt.current = now;
            void loadMembership();
        };

        document.addEventListener("visibilitychange", revalidate);
        window.addEventListener("focus", revalidate);

        return () => {
            document.removeEventListener("visibilitychange", revalidate);
            window.removeEventListener("focus", revalidate);
        };
    }, [loadMembership]);

    useEffect(() => {
        const nextTransition = payload?.meta.next_transition_at;
        if (!nextTransition) return;

        const transitionAt = new Date(nextTransition).getTime();
        if (!Number.isFinite(transitionAt) || transitionAt <= Date.now()) return;

        const timer = window.setTimeout(
            () => void loadMembership(),
            Math.min(
                Math.max(1_000, transitionAt - Date.now() + 350),
                2_147_000_000,
            ),
        );

        return () => window.clearTimeout(timer);
    }, [loadMembership, payload?.meta.next_transition_at]);

    const membership =
        payload?.current ?? payload?.scheduled ?? payload?.latest ?? null;
    const isActive = membership?.status === "active";
    const progress = useMemo(
        () =>
            membership
                ? Math.max(0, Math.min(100, Math.round(membership.progress * 100)))
                : 0,
        [membership],
    );
    const startDate = membership
        ? dateValue(membership.start_date, membership.starts_at)
        : null;
    const endDate = membership
        ? dateValue(membership.end_date, membership.expires_at)
        : null;
    const periodCopy = membership ? accessPeriodCopy(membership) : null;
    const reference = membership
        ? membership.receipt_number ??
          (membership.id
              ? `UBSC-${String(membership.id).padStart(6, "0")}`
              : "UBSC-MEMBER")
        : null;
    const credentialNumber = membership?.id
        ? `MEMBER-${String(membership.id).padStart(6, "0")}`
        : "MEMBER-TERVERIFIKASI";
    const scheduledStart = payload?.scheduled
        ? dateValue(payload.scheduled.start_date, payload.scheduled.starts_at)
        : null;

    return (
        <AccountModalShell
            bannerGradient="membership"
            eyebrow="Membership Gym"
            title="Status Membership"
            subtitle="Pantau paket, masa aktif, periode berikutnya, dan opsi perpanjangan Anda."
            wordmark="Membership"
            index="03"
            accent="#15678d"
            maxWidthClass="sm:max-w-[940px]"
            onClose={onClose}
            footer={
                !loading && !error ? (
                    <div className="acc-member__footer">
                        <PrimaryButton
                            type="button"
                            onClick={() => {
                                window.location.href = "/pricing";
                            }}
                        >
                            <Sparkles />
                            {isActive
                                ? "Lihat Harga Perpanjangan"
                                : "Pilih Paket Membership"}
                        </PrimaryButton>
                        <button
                            type="button"
                            className="acc-member__help"
                            onClick={() =>
                                window.open(
                                    WHATSAPP_URL,
                                    "_blank",
                                    "noopener,noreferrer",
                                )
                            }
                        >
                            <MessageCircleMore />
                            Konsultasi Membership
                        </button>
                    </div>
                ) : undefined
            }
        >
            <div
                className="acc-member"
                style={{ "--progress": `${progress}%` } as ProgressStyle}
                aria-live="polite"
                aria-busy={loading}
            >
                {loading && (
                    <div
                        className="acc-member__loading"
                        role="status"
                        aria-label="Memuat membership"
                    >
                        <span className="acc-member__sr-only">
                            Memuat informasi membership Anda.
                        </span>
                        <div className="acc-member__loading-photo" />
                        <div className="acc-member__loading-main" />
                        <div className="acc-member__loading-stub" />
                    </div>
                )}

                {!loading && error && (
                    <section className="acc-member__error" role="alert">
                        <div>
                            <span
                                className="acc-member__state-icon"
                                aria-hidden="true"
                            >
                                <CircleAlert />
                            </span>
                            <h3>Data Membership Belum Tersedia</h3>
                            <p>{error}</p>
                            <button
                                type="button"
                                className="acc-member__retry"
                                onClick={() => void loadMembership()}
                            >
                                <RefreshCcw /> Coba Lagi
                            </button>
                        </div>
                    </section>
                )}

                {!loading && !error && membership && periodCopy && (
                    <>
                        <section
                            className="acc-member__ticket"
                            data-status={membership.status}
                            aria-labelledby="membership-pass-title"
                        >
                            <figure className="acc-member__media">
                                <MembershipImage
                                    src={membership.image_url}
                                    planName={membership.plan_name}
                                />
                                <figcaption className="acc-member__media-caption">
                                    <span>UBSC / Member access</span>
                                    <strong>{membership.plan_name}</strong>
                                </figcaption>
                            </figure>

                            <div className="acc-member__body">
                                <header className="acc-member__ticket-head">
                                    <div>
                                        <p className="acc-member__eyebrow">
                                            Membership credential
                                        </p>
                                        <p className="acc-member__reference">
                                            {reference}
                                        </p>
                                    </div>
                                </header>

                                <div className="acc-member__hero">
                                    <p className="acc-member__plan-label">
                                        Paket membership
                                    </p>
                                    <h3
                                        id="membership-pass-title"
                                        className="acc-member__plan-name"
                                    >
                                        {membership.plan_name}
                                    </h3>
                                    <p className="acc-member__holder">
                                        Pemegang akses <strong>{user.name}</strong>
                                    </p>
                                </div>

                                <dl className="acc-member__validity">
                                    <div className="acc-member__validity-item">
                                        <dt>Mulai</dt>
                                        <dd>{formatLongDate(startDate)}</dd>
                                    </div>
                                    <div className="acc-member__validity-item">
                                        <dt>Berakhir</dt>
                                        <dd>{formatLongDate(endDate)}</dd>
                                    </div>
                                    <div className="acc-member__validity-item">
                                        <dt>Durasi</dt>
                                        <dd>{durationLabel(startDate, endDate)}</dd>
                                    </div>
                                </dl>
                            </div>

                            <aside
                                className="acc-member__stub"
                                aria-label={`Member pass ${membership.plan_name}`}
                            >
                                <div>
                                    <p className="acc-member__stub-label">
                                        Member pass
                                    </p>
                                    <span
                                        className="acc-member__status"
                                        data-status={membership.status}
                                    >
                                        {stateLabel(membership.status)}
                                    </span>
                                    <strong className="acc-member__stub-value">
                                        {periodCopy.value}
                                    </strong>
                                    <span className="acc-member__stub-copy">
                                        {periodCopy.label}
                                    </span>
                                    {isActive && (
                                        <div
                                            className="acc-member__progress"
                                            role="progressbar"
                                            aria-label="Progres periode membership"
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-valuenow={progress}
                                            aria-valuetext={periodCopy.value}
                                        >
                                            <span />
                                        </div>
                                    )}
                                </div>
                                <div className="acc-member__serial">
                                    <p className="acc-member__serial-label">
                                        Nomor akses
                                    </p>
                                    <p className="acc-member__serial-value">
                                        {credentialNumber}
                                    </p>
                                    <p className="acc-member__updated">
                                        {formatUpdatedTime(payload?.meta.server_now)}
                                    </p>
                                </div>
                            </aside>
                        </section>

                        {payload?.current && payload.scheduled && (
                            <section
                                className="acc-member__renewal"
                                aria-label="Periode membership berikutnya"
                            >
                                <div>
                                    <p className="acc-member__renewal-title">
                                        Periode berikutnya sudah siap
                                    </p>
                                    <p className="acc-member__renewal-copy">
                                        {payload.scheduled.plan_name} dimulai setelah
                                        masa aktif sekarang selesai.
                                    </p>
                                </div>
                                <span className="acc-member__renewal-date">
                                    Mulai {formatLongDate(scheduledStart)}
                                </span>
                            </section>
                        )}

                        <p className="acc-member__note">
                            {membershipNote(membership.status)}
                        </p>
                    </>
                )}

                {!loading && !error && !membership && (
                    <section className="acc-member__empty">
                        <div>
                            <span
                                className="acc-member__state-icon"
                                aria-hidden="true"
                            >
                                <Dumbbell />
                            </span>
                            <h3>Belum Ada Membership Aktif</h3>
                            <p>
                                Setelah paket selesai dibayar, masa aktif dan detail
                                membership akan muncul otomatis di sini.
                            </p>
                        </div>
                    </section>
                )}
            </div>
        </AccountModalShell>
    );
}
