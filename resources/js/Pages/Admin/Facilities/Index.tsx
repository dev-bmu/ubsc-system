import { Head, Link, router, usePage } from "@inertiajs/react";
import {
    Archive,
    ArrowUpRight,
    BadgeCheck,
    Banknote,
    Building2,
    Check,
    CircleDot,
    FolderOpen,
    GripVertical,
    ImageIcon,
    Layers3,
    LayoutGrid,
    MapPin,
    Pencil,
    Plus,
    Search,
    SlidersHorizontal,
    Sparkles,
    Tag,
    Trash2,
    UsersRound,
    X,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    rectSortingStrategy,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import AdminLayout from "@/Layouts/AdminLayout";
import SortableListItem from "@/Components/Admin/SortableListItem";
import type { FacilityCategory, FacilityItem, PageProps } from "@/types";
import { cn } from "@/lib/utils";
import "./Index.css";

type Props = PageProps<{
    facilities: FacilityItem[];
    categories: FacilityCategory[];
}>;

type FacilityStatus = "all" | "active" | "inactive";

type CategoryForm = {
    name: string;
    description: string;
};

const EMPTY_CATEGORY_FORM: CategoryForm = {
    name: "",
    description: "",
};

const CATEGORY_TONES = [
    "border-[#FFD5CD] bg-[#FFF1EE] text-[#B93D2A]",
    "border-sky-200 bg-sky-50 text-sky-700",
    "border-emerald-200 bg-emerald-50 text-emerald-700",
    "border-violet-200 bg-violet-50 text-violet-700",
];

function ShinyIcon({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "facilities-icon relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl",
                className,
            )}
        >
            {children}
            <span className="pointer-events-none absolute inset-x-2 top-1 h-px bg-white/55" />
        </div>
    );
}

function MetricCard({
    label,
    value,
    note,
    icon: Icon,
    tone,
}: {
    label: string;
    value: number;
    note: string;
    icon: typeof Building2;
    tone: string;
}) {
    return (
        <div className="facilities-metric relative overflow-hidden rounded-[20px] border border-white/75 bg-white p-3.5 text-slate-950 shadow-[0_18px_38px_-32px_rgba(122,47,35,.5)]">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl border", tone)}>
                <Icon size={16} />
            </div>
            <p className="mt-4 font-clash text-[1.85rem] font-bold leading-none tabular-nums">{value}</p>
            <p className="mt-2 font-bdo text-xs font-bold text-slate-700">{label}</p>
            <p className="mt-1 font-bdo text-[11px] font-medium text-slate-400">{note}</p>
        </div>
    );
}

function FacilityCard({
    facility,
    position,
    sortableEnabled,
}: {
    facility: FacilityItem;
    position: number;
    sortableEnabled: boolean;
}) {
    const [deleting, setDeleting] = useState(false);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: String(facility.id), disabled: !sortableEnabled });

    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    };
    const categoryName = facility.category?.name ?? "Tanpa kategori";

    const remove = () => {
        if (!confirm(`Hapus fasilitas "${facility.name}"?`)) return;

        setDeleting(true);
        router.delete(route("admin.facilities.destroy", facility.id), {
            preserveScroll: true,
            onFinish: () => setDeleting(false),
        });
    };

    return (
        <article
            ref={setNodeRef}
            style={style}
            className={cn(
                "facilities-card group relative overflow-hidden rounded-[22px] border border-[#FFE0D8] bg-white",
                "transition-shadow duration-300",
                isDragging && "z-50 opacity-70 shadow-2xl",
            )}
        >
            <div className="relative aspect-[16/9] overflow-hidden bg-[#FFF7F4]">
                {facility.hero?.url ? (
                    <img
                        src={facility.hero.url}
                        alt=""
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    />
                ) : (
                    <div className="facilities-image-placeholder flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-[#E35336]/30" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-slate-950/5 to-transparent" />

                <div className="absolute left-3 top-3 flex items-center gap-2">
                    <span className="rounded-full border border-white/30 bg-slate-950/35 px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
                        #{position}
                    </span>
                    <span
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-wide backdrop-blur",
                            facility.is_active
                                ? "border-emerald-300/45 bg-emerald-950/35 text-emerald-100"
                                : "border-white/30 bg-slate-950/35 text-white/80",
                        )}
                    >
                        <span className={cn("h-1.5 w-1.5 rounded-full", facility.is_active ? "bg-emerald-300" : "bg-white/55")} />
                        {facility.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                </div>

                <button
                    type="button"
                    disabled={!sortableEnabled}
                    {...attributes}
                    {...listeners}
                    aria-label={`Ubah urutan ${facility.name}`}
                    title={sortableEnabled ? "Geser untuk mengubah urutan" : "Kosongkan filter untuk mengubah urutan"}
                    className="absolute right-3 top-3 flex h-9 w-9 touch-none items-center justify-center rounded-xl border border-white/35 bg-white/20 text-white backdrop-blur transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-45"
                >
                    <GripVertical size={15} />
                </button>

                <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate font-bdo text-[10px] font-bold uppercase tracking-wide text-white/70">
                            {facility.venue_type || "Facility venue"}
                        </p>
                        <h3 className="mt-1 line-clamp-2 font-clash text-xl font-bold leading-[1.02] text-white">
                            {facility.name}
                        </h3>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/20 text-white backdrop-blur">
                        <ArrowUpRight size={15} />
                    </span>
                </div>
            </div>

            <div className="p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-[#FFD5CD] bg-[#FFF7F4] px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-wide text-[#B93D2A]">
                        <Tag size={11} />
                        <span className="max-w-[150px] truncate">{categoryName}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        <ImageIcon size={11} />
                        {(facility.gallery?.length ?? 0) + (facility.hero ? 1 : 0)} visual
                    </span>
                </div>

                <p className="mt-3 line-clamp-2 min-h-[40px] font-bdo text-sm font-medium leading-5 text-slate-500">
                    {facility.description || "Belum ada deskripsi fasilitas."}
                </p>

                <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/75 py-2.5">
                    <div className="px-2.5">
                        <p className="font-clash text-sm font-bold text-slate-900">{facility.units_count ?? 0}</p>
                        <p className="mt-0.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-400">Unit</p>
                    </div>
                    <div className="px-2.5">
                        <p className="font-clash text-sm font-bold text-slate-900">{facility.prices_count ?? 0}</p>
                        <p className="mt-0.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-400">Harga</p>
                    </div>
                    <div className="px-2.5">
                        <p className="truncate font-clash text-sm font-bold text-slate-900">{facility.capacity ?? 1}</p>
                        <p className="mt-0.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-400">Kapasitas</p>
                    </div>
                </div>

                <div className="mt-3 flex min-w-0 items-center gap-1.5 text-slate-400">
                    <MapPin size={13} className="shrink-0 text-[#E35336]" />
                    <p className="truncate font-bdo text-xs font-semibold">
                        {facility.location || "Lokasi belum diatur"}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_40px_40px_40px] gap-2 border-t border-slate-100 bg-slate-50/60 p-3">
                <Link
                    href={route("admin.facilities.edit", facility.id)}
                    className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-3 font-clash text-xs font-semibold text-white shadow-[0_16px_28px_-24px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5"
                >
                    <Pencil size={14} />
                    <span className="truncate">Edit fasilitas</span>
                </Link>
                <Link
                    href={route("admin.facilities.units.index", facility.id)}
                    aria-label={`Kelola unit ${facility.name}`}
                    title="Kelola unit"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-600 transition hover:bg-sky-100"
                >
                    <UsersRound size={14} />
                </Link>
                <Link
                    href={route("admin.facilities.pricing", facility.id)}
                    aria-label={`Kelola harga ${facility.name}`}
                    title="Kelola harga"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
                >
                    <Banknote size={14} />
                </Link>
                <button
                    type="button"
                    onClick={remove}
                    disabled={deleting}
                    aria-label={`Hapus ${facility.name}`}
                    title="Hapus fasilitas"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-500 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </article>
    );
}

function CategoriesPanel({ categories }: { categories: FacilityCategory[] }) {
    const [items, setItems] = useState(categories);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<number | null>(null);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    useEffect(() => setItems(categories), [categories]);

    const closeForm = () => {
        setShowForm(false);
        setEditingId(null);
        setForm(EMPTY_CATEGORY_FORM);
    };

    const startCreate = () => {
        setEditingId(null);
        setForm(EMPTY_CATEGORY_FORM);
        setShowForm(true);
    };

    const startEdit = (category: FacilityCategory) => {
        setEditingId(category.id);
        setForm({
            name: category.name,
            description: category.description ?? "",
        });
        setShowForm(true);
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!form.name.trim()) return;

        setSaving(true);
        const payload = {
            name: form.name.trim(),
            description: form.description.trim() || null,
            sort_order: editingId
                ? items.find((category) => category.id === editingId)?.sort_order ?? 0
                : items.length + 1,
        };
        const options = {
            preserveScroll: true,
            onSuccess: closeForm,
            onFinish: () => setSaving(false),
        };

        if (editingId) {
            router.put(route("admin.facility-categories.update", editingId), payload, options);
            return;
        }

        router.post(route("admin.facility-categories.store"), payload, options);
    };

    const remove = (category: FacilityCategory) => {
        if (!confirm(`Hapus kategori "${category.name}"?`)) return;

        setDeleting(category.id);
        router.delete(route("admin.facility-categories.destroy", category.id), {
            preserveScroll: true,
            onFinish: () => setDeleting(null),
        });
    };

    const reorder = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = items.findIndex((category) => String(category.id) === active.id);
        const newIndex = items.findIndex((category) => String(category.id) === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const reordered = arrayMove(items, oldIndex, newIndex);
        setItems(reordered);
        router.post(
            route("admin.facility-categories.reorder"),
            { ids: reordered.map((category) => category.id) },
            { preserveScroll: true, onError: () => setItems(categories) },
        );
    };

    return (
        <aside className="facilities-category-desk overflow-hidden rounded-[20px] border border-white/80 bg-white/90 shadow-[0_20px_42px_-34px_rgba(122,47,35,.55)] backdrop-blur">
            <div className="flex items-center justify-between gap-3 border-b border-[#FFE0D8] bg-[#FFF9F7]/90 p-3.5">
                <div className="flex min-w-0 items-center gap-3">
                    <ShinyIcon className="h-10 w-10">
                        <Layers3 size={17} />
                    </ShinyIcon>
                    <div className="min-w-0">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-[#E35336]">Klasifikasi</p>
                        <h3 className="truncate font-clash text-base font-bold text-slate-950">Kategori fasilitas</h3>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={startCreate}
                    aria-label="Tambah kategori"
                    title="Tambah kategori"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_14px_24px_-18px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5"
                >
                    <Plus size={14} />
                </button>
            </div>

            {showForm && (
                <form onSubmit={submit} className="border-b border-[#FFE0D8] bg-[#FFF9F7] p-3">
                    <label className="block" htmlFor="facility-category-name">
                        <span className="sr-only">Nama kategori</span>
                        <input
                            id="facility-category-name"
                            value={form.name}
                            onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
                            className="facilities-input h-10 w-full rounded-xl px-3 font-bdo text-sm"
                            placeholder="Nama kategori"
                            autoFocus
                        />
                    </label>
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_36px_36px] gap-2">
                        <label htmlFor="facility-category-description">
                            <span className="sr-only">Deskripsi kategori</span>
                            <input
                                id="facility-category-description"
                                value={form.description}
                                onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
                                className="facilities-input h-9 w-full rounded-xl px-3 font-bdo text-xs"
                                placeholder="Deskripsi singkat"
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={saving || !form.name.trim()}
                            aria-label="Simpan kategori"
                            title="Simpan kategori"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Check size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={closeForm}
                            aria-label="Batal edit kategori"
                            title="Batal"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </form>
            )}

            <div className="facilities-scrollbar max-h-[220px] space-y-2 overflow-y-auto p-3">
                {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
                        <FolderOpen className="mx-auto h-6 w-6 text-slate-300" />
                        <p className="mt-2 font-bdo text-xs font-semibold text-slate-400">Belum ada kategori.</p>
                    </div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
                        <SortableContext items={items.map((category) => String(category.id))} strategy={verticalListSortingStrategy}>
                            {items.map((category, index) => (
                                <SortableListItem key={category.id} id={String(category.id)}>
                                    <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/75 p-2 transition hover:border-[#F8B5A8] hover:bg-white">
                                        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", CATEGORY_TONES[index % CATEGORY_TONES.length])}>
                                            <Tag size={13} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-clash text-sm font-semibold text-slate-900">{category.name}</p>
                                            <p className="font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                                {category.facilities_count ?? 0} fasilitas
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => startEdit(category)}
                                            aria-label={`Edit kategori ${category.name}`}
                                            title="Edit kategori"
                                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:text-slate-950"
                                        >
                                            <Pencil size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => remove(category)}
                                            disabled={deleting === category.id}
                                            aria-label={`Hapus kategori ${category.name}`}
                                            title="Hapus kategori"
                                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-500 transition hover:bg-rose-100 disabled:opacity-50"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </SortableListItem>
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>
        </aside>
    );
}

export default function FacilitiesIndex() {
    const { facilities, categories } = usePage<Props>().props;
    const [facilityItems, setFacilityItems] = useState(facilities);
    const [query, setQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState<FacilityStatus>("all");
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    useEffect(() => setFacilityItems(facilities), [facilities]);

    const stats = useMemo(() => {
        const active = facilityItems.filter((facility) => facility.is_active).length;
        const pictured = facilityItems.filter((facility) => Boolean(facility.hero)).length;

        return {
            total: facilityItems.length,
            active,
            inactive: facilityItems.length - active,
            pictured,
        };
    }, [facilityItems]);

    const filteredFacilities = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        return facilityItems.filter((facility) => {
            const matchesCategory = categoryFilter === "all" || String(facility.category?.id) === categoryFilter;
            const matchesStatus =
                statusFilter === "all"
                || (statusFilter === "active" && facility.is_active)
                || (statusFilter === "inactive" && !facility.is_active);
            const haystack = [
                facility.name,
                facility.slug,
                facility.location ?? "",
                facility.venue_type ?? "",
                facility.category?.name ?? "",
            ].join(" ").toLowerCase();
            const matchesQuery = normalized.length === 0 || haystack.includes(normalized);

            return matchesCategory && matchesStatus && matchesQuery;
        });
    }, [categoryFilter, facilityItems, query, statusFilter]);

    const filtersActive = query.trim().length > 0 || categoryFilter !== "all" || statusFilter !== "all";

    const reorderFacilities = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id || filtersActive) return;

        const oldIndex = facilityItems.findIndex((facility) => String(facility.id) === active.id);
        const newIndex = facilityItems.findIndex((facility) => String(facility.id) === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const reordered = arrayMove(facilityItems, oldIndex, newIndex);
        setFacilityItems(reordered);
        router.post(
            route("admin.facilities.reorder"),
            { ids: reordered.map((facility) => facility.id) },
            { preserveScroll: true, onError: () => setFacilityItems(facilities) },
        );
    };

    return (
        <AdminLayout
            header={
                <div className="facilities-enter flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="font-bdo text-[11px] font-bold text-[#E35336]">
                            Facility Management
                        </p>
                        <h1 className="mt-1 font-clash text-3xl font-bold leading-none text-slate-950">
                            <span className="facilities-title-shine">Facilities</span>
                        </h1>
                    </div>
                    <Link
                        href={route("admin.facilities.create")}
                        className="facilities-button-sheen inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 font-clash text-sm font-semibold text-white shadow-[0_18px_30px_-24px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 sm:w-auto"
                    >
                        <Plus size={15} />
                        Fasilitas baru
                    </Link>
                </div>
            }
        >
            <Head title="Facilities" />

            <div className="flex flex-col gap-5 overflow-x-hidden pb-20 pt-6">
                <section className="facilities-enter facilities-hero relative overflow-hidden rounded-[28px] border border-[#FFD5CD] p-4 shadow-[0_22px_52px_-38px_rgba(185,61,42,.58)] sm:p-5">
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-2/3 facilities-hero-grid" />
                    <div className="relative z-10 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="flex min-w-0 flex-col justify-between gap-5">
                            <div>
                                <span className="inline-flex items-center gap-2 rounded-full border border-[#FFD5CD] bg-white/90 px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-[#B93D2A] shadow-sm">
                                    <Sparkles size={12} />
                                    Venue control desk
                                </span>
                                <h2 className="mt-4 max-w-3xl font-clash text-[2rem] font-bold leading-[.98] text-slate-950 sm:text-[2.55rem]">
                                    Ruang fasilitas yang tertata, siap dipublikasikan.
                                </h2>
                                <p className="mt-3 max-w-2xl font-bdo text-sm font-medium leading-6 text-slate-500">
                                    Pantau kelengkapan venue dan masuk ke pengaturan penting tanpa meninggalkan halaman utama.
                                </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 lg:max-w-[720px]">
                                <div className="facilities-insight-terracotta flex items-center gap-3 overflow-hidden rounded-xl border border-[#F8B5A8] p-3.5 text-white shadow-[0_18px_32px_-24px_rgba(185,61,42,.78)]">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15">
                                        <CircleDot className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <p className="font-clash text-sm font-bold">{categories.length} kategori</p>
                                        <p className="font-bdo text-[11px] font-semibold text-white/70">Struktur venue tersusun</p>
                                    </div>
                                </div>
                                <div className="facilities-insight-sky flex items-center gap-3 overflow-hidden rounded-xl border border-sky-300/75 p-3.5 text-white shadow-[0_18px_32px_-24px_rgba(14,116,144,.72)]">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15">
                                        <ImageIcon className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <p className="font-clash text-sm font-bold">{stats.pictured} memiliki hero</p>
                                        <p className="font-bdo text-[11px] font-semibold text-white/70">Visual utama tersedia</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <CategoriesPanel categories={categories} />
                    </div>

                    <div className="relative z-10 mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MetricCard
                            label="Total fasilitas"
                            value={stats.total}
                            note="Seluruh venue terdata"
                            icon={Building2}
                            tone="border-[#FFD5CD] bg-[#FFF1EE] text-[#B93D2A]"
                        />
                        <MetricCard
                            label="Fasilitas aktif"
                            value={stats.active}
                            note="Tampil di halaman publik"
                            icon={BadgeCheck}
                            tone="border-emerald-200 bg-emerald-50 text-emerald-700"
                        />
                        <MetricCard
                            label="Fasilitas nonaktif"
                            value={stats.inactive}
                            note="Tersimpan sebagai draft"
                            icon={Archive}
                            tone="border-slate-200 bg-slate-50 text-slate-600"
                        />
                        <MetricCard
                            label="Dengan visual"
                            value={stats.pictured}
                            note="Hero utama tersedia"
                            icon={ImageIcon}
                            tone="border-sky-200 bg-sky-50 text-sky-700"
                        />
                    </div>
                </section>

                <div className="min-w-0">
                    <section className="facilities-enter facilities-panel min-w-0 overflow-hidden rounded-[24px] border border-[#FFE0D8] bg-white">
                        <div className="border-b border-[#FFE0D8] bg-[#FFF9F7] p-4 sm:p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-center gap-3">
                                    <ShinyIcon className="h-11 w-11">
                                        <LayoutGrid size={18} />
                                    </ShinyIcon>
                                    <div>
                                        <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-[#E35336]">Venue library</p>
                                        <h2 className="font-clash text-lg font-bold text-slate-950">Koleksi fasilitas</h2>
                                    </div>
                                </div>
                                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#FFD5CD] bg-white px-3 py-1.5 font-bdo text-[11px] font-bold text-[#B93D2A]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#E35336]" />
                                    {filteredFacilities.length} hasil
                                </span>
                            </div>

                            <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px]">
                                <label className="facilities-input flex h-11 min-w-0 items-center gap-2 rounded-xl px-3" htmlFor="facility-search">
                                    <Search size={15} className="shrink-0 text-slate-400" />
                                    <input
                                        id="facility-search"
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Cari venue, lokasi, kategori..."
                                        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-bdo text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-0"
                                    />
                                </label>
                                <label className="facilities-input flex h-11 items-center gap-2 rounded-xl px-3" htmlFor="facility-category-filter">
                                    <Tag size={14} className="shrink-0 text-slate-400" />
                                    <select
                                        id="facility-category-filter"
                                        value={categoryFilter}
                                        onChange={(event) => setCategoryFilter(event.target.value)}
                                        className="min-w-0 flex-1 border-0 bg-transparent py-0 pl-0 pr-7 font-bdo text-sm text-slate-700 outline-none focus:ring-0"
                                    >
                                        <option value="all">Semua kategori</option>
                                        {categories.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="facilities-input flex h-11 items-center gap-2 rounded-xl px-3" htmlFor="facility-status-filter">
                                    <SlidersHorizontal size={14} className="shrink-0 text-slate-400" />
                                    <select
                                        id="facility-status-filter"
                                        value={statusFilter}
                                        onChange={(event) => setStatusFilter(event.target.value as FacilityStatus)}
                                        className="min-w-0 flex-1 border-0 bg-transparent py-0 pl-0 pr-7 font-bdo text-sm text-slate-700 outline-none focus:ring-0"
                                    >
                                        <option value="all">Semua status</option>
                                        <option value="active">Aktif</option>
                                        <option value="inactive">Nonaktif</option>
                                    </select>
                                </label>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <p className="font-bdo text-[11px] font-semibold text-slate-400">
                                    {filtersActive ? "Urutan dikunci selama filter aktif." : "Geser kartu untuk menyusun prioritas tampil."}
                                </p>
                                {filtersActive && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setQuery("");
                                            setCategoryFilter("all");
                                            setStatusFilter("all");
                                        }}
                                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#FFD5CD] bg-white px-2.5 py-1.5 font-bdo text-[11px] font-bold text-[#B93D2A] transition hover:bg-[#FFF1EE]"
                                    >
                                        <X size={12} />
                                        Reset filter
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="facilities-scrollbar max-h-[min(74vh,820px)] overflow-y-auto p-3 sm:p-4">
                            {filteredFacilities.length === 0 ? (
                                <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                    <FolderOpen className="h-10 w-10 text-slate-300" />
                                    <p className="mt-3 font-clash text-base font-bold text-slate-800">Fasilitas tidak ditemukan</p>
                                    <p className="mt-1 max-w-sm font-bdo text-sm font-medium text-slate-400">
                                        Ubah pencarian atau reset filter untuk melihat koleksi lainnya.
                                    </p>
                                </div>
                            ) : (
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderFacilities}>
                                    <SortableContext items={facilityItems.map((facility) => String(facility.id))} strategy={rectSortingStrategy}>
                                        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                                            {filteredFacilities.map((facility) => (
                                                <FacilityCard
                                                    key={facility.id}
                                                    facility={facility}
                                                    position={facilityItems.findIndex((item) => item.id === facility.id) + 1}
                                                    sortableEnabled={!filtersActive}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>
                    </section>

                </div>
            </div>
        </AdminLayout>
    );
}
