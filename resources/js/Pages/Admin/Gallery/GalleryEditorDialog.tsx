import { router } from "@inertiajs/react";
import {
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    EyeOff,
    LoaderCircle,
    RotateCcw,
    Save,
    Send,
    Trash2,
    UploadCloud,
    X,
} from "lucide-react";
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type {
    AdminGalleryItem,
    GalleryLocation,
    GalleryPermissions,
    GallerySectionAdmin,
} from "./types";

interface Props {
    item: AdminGalleryItem | null;
    onClose: () => void;
    sections: GallerySectionAdmin[];
    locations: GalleryLocation[];
    permissions: GalleryPermissions;
}

interface EditorForm {
    title: string;
    arena_type: string;
    alt_text: string;
    caption: string;
    title_en: string;
    arena_type_en: string;
    alt_text_en: string;
    caption_en: string;
    search_aliases: string;
    location_id: string;
    sections: string[];
    captured_at: string;
    credit: string;
    focal_x: number;
    focal_y: number;
    poster_second: string;
    rights_confirmed: boolean;
    poster: File | null;
    subtitle: File | null;
}

function formFromItem(item: AdminGalleryItem): EditorForm {
    return {
        title: item.title,
        arena_type: item.arena_type,
        alt_text: item.alt_text,
        caption: item.caption ?? "",
        title_en: item.translation_en?.title ?? "",
        arena_type_en: item.translation_en?.arena_type ?? "",
        alt_text_en: item.translation_en?.alt_text ?? "",
        caption_en: item.translation_en?.caption ?? "",
        search_aliases: item.search_aliases.join(", "),
        location_id: String(item.location?.id ?? ""),
        sections: item.sections.map((section) => section.key),
        captured_at: item.captured_at ?? "",
        credit: item.credit,
        focal_x: item.focal_x,
        focal_y: item.focal_y,
        poster_second: item.poster_second === null ? "" : String(item.poster_second),
        rights_confirmed: item.rights_confirmed,
        poster: null,
        subtitle: null,
    };
}

const statusLabel: Record<AdminGalleryItem["status"], string> = {
    draft: "Draft",
    processing: "Processing",
    ready_for_review: "Ready for Review",
    scheduled: "Scheduled",
    published: "Published",
    unpublished: "Unpublished",
    failed: "Failed",
};

export default function GalleryEditorDialog({
    item,
    onClose,
    sections,
    locations,
    permissions,
}: Props) {
    const [form, setForm] = useState<EditorForm | null>(item ? formFromItem(item) : null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [acting, setActing] = useState<string | null>(null);
    const [englishOpen, setEnglishOpen] = useState(Boolean(item?.translation_en));
    const [publishAt, setPublishAt] = useState(item?.publish_at ?? "");
    const [recoveredDraft, setRecoveredDraft] = useState(false);
    const posterRef = useRef<HTMLInputElement>(null);
    const subtitleRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!item) {
            setForm(null);
            setRecoveredDraft(false);
            return;
        }
        const initial = formFromItem(item);
        const stored = localStorage.getItem(`ubsc.gallery.editor.${item.uuid}`);
        if (stored) {
            try {
                const recovery = JSON.parse(stored) as { lock_version: number; form: Partial<EditorForm> };
                if (recovery.lock_version === item.lock_version) {
                    setForm({ ...initial, ...recovery.form, poster: null, subtitle: null });
                    setRecoveredDraft(true);
                } else {
                    localStorage.removeItem(`ubsc.gallery.editor.${item.uuid}`);
                    setForm(initial);
                    setRecoveredDraft(false);
                }
            } catch {
                localStorage.removeItem(`ubsc.gallery.editor.${item.uuid}`);
                setForm(initial);
                setRecoveredDraft(false);
            }
        } else {
            setForm(initial);
            setRecoveredDraft(false);
        }
        setPublishAt(item?.publish_at ?? "");
        setErrors({});
        setEnglishOpen(Boolean(item?.translation_en));
    }, [item]);

    useEffect(() => {
        if (!item || !form) return;
        const timer = window.setTimeout(() => {
            const { poster: _poster, subtitle: _subtitle, ...recoverable } = form;
            const { poster: _initialPoster, subtitle: _initialSubtitle, ...initial } = formFromItem(item);
            const storageKey = `ubsc.gallery.editor.${item.uuid}`;

            if (JSON.stringify(recoverable) === JSON.stringify(initial)) {
                localStorage.removeItem(storageKey);
                setRecoveredDraft(false);
                return;
            }
            localStorage.setItem(storageKey, JSON.stringify({
                lock_version: item.lock_version,
                form: recoverable,
                saved_at: new Date().toISOString(),
            }));
        }, 800);

        return () => window.clearTimeout(timer);
    }, [form, item]);

    useEffect(() => {
        if (!item) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !saving && !acting) onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [acting, item, onClose, saving]);

    const preview = item?.image?.fallback_url ?? item?.video?.poster?.fallback_url ?? null;
    const readiness = useMemo(() => Object.values(item?.readiness_errors ?? {}), [item]);

    const patchForm = <K extends keyof EditorForm>(key: K, value: EditorForm[K]) => {
        setForm((current) => current ? { ...current, [key]: value } : current);
    };

    const handleFocalPoint = (event: MouseEvent<HTMLButtonElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        patchForm("focal_x", Number(((event.clientX - bounds.left) / bounds.width).toFixed(4)));
        patchForm("focal_y", Number(((event.clientY - bounds.top) / bounds.height).toFixed(4)));
    };

    const save = () => {
        if (!item || !form) return;
        setSaving(true);
        setErrors({});
        router.post(
            route("admin.gallery.items.update", item.uuid),
            {
                _method: "put",
                lock_version: item.lock_version,
                ...form,
                search_aliases: form.search_aliases
                    .split(",")
                    .map((alias) => alias.trim())
                    .filter(Boolean),
                location_id: Number(form.location_id),
                poster_second: form.poster_second || null,
            },
            {
                forceFormData: true,
                preserveScroll: true,
                onError: (nextErrors) => setErrors(nextErrors),
                onSuccess: () => {
                    localStorage.removeItem(`ubsc.gallery.editor.${item.uuid}`);
                    onClose();
                },
                onFinish: () => setSaving(false),
            },
        );
    };

    const action = (name: string, data: Record<string, string> = {}) => {
        if (!item) return;
        setActing(name);
        setErrors({});
        router.post(route(`admin.gallery.items.${name}`, item.uuid), data, {
            preserveScroll: true,
            onError: (nextErrors) => setErrors(nextErrors),
            onSuccess: onClose,
            onFinish: () => setActing(null),
        });
    };

    const destroy = () => {
        if (!item || !window.confirm(`Hapus permanen "${item.title}" beserta seluruh turunannya?`)) return;
        setActing("delete");
        router.delete(route("admin.gallery.items.destroy", item.uuid), {
            preserveScroll: true,
            onSuccess: onClose,
            onFinish: () => setActing(null),
        });
    };

    if (!item || !form || typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/45 backdrop-blur-[2px]" role="presentation">
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="gallery-editor-title"
                className="gallery-admin-panel flex h-full w-full max-w-[900px] flex-col bg-[#f7f8fa] shadow-2xl"
            >
                <header className="flex shrink-0 items-start justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
                    <div className="min-w-0 pr-4">
                        <div className="mb-1 flex items-center gap-2">
                            <span className={`size-1.5 rounded-full ${item.status === "published" ? "bg-emerald-500" : item.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{statusLabel[item.status]} / {item.media_type}</p>
                        </div>
                        <h2 id="gallery-editor-title" className="truncate font-clash text-xl font-semibold text-slate-950 sm:text-2xl">
                            {item.title || "Media tanpa judul"}
                        </h2>
                        <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{item.uuid}</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={saving || Boolean(acting)} className="grid size-9 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-40" aria-label="Tutup editor">
                        <X size={18} />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="grid xl:grid-cols-[310px_minmax(0,1fr)]">
                        <aside className="border-b border-slate-200 bg-[#f0f2f4] p-5 xl:sticky xl:top-0 xl:h-fit xl:border-b-0 xl:border-r sm:p-7">
                            <button
                                type="button"
                                onClick={handleFocalPoint}
                                className="relative block w-full cursor-crosshair overflow-hidden bg-slate-200 text-left"
                                style={{
                                    aspectRatio: item.image
                                        ? `${item.image.width}/${item.image.height}`
                                        : item.video
                                          ? `${item.video.width}/${item.video.height}`
                                          : "4/3",
                                }}
                                aria-label="Atur titik fokus gambar"
                            >
                                {preview ? (
                                    <img src={preview} alt={item.alt_text} className="h-full w-full object-cover" style={{ objectPosition: `${form.focal_x * 100}% ${form.focal_y * 100}%` }} />
                                ) : (
                                    <span className="grid h-full place-items-center text-xs text-slate-500">Media sedang diproses</span>
                                )}
                                <span className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#e35336] shadow" style={{ left: `${form.focal_x * 100}%`, top: `${form.focal_y * 100}%` }} />
                            </button>
                            <div className="mt-3 flex justify-between text-[10px] uppercase tracking-[0.1em] text-slate-500">
                                <span>Focal {Math.round(form.focal_x * 100)} / {Math.round(form.focal_y * 100)}</span>
                                <span>{item.image?.width ?? item.video?.width ?? "-"} x {item.image?.height ?? item.video?.height ?? "-"}</span>
                            </div>

                            {item.status === "failed" && (
                                <div className="mt-5 border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                                    <strong className="block">{item.processing_error_code}</strong>
                                    {item.processing_error_detail}
                                </div>
                            )}

                            {readiness.length > 0 && (
                                <div className="mt-5 border-t border-slate-300 pt-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Belum siap terbit</p>
                                    <ul className="mt-2 space-y-2">
                                        {readiness.map((message) => (
                                            <li key={message} className="flex gap-2 text-xs leading-4 text-slate-600">
                                                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
                                                {message}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-300 pt-4 text-[11px]">
                                <div><dt className="text-slate-400">Dibuat oleh</dt><dd className="mt-0.5 font-semibold text-slate-700">{item.created_by ?? "-"}</dd></div>
                                <div><dt className="text-slate-400">Diubah oleh</dt><dd className="mt-0.5 font-semibold text-slate-700">{item.updated_by ?? "-"}</dd></div>
                                <div><dt className="text-slate-400">Versi</dt><dd className="mt-0.5 font-semibold text-slate-700">{item.lock_version}</dd></div>
                                <div><dt className="text-slate-400">Terbit</dt><dd className="mt-0.5 font-semibold text-slate-700">{item.published_at ? new Date(item.published_at).toLocaleDateString("id-ID") : "-"}</dd></div>
                                <div className="col-span-2"><dt className="text-slate-400">File sumber</dt><dd className="mt-0.5 truncate font-semibold text-slate-700" title={item.source_file_name ?? undefined}>{item.source_file_name ?? "-"}</dd></div>
                            </dl>
                            <div className="mt-5 border-t border-slate-300 pt-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Riwayat terbaru</p>
                                <ol className="mt-2 space-y-2">
                                    {item.audit.slice(0, 6).map((entry) => (
                                        <li key={entry.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-[10px] leading-4">
                                            <span className="min-w-0"><strong className="block truncate text-slate-700">{entry.action.replaceAll("_", " ")}</strong><span className="text-slate-400">{entry.user}</span></span>
                                            <time className="text-right text-slate-400" dateTime={entry.created_at ?? undefined}>{entry.created_at ? new Date(entry.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : "-"}</time>
                                        </li>
                                    ))}
                                    {item.audit.length === 0 && <li className="text-[10px] text-slate-400">Belum ada riwayat.</li>}
                                </ol>
                            </div>
                        </aside>

                        <div className="space-y-7 p-5 sm:p-7">
                            {recoveredDraft && (
                                <div className="flex items-center justify-between gap-3 border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
                                    <span>Perubahan lokal yang belum tersimpan berhasil dipulihkan.</span>
                                    <button type="button" onClick={() => { localStorage.removeItem(`ubsc.gallery.editor.${item.uuid}`); setForm(formFromItem(item)); setRecoveredDraft(false); }} className="font-bold underline underline-offset-2">Gunakan data server</button>
                                </div>
                            )}
                            <section>
                                <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2">
                                    <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-slate-900">Metadata Indonesia</h3>
                                    <span className="text-[10px] text-slate-400">Wajib</span>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Judul" error={errors.title} className="sm:col-span-2">
                                        <input value={form.title} onChange={(event) => patchForm("title", event.target.value)} className="gallery-admin-input" maxLength={255} />
                                    </Field>
                                    <Field label="Jenis arena" error={errors.arena_type}>
                                        <input value={form.arena_type} onChange={(event) => patchForm("arena_type", event.target.value)} className="gallery-admin-input" maxLength={160} />
                                    </Field>
                                    <Field label="Lokasi" error={errors.location_id}>
                                        <select value={form.location_id} onChange={(event) => patchForm("location_id", event.target.value)} className="gallery-admin-input">
                                            <option value="">Pilih lokasi</option>
                                            {locations.filter((location) => location.is_active || location.id === item.location?.id).map((location) => (
                                                <option key={location.id} value={location.id}>{location.name}{!location.is_active ? " (nonaktif)" : ""}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field label="Alt text" error={errors.alt_text} className="sm:col-span-2" hint={`${form.alt_text.length}/500`}>
                                        <textarea value={form.alt_text} onChange={(event) => patchForm("alt_text", event.target.value)} className="gallery-admin-input min-h-20 resize-y py-2" maxLength={500} />
                                    </Field>
                                    <Field label="Caption" error={errors.caption} className="sm:col-span-2">
                                        <textarea value={form.caption} onChange={(event) => patchForm("caption", event.target.value)} className="gallery-admin-input min-h-24 resize-y py-2" maxLength={5000} />
                                    </Field>
                                    <Field label="Alias pencarian" error={errors.search_aliases} className="sm:col-span-2" hint="Pisahkan dengan koma">
                                        <input value={form.search_aliases} onChange={(event) => patchForm("search_aliases", event.target.value)} className="gallery-admin-input" placeholder="basket, lapangan utama, veteran" />
                                    </Field>
                                </div>
                            </section>

                            <section>
                                <button type="button" onClick={() => setEnglishOpen((current) => !current)} className="flex w-full items-center justify-between border-b border-slate-200 pb-2 text-left">
                                    <span className="text-xs font-bold uppercase tracking-[0.13em] text-slate-900">English metadata</span>
                                    <ChevronDown size={16} className={`transition-transform ${englishOpen ? "rotate-180" : ""}`} />
                                </button>
                                {englishOpen && (
                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                        <Field label="Title" error={errors.title_en} className="sm:col-span-2"><input value={form.title_en} onChange={(event) => patchForm("title_en", event.target.value)} className="gallery-admin-input" /></Field>
                                        <Field label="Arena type" error={errors.arena_type_en}><input value={form.arena_type_en} onChange={(event) => patchForm("arena_type_en", event.target.value)} className="gallery-admin-input" /></Field>
                                        <Field label="Alt text" error={errors.alt_text_en}><input value={form.alt_text_en} onChange={(event) => patchForm("alt_text_en", event.target.value)} className="gallery-admin-input" /></Field>
                                        <Field label="Caption" error={errors.caption_en} className="sm:col-span-2"><textarea value={form.caption_en} onChange={(event) => patchForm("caption_en", event.target.value)} className="gallery-admin-input min-h-20 resize-y py-2" /></Field>
                                    </div>
                                )}
                            </section>

                            <section>
                                <h3 className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-[0.13em] text-slate-900">Penempatan & hak</h3>
                                <fieldset className="mt-4">
                                    <legend className="text-xs font-semibold text-slate-700">Section</legend>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {sections.map((section) => {
                                            const active = form.sections.includes(section.key);
                                            return (
                                                <label key={section.key} className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-xs font-semibold ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                                                    <input type="checkbox" checked={active} onChange={() => patchForm("sections", active ? form.sections.filter((key) => key !== section.key) : [...form.sections, section.key])} className="sr-only" />
                                                    {active && <CheckCircle2 size={13} />}{section.name}
                                                </label>
                                            );
                                        })}
                                    </div>
                                    {errors.sections && <p className="mt-1 text-[11px] text-red-600">{errors.sections}</p>}
                                </fieldset>
                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                    <Field label="Tanggal pengambilan" error={errors.captured_at}><input type="date" max={new Date().toISOString().slice(0, 10)} value={form.captured_at} onChange={(event) => patchForm("captured_at", event.target.value)} className="gallery-admin-input" /></Field>
                                    <Field label="Kredit" error={errors.credit}><input value={form.credit} onChange={(event) => patchForm("credit", event.target.value)} className="gallery-admin-input" /></Field>
                                </div>
                                <label className="mt-4 flex cursor-pointer items-start gap-3 border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                                    <input type="checkbox" checked={form.rights_confirmed} onChange={(event) => patchForm("rights_confirmed", event.target.checked)} className="mt-0.5 rounded border-slate-300 text-[#e35336] focus:ring-[#e35336]" />
                                    Hak penyimpanan, pemrosesan, dan publikasi media telah dikonfirmasi.
                                </label>
                                {errors.rights_confirmed && <p className="mt-1 text-[11px] text-red-600">{errors.rights_confirmed}</p>}
                            </section>

                            {item.media_type === "video" && (
                                <section>
                                    <h3 className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-[0.13em] text-slate-900">Video</h3>
                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                        <Field label="Detik poster otomatis" error={errors.poster_second}><input type="number" min="0" max="90" step="0.1" value={form.poster_second} onChange={(event) => patchForm("poster_second", event.target.value)} className="gallery-admin-input" /></Field>
                                        <div className="grid grid-cols-2 gap-2 self-end">
                                            <button type="button" onClick={() => posterRef.current?.click()} className="flex h-10 items-center justify-center gap-2 rounded border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-slate-400"><UploadCloud size={14} />Poster</button>
                                            <button type="button" onClick={() => subtitleRef.current?.click()} className="flex h-10 items-center justify-center gap-2 rounded border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-slate-400"><UploadCloud size={14} />Subtitle</button>
                                            <input ref={posterRef} type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif" className="sr-only" onChange={(event) => patchForm("poster", event.target.files?.[0] ?? null)} />
                                            <input ref={subtitleRef} type="file" accept=".vtt,.txt" className="sr-only" onChange={(event) => patchForm("subtitle", event.target.files?.[0] ?? null)} />
                                        </div>
                                    </div>
                                    {(form.poster || form.subtitle) && <p className="mt-2 text-[11px] text-slate-500">{form.poster?.name}{form.poster && form.subtitle ? " / " : ""}{form.subtitle?.name}</p>}
                                </section>
                            )}

                            {Object.keys(errors).length > 0 && (
                                <div className="border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                                    {errors.lock_version ?? errors.status ?? errors.processing ?? "Periksa field yang ditandai sebelum menyimpan."}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-3 sm:px-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            {permissions.manage && item.status === "failed" && <ActionButton onClick={() => action("retry")} loading={acting === "retry"} icon={RotateCcw} label="Proses ulang" />}
                            {permissions.manage && item.status === "draft" && <ActionButton onClick={() => action("submit")} loading={acting === "submit"} icon={Send} label="Kirim review" />}
                            {permissions.manage && item.status === "ready_for_review" && <ActionButton onClick={() => action("draft")} loading={acting === "draft"} icon={RotateCcw} label="Kembali ke draft" />}
                            {permissions.manage && ["scheduled", "unpublished"].includes(item.status) && <ActionButton onClick={() => action("review")} loading={acting === "review"} icon={RotateCcw} label={item.status === "scheduled" ? "Batalkan jadwal" : "Kembali ke review"} />}
                            {permissions.publish && item.status === "published" && <ActionButton onClick={() => action("unpublish")} loading={acting === "unpublish"} icon={EyeOff} label="Sembunyikan" />}
                            {permissions.delete && <button type="button" onClick={destroy} disabled={Boolean(acting) || saving} className="grid size-10 place-items-center rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40" aria-label="Hapus permanen"><Trash2 size={16} /></button>}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {permissions.publish && ["ready_for_review", "scheduled"].includes(item.status) && (
                                <>
                                    <input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="h-10 rounded border-slate-200 text-xs focus:border-[#e35336] focus:ring-[#e35336]" aria-label="Jadwal publikasi" />
                                    <ActionButton onClick={() => action("schedule", { publish_at: publishAt })} disabled={!publishAt} loading={acting === "schedule"} icon={CalendarClock} label="Jadwalkan" />
                                    <ActionButton onClick={() => action("publish")} loading={acting === "publish"} icon={CheckCircle2} label="Terbitkan" primary />
                                </>
                            )}
                            {permissions.manage && <button type="button" onClick={save} disabled={saving || Boolean(acting)} className="flex h-10 items-center gap-2 rounded bg-slate-950 px-4 text-xs font-bold text-white hover:bg-[#e35336] disabled:opacity-40">{saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}Simpan</button>}
                        </div>
                    </div>
                </footer>
            </section>
        </div>,
        document.body,
    );
}

function Field({ label, hint, error, className = "", children }: { label: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
    return (
        <label className={`block text-xs font-semibold text-slate-700 ${className}`}>
            <span className="flex items-center justify-between gap-3"><span>{label}</span>{hint && <span className="font-normal text-slate-400">{hint}</span>}</span>
            <span className="mt-1.5 block">{children}</span>
            {error && <span className="mt-1 block text-[11px] font-normal text-red-600">{error}</span>}
        </label>
    );
}

function ActionButton({ onClick, loading, disabled, icon: Icon, label, primary = false }: { onClick: () => void; loading: boolean; disabled?: boolean; icon: typeof Save; label: string; primary?: boolean }) {
    return (
        <button type="button" onClick={onClick} disabled={loading || disabled} className={`flex h-10 items-center gap-2 rounded border px-3 text-xs font-bold transition disabled:opacity-40 ${primary ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
            {loading ? <LoaderCircle size={14} className="animate-spin" /> : <Icon size={14} />}{label}
        </button>
    );
}
