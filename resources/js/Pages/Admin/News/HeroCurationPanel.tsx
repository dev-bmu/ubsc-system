import { router } from "@inertiajs/react";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Check,
    Clock3,
    ExternalLink,
    Eye,
    ImageOff,
    Layers3,
    Plus,
    RotateCcw,
    Save,
    Search,
    Sparkles,
    Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { NewsItem, NewsStatus } from "@/types";

type StatusFilter = NewsStatus | "all";

type Props = {
    articles: NewsItem[];
    canCurate: boolean;
};

const MAX_SLOTS = 6;
const PUBLIC_CATEGORIES = new Set(["Berita", "Artikel"]);

const STATUS_LABELS: Record<NewsStatus, string> = {
    published: "Terbit",
    draft: "Draft",
    archived: "Arsip",
};

function publicationTimestamp(article: NewsItem): number | null {
    if (!article.published_at) return null;

    const value = article.published_at.includes("T")
        ? article.published_at
        : article.published_at.replace(" ", "T");
    const timestamp = Date.parse(value);

    return Number.isNaN(timestamp) ? null : timestamp;
}

function isLive(article: NewsItem): boolean {
    const timestamp = publicationTimestamp(article);

    return (
        article.status === "published" &&
        timestamp !== null &&
        timestamp <= Date.now() &&
        PUBLIC_CATEGORIES.has(article.category?.name ?? "")
    );
}

function displayStatus(article: NewsItem): string {
    if (isLive(article)) return "Tayang";
    if (article.status === "published") return "Terjadwal";

    return STATUS_LABELS[article.status];
}

function orderedHeroIds(articles: NewsItem[]): number[] {
    return [...articles]
        .filter((article) => article.is_hero_featured)
        .sort((first, second) => {
            const firstOrder = first.hero_sort_order ?? 99;
            const secondOrder = second.hero_sort_order ?? 99;

            return firstOrder === secondOrder
                ? first.id - second.id
                : firstOrder - secondOrder;
        })
        .slice(0, MAX_SLOTS)
        .map((article) => article.id);
}

function StatusPill({ article }: { article: NewsItem }) {
    const live = isLive(article);

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bdo text-[10px] font-bold",
                live
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : article.status === "draft"
                      ? "border-slate-200 bg-slate-100 text-slate-600"
                      : "border-amber-200 bg-amber-50 text-amber-700",
            )}
        >
            <span
                className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    live
                        ? "bg-emerald-500"
                        : article.status === "draft"
                          ? "bg-slate-400"
                          : "bg-amber-500",
                )}
            />
            {displayStatus(article)}
        </span>
    );
}

export default function HeroCurationPanel({ articles, canCurate }: Props) {
    const initialIds = useMemo(() => orderedHeroIds(articles), [articles]);
    const initialKey = initialIds.join(":");
    const [slotIds, setSlotIds] = useState<number[]>(initialIds);
    const [previewId, setPreviewId] = useState<number | null>(initialIds[0] ?? null);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [saving, setSaving] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const nextIds = initialKey
            ? initialKey.split(":").map((id) => Number(id))
            : [];

        setSlotIds(nextIds);
        setPreviewId((current) =>
            current && nextIds.includes(current)
                ? current
                : nextIds[0] ?? null,
        );
    }, [initialKey]);

    useEffect(() => {
        if (!saved) return;

        const timeout = window.setTimeout(() => setSaved(false), 3_000);
        return () => window.clearTimeout(timeout);
    }, [saved]);

    const articlesById = useMemo(
        () => new Map(articles.map((article) => [article.id, article])),
        [articles],
    );
    const selectedArticles = slotIds
        .map((id) => articlesById.get(id))
        .filter((article): article is NewsItem => Boolean(article));
    const automaticPreview = useMemo(
        () =>
            [...articles]
                .filter(isLive)
                .sort(
                    (first, second) =>
                        (publicationTimestamp(second) ?? 0) -
                        (publicationTimestamp(first) ?? 0),
                )[0] ?? null,
        [articles],
    );
    const previewArticle =
        (previewId ? articlesById.get(previewId) : null) ??
        selectedArticles[0] ??
        automaticPreview;
    const liveCount = selectedArticles.filter(isLive).length;
    const stagedCount = selectedArticles.length - liveCount;
    const isDirty = slotIds.join(":") !== initialKey;

    const candidates = useMemo(() => {
        const needle = query.trim().toLowerCase();

        return articles
            .filter((article) => PUBLIC_CATEGORIES.has(article.category?.name ?? ""))
            .filter(
                (article) =>
                    statusFilter === "all" || article.status === statusFilter,
            )
            .filter((article) => {
                if (!needle) return true;

                return [
                    article.title,
                    article.excerpt ?? "",
                    article.category?.name ?? "",
                    article.author.name,
                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(needle);
            })
            .sort((first, second) => {
                const firstSelected = slotIds.includes(first.id) ? 1 : 0;
                const secondSelected = slotIds.includes(second.id) ? 1 : 0;

                if (firstSelected !== secondSelected) {
                    return secondSelected - firstSelected;
                }

                return (
                    (publicationTimestamp(second) ?? 0) -
                    (publicationTimestamp(first) ?? 0)
                );
            });
    }, [articles, query, slotIds, statusFilter]);

    const addArticle = (article: NewsItem) => {
        if (!canCurate || slotIds.includes(article.id)) {
            setPreviewId(article.id);
            return;
        }

        if (slotIds.length >= MAX_SLOTS) {
            setServerError("Enam slot sudah terisi. Hapus satu konten sebelum menambahkan pilihan baru.");
            return;
        }

        setSlotIds((current) => [...current, article.id]);
        setPreviewId(article.id);
        setServerError(null);
        setSaved(false);
    };

    const removeArticle = (index: number) => {
        if (!canCurate) return;

        setSlotIds((current) => {
            const removedId = current[index];
            const next = current.filter((_, itemIndex) => itemIndex !== index);

            if (previewId === removedId) {
                setPreviewId(next[Math.min(index, next.length - 1)] ?? null);
            }

            return next;
        });
        setServerError(null);
        setSaved(false);
    };

    const moveArticle = (index: number, direction: -1 | 1) => {
        if (!canCurate) return;

        const target = index + direction;
        if (target < 0 || target >= slotIds.length) return;

        setSlotIds((current) => {
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
        setServerError(null);
        setSaved(false);
    };

    const restore = () => {
        setSlotIds(initialIds);
        setPreviewId(initialIds[0] ?? null);
        setServerError(null);
        setSaved(false);
    };

    const save = () => {
        if (!canCurate || !isDirty || saving) return;

        setSaving(true);
        setServerError(null);
        router.put(
            route("admin.news.hero.update"),
            {
                news_ids: slotIds,
                expected_news_ids: initialIds,
            },
            {
                preserveScroll: true,
                onSuccess: () => setSaved(true),
                onError: (errors) => {
                    setServerError(
                        String(
                            errors.news_ids ??
                                Object.values(errors)[0] ??
                                "Susunan hero belum dapat disimpan.",
                        ),
                    );
                },
                onFinish: () => setSaving(false),
            },
        );
    };

    return (
        <section
            id="hero-curation"
            className="news-enter delay-100 news-hero-curation relative scroll-mt-24 overflow-hidden rounded-[24px] border border-slate-800 text-white shadow-[0_30px_70px_-48px_rgba(15,23,42,.9)] sm:scroll-mt-28"
        >
            <div className="news-hero-curation__grid" aria-hidden="true" />
            <div className="news-hero-curation__glow" aria-hidden="true" />

            <header className="relative z-10 flex flex-col gap-4 border-b border-white/10 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-white/15 bg-white/10 text-[#F08C78] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
                        <Sparkles size={18} />
                    </span>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bdo text-[11px] font-bold tracking-[.16em] text-[#F8B5A8]">
                                Kurasi hero News
                            </p>
                            <span className="rounded-full border border-white/15 bg-white/8 px-2.5 py-1 font-bdo text-[10px] font-bold text-white/72">
                                {slotIds.length}/{MAX_SLOTS} slot
                            </span>
                        </div>
                        <h2 className="mt-1 font-clash text-xl font-semibold leading-tight sm:text-2xl">
                            Tentukan cerita yang pertama dilihat pengunjung.
                        </h2>
                        <p className="mt-1.5 max-w-2xl font-bdo text-xs font-medium leading-5 text-white/58 sm:text-sm">
                            Susun hingga enam berita atau artikel. Urutan di sini sama dengan urutan slide pada hero halaman News.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <a
                        href={route("news")}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[15px] border border-white/15 bg-white/8 px-3.5 font-bdo text-xs font-bold text-white transition hover:border-white/30 hover:bg-white/12"
                    >
                        <ExternalLink size={14} />
                        Lihat publik
                    </a>
                    <button
                        type="button"
                        onClick={restore}
                        disabled={!isDirty || saving || !canCurate}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[15px] border border-white/15 bg-white/8 px-3.5 font-bdo text-xs font-bold text-white transition hover:border-white/30 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        <RotateCcw size={14} />
                        Batalkan
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={!isDirty || saving || !canCurate}
                        className="news-hero-curation__save inline-flex h-10 min-w-[132px] items-center justify-center gap-2 rounded-[15px] bg-[#E35336] px-4 font-clash text-xs font-semibold text-white transition hover:bg-[#F06749] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        {saved ? <Check size={15} /> : <Save size={14} />}
                        {saving ? "Menyimpan..." : saved ? "Tersimpan" : "Simpan susunan"}
                    </button>
                </div>
            </header>

            {!canCurate && (
                <div className="relative z-10 flex items-start gap-3 border-b border-amber-300/15 bg-amber-300/8 px-4 py-3 text-amber-100 sm:px-5">
                    <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                    <p className="font-bdo text-xs font-medium leading-5">
                        Susunan dapat dilihat, tetapi hanya akun dengan izin publikasi berita yang dapat mengubah hero.
                    </p>
                </div>
            )}

            <div className="relative z-10 grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(340px,.86fr)_minmax(0,1.14fr)]">
                <div className="flex min-w-0 flex-col gap-3">
                    <div className="news-hero-curation__preview relative min-h-[286px] overflow-hidden rounded-[22px] border border-white/12 bg-slate-900 sm:min-h-[340px]">
                        {previewArticle?.thumbnail ? (
                            <img
                                src={previewArticle.thumbnail}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,#152235,#07101D_60%,#25110F)] text-white/24">
                                <ImageOff size={44} />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,.08)_0%,rgba(2,6,23,.18)_35%,rgba(2,6,23,.94)_100%)]" />
                        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-3.5 sm:p-4">
                            <span className="rounded-full border border-white/20 bg-slate-950/45 px-3 py-1.5 font-bdo text-[10px] font-bold text-white backdrop-blur-md">
                                {slotIds.length === 0 ? "Preview mode otomatis" : "Preview highlight"}
                            </span>
                            {previewArticle && <StatusPill article={previewArticle} />}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                            <p className="font-bdo text-[11px] font-bold text-[#F8B5A8]">
                                {previewArticle?.category?.name ?? "Belum ada kategori"}
                            </p>
                            <h3 className="mt-1.5 line-clamp-3 max-w-xl font-clash text-xl font-semibold leading-[1.04] text-white sm:text-2xl">
                                {previewArticle?.title ?? "Belum ada konten untuk dipreview"}
                            </h3>
                            <p className="mt-2 line-clamp-2 max-w-xl font-bdo text-xs font-medium leading-5 text-white/62 sm:text-sm">
                                {previewArticle?.excerpt ??
                                    "Tambahkan berita atau artikel untuk membangun highlight hero News."}
                            </p>
                            {previewArticle && (
                                <div className="mt-3 flex items-center gap-2 font-bdo text-[11px] font-semibold text-white/55">
                                    <Eye size={13} />
                                    <span>{previewArticle.author.name}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-white/10 bg-white/[.045] p-2.5">
                        {[
                            ["Mode", slotIds.length === 0 ? "Otomatis" : "Kurasi"],
                            ["Tayang", String(liveCount)],
                            ["Menunggu", String(stagedCount)],
                        ].map(([label, value]) => (
                            <div key={label} className="min-w-0 rounded-[14px] bg-white/[.055] px-3 py-2.5">
                                <p className="font-bdo text-[9px] font-bold text-white/38">{label}</p>
                                <p className="mt-1 truncate font-clash text-sm font-semibold text-white">{value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="min-w-0 rounded-[22px] border border-white/10 bg-white/[.055] p-3 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="font-bdo text-[10px] font-bold tracking-[.15em] text-white/38">Storyboard</p>
                            <h3 className="mt-1 font-clash text-base font-semibold text-white">Urutan slide hero</h3>
                            <p className="mt-1 font-bdo text-xs leading-5 text-white/48">
                                Gunakan panah untuk mengubah prioritas. Slot pertama menjadi pembuka hero.
                            </p>
                        </div>
                        {slotIds.length > 0 && canCurate && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSlotIds([]);
                                    setPreviewId(null);
                                    setServerError(null);
                                    setSaved(false);
                                }}
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-[14px] border border-white/12 bg-white/[.055] px-3 font-bdo text-[11px] font-bold text-white/68 transition hover:border-white/25 hover:text-white"
                            >
                                <RotateCcw size={13} />
                                Gunakan otomatis
                            </button>
                        )}
                    </div>

                    <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                        {Array.from({ length: MAX_SLOTS }, (_, index) => {
                            const article = selectedArticles[index];
                            const active = article?.id === previewArticle?.id;

                            return (
                                <li
                                    key={article?.id ?? `empty-${index}`}
                                    className={cn(
                                        "news-hero-slot relative min-h-[110px] overflow-hidden rounded-[18px] border p-2.5 transition",
                                        article
                                            ? active
                                                ? "border-[#F08C78]/75 bg-[#E35336]/12"
                                                : "border-white/10 bg-slate-950/24 hover:border-white/20"
                                            : "border-dashed border-white/10 bg-white/[.025]",
                                    )}
                                >
                                    {article ? (
                                        <div className="grid h-full grid-cols-[52px_minmax(0,1fr)] gap-2.5">
                                            <button
                                                type="button"
                                                onClick={() => setPreviewId(article.id)}
                                                className="relative overflow-hidden rounded-[14px] bg-white/8 text-left"
                                                aria-label={`Preview slot ${index + 1}: ${article.title}`}
                                            >
                                                {article.thumbnail ? (
                                                    <img src={article.thumbnail} alt="" className="h-full w-full object-cover" />
                                                ) : (
                                                    <span className="flex h-full items-center justify-center text-white/25">
                                                        <ImageOff size={18} />
                                                    </span>
                                                )}
                                                <span className="absolute left-1.5 top-1.5 rounded-full bg-slate-950/72 px-1.5 py-0.5 font-bdo text-[9px] font-bold text-white">
                                                    {String(index + 1).padStart(2, "0")}
                                                </span>
                                            </button>
                                            <div className="flex min-w-0 flex-col justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewId(article.id)}
                                                    className="min-w-0 text-left"
                                                >
                                                    <span className="block truncate font-bdo text-[10px] font-bold text-[#F8B5A8]">
                                                        {article.category?.name ?? "Tanpa kategori"}
                                                    </span>
                                                    <span className="mt-1 line-clamp-2 font-clash text-sm font-semibold leading-tight text-white">
                                                        {article.title}
                                                    </span>
                                                </button>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={cn("font-bdo text-[10px] font-bold", isLive(article) ? "text-emerald-300" : "text-amber-200")}>
                                                        {isLive(article) ? "Tayang" : "Belum tayang"}
                                                    </span>
                                                    {canCurate && (
                                                        <span className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => moveArticle(index, -1)}
                                                                disabled={index === 0}
                                                                className="hero-slot-action"
                                                                aria-label={`Naikkan ${article.title}`}
                                                            >
                                                                <ArrowLeft size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => moveArticle(index, 1)}
                                                                disabled={index === selectedArticles.length - 1}
                                                                className="hero-slot-action"
                                                                aria-label={`Turunkan ${article.title}`}
                                                            >
                                                                <ArrowRight size={12} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeArticle(index)}
                                                                className="hero-slot-action hero-slot-action--danger"
                                                                aria-label={`Hapus ${article.title} dari hero`}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex h-full min-h-[88px] items-center gap-3 px-2 text-white/30">
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-dashed border-white/15">
                                                <Plus size={14} />
                                            </span>
                                            <span>
                                                <span className="block font-bdo text-[10px] font-bold">Slot {index + 1}</span>
                                                <span className="mt-0.5 block font-bdo text-[11px]">Belum diisi</span>
                                            </span>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </div>

            <div className="relative z-10 border-t border-white/10 bg-slate-950/26 p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Layers3 size={15} className="text-[#F08C78]" />
                            <h3 className="font-clash text-base font-semibold text-white">Pustaka konten</h3>
                        </div>
                        <p className="mt-1 font-bdo text-xs leading-5 text-white/46">
                            Pilih konten untuk ditambahkan ke slot berikutnya. Draft dan konten terjadwal baru muncul setelah waktunya aktif.
                        </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(210px,1fr)_150px] lg:min-w-[490px]">
                        <label className="flex h-10 items-center gap-2 rounded-[15px] border border-white/12 bg-white/[.065] px-3.5 focus-within:border-[#F08C78]/65 focus-within:bg-white/[.09]">
                            <Search size={14} className="shrink-0 text-white/38" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Cari judul atau penulis..."
                                className="min-w-0 flex-1 border-0 bg-transparent p-0 font-bdo text-xs text-white outline-none placeholder:text-white/30 focus:ring-0"
                            />
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                            className="h-10 rounded-[15px] border border-white/12 bg-[#111C2A] px-3 font-bdo text-xs font-bold text-white outline-none focus:border-[#F08C78]/65 focus:ring-0"
                            aria-label="Filter status pustaka hero"
                        >
                            <option value="all">Semua status</option>
                            <option value="published">Terbit</option>
                            <option value="draft">Draft</option>
                            <option value="archived">Arsip</option>
                        </select>
                    </div>
                </div>

                {serverError && (
                    <div role="alert" className="mt-3 flex items-start gap-2 rounded-[15px] border border-rose-300/20 bg-rose-400/10 px-3.5 py-3 text-rose-100">
                        <AlertTriangle className="mt-0.5 shrink-0" size={15} />
                        <p className="font-bdo text-xs font-semibold leading-5">{serverError}</p>
                    </div>
                )}

                <div className="news-scrollbar mt-3 grid max-h-[340px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                    {candidates.length === 0 ? (
                        <div className="rounded-[18px] border border-dashed border-white/12 p-6 text-center sm:col-span-2 xl:col-span-3">
                            <Search className="mx-auto text-white/22" size={24} />
                            <p className="mt-2 font-clash text-sm font-semibold text-white/72">Konten tidak ditemukan</p>
                            <p className="mt-1 font-bdo text-xs text-white/38">Ubah kata pencarian atau filter status.</p>
                        </div>
                    ) : (
                        candidates.map((article) => {
                            const selectedIndex = slotIds.indexOf(article.id);
                            const selected = selectedIndex >= 0;

                            return (
                                <article
                                    key={article.id}
                                    className={cn(
                                        "grid min-h-[86px] grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[18px] border p-2.5 transition",
                                        selected
                                            ? "border-[#F08C78]/55 bg-[#E35336]/10"
                                            : "border-white/9 bg-white/[.045] hover:border-white/18 hover:bg-white/[.065]",
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setPreviewId(article.id)}
                                        className="h-16 overflow-hidden rounded-[14px] bg-white/8"
                                        aria-label={`Preview ${article.title}`}
                                    >
                                        {article.thumbnail ? (
                                            <img src={article.thumbnail} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <span className="flex h-full items-center justify-center text-white/25">
                                                <ImageOff size={19} />
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPreviewId(article.id)}
                                        className="min-w-0 text-left"
                                    >
                                        <span className="flex items-center gap-1.5 font-bdo text-[10px] font-bold text-[#F8B5A8]">
                                            {article.category?.name ?? "Tanpa kategori"}
                                            <span className="text-white/22">/</span>
                                            <span className={isLive(article) ? "text-emerald-300" : "text-white/42"}>
                                                {displayStatus(article)}
                                            </span>
                                        </span>
                                        <span className="mt-1 line-clamp-2 font-clash text-sm font-semibold leading-tight text-white">
                                            {article.title}
                                        </span>
                                        <span className="mt-1 block truncate font-bdo text-[10px] text-white/38">
                                            {article.author.name}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => addArticle(article)}
                                        disabled={!canCurate || (!selected && slotIds.length >= MAX_SLOTS)}
                                        className={cn(
                                            "inline-flex h-9 min-w-[38px] items-center justify-center gap-1.5 rounded-[13px] border px-2.5 font-bdo text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-35",
                                            selected
                                                ? "border-[#F08C78]/35 bg-[#E35336]/16 text-[#F8B5A8]"
                                                : "border-white/12 bg-white/[.065] text-white hover:border-[#F08C78]/50 hover:text-[#F8B5A8]",
                                        )}
                                        aria-label={selected ? `${article.title} berada di slot ${selectedIndex + 1}` : `Tambahkan ${article.title} ke hero`}
                                    >
                                        {selected ? <Check size={13} /> : <Plus size={13} />}
                                        <span className="hidden 2xl:inline">{selected ? `Slot ${selectedIndex + 1}` : "Tambah"}</span>
                                    </button>
                                </article>
                            );
                        })
                    )}
                </div>
            </div>
        </section>
    );
}
