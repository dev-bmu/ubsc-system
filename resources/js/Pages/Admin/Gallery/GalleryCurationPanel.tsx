import { router } from "@inertiajs/react";
import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import axios from "axios";
import {
    ArrowDown,
    ArrowUp,
    Check,
    GripVertical,
    LoaderCircle,
    Plus,
    Power,
    PowerOff,
    Search,
    X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
    CurationCandidate,
    FeaturedGalleryItem,
    GalleryPermissions,
    GallerySectionAdmin,
} from "./types";

interface Props {
    sections: GallerySectionAdmin[];
    permissions: GalleryPermissions;
}

type SlotItem = FeaturedGalleryItem | (CurationCandidate & { status: "published"; position: number });

export default function GalleryCurationPanel({ sections, permissions }: Props) {
    const [activeKey, setActiveKey] = useState(sections[0]?.key ?? "indoor");
    const section = sections.find((item) => item.key === activeKey) ?? sections[0];
    const [slots, setSlots] = useState<SlotItem[]>(section?.featured_items ?? []);
    const [query, setQuery] = useState("");
    const [candidates, setCandidates] = useState<CurationCandidate[]>([]);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activationBusy, setActivationBusy] = useState(false);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    useEffect(() => {
        setSlots(section?.featured_items ?? []);
        setCandidates([]);
        setQuery("");
    }, [section?.id, section?.featured_items]);

    useEffect(() => {
        if (!section) return;
        const timer = window.setTimeout(async () => {
            setSearching(true);
            try {
                const response = await axios.get(
                    route("admin.gallery.sections.candidates", section.id),
                    { params: query ? { q: query } : {} },
                );
                setCandidates(response.data.items ?? []);
            } finally {
                setSearching(false);
            }
        }, query ? 260 : 0);

        return () => window.clearTimeout(timer);
    }, [query, section]);

    const selected = useMemo(() => new Set(slots.map((item) => item.uuid)), [slots]);
    const available = candidates.filter((item) => !selected.has(item.uuid));
    const complete = Boolean(section && slots.length === section.quota && slots.every((item) => item.status === "published"));

    if (!section) return null;

    const move = (index: number, direction: -1 | 1) => {
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= slots.length) return;
        setSlots((current) => {
            const next = [...current];
            [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
            return next.map((item, itemIndex) => ({ ...item, position: itemIndex + 1 }));
        });
    };

    const add = (candidate: CurationCandidate) => {
        if (slots.length >= section.quota) return;
        setSlots((current) => [
            ...current,
            { ...candidate, status: "published", position: current.length + 1 },
        ]);
    };

    const remove = (uuid: string) => {
        setSlots((current) => current
            .filter((item) => item.uuid !== uuid)
            .map((item, index) => ({ ...item, position: index + 1 })));
    };

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        setSlots((current) => {
            const from = current.findIndex((item) => item.uuid === active.id);
            const to = current.findIndex((item) => item.uuid === over.id);
            if (from < 0 || to < 0) return current;
            return arrayMove(current, from, to).map((item, index) => ({ ...item, position: index + 1 }));
        });
    };

    const save = () => {
        setSaving(true);
        router.put(
            route("admin.gallery.sections.curation", section.id),
            { items: slots.map((item) => item.uuid) },
            { preserveScroll: true, onFinish: () => setSaving(false) },
        );
    };

    const toggleActive = () => {
        setActivationBusy(true);
        router.post(
            route(
                section.is_active
                    ? "admin.gallery.sections.deactivate"
                    : "admin.gallery.sections.activate",
                section.id,
            ),
            {},
            { preserveScroll: true, onFinish: () => setActivationBusy(false) },
        );
    };

    return (
        <section className="border border-slate-200 bg-white" aria-labelledby="gallery-curation-title">
            <header className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between lg:px-5">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#e35336]">Public composition</p>
                    <h2 id="gallery-curation-title" className="mt-1 font-clash text-lg font-semibold text-slate-950">Kurasi halaman fasilitas</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Section galeri">
                        {sections.map((item) => (
                            <button key={item.key} type="button" role="tab" aria-selected={item.key === section.key} onClick={() => setActiveKey(item.key)} className={`h-8 rounded px-3 text-[11px] font-bold transition ${item.key === section.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                                {item.name}
                            </button>
                        ))}
                    </div>
                    {permissions.publish && (
                        <button type="button" onClick={toggleActive} disabled={activationBusy || (!section.is_active && !complete)} className={`flex h-10 items-center gap-2 rounded border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${section.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700 hover:border-slate-400"}`}>
                            {activationBusy ? <LoaderCircle size={14} className="animate-spin" /> : section.is_active ? <PowerOff size={14} /> : <Power size={14} />}
                            {section.is_active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                    )}
                </div>
            </header>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r lg:p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-800">Slot terpilih</p>
                        <span className={`text-[11px] font-semibold ${complete ? "text-emerald-600" : "text-amber-600"}`}>{slots.length} / {section.quota}</span>
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={slots.map((item) => item.uuid)} strategy={rectSortingStrategy}>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: section.quota }, (_, index) => {
                            const item = slots[index];
                            return item ? (
                                <SortableSlot key={item.uuid} item={item} index={index} total={slots.length} canManage={permissions.manage} onMove={move} onRemove={remove} />
                            ) : (
                                <div key={`empty-${index}`} className="grid min-h-[82px] place-items-center border border-dashed border-slate-250 bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                                    Slot {String(index + 1).padStart(2, "0")}
                                </div>
                            );
                        })}
                    </div>
                    </SortableContext>
                    </DndContext>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                        <p className="text-[11px] leading-4 text-slate-500">Section publik hanya aktif saat seluruh slot berisi media berstatus Published.</p>
                        {permissions.manage && (
                            <button type="button" onClick={save} disabled={saving} className="flex h-9 shrink-0 items-center gap-2 rounded bg-slate-950 px-3 text-xs font-bold text-white hover:bg-[#e35336] disabled:opacity-40">
                                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}Simpan urutan
                            </button>
                        )}
                    </div>
                </div>

                <aside className="p-4 lg:p-5">
                    <p className="text-xs font-bold text-slate-800">Media terbit di {section.name}</p>
                    <label className="relative mt-3 block">
                        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full rounded border-slate-200 pl-9 pr-8 text-xs focus:border-[#e35336] focus:ring-[#e35336]" placeholder="Cari kandidat" />
                        {searching && <LoaderCircle size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
                    </label>
                    <div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto border-y border-slate-100">
                        {available.map((item) => (
                            <button key={item.uuid} type="button" onClick={() => add(item)} disabled={!permissions.manage || slots.length >= section.quota} className="grid w-full grid-cols-[44px_minmax(0,1fr)_24px] items-center gap-2 py-2 text-left disabled:opacity-40">
                                <span className="h-10 overflow-hidden bg-slate-100">{item.thumbnail && <img src={item.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />}</span>
                                <span className="min-w-0"><strong className="block truncate text-[11px] text-slate-800">{item.title}</strong><span className="block truncate text-[10px] text-slate-400">{item.arena_type} / {item.location}</span></span>
                                <span className="grid size-6 place-items-center rounded border border-slate-200 text-slate-500"><Plus size={12} /></span>
                            </button>
                        ))}
                        {!searching && available.length === 0 && <p className="py-8 text-center text-[11px] text-slate-400">Tidak ada kandidat lain.</p>}
                    </div>
                </aside>
            </div>
        </section>
    );
}

function SortableSlot({ item, index, total, canManage, onMove, onRemove }: { item: SlotItem; index: number; total: number; canManage: boolean; onMove: (index: number, direction: -1 | 1) => void; onRemove: (uuid: string) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.uuid, disabled: !canManage });

    return (
        <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }} className={`group grid min-h-[82px] grid-cols-[68px_minmax(0,1fr)] border bg-white ${isDragging ? "border-[#e35336] shadow-lg" : "border-slate-200"}`}>
            <div className="relative bg-slate-100">
                {item.thumbnail && <img src={item.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />}
                <span className="absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-black/75 text-[9px] font-bold text-white">{index + 1}</span>
            </div>
            <div className="min-w-0 p-2">
                <div className="flex items-start gap-1"><p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{item.title}</p>{canManage && <button type="button" {...attributes} {...listeners} className="grid size-6 shrink-0 cursor-grab place-items-center rounded text-slate-400 hover:bg-slate-100 active:cursor-grabbing" aria-label={`Pindahkan ${item.title}`}><GripVertical size={13} /></button>}</div>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-400">{item.status.replaceAll("_", " ")}</p>
                {canManage && (
                    <div className="mt-2 flex gap-1">
                        <IconButton label="Naik" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={12} /></IconButton>
                        <IconButton label="Turun" disabled={index === total - 1} onClick={() => onMove(index, 1)}><ArrowDown size={12} /></IconButton>
                        <IconButton label="Hapus dari slot" onClick={() => onRemove(item.uuid)} danger><X size={12} /></IconButton>
                    </div>
                )}
            </div>
        </article>
    );
}

function IconButton({ label, disabled, onClick, danger = false, children }: { label: string; disabled?: boolean; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
    return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`grid size-6 place-items-center rounded border disabled:opacity-30 ${danger ? "border-red-100 text-red-500 hover:bg-red-50" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>{children}</button>;
}
