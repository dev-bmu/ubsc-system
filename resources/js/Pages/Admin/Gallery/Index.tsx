import { Head, Link, router, usePage } from "@inertiajs/react";
import axios from "axios";
import {
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Download,
    ExternalLink,
    Filter,
    FileUp,
    Images,
    Layers3,
    ListChecks,
    LoaderCircle,
    MapPin,
    Search,
    SlidersHorizontal,
    Upload,
    Video,
    X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AdminLayout from "@/Layouts/AdminLayout";
import type { PageProps } from "@/types";
import GalleryCurationPanel from "./GalleryCurationPanel";
import GalleryEditorDialog from "./GalleryEditorDialog";
import GalleryMedia from "./GalleryMedia";
import GalleryUploadDialog from "./GalleryUploadDialog";
import type {
    AdminGalleryItem,
    GalleryAnalytics,
    GalleryLocation,
    GalleryPageData,
    GalleryPermissions,
    GallerySectionAdmin,
    GalleryStatus,
} from "./types";
import "./gallery-admin.css";

type Props = PageProps<GalleryPageData & Record<string, unknown>>;

const STATUS_LABELS: Record<GalleryStatus, string> = {
    draft: "Draft",
    processing: "Processing",
    ready_for_review: "Ready for Review",
    scheduled: "Scheduled",
    published: "Published",
    unpublished: "Unpublished",
    failed: "Failed",
};

const STATUS_STYLES: Record<GalleryStatus, string> = {
    draft: "border-slate-200 bg-slate-50 text-slate-600",
    processing: "border-blue-200 bg-blue-50 text-blue-700",
    ready_for_review: "border-amber-200 bg-amber-50 text-amber-700",
    scheduled: "border-violet-200 bg-violet-50 text-violet-700",
    published: "border-emerald-200 bg-emerald-50 text-emerald-700",
    unpublished: "border-orange-200 bg-orange-50 text-orange-700",
    failed: "border-red-200 bg-red-50 text-red-700",
};

export default function GalleryIndex(props: Props) {
    const {
        items,
        status_counts: statusCounts,
        sections,
        locations,
        saved_views: savedViews,
        editors,
        filters,
        capabilities,
        upload_config: uploadConfig,
        permissions,
        analytics,
    } = props;
    const page = usePage<Props>();
    const [uploadOpen, setUploadOpen] = useState(false);
    const [editorItem, setEditorItem] = useState<AdminGalleryItem | null>(null);
    const [locationOpen, setLocationOpen] = useState(false);
    const [curationVisible, setCurationVisible] = useState(true);
    const [query, setQuery] = useState(filters.q ?? "");
    const [navigating, setNavigating] = useState(false);
    const [savedViewName, setSavedViewName] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkAction, setBulkAction] = useState("");
    const [bulkSection, setBulkSection] = useState("");
    const [bulkSchedule, setBulkSchedule] = useState("");
    const [bulkConfirmation, setBulkConfirmation] = useState("");
    const [bulkBusy, setBulkBusy] = useState(false);
    const [operationNotice, setOperationNotice] = useState<string | null>(null);
    const [analyticsVisible, setAnalyticsVisible] = useState(false);
    const importRef = useRef<HTMLInputElement>(null);
    const firstSearch = useRef(true);

    useEffect(() => {
        const removeStart = router.on("start", () => setNavigating(true));
        const removeFinish = router.on("finish", () => setNavigating(false));
        return () => { removeStart(); removeFinish(); };
    }, []);

    useEffect(() => {
        if (firstSearch.current) {
            firstSearch.current = false;
            return;
        }
        const timer = window.setTimeout(() => {
            if (query === (filters.q ?? "")) return;
            visit({ ...filters, q: query || undefined, page: undefined });
        }, 320);
        return () => window.clearTimeout(timer);
        // Filters are server state; query is the only trigger here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    useEffect(() => {
        setSelected(new Set());
    }, [items.current_page, filters.status, filters.section, filters.location, filters.media_type, filters.year]);

    const visit = (next: Record<string, string | number | undefined>) => {
        const clean = Object.fromEntries(
            Object.entries(next).filter(([, value]) => value !== "" && value !== undefined && value !== null),
        );
        router.get(route("admin.gallery.index"), clean, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            only: ["items", "filters", "status_counts", "sections", "locations", "saved_views", "flash"],
        });
    };

    const setFilter = (key: string, value?: string) => {
        visit({ ...filters, [key]: value, page: undefined });
    };

    const clearFilters = () => {
        setQuery("");
        router.get(route("admin.gallery.index"), {}, { preserveState: true, replace: true });
    };

    const hasFilters = Object.values(filters).some(Boolean);
    const videoReady = capabilities.video.ffmpeg && capabilities.video.ffprobe;
    const total = items.total;
    const reviewTotal = statusCounts.ready_for_review + statusCounts.scheduled;

    const saveView = () => {
        if (!savedViewName.trim()) return;
        router.post(
            route("admin.gallery.saved-views.store"),
            { name: savedViewName.trim(), filters },
            { preserveScroll: true, onSuccess: () => setSavedViewName("") },
        );
    };

    const allPageSelected = items.data.length > 0 && items.data.every((item) => selected.has(item.uuid));
    const toggleAll = () => setSelected((current) => {
        const next = new Set(current);
        if (allPageSelected) items.data.forEach((item) => next.delete(item.uuid));
        else items.data.forEach((item) => next.add(item.uuid));
        return next;
    });
    const toggleItem = (uuid: string) => setSelected((current) => {
        const next = new Set(current);
        if (next.has(uuid)) next.delete(uuid); else next.add(uuid);
        return next;
    });

    const runBulkAction = async () => {
        if (!bulkAction || selected.size === 0) return;
        if (bulkAction === "export") {
            const parameters = new URLSearchParams();
            selected.forEach((uuid) => parameters.append("uuids[]", uuid));
            window.location.assign(`${route("admin.gallery.csv.export")}?${parameters.toString()}`);
            return;
        }
        setBulkBusy(true);
        setOperationNotice(null);
        try {
            const response = await axios.post(route("admin.gallery.bulk.store"), {
                idempotency_key: crypto.randomUUID(),
                operation: bulkAction,
                uuids: [...selected],
                ...(bulkAction === "assign" ? { sections: [bulkSection] } : {}),
                ...(bulkAction === "schedule" ? { publish_at: bulkSchedule } : {}),
                ...(bulkAction === "delete" ? { confirmation: bulkConfirmation } : {}),
            });
            setOperationNotice(`${response.data.succeeded} selesai${response.data.failed ? `, ${response.data.failed} gagal` : ""}.`);
            setSelected(new Set());
            setBulkAction("");
            setBulkConfirmation("");
            router.reload({ only: ["items", "status_counts", "sections", "analytics"] });
        } catch (error) {
            const message = axios.isAxiosError(error)
                ? Object.values(error.response?.data?.errors ?? {}).flat().join(" ") || error.response?.data?.message
                : null;
            setOperationNotice(message || "Operasi massal gagal diproses.");
        } finally {
            setBulkBusy(false);
        }
    };

    const importCsv = async (file: File) => {
        setOperationNotice(null);
        const payload = new FormData();
        payload.append("csv", file);
        try {
            const response = await axios.post(route("admin.gallery.csv.import"), payload, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setOperationNotice(`CSV: ${response.data.succeeded} baris diperbarui${response.data.failed ? `, ${response.data.failed} gagal` : ""}.`);
            if (response.data.failed) downloadImportErrors(response.data.results);
            router.reload({ only: ["items", "status_counts", "sections"] });
        } catch (error) {
            const message = axios.isAxiosError(error)
                ? Object.values(error.response?.data?.errors ?? {}).flat().join(" ") || error.response?.data?.message
                : null;
            setOperationNotice(message || "CSV tidak dapat diimpor.");
        }
    };

    return (
        <AdminLayout>
            <Head title="Galeri Fasilitas - Admin UBSC" />

            <div className="gallery-admin-enter mx-auto w-full max-w-[1880px] space-y-4 pb-8">
                <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 pt-2 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#e35336]">
                            <span className="size-1.5 bg-[#e35336]" />Content / Gallery system
                        </div>
                        <h1 className="font-clash text-[clamp(1.75rem,3vw,2.65rem)] font-semibold leading-none text-slate-950">Galeri Fasilitas</h1>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <a href={route("gallery.index")} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-2 rounded border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-400">
                            <ExternalLink size={14} />Lihat publik
                        </a>
                        <a href={route("admin.gallery.csv.export", filters)} className="flex h-10 items-center gap-2 rounded border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-400">
                            <Download size={14} />Export CSV
                        </a>
                        {permissions.manage && (
                            <>
                                <input ref={importRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.target.value = ""; }} />
                                <button type="button" onClick={() => importRef.current?.click()} className="flex h-10 items-center gap-2 rounded border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-slate-400"><FileUp size={14} />Import</button>
                            </>
                        )}
                        <button type="button" onClick={() => setAnalyticsVisible((current) => !current)} className="grid size-10 place-items-center rounded border border-slate-200 bg-white text-slate-600 hover:border-slate-400" title="Analitik galeri" aria-label="Analitik galeri"><BarChart3 size={16} /></button>
                        {permissions.manage && (
                            <>
                                <button type="button" onClick={() => setLocationOpen(true)} className="grid size-10 place-items-center rounded border border-slate-200 bg-white text-slate-600 hover:border-slate-400" title="Kelola lokasi" aria-label="Kelola lokasi"><MapPin size={16} /></button>
                                <button type="button" onClick={() => setCurationVisible((current) => !current)} className="flex h-10 items-center gap-2 rounded border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-slate-400"><SlidersHorizontal size={15} />Kurasi</button>
                                <button type="button" onClick={() => setUploadOpen(true)} className="flex h-10 items-center gap-2 rounded bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-[#e35336]"><Upload size={15} />Upload media</button>
                            </>
                        )}
                    </div>
                </header>

                {(page.props.flash?.success || page.props.flash?.error) && (
                    <div className={`flex items-center gap-2 border px-3 py-2.5 text-xs ${page.props.flash.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                        {page.props.flash.error ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                        {page.props.flash.error ?? page.props.flash.success}
                    </div>
                )}

                {!videoReady && (
                    <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                        <Video size={17} className="mt-0.5 shrink-0" />
                        <span><strong>Video dinonaktifkan.</strong> FFmpeg dan FFprobe perlu tersedia pada worker VPS. Upload gambar tetap berfungsi normal.</span>
                    </div>
                )}

                {capabilities.search.driver === "meilisearch" && !capabilities.search.healthy && (
                    <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                        <Search size={17} className="mt-0.5 shrink-0" />
                        <span><strong>Indeks pencarian sedang tidak sehat.</strong> Galeri publik otomatis memakai pencarian database terbatas; kurasi utama tetap tersedia.</span>
                    </div>
                )}

                <section className="grid grid-cols-2 border border-slate-200 bg-white md:grid-cols-4" aria-label="Ringkasan galeri">
                    <Metric label="Total media" value={total} icon={Images} />
                    <Metric label="Published" value={statusCounts.published} icon={CheckCircle2} tone="emerald" />
                    <Metric label="Perlu review" value={reviewTotal} icon={Layers3} tone="amber" />
                    <Metric label="Gagal diproses" value={statusCounts.failed} icon={AlertTriangle} tone="red" last />
                </section>

                {analyticsVisible && <GalleryInsights analytics={analytics} />}

                {operationNotice && (
                    <div className="flex items-center justify-between gap-3 border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700">
                        <span>{operationNotice}</span>
                        <button type="button" onClick={() => setOperationNotice(null)} className="grid size-7 place-items-center text-slate-400 hover:text-slate-900" aria-label="Tutup notifikasi"><X size={14} /></button>
                    </div>
                )}

                {curationVisible && <GalleryCurationPanel sections={sections} permissions={permissions} />}

                <section className="border border-slate-200 bg-white">
                    <div className="overflow-x-auto border-b border-slate-200">
                        <nav className="flex min-w-max px-2" aria-label="Status media">
                            <StatusTab active={!filters.status} label="Semua" count={total} onClick={() => setFilter("status")} />
                            {(Object.keys(STATUS_LABELS) as GalleryStatus[]).map((status) => (
                                <StatusTab key={status} active={filters.status === status} label={STATUS_LABELS[status]} count={statusCounts[status]} onClick={() => setFilter("status", status)} />
                            ))}
                        </nav>
                    </div>

                    <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-3 lg:grid-cols-[minmax(260px,1fr)_repeat(4,minmax(130px,180px))_auto]">
                        <label className="relative block">
                            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded border-slate-200 bg-white pl-9 pr-9 text-xs focus:border-[#e35336] focus:ring-[#e35336]" placeholder="Cari judul, arena, lokasi, atau UUID" />
                            {navigating && <LoaderCircle size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
                        </label>
                        <FilterSelect value={filters.section ?? ""} onChange={(value) => setFilter("section", value || undefined)} label="Semua section" options={sections.map((section) => ({ value: section.key, label: section.name }))} />
                        <FilterSelect value={filters.location ?? ""} onChange={(value) => setFilter("location", value || undefined)} label="Semua lokasi" options={locations.map((location) => ({ value: String(location.id), label: location.name }))} />
                        <FilterSelect value={filters.media_type ?? ""} onChange={(value) => setFilter("media_type", value || undefined)} label="Semua media" options={[{ value: "image", label: "Gambar" }, { value: "video", label: "Video" }]} />
                        <input type="number" min="2000" max={new Date().getFullYear()} value={filters.year ?? ""} onChange={(event) => setFilter("year", event.target.value || undefined)} className="h-10 rounded border-slate-200 bg-white text-xs focus:border-[#e35336] focus:ring-[#e35336]" placeholder="Tahun" aria-label="Filter tahun" />
                        <button type="button" onClick={clearFilters} disabled={!hasFilters} className="flex h-10 items-center justify-center gap-2 rounded border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:border-slate-400 disabled:opacity-35"><X size={14} />Reset</button>
                    </div>
                    <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-3 pb-3 md:grid-cols-4">
                        <FilterSelect value={filters.editor ?? ""} onChange={(value) => setFilter("editor", value || undefined)} label="Semua editor" options={editors.map((editor) => ({ value: String(editor.id), label: editor.name }))} />
                        <FilterSelect value={filters.sort ?? "updated_desc"} onChange={(value) => setFilter("sort", value || undefined)} label="Urutkan" options={[{ value: "updated_desc", label: "Terakhir diperbarui" }, { value: "created_desc", label: "Terbaru dibuat" }, { value: "scheduled_asc", label: "Jadwal terdekat" }, { value: "published_desc", label: "Terbaru terbit" }, { value: "title_asc", label: "Judul A-Z" }, { value: "section_position", label: "Posisi section" }]} />
                        <input type="date" value={filters.published_from ?? ""} onChange={(event) => setFilter("published_from", event.target.value || undefined)} className="h-10 rounded border-slate-200 bg-white text-xs focus:border-[#e35336] focus:ring-[#e35336]" aria-label="Terbit mulai tanggal" />
                        <input type="date" value={filters.published_to ?? ""} onChange={(event) => setFilter("published_to", event.target.value || undefined)} className="h-10 rounded border-slate-200 bg-white text-xs focus:border-[#e35336] focus:ring-[#e35336]" aria-label="Terbit sampai tanggal" />
                    </div>

                    <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-1.5">
                            {savedViews.map((view) => (
                                <button key={view.id} type="button" onClick={() => visit(view.filters)} className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:border-slate-400">{view.name}</button>
                            ))}
                        </div>
                        <div className="flex gap-1.5">
                            <input value={savedViewName} onChange={(event) => setSavedViewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveView(); }} className="h-8 min-w-0 rounded border-slate-200 text-[11px] focus:border-[#e35336] focus:ring-[#e35336]" placeholder="Nama tampilan filter" maxLength={80} />
                            <button type="button" onClick={saveView} disabled={!savedViewName.trim()} className="h-8 rounded border border-slate-200 px-2.5 text-[10px] font-bold text-slate-700 hover:border-slate-400 disabled:opacity-40">Simpan</button>
                        </div>
                    </div>

                    <BulkActionBar
                        count={selected.size}
                        allPageSelected={allPageSelected}
                        action={bulkAction}
                        section={bulkSection}
                        schedule={bulkSchedule}
                        confirmation={bulkConfirmation}
                        busy={bulkBusy}
                        permissions={permissions}
                        sections={sections}
                        onToggleAll={toggleAll}
                        onAction={setBulkAction}
                        onSection={setBulkSection}
                        onSchedule={setBulkSchedule}
                        onConfirmation={setBulkConfirmation}
                        onClear={() => setSelected(new Set())}
                        onApply={() => void runBulkAction()}
                    />

                    <GalleryTable items={items.data} onEdit={setEditorItem} selected={selected} onToggle={toggleItem} />

                    {items.data.length === 0 && (
                        <div className="grid min-h-64 place-items-center px-5 py-12 text-center">
                            <div><span className="mx-auto grid size-11 place-items-center rounded-full bg-slate-100 text-slate-400"><Filter size={18} /></span><p className="mt-3 text-sm font-bold text-slate-800">Media tidak ditemukan</p><p className="mt-1 text-xs text-slate-400">Ubah filter atau upload koleksi pertama.</p></div>
                        </div>
                    )}

                    <Pagination items={items} />
                </section>
            </div>

            <GalleryUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onComplete={() => router.reload({ only: ["items", "status_counts", "sections"] })} sections={sections} locations={locations} capabilities={capabilities} config={uploadConfig} />
            <GalleryEditorDialog item={editorItem} onClose={() => setEditorItem(null)} sections={sections} locations={locations} permissions={permissions} />
            <LocationDialog open={locationOpen} onClose={() => setLocationOpen(false)} locations={locations} />
        </AdminLayout>
    );
}

function downloadImportErrors(results: Array<{ line: number; uuid?: string | null; ok: boolean; message?: string }>) {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = results.filter((row) => !row.ok);
    const csv = ["line,uuid,error", ...rows.map((row) => [row.line, row.uuid, row.message].map(escape).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `facility-gallery-import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function BulkActionBar({
    count,
    allPageSelected,
    action,
    section,
    schedule,
    confirmation,
    busy,
    permissions,
    sections,
    onToggleAll,
    onAction,
    onSection,
    onSchedule,
    onConfirmation,
    onClear,
    onApply,
}: {
    count: number;
    allPageSelected: boolean;
    action: string;
    section: string;
    schedule: string;
    confirmation: string;
    busy: boolean;
    permissions: GalleryPermissions;
    sections: GallerySectionAdmin[];
    onToggleAll: () => void;
    onAction: (value: string) => void;
    onSection: (value: string) => void;
    onSchedule: (value: string) => void;
    onConfirmation: (value: string) => void;
    onClear: () => void;
    onApply: () => void;
}) {
    const expectedConfirmation = `HAPUS ${count} ITEM`;
    const ready = count > 0
        && Boolean(action)
        && (action !== "assign" || Boolean(section))
        && (action !== "schedule" || Boolean(schedule))
        && (action !== "delete" || confirmation === expectedConfirmation);

    return (
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-3 py-3 xl:flex-row xl:items-center">
            <div className="flex min-w-[190px] items-center gap-3">
                <button type="button" onClick={onToggleAll} className={`grid size-8 place-items-center rounded border ${allPageSelected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-500"}`} aria-label={allPageSelected ? "Batalkan semua pilihan halaman" : "Pilih semua pada halaman"}><ListChecks size={15} /></button>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Pilihan aktif</p><p className="text-xs font-bold text-slate-800">{count} media</p></div>
                {count > 0 && <button type="button" onClick={onClear} className="text-[10px] font-bold text-[#d9472a]">Bersihkan</button>}
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
                <select value={action} onChange={(event) => onAction(event.target.value)} disabled={count === 0 || busy} className="h-9 min-w-[170px] rounded border-slate-200 bg-white text-xs focus:border-[#e35336] focus:ring-[#e35336] disabled:opacity-40" aria-label="Pilih aksi massal">
                    <option value="">Pilih aksi massal</option>
                    <option value="export">Export pilihan</option>
                    {permissions.manage && <option value="submit">Kirim untuk review</option>}
                    {permissions.publish && <option value="publish">Terbitkan</option>}
                    {permissions.publish && <option value="schedule">Jadwalkan</option>}
                    {permissions.publish && <option value="unpublish">Unpublish</option>}
                    {permissions.manage && <option value="review">Kembalikan ke review</option>}
                    {permissions.manage && <option value="draft">Kembalikan ke draft</option>}
                    {permissions.manage && <option value="assign">Tambahkan ke section</option>}
                    {permissions.delete && <option value="delete">Hapus permanen</option>}
                </select>
                {action === "assign" && <select value={section} onChange={(event) => onSection(event.target.value)} className="h-9 rounded border-slate-200 bg-white text-xs focus:border-[#e35336] focus:ring-[#e35336]" aria-label="Section tujuan"><option value="">Pilih section</option>{sections.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select>}
                {action === "schedule" && <input type="datetime-local" value={schedule} onChange={(event) => onSchedule(event.target.value)} className="h-9 rounded border-slate-200 bg-white text-xs focus:border-[#e35336] focus:ring-[#e35336]" aria-label="Jadwal publikasi" />}
                {action === "delete" && <input value={confirmation} onChange={(event) => onConfirmation(event.target.value)} className="h-9 min-w-[220px] rounded border-red-200 bg-red-50 text-xs text-red-700 placeholder:text-red-300 focus:border-red-500 focus:ring-red-500" placeholder={expectedConfirmation} aria-label="Konfirmasi penghapusan permanen" />}
                <button type="button" onClick={onApply} disabled={!ready || busy} className={`flex h-9 items-center gap-2 rounded px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-35 ${action === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-slate-950 hover:bg-[#e35336]"}`}>{busy && <LoaderCircle size={14} className="animate-spin" />}{busy ? "Memproses" : "Terapkan"}</button>
            </div>
        </div>
    );
}

function GalleryInsights({ analytics }: { analytics: GalleryAnalytics }) {
    const opens = analytics.events.gallery_lightbox_open ?? 0;
    const impressions = analytics.events.gallery_card_impression ?? 0;
    const openRate = impressions > 0 ? Math.round((opens / impressions) * 1000) / 10 : 0;

    return (
        <section className="border border-slate-200 bg-white" aria-labelledby="gallery-insights-title">
            <header className="flex items-end justify-between border-b border-slate-200 px-4 py-3">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#e35336]">Editorial intelligence</p><h2 id="gallery-insights-title" className="mt-1 font-clash text-lg font-semibold text-slate-950">Performa {analytics.days} hari</h2></div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Anonim / tanpa IP</p>
            </header>
            <div className="grid lg:grid-cols-[.75fr_1fr_1fr_1fr]">
                <div className="grid grid-cols-2 border-b border-slate-200 lg:border-b-0 lg:border-r">
                    <InsightMetric label="Impression" value={impressions} />
                    <InsightMetric label="Open rate" value={`${openRate}%`} />
                    <InsightMetric label="Depth rata-rata" value={analytics.average_navigation_depth} />
                    <InsightMetric label="Video selesai" value={`${analytics.video_completion_rate}%`} />
                </div>
                <InsightList title="Paling sering dibuka" items={analytics.top_opened.map((item) => ({ label: item.title, value: item.count }))} />
                <InsightList title="Pencarian teratas" items={analytics.search_terms.map((item) => ({ label: item.term, value: item.count }))} />
                <InsightList title="Pencarian tanpa hasil" items={analytics.zero_result_terms.map((item) => ({ label: item.term, value: item.count }))} />
            </div>
        </section>
    );
}

function InsightMetric({ label, value }: { label: string; value: string | number }) {
    return <div className="border-b border-r border-slate-100 p-3"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p><p className="mt-1 font-clash text-xl font-semibold text-slate-900">{typeof value === "number" ? value.toLocaleString("id-ID") : value}</p></div>;
}

function InsightList({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
    return <div className="min-h-44 border-b border-slate-200 p-4 lg:border-b-0 lg:border-r"><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{title}</p><ol className="space-y-2">{items.slice(0, 5).map((item, index) => <li key={`${item.label}-${index}`} className="grid grid-cols-[18px_minmax(0,1fr)_auto] gap-2 text-[11px]"><span className="font-mono text-slate-300">{String(index + 1).padStart(2, "0")}</span><span className="truncate font-semibold text-slate-700">{item.label}</span><span className="font-bold text-slate-400">{item.value}</span></li>)}{items.length === 0 && <li className="text-[11px] text-slate-400">Belum ada data.</li>}</ol></div>;
}

function GalleryTable({ items, onEdit, selected, onToggle }: { items: AdminGalleryItem[]; onEdit: (item: AdminGalleryItem) => void; selected: Set<string>; onToggle: (uuid: string) => void }) {
    return (
        <>
            <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1050px] border-collapse text-left">
                    <thead><tr className="border-b border-slate-200 bg-white text-[10px] uppercase tracking-[0.1em] text-slate-400"><th className="w-10 px-3 py-3"><span className="sr-only">Pilih</span></th><th className="w-[92px] px-4 py-3 font-bold">Media</th><th className="px-3 py-3 font-bold">Identitas</th><th className="px-3 py-3 font-bold">Penempatan</th><th className="px-3 py-3 font-bold">Lokasi</th><th className="px-3 py-3 font-bold">Status</th><th className="px-3 py-3 font-bold">Diperbarui</th><th className="w-12 px-3 py-3" /></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {items.map((item) => (
                            <tr key={item.uuid} onDoubleClick={() => onEdit(item)} className="group transition hover:bg-slate-50">
                                <td className="px-3 py-3"><input type="checkbox" checked={selected.has(item.uuid)} onChange={() => onToggle(item.uuid)} onDoubleClick={(event) => event.stopPropagation()} className="rounded border-slate-300 text-[#e35336] focus:ring-[#e35336]" aria-label={`Pilih ${item.title}`} /></td>
                                <td className="px-4 py-3"><GalleryMedia item={item} className="h-14 w-[74px] rounded-sm" /></td>
                                <td className="max-w-[360px] px-3 py-3"><button type="button" onClick={() => onEdit(item)} className="block max-w-full text-left"><strong className="block truncate text-xs font-bold text-slate-900 group-hover:text-[#d9472a]">{item.title || "Tanpa judul"}</strong><span className="mt-1 block truncate text-[11px] text-slate-500">{item.arena_type}</span><span className="mt-1 block truncate font-mono text-[9px] text-slate-300">{item.uuid}</span></button></td>
                                <td className="px-3 py-3"><div className="flex max-w-[260px] flex-wrap gap-1">{item.sections.map((section) => <span key={section.key} className="rounded-sm bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">{section.name}{section.featured_position ? ` #${section.featured_position}` : ""}</span>)}</div></td>
                                <td className="px-3 py-3 text-xs text-slate-600">{item.location?.name ?? "-"}</td>
                                <td className="px-3 py-3"><StatusBadge status={item.status} /></td>
                                <td className="px-3 py-3"><span className="block text-[11px] font-semibold text-slate-600">{item.updated_at ? new Date(item.updated_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-"}</span><span className="mt-0.5 block text-[10px] text-slate-400">{item.updated_by ?? "Sistem"}</span></td>
                                <td className="px-3 py-3"><button type="button" onClick={() => onEdit(item)} className="grid size-8 place-items-center rounded border border-transparent text-slate-400 hover:border-slate-200 hover:bg-white hover:text-slate-900" aria-label={`Edit ${item.title}`}><ChevronRight size={16} /></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="grid gap-3 p-3 sm:grid-cols-2 lg:hidden">
                {items.map((item) => (
                    <article key={item.uuid} className={`relative border bg-white p-2 transition ${selected.has(item.uuid) ? "border-[#e35336]" : "border-slate-200"}`}>
                        <input type="checkbox" checked={selected.has(item.uuid)} onChange={() => onToggle(item.uuid)} className="absolute left-3 top-3 z-10 rounded border-slate-300 bg-white text-[#e35336] focus:ring-[#e35336]" aria-label={`Pilih ${item.title}`} />
                        <button type="button" onClick={() => onEdit(item)} className="grid w-full grid-cols-[94px_minmax(0,1fr)] gap-3 text-left">
                            <GalleryMedia item={item} className="h-[94px] w-[94px] rounded-sm" />
                            <span className="min-w-0 py-1"><span className="mb-2 flex items-center justify-between gap-2"><StatusBadge status={item.status} /><ChevronRight size={14} className="text-slate-300" /></span><strong className="block truncate text-xs text-slate-900">{item.title}</strong><span className="mt-1 block truncate text-[11px] text-slate-500">{item.arena_type}</span><span className="mt-2 block truncate text-[10px] text-slate-400">{item.location?.name} / {item.sections.map((section) => section.name).join(", ")}</span></span>
                        </button>
                    </article>
                ))}
            </div>
        </>
    );
}

function StatusBadge({ status }: { status: GalleryStatus }) {
    return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.07em] ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

function StatusTab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
    return <button type="button" onClick={onClick} className={`relative flex h-11 items-center gap-2 px-3 text-[11px] font-bold transition ${active ? "text-slate-950" : "text-slate-400 hover:text-slate-700"}`}>{label}<span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"}`}>{count}</span>{active && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-[#e35336]" />}</button>;
}

function FilterSelect({ value, onChange, label, options }: { value?: string; onChange: (value: string) => void; label: string; options: Array<{ value: string; label: string }> }) {
    return <select value={value ?? ""} onChange={(event) => onChange(event.target.value)} className="h-10 rounded border-slate-200 bg-white text-xs focus:border-[#e35336] focus:ring-[#e35336]" aria-label={label}><option value="">{label}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
}

function Metric({ label, value, icon: Icon, tone = "slate", last = false }: { label: string; value: number; icon: typeof Images; tone?: "slate" | "emerald" | "amber" | "red"; last?: boolean }) {
    const colors = { slate: "bg-slate-100 text-slate-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", red: "bg-red-50 text-red-600" };
    return <div className={`flex min-h-24 items-center justify-between gap-3 border-b border-r border-slate-200 p-4 md:border-b-0 ${last ? "md:border-r-0" : ""}`}><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 font-clash text-2xl font-semibold text-slate-950">{value.toLocaleString("id-ID")}</p></div><span className={`grid size-9 shrink-0 place-items-center rounded ${colors[tone]}`}><Icon size={16} /></span></div>;
}

function Pagination({ items }: { items: GalleryPageData["items"] }) {
    if (items.last_page <= 1) return null;
    return <footer className="flex items-center justify-between border-t border-slate-200 px-3 py-3"><p className="text-[11px] text-slate-500">{items.from}-{items.to} dari {items.total}</p><div className="flex items-center gap-2">{items.prev_page_url ? <Link href={items.prev_page_url} preserveScroll preserveState className="grid size-8 place-items-center rounded border border-slate-200 text-slate-600 hover:border-slate-400" aria-label="Halaman sebelumnya"><ChevronLeft size={15} /></Link> : <span className="grid size-8 place-items-center rounded border border-slate-100 text-slate-200"><ChevronLeft size={15} /></span>}<span className="min-w-16 text-center text-[11px] font-bold text-slate-600">{items.current_page} / {items.last_page}</span>{items.next_page_url ? <Link href={items.next_page_url} preserveScroll preserveState className="grid size-8 place-items-center rounded border border-slate-200 text-slate-600 hover:border-slate-400" aria-label="Halaman berikutnya"><ChevronRight size={15} /></Link> : <span className="grid size-8 place-items-center rounded border border-slate-100 text-slate-200"><ChevronRight size={15} /></span>}</div></footer>;
}

function LocationDialog({ open, onClose, locations }: { open: boolean; onClose: () => void; locations: GalleryLocation[] }) {
    const [name, setName] = useState("");
    if (!open || typeof document === "undefined") return null;

    const create = () => {
        if (!name.trim()) return;
        router.post(route("admin.gallery.locations.store"), { name: name.trim() }, { preserveScroll: true, onSuccess: () => setName("") });
    };
    const toggle = (location: GalleryLocation) => router.put(route("admin.gallery.locations.update", location.id), { name: location.name, is_active: !location.is_active }, { preserveScroll: true });

    return createPortal(<div className="fixed inset-0 z-[110] grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]"><section role="dialog" aria-modal="true" aria-labelledby="location-dialog-title" className="gallery-admin-dialog w-full max-w-md bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-200 p-4"><h2 id="location-dialog-title" className="font-clash text-lg font-semibold">Lokasi galeri</h2><button type="button" onClick={onClose} className="grid size-8 place-items-center text-slate-400 hover:text-slate-900" aria-label="Tutup"><X size={17} /></button></header><div className="max-h-80 divide-y divide-slate-100 overflow-y-auto px-4">{locations.map((location) => <div key={location.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-xs font-bold text-slate-800">{location.name}</p><p className="mt-0.5 text-[10px] text-slate-400">/{location.slug}</p></div><button type="button" onClick={() => toggle(location)} className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase ${location.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{location.is_active ? "Aktif" : "Nonaktif"}</button></div>)}</div><footer className="flex gap-2 border-t border-slate-200 bg-slate-50 p-4"><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") create(); }} className="h-10 min-w-0 flex-1 rounded border-slate-200 bg-white text-xs focus:border-[#e35336] focus:ring-[#e35336]" placeholder="Nama lokasi baru" /><button type="button" onClick={create} disabled={!name.trim()} className="h-10 rounded bg-slate-950 px-4 text-xs font-bold text-white hover:bg-[#e35336] disabled:opacity-40">Tambah</button></footer></section></div>, document.body);
}
