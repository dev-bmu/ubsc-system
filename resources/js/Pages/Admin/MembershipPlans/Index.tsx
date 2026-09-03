import { Head, router, useForm, usePage } from "@inertiajs/react";
import {
    Activity,
    ArrowRight,
    Check,
    CheckCircle2,
    Crown,
    Gem,
    ImageIcon,
    Layers3,
    Pencil,
    Plus,
    ReceiptText,
    Search,
    ShieldCheck,
    Sparkles,
    Trash2,
    Users,
    X,
} from "lucide-react";
import {
    type FormEvent,
    type ReactNode,
    useEffect,
    useMemo,
    useState,
} from "react";
import { SingleDropzone } from "@/Components/Admin/ImageDropzone";
import SlideOver from "@/Components/Admin/SlideOver";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { MembershipPlanItem, MembershipPlanTier, PageProps } from "@/types";
import "./Index.css";

type Props = PageProps<{ plans: MembershipPlanItem[] }>;
type StatusFilter = "all" | "active" | "inactive";

const DEFAULT_MEMBERSHIP_CARD_IMAGE =
    "/assets/images/poster-gym-konten-program-ub-sport-center.avif";

type PlanFormData = {
    name: string;
    description: string;
    tier: MembershipPlanTier;
    public_badge: string;
    savings_label: string;
    cta_label: string;
    card_image: File | null;
    remove_card_image: boolean;
    price: string;
    compare_at_price: string;
    duration_months: number;
    features: string[];
    is_active: boolean;
    is_primary: boolean;
    sort_order: string;
    _method?: "PATCH";
};

type TierOption = {
    value: MembershipPlanTier;
    label: string;
    order: string;
    description: string;
    shortDescription: string;
};

const MEMBERSHIP_TIER_OPTIONS: TierOption[] = [
    {
        value: "hemat",
        label: "Hemat",
        order: "01",
        description: "Titik masuk paling ringan untuk memulai rutinitas.",
        shortDescription: "Akses esensial",
    },
    {
        value: "favorit",
        label: "Favorit",
        order: "02",
        description: "Pilihan seimbang yang paling mudah direkomendasikan.",
        shortDescription: "Pilihan utama",
    },
    {
        value: "performa",
        label: "Performa",
        order: "03",
        description: "Program lebih intens untuk progres yang terukur.",
        shortDescription: "Latihan progresif",
    },
    {
        value: "eksklusif",
        label: "Eksklusif",
        order: "04",
        description: "Pengalaman terlengkap untuk kebutuhan premium.",
        shortDescription: "Akses premium",
    },
];

const inputBase = "mp-input";
const labelBase = "mp-label";

function membershipTierOption(tier: MembershipPlanTier): TierOption {
    return MEMBERSHIP_TIER_OPTIONS.find((option) => option.value === tier)
        ?? MEMBERSHIP_TIER_OPTIONS[0];
}

function formatIDR(amount: number): string {
    return "Rp " + amount.toLocaleString("id-ID");
}

function formatCompactIDR(amount: number): string {
    if (amount >= 1_000_000_000) {
        return "Rp " + (amount / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " M";
    }
    if (amount >= 1_000_000) {
        return "Rp " + (amount / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
    }
    if (amount >= 1_000) {
        return "Rp " + (amount / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " rb";
    }
    return formatIDR(amount);
}

function durationLabel(months: number): string {
    if (months === 12) return "1 tahun";
    if (months === 1) return "1 bulan";
    return months + " bulan";
}

function durationLead(months: number): string {
    if (months === 12) return "Membership tahunan";
    if (months === 1) return "Membership bulanan";
    return "Membership " + months + " bulan";
}

function monthlyEstimate(plan: MembershipPlanItem): number {
    return Math.round(plan.price / Math.max(plan.duration_months, 1));
}

function discountPercentage(price: number, compareAtPrice?: number | null): number | null {
    const originalPrice = Number(compareAtPrice);
    if (!Number.isFinite(originalPrice) || originalPrice <= price) return null;
    return Math.round(((originalPrice - price) / originalPrice) * 100);
}

function TierMark({ tier, compact = false }: { tier: MembershipPlanTier; compact?: boolean }) {
    const option = membershipTierOption(tier);

    return (
        <span className={cn("mp-tier-mark", "mp-tier-" + tier, compact && "is-compact")}>
            <span className="mp-tier-mark__dot" aria-hidden="true" />
            <span>{option.label}</span>
        </span>
    );
}

function ToggleSwitch({
    enabled,
    onChange,
    label,
    disabled = false,
}: {
    enabled: boolean;
    onChange: (value: boolean) => void;
    label: string;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-label={label}
            aria-checked={enabled}
            disabled={disabled}
            onClick={() => onChange(!enabled)}
            className={cn("mp-switch", enabled && "is-on")}
        >
            <span className="mp-switch__thumb" />
        </button>
    );
}

function FormSection({
    number,
    title,
    description,
    children,
}: {
    number: string;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="mp-form-section">
            <header className="mp-form-section__header">
                <span className="mp-form-section__number">{number}</span>
                <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>
            </header>
            <div className="mp-form-section__body">{children}</div>
        </section>
    );
}

function FieldError({ message }: { message?: string }) {
    return message ? <p className="mp-field-error">{message}</p> : null;
}

function PlanForm({ item, onClose }: { item: MembershipPlanItem | null; onClose: () => void }) {
    const isEdit = item !== null;
    const [featureInput, setFeatureInput] = useState("");
    const { data, setData, post, processing, errors } = useForm<PlanFormData>({
        name: item?.name ?? "",
        description: item?.description ?? "",
        tier: item?.tier ?? (item?.is_primary ? "favorit" : "hemat"),
        public_badge: item?.public_badge ?? "",
        savings_label: item?.savings_label ?? "",
        cta_label: item?.cta_label ?? "",
        card_image: null,
        remove_card_image: false,
        price: item ? String(item.price) : "",
        compare_at_price: item?.compare_at_price ? String(item.compare_at_price) : "",
        duration_months: item?.duration_months ?? 1,
        features: item?.features ?? [],
        is_active: item?.is_active ?? true,
        is_primary: item?.is_primary ?? false,
        sort_order: item ? String(item.sort_order) : "0",
        ...(isEdit ? { _method: "PATCH" as const } : {}),
    });

    const previewUrl = useMemo(() => {
        if (data.card_image) return URL.createObjectURL(data.card_image);
        if (!item) return null;
        return item.card_image_url || DEFAULT_MEMBERSHIP_CARD_IMAGE;
    }, [data.card_image, item]);

    useEffect(() => {
        return () => {
            if (data.card_image && previewUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [data.card_image, previewUrl]);

    const addFeature = () => {
        const next = featureInput.trim();
        if (!next) return;

        if (data.features.some((feature) => feature.toLowerCase() === next.toLowerCase())) {
            setFeatureInput("");
            return;
        }

        setData("features", [...data.features, next]);
        setFeatureInput("");
    };

    const removeFeature = (index: number) => {
        setData("features", data.features.filter((_, featureIndex) => featureIndex !== index));
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const target = isEdit
            ? route("admin.memberships.plans.update", item.id)
            : route("admin.memberships.plans.store");

        post(target, {
            onSuccess: onClose,
            preserveScroll: true,
            forceFormData: true,
        });
    };

    const tier = membershipTierOption(data.tier);
    const price = Number(data.price) || 0;
    const compareAtPrice = Number(data.compare_at_price) || 0;
    const discount = discountPercentage(price, compareAtPrice);

    return (
        <form onSubmit={submit} className="mp-form">
            <section className={cn("mp-form-preview", "mp-tier-" + data.tier)}>
                <div className="mp-form-preview__media">
                    {previewUrl ? (
                        <img
                            src={previewUrl}
                            alt="Pratinjau gambar paket"
                            onError={(event) => {
                                const image = event.currentTarget;
                                if (image.dataset.fallbackApplied === "true") return;
                                image.dataset.fallbackApplied = "true";
                                image.src = DEFAULT_MEMBERSHIP_CARD_IMAGE;
                            }}
                        />
                    ) : (
                        <div className="mp-form-preview__placeholder">
                            <ImageIcon size={24} />
                            <span>Pratinjau visual paket</span>
                        </div>
                    )}
                    <div className="mp-form-preview__wash" />
                </div>
                <div className="mp-form-preview__content">
                    <div className="mp-form-preview__topline">
                        <span>{tier.order} / {tier.label}</span>
                        <span>{data.is_active ? "Tampil publik" : "Draft"}</span>
                    </div>
                    <div>
                        <p className="mp-form-preview__lead">{durationLead(data.duration_months)}</p>
                        <h3>{data.name || "Nama paket membership"}</h3>
                        <div className="mp-form-preview__price">
                            <strong>{price > 0 ? formatIDR(price) : "Harga belum diisi"}</strong>
                            <span>/ {durationLabel(data.duration_months)}</span>
                        </div>
                    </div>
                    <div className="mp-form-preview__footer">
                        <span>{data.public_badge || tier.shortDescription}</span>
                        {discount ? <span>Hemat {discount}%</span> : <span>{data.features.length} benefit</span>}
                    </div>
                </div>
            </section>

            <FormSection
                number="01"
                title="Identitas paket"
                description="Nama dan penjelasan yang pertama kali dibaca calon member."
            >
                <div className="mp-field-grid">
                    <div className="mp-field mp-field--wide">
                        <label htmlFor="plan_name" className={labelBase}>Nama paket</label>
                        <input
                            id="plan_name"
                            type="text"
                            value={data.name}
                            onChange={(event) => setData("name", event.target.value)}
                            placeholder="Contoh: Gym Basic"
                            className={inputBase}
                            required
                        />
                        <FieldError message={errors.name} />
                    </div>
                    <div className="mp-field mp-field--wide">
                        <label htmlFor="plan_description" className={labelBase}>Deskripsi singkat</label>
                        <textarea
                            id="plan_description"
                            rows={3}
                            value={data.description}
                            onChange={(event) => setData("description", event.target.value)}
                            placeholder="Jelaskan nilai utama paket dengan kalimat singkat."
                            className={cn(inputBase, "mp-input--textarea")}
                        />
                        <FieldError message={errors.description} />
                    </div>
                </div>
            </FormSection>

            <FormSection
                number="02"
                title="Posisi dalam jenjang"
                description="Pilih karakter paket agar pengguna memahami perbedaannya dalam sekali lihat."
            >
                <fieldset>
                    <legend className="sr-only">Tingkatan membership</legend>
                    <div className="mp-tier-picker" role="radiogroup" aria-label="Tingkatan membership">
                        {MEMBERSHIP_TIER_OPTIONS.map((option) => {
                            const selected = data.tier === option.value;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => setData("tier", option.value)}
                                    className={cn(
                                        "mp-tier-choice",
                                        "mp-tier-" + option.value,
                                        selected && "is-selected",
                                    )}
                                >
                                    <span className="mp-tier-choice__index">{option.order}</span>
                                    <span className="mp-tier-choice__swatch" />
                                    <span className="mp-tier-choice__copy">
                                        <strong>{option.label}</strong>
                                        <small>{option.shortDescription}</small>
                                    </span>
                                    <span className="mp-tier-choice__check"><Check size={12} /></span>
                                </button>
                            );
                        })}
                    </div>
                    <FieldError message={errors.tier} />
                </fieldset>

                <div className="mp-field-grid mp-field-grid--three">
                    <div className="mp-field">
                        <label htmlFor="plan_public_badge" className={labelBase}>Badge publik</label>
                        <input
                            id="plan_public_badge"
                            type="text"
                            value={data.public_badge}
                            onChange={(event) => setData("public_badge", event.target.value)}
                            placeholder="Contoh: Paling populer"
                            className={inputBase}
                        />
                        <FieldError message={errors.public_badge} />
                    </div>
                    <div className="mp-field">
                        <label htmlFor="plan_savings_label" className={labelBase}>Label promo</label>
                        <input
                            id="plan_savings_label"
                            type="text"
                            value={data.savings_label}
                            onChange={(event) => setData("savings_label", event.target.value)}
                            placeholder="Contoh: Hemat 20%"
                            className={inputBase}
                        />
                        <FieldError message={errors.savings_label} />
                    </div>
                    <div className="mp-field">
                        <label htmlFor="plan_cta_label" className={labelBase}>Teks tombol</label>
                        <input
                            id="plan_cta_label"
                            type="text"
                            value={data.cta_label}
                            onChange={(event) => setData("cta_label", event.target.value)}
                            placeholder="Contoh: Pilih paket"
                            className={inputBase}
                        />
                        <FieldError message={errors.cta_label} />
                    </div>
                </div>

                <div className="mp-upload-shell">
                    <SingleDropzone
                        label={isEdit ? "Gambar landscape" : "Gambar landscape (wajib)"}
                        currentUrl={
                            item
                                ? item.card_image_url || DEFAULT_MEMBERSHIP_CARD_IMAGE
                                : null
                        }
                        allowRemove={false}
                        onFileSelect={(file) => {
                            setData("card_image", file);
                            if (file) setData("remove_card_image", false);
                        }}
                        onRemoveExisting={() => {
                            setData("card_image", null);
                            setData("remove_card_image", true);
                        }}
                    />
                    <p>JPG, PNG, WebP, atau AVIF landscape · minimal 960 × 240 px · maksimal 5 MB.</p>
                    <FieldError message={errors.card_image} />
                </div>
            </FormSection>

            <FormSection
                number="03"
                title="Harga dan periode"
                description="Nominal utama dibuat dominan, sementara pembanding dan estimasi bulanan tetap mudah dipahami."
            >
                <div className="mp-field-grid mp-field-grid--price">
                    <div className="mp-field">
                        <label htmlFor="plan_price" className={labelBase}>Harga membership</label>
                        <div className="mp-money-input">
                            <span>Rp</span>
                            <input
                                id="plan_price"
                                type="number"
                                min="0"
                                step="1000"
                                value={data.price}
                                onChange={(event) => setData("price", event.target.value)}
                                placeholder="150000"
                                required
                            />
                        </div>
                        <FieldError message={errors.price} />
                    </div>
                    <div className="mp-field">
                        <label htmlFor="plan_compare_at_price" className={labelBase}>Harga normal</label>
                        <div className="mp-money-input">
                            <span>Rp</span>
                            <input
                                id="plan_compare_at_price"
                                type="number"
                                min="0"
                                step="1000"
                                value={data.compare_at_price}
                                onChange={(event) => setData("compare_at_price", event.target.value)}
                                placeholder="187500"
                            />
                        </div>
                        <FieldError message={errors.compare_at_price} />
                    </div>
                    <div className="mp-field">
                        <label htmlFor="plan_duration" className={labelBase}>Periode berlaku</label>
                        <select
                            id="plan_duration"
                            value={data.duration_months}
                            onChange={(event) => setData("duration_months", Number(event.target.value))}
                            className={inputBase}
                        >
                            <option value={1}>Bulanan · 1 bulan</option>
                            <option value={3}>Triwulan · 3 bulan</option>
                            <option value={6}>Semester · 6 bulan</option>
                            <option value={12}>Tahunan · 12 bulan</option>
                        </select>
                        <FieldError message={errors.duration_months} />
                    </div>
                    <div className="mp-field">
                        <label htmlFor="plan_sort_order" className={labelBase}>Urutan dalam tier</label>
                        <input
                            id="plan_sort_order"
                            type="number"
                            value={data.sort_order}
                            onChange={(event) => setData("sort_order", event.target.value)}
                            className={inputBase}
                        />
                        <FieldError message={errors.sort_order} />
                    </div>
                </div>

                <div className="mp-price-insight">
                    <ReceiptText size={17} />
                    <div>
                        <strong>
                            {price > 0
                                ? formatIDR(Math.round(price / Math.max(data.duration_months, 1))) + "/bulan"
                                : "Estimasi bulanan belum tersedia"}
                        </strong>
                        <span>
                            {discount
                                ? "Selisih " + discount + "% dari harga normal."
                                : "Isi harga normal untuk menampilkan nilai penghematan otomatis."}
                        </span>
                    </div>
                </div>
            </FormSection>

            <FormSection
                number="04"
                title="Benefit member"
                description="Tambahkan alasan paling kuat untuk memilih paket ini."
            >
                <div className="mp-feature-entry">
                    <input
                        type="text"
                        value={featureInput}
                        onChange={(event) => setFeatureInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                addFeature();
                            }
                        }}
                        placeholder="Contoh: Akses gym setiap hari"
                        className={inputBase}
                        aria-label="Tambah benefit paket"
                    />
                    <button type="button" onClick={addFeature}>
                        <Plus size={14} />
                        Tambah
                    </button>
                </div>

                {data.features.length > 0 ? (
                    <div className="mp-feature-list">
                        {data.features.map((feature, index) => (
                            <div key={feature + "-" + index} className="mp-feature-item">
                                <span className="mp-feature-item__index">{String(index + 1).padStart(2, "0")}</span>
                                <CheckCircle2 size={14} />
                                <span>{feature}</span>
                                <button
                                    type="button"
                                    onClick={() => removeFeature(index)}
                                    aria-label={"Hapus benefit " + feature}
                                >
                                    <X size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="mp-form-empty">Belum ada benefit. Tambahkan minimal tiga agar paket lebih mudah dibandingkan.</div>
                )}
                <FieldError message={errors.features} />
            </FormSection>

            <FormSection
                number="05"
                title="Publikasi"
                description="Tentukan apakah paket terlihat dan menjadi rekomendasi utama."
            >
                <div className="mp-publish-grid">
                    <div className={cn("mp-publish-option", data.is_active && "is-selected")}>
                        <span className="mp-publish-option__icon"><Activity size={17} /></span>
                        <div>
                            <strong>Tampilkan paket</strong>
                            <p>{data.is_active ? "Paket dapat dipilih pengguna." : "Paket disembunyikan sementara."}</p>
                        </div>
                        <ToggleSwitch
                            label="Tampilkan paket"
                            enabled={data.is_active}
                            onChange={(value) => {
                                setData("is_active", value);
                                if (!value) setData("is_primary", false);
                            }}
                        />
                    </div>
                    <div className={cn("mp-publish-option", data.is_primary && "is-selected")}>
                        <span className="mp-publish-option__icon"><Crown size={17} /></span>
                        <div>
                            <strong>Paket utama</strong>
                            <p>{data.is_primary ? "Menjadi pilihan default." : "Tidak diberi prioritas khusus."}</p>
                        </div>
                        <ToggleSwitch
                            label="Jadikan paket utama"
                            enabled={data.is_primary}
                            disabled={!data.is_active}
                            onChange={(value) => setData("is_primary", value)}
                        />
                    </div>
                </div>
            </FormSection>

            <footer className="mp-form-actions">
                <button type="button" onClick={onClose} className="mp-button mp-button--quiet">
                    Batal
                </button>
                <button type="submit" disabled={processing} className="mp-button mp-button--primary">
                    <span>{processing ? "Menyimpan..." : isEdit ? "Simpan perubahan" : "Buat paket"}</span>
                    <ArrowRight size={15} />
                </button>
            </footer>
        </form>
    );
}

function Metric({
    icon,
    label,
    value,
    note,
}: {
    icon: ReactNode;
    label: string;
    value: string | number;
    note: string;
}) {
    return (
        <div className="mp-metric">
            <span className="mp-metric__icon">{icon}</span>
            <div>
                <span className="mp-metric__label">{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
            </div>
        </div>
    );
}

function PlanCard({
    plan,
    index,
    onEdit,
    onDelete,
}: {
    plan: MembershipPlanItem;
    index: number;
    onEdit: (plan: MembershipPlanItem) => void;
    onDelete: (plan: MembershipPlanItem) => void;
}) {
    const discount = discountPercentage(plan.price, plan.compare_at_price);
    const features = plan.features.slice(0, 3);

    return (
        <article className={cn("mp-plan", "mp-tier-" + plan.tier, !plan.is_active && "is-inactive")}>
            <div className="mp-plan__visual">
                <img
                    src={plan.card_image_url || DEFAULT_MEMBERSHIP_CARD_IMAGE}
                    alt={"Visual " + plan.name}
                    onError={(event) => {
                        const image = event.currentTarget;
                        if (image.dataset.fallbackApplied === "true") return;
                        image.dataset.fallbackApplied = "true";
                        image.src = DEFAULT_MEMBERSHIP_CARD_IMAGE;
                    }}
                />
                <div className="mp-plan__visual-shade" />
                <span className="mp-plan__position">{String(index + 1).padStart(2, "0")}</span>
                <div className="mp-plan__visual-footer">
                    <TierMark tier={plan.tier} compact />
                    <span>{durationLabel(plan.duration_months)}</span>
                </div>
            </div>

            <div className="mp-plan__body">
                <div className="mp-plan__eyebrow">
                    <span className={cn("mp-status", plan.is_active ? "is-active" : "is-hidden")}>
                        <i /> {plan.is_active ? "Tampil publik" : "Disembunyikan"}
                    </span>
                    {plan.is_primary && <span className="mp-primary-tag"><Crown size={12} /> Pilihan utama</span>}
                    {plan.public_badge && <span className="mp-public-badge">{plan.public_badge}</span>}
                </div>

                <div className="mp-plan__title-row">
                    <div>
                        <p>{durationLead(plan.duration_months)}</p>
                        <h2>{plan.name}</h2>
                    </div>
                    <span className="mp-plan__members"><Users size={14} /> {plan.active_members_count} aktif</span>
                </div>

                <p className="mp-plan__description">
                    {plan.description || "Belum ada deskripsi singkat untuk paket ini."}
                </p>

                <div className="mp-plan__benefits">
                    {features.length > 0 ? features.map((feature, featureIndex) => (
                        <span key={feature + "-" + featureIndex}>
                            <CheckCircle2 size={13} />
                            <span>{feature}</span>
                        </span>
                    )) : (
                        <span className="is-empty"><Sparkles size={13} /> Benefit belum diisi</span>
                    )}
                    {plan.features.length > features.length && (
                        <span className="is-more">+{plan.features.length - features.length} lainnya</span>
                    )}
                </div>
            </div>

            <aside className="mp-plan__commerce">
                <div className="mp-plan__price-head">
                    <span>Harga paket</span>
                    <span>#{plan.sort_order || index + 1}</span>
                </div>
                {discount && plan.compare_at_price ? (
                    <div className="mp-plan__saving">
                        <span>{formatIDR(plan.compare_at_price)}</span>
                        <strong>Hemat {discount}%</strong>
                    </div>
                ) : (
                    <div className="mp-plan__saving is-placeholder">Harga final</div>
                )}
                <strong className="mp-plan__price">{formatIDR(plan.price)}</strong>
                <div className="mp-plan__monthly">
                    <ReceiptText size={14} />
                    <span>{formatIDR(monthlyEstimate(plan))} / bulan</span>
                </div>

                <div className="mp-plan__actions">
                    <button type="button" onClick={() => onEdit(plan)} className="mp-action mp-action--edit">
                        <Pencil size={14} />
                        Edit paket
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(plan)}
                        className="mp-action mp-action--delete"
                        aria-label={"Hapus paket " + plan.name}
                        title="Hapus paket"
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            </aside>
        </article>
    );
}

function EmptyState({
    onCreate,
    filtered = false,
}: {
    onCreate: () => void;
    filtered?: boolean;
}) {
    return (
        <section className="mp-empty">
            <span className="mp-empty__icon">{filtered ? <Search size={22} /> : <Layers3 size={22} />}</span>
            <div>
                <h2>{filtered ? "Paket tidak ditemukan" : "Belum ada paket membership"}</h2>
                <p>{filtered ? "Ubah kata kunci atau status untuk melihat paket lain." : "Buat paket pertama agar jenjang membership dapat ditampilkan kepada pengguna."}</p>
            </div>
            {!filtered && (
                <button type="button" onClick={onCreate} className="mp-button mp-button--primary">
                    <Plus size={15} /> Tambah paket pertama
                </button>
            )}
        </section>
    );
}

export default function MembershipPlansIndex() {
    const { plans, flash, errors } = usePage<Props>().props;
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [slideOver, setSlideOver] = useState<{ open: boolean; item: MembershipPlanItem | null }>({
        open: false,
        item: null,
    });

    const summary = useMemo(() => {
        const activePlans = plans.filter((plan) => plan.is_active);
        const members = plans.reduce((total, plan) => total + plan.active_members_count, 0);
        const cheapest = plans.length > 0 ? Math.min(...plans.map((plan) => plan.price)) : 0;

        return {
            total: plans.length,
            active: activePlans.length,
            members,
            cheapest,
        };
    }, [plans]);

    const filteredPlans = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase("id-ID");

        return plans.filter((plan) => {
            const matchesQuery = !needle
                || plan.name.toLocaleLowerCase("id-ID").includes(needle)
                || membershipTierOption(plan.tier).label.toLocaleLowerCase("id-ID").includes(needle)
                || (plan.description ?? "").toLocaleLowerCase("id-ID").includes(needle);
            const matchesStatus = statusFilter === "all"
                || (statusFilter === "active" && plan.is_active)
                || (statusFilter === "inactive" && !plan.is_active);

            return matchesQuery && matchesStatus;
        });
    }, [plans, query, statusFilter]);

    const openCreate = () => setSlideOver({ open: true, item: null });
    const openEdit = (item: MembershipPlanItem) => setSlideOver({ open: true, item });
    const closeSlideOver = () => setSlideOver({ open: false, item: null });

    const deletePlan = (plan: MembershipPlanItem) => {
        if (!window.confirm('Hapus paket "' + plan.name + '"?')) return;
        router.delete(route("admin.memberships.plans.destroy", plan.id), { preserveScroll: true });
    };

    return (
        <AdminLayout
            header={
                <div className="mp-page-heading">
                    <span>Manajemen Keanggotaan</span>
                    <h1><span className="mp-title-shine">Membership Plans</span></h1>
                </div>
            }
        >
            <Head title="Membership Plans" />

            <main className="mp-page">
                {flash?.success && (
                    <section className="mp-alert mp-alert--success" role="status">
                        <span><CheckCircle2 size={17} /></span>
                        <p>{flash.success}</p>
                    </section>
                )}

                {errors?.plan && (
                    <section className="mp-alert mp-alert--error" role="alert">
                        <span><X size={17} /></span>
                        <p>{errors.plan}</p>
                    </section>
                )}

                <section className="mp-hero">
                    <div className="mp-hero__grid" aria-hidden="true" />
                    <div className="mp-hero__flare mp-hero__flare--red" aria-hidden="true" />
                    <div className="mp-hero__flare mp-hero__flare--peach" aria-hidden="true" />

                    <div className="mp-hero__content">
                        <div className="mp-hero__meta">
                            <span><i /> Paket publik</span>
                        </div>

                        <div className="mp-hero__layout">
                            <div className="mp-hero__copy">
                                <p>Katalog membership</p>
                                <h2>Susun paket gym yang jelas, rapi, dan mudah dibandingkan pengguna.</h2>
                                <span>
                                    Paket ditampilkan dari Hemat hingga Eksklusif. Periksa harga, benefit, dan status tayang sebelum paket dilihat pengguna.
                                </span>
                            </div>

                            <button type="button" onClick={openCreate} className="mp-hero__cta">
                                <span><Plus size={16} /></span>
                                Tambah paket
                                <ArrowRight size={15} />
                            </button>
                        </div>
                    </div>
                </section>

                <section className="mp-metrics" aria-label="Ringkasan paket membership">
                    <span className="mp-metrics__label">Ringkasan</span>
                    <div className="mp-metrics__items">
                        <Metric icon={<Layers3 size={15} />} label="Total paket" value={summary.total} note="Seluruh katalog" />
                        <Metric icon={<Activity size={15} />} label="Tampil publik" value={summary.active} note={Math.max(summary.total - summary.active, 0) + " disembunyikan"} />
                        <Metric icon={<Users size={15} />} label="Member aktif" value={summary.members} note="Berlaku hari ini" />
                        <Metric icon={<ReceiptText size={15} />} label="Harga mulai" value={summary.cheapest > 0 ? formatCompactIDR(summary.cheapest) : "—"} note="Titik masuk katalog" />
                    </div>
                </section>

                <section className="mp-catalog">
                    <header className="mp-catalog__header">
                        <div className="mp-catalog__title">
                            <span className="mp-catalog__icon"><Gem size={18} /></span>
                            <div>
                                <p>Susunan publik</p>
                                <h2>Katalog paket</h2>
                                <span>Urutan tier tetap konsisten; urutan manual berlaku di dalam tier yang sama.</span>
                            </div>
                        </div>

                        <div className="mp-catalog__tools">
                            <label className="mp-search">
                                <Search size={15} />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Cari paket atau tier..."
                                    aria-label="Cari paket membership"
                                />
                                {query && (
                                    <button type="button" onClick={() => setQuery("")} aria-label="Bersihkan pencarian">
                                        <X size={13} />
                                    </button>
                                )}
                            </label>

                            <div className="mp-filter" aria-label="Filter status paket">
                                {([
                                    ["all", "Semua"],
                                    ["active", "Aktif"],
                                    ["inactive", "Nonaktif"],
                                ] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setStatusFilter(value)}
                                        className={cn(statusFilter === value && "is-selected")}
                                        aria-pressed={statusFilter === value}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </header>

                    <div className="mp-catalog__result-bar">
                        <span><ShieldCheck size={14} /> {filteredPlans.length} paket ditampilkan</span>
                        <span>Hemat → Favorit → Performa → Eksklusif</span>
                    </div>

                    {plans.length === 0 ? (
                        <EmptyState onCreate={openCreate} />
                    ) : filteredPlans.length === 0 ? (
                        <EmptyState onCreate={openCreate} filtered />
                    ) : (
                        <div className="mp-plan-list">
                            {filteredPlans.map((plan) => (
                                <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    index={plans.findIndex((source) => source.id === plan.id)}
                                    onEdit={openEdit}
                                    onDelete={deletePlan}
                                />
                            ))}
                        </div>
                    )}
                </section>
            </main>

            <SlideOver
                isOpen={slideOver.open}
                onClose={closeSlideOver}
                panelClassName="mp-slide-over"
                headerClassName="mp-slide-over__header"
                contentClassName="mp-slide-over__content"
                title={slideOver.item ? "Edit Paket" : "Tambah Paket"}
                description={slideOver.item
                    ? "Perbarui " + slideOver.item.name + " tanpa mengubah histori member."
                    : "Bangun paket baru yang siap tampil di website."}
            >
                {slideOver.open && (
                    <PlanForm
                        key={slideOver.item?.id ?? "new"}
                        item={slideOver.item}
                        onClose={closeSlideOver}
                    />
                )}
            </SlideOver>
        </AdminLayout>
    );
}
