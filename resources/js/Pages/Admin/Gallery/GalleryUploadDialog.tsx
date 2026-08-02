import axios, { type AxiosError } from "axios";
import {
    AlertCircle,
    Check,
    CircleStop,
    FileImage,
    FileVideo,
    LoaderCircle,
    Upload,
    X,
} from "lucide-react";
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import type {
    GalleryCapabilities,
    GalleryLocation,
    GallerySectionAdmin,
    GalleryUploadConfig,
} from "./types";

type EntryStatus = "queued" | "uploading" | "uploaded" | "error";

interface UploadEntry {
    id: string;
    file: File;
    title: string;
    arenaType: string;
    progress: number;
    status: EntryStatus;
    error: string | null;
    sessionUuid: string | null;
}

interface Props {
    open: boolean;
    onClose: () => void;
    onComplete: () => void;
    sections: GallerySectionAdmin[];
    locations: GalleryLocation[];
    capabilities: GalleryCapabilities;
    config: GalleryUploadConfig;
}

function titleFromFile(name: string) {
    return name
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableBytes(bytes: number) {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.ceil(bytes / 1024)} KB`;
}

function responseError(error: unknown) {
    const response = (error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>).response;
    const first = response?.data?.errors
        ? Object.values(response.data.errors).flat()[0]
        : null;

    return first ?? response?.data?.message ?? "Upload gagal. Periksa koneksi lalu coba lagi.";
}

export default function GalleryUploadDialog({
    open,
    onClose,
    onComplete,
    sections,
    locations,
    capabilities,
    config,
}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const uploadControllers = useRef(new Map<string, AbortController>());
    const [entries, setEntries] = useState<UploadEntry[]>([]);
    const [locationId, setLocationId] = useState("");
    const [selectedSections, setSelectedSections] = useState<string[]>([]);
    const [commonArenaType, setCommonArenaType] = useState("");
    const [credit, setCredit] = useState("UB Sport Center");
    const [capturedAt, setCapturedAt] = useState("");
    const [rightsConfirmed, setRightsConfirmed] = useState(false);
    const [allowDuplicate, setAllowDuplicate] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [recoveryNotice, setRecoveryNotice] = useState(false);
    const recoveryLoaded = useRef(false);
    const uploadDraftKey = "ubsc.gallery.upload-draft";

    useEffect(() => {
        if (!open) return;
        if (!recoveryLoaded.current) {
            recoveryLoaded.current = true;
            try {
                const draft = JSON.parse(localStorage.getItem(uploadDraftKey) ?? "null") as null | {
                    locationId?: string;
                    selectedSections?: string[];
                    commonArenaType?: string;
                    credit?: string;
                    capturedAt?: string;
                    allowDuplicate?: boolean;
                    entries?: Array<unknown>;
                };
                if (draft) {
                    if (draft.locationId && locations.some((item) => String(item.id) === draft.locationId && item.is_active)) setLocationId(draft.locationId);
                    if (draft.selectedSections) setSelectedSections(draft.selectedSections.filter((key) => sections.some((item) => item.key === key)));
                    setCommonArenaType(draft.commonArenaType ?? "");
                    setCredit(draft.credit ?? "UB Sport Center");
                    setCapturedAt(draft.capturedAt ?? "");
                    setAllowDuplicate(Boolean(draft.allowDuplicate));
                    setRecoveryNotice(Boolean(draft.entries?.length));
                }
            } catch {
                localStorage.removeItem(uploadDraftKey);
            }
        }
        setLocationId((current) => current || String(locations.find((item) => item.is_active)?.id ?? ""));
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !submitting) onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [locations, onClose, open, sections, submitting]);

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => {
            const draftEntries = entries
                .filter((entry) => entry.status !== "uploaded")
                .map((entry) => ({
                    name: entry.file.name,
                    size: entry.file.size,
                    lastModified: entry.file.lastModified,
                    title: entry.title,
                    arenaType: entry.arenaType,
                }));
            const hasDraft = draftEntries.length > 0 || commonArenaType || capturedAt || selectedSections.length > 0;
            if (!hasDraft) {
                localStorage.removeItem(uploadDraftKey);
                return;
            }
            localStorage.setItem(uploadDraftKey, JSON.stringify({
                locationId,
                selectedSections,
                commonArenaType,
                credit,
                capturedAt,
                allowDuplicate,
                entries: draftEntries,
            }));
        }, 500);
        return () => window.clearTimeout(timer);
    }, [allowDuplicate, capturedAt, commonArenaType, credit, entries, locationId, open, selectedSections]);

    const pending = useMemo(
        () => entries.filter((entry) => entry.status === "queued" || entry.status === "error"),
        [entries],
    );
    const completed = entries.filter((entry) => entry.status === "uploaded").length;

    const validateFile = (file: File) => {
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        const video = file.type.startsWith("video/") || ["mp4", "mov"].includes(extension);

        if (video && (!capabilities.video.ffmpeg || !capabilities.video.ffprobe)) {
            return "Video belum dapat diproses karena FFmpeg server belum aktif.";
        }
        if (["heic", "heif"].includes(extension) && !capabilities.image.heic) {
            return "HEIC belum didukung server ini. Konversi ke JPG, PNG, atau WebP.";
        }
        if (file.size > (video ? config.video_max_bytes : config.image_max_bytes)) {
            return `Ukuran ${video ? "video" : "gambar"} melebihi ${readableBytes(
                video ? config.video_max_bytes : config.image_max_bytes,
            )}.`;
        }

        return null;
    };

    const addFiles = (files: File[]) => {
        setFormError(null);
        const available = Math.max(0, config.max_batch_files - entries.length);
        const candidates = files.slice(0, available);
        const rejected: string[] = [];
        let recoveredEntries: Array<{ name: string; size: number; lastModified: number; title: string; arenaType: string }> = [];
        try {
            recoveredEntries = JSON.parse(localStorage.getItem(uploadDraftKey) ?? "{}")?.entries ?? [];
        } catch {
            recoveredEntries = [];
        }
        const next = candidates.flatMap<UploadEntry>((file) => {
            const error = validateFile(file);
            if (error) {
                rejected.push(`${file.name}: ${error}`);
                return [];
            }

            const recovered = recoveredEntries.find((entry) => entry.name === file.name && entry.size === file.size && entry.lastModified === file.lastModified);
            return [{
                id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
                file,
                title: recovered?.title ?? titleFromFile(file.name),
                arenaType: recovered?.arenaType ?? "",
                progress: 0,
                status: "queued",
                error: null,
                sessionUuid: null,
            }];
        });

        setEntries((current) => [...current, ...next]);
        if (files.length > available) {
            rejected.push(`Maksimum ${config.max_batch_files} file dalam satu album.`);
        }
        if (rejected.length) setFormError(rejected.join(" "));
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        addFiles(Array.from(event.dataTransfer.files));
    };

    const updateEntry = (id: string, patch: Partial<UploadEntry>) => {
        setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
    };

    const removeEntry = (id: string) => {
        const entry = entries.find((candidate) => candidate.id === id);
        if (entry?.sessionUuid) {
            axios.delete(route("admin.gallery.upload-sessions.destroy", entry.sessionUuid)).catch(() => undefined);
        }
        setEntries((current) => current.filter((candidate) => candidate.id !== id));
    };

    const cancelUpload = (id: string) => {
        uploadControllers.current.get(id)?.abort();
    };

    const cancelAll = () => {
        uploadControllers.current.forEach((controller) => controller.abort());
    };

    const submit = async () => {
        setFormError(null);
        const targetEntries = entries.filter((entry) => entry.status !== "uploaded");
        const missingArena = targetEntries.find((entry) => !(entry.arenaType || commonArenaType).trim());

        if (!targetEntries.length) return;
        if (!locationId || selectedSections.length === 0 || missingArena || !rightsConfirmed) {
            setFormError(
                missingArena
                    ? `Jenis arena untuk ${missingArena.file.name} belum diisi.`
                    : "Pilih lokasi, minimal satu section, dan konfirmasikan hak publikasi.",
            );
            return;
        }

        setSubmitting(true);
        try {
            const batch = await axios.post(route("admin.gallery.batches.store"), {
                file_count: targetEntries.length,
                common_metadata: {
                    location_id: Number(locationId),
                    sections: selectedSections,
                    arena_type: commonArenaType,
                    captured_at: capturedAt || null,
                    credit,
                },
            });
            let cursor = 0;
            let successCount = 0;

            const worker = async () => {
                while (cursor < targetEntries.length) {
                    const entry = targetEntries[cursor++];
                    updateEntry(entry.id, { status: "uploading", progress: 0, error: null });
                    const controller = new AbortController();
                    uploadControllers.current.set(entry.id, controller);

                    try {
                        const sessionResponse = await axios.post(route("admin.gallery.upload-sessions.store"), {
                            file_name: entry.file.name,
                            file_size: entry.file.size,
                            file_mime: entry.file.type || null,
                            last_modified: entry.file.lastModified,
                            client_fingerprint: `${entry.file.name}|${entry.file.size}|${entry.file.lastModified}`,
                            batch_uuid: batch.data.uuid,
                            title: entry.title,
                            arena_type: entry.arenaType.trim() || commonArenaType.trim(),
                            alt_text: `${entry.title}, ${entry.arenaType.trim() || commonArenaType.trim()} di UB Sport Center`,
                            location_id: Number(locationId),
                            sections: selectedSections,
                            captured_at: capturedAt || null,
                            credit: credit || "UB Sport Center",
                            rights_confirmed: true,
                            allow_duplicate: allowDuplicate,
                        }, { signal: controller.signal });
                        const session = sessionResponse.data as {
                            uuid: string;
                            status: string;
                            chunk_size: number;
                            total_chunks: number;
                            received_chunks: number[];
                        };
                        updateEntry(entry.id, { sessionUuid: session.uuid });

                        if (session.status !== "completed") {
                            const received = new Set(session.received_chunks);
                            let committedBytes = [...received].reduce((sum, index) => {
                                const start = index * session.chunk_size;
                                return sum + Math.min(session.chunk_size, entry.file.size - start);
                            }, 0);

                            for (let index = 0; index < session.total_chunks; index += 1) {
                                if (received.has(index)) continue;
                                const start = index * session.chunk_size;
                                const chunk = entry.file.slice(start, Math.min(entry.file.size, start + session.chunk_size));
                                const chunkPayload = new FormData();
                                chunkPayload.append("chunk", chunk, `${index}.part`);
                                const committedBeforeChunk = committedBytes;

                                await axios.put(
                                    route("admin.gallery.upload-sessions.chunks.store", [session.uuid, index]),
                                    chunkPayload,
                                    {
                                        signal: controller.signal,
                                        onUploadProgress: (progressEvent) => {
                                            const requestTotal = progressEvent.total ?? chunk.size;
                                            const chunkProgress = Math.min(1, progressEvent.loaded / requestTotal);
                                            updateEntry(entry.id, {
                                                progress: Math.min(98, Math.round(((committedBeforeChunk + (chunk.size * chunkProgress)) / entry.file.size) * 100)),
                                            });
                                        },
                                    },
                                );
                                committedBytes += chunk.size;
                                updateEntry(entry.id, {
                                    progress: Math.min(98, Math.round((committedBytes / entry.file.size) * 100)),
                                });
                            }

                            await axios.post(
                                route("admin.gallery.upload-sessions.complete", session.uuid),
                                {},
                                { signal: controller.signal },
                            );
                        }
                        successCount += 1;
                        updateEntry(entry.id, { status: "uploaded", progress: 100 });
                    } catch (error) {
                        updateEntry(entry.id, {
                            status: "error",
                            progress: 0,
                            error: axios.isCancel(error) ? "Upload dibatalkan. File tetap dapat dicoba ulang." : responseError(error),
                        });
                    } finally {
                        uploadControllers.current.delete(entry.id);
                    }
                }
            };

            await Promise.all([worker(), worker()]);
            await axios.patch(route("admin.gallery.batches.finalize", batch.data.uuid));
            if (successCount > 0) onComplete();
            if (successCount === targetEntries.length) {
                localStorage.removeItem(uploadDraftKey);
                setRecoveryNotice(false);
            }
            if (successCount !== targetEntries.length) {
                setFormError("Sebagian file belum berhasil. Detail kesalahan tersedia pada daftar file.");
            }
        } catch (error) {
            setFormError(responseError(error));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/45 backdrop-blur-[2px]" role="presentation">
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="gallery-upload-title"
                className="gallery-admin-panel flex h-full w-full max-w-[780px] flex-col bg-[#f7f8fa] shadow-2xl"
            >
                <header className="flex shrink-0 items-start justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
                    <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#e35336]">Media intake</p>
                        <h2 id="gallery-upload-title" className="font-clash text-2xl font-semibold text-slate-950">
                            Tambah Media Gallery
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">Maksimum {config.max_batch_files} file per album. Pemrosesan berjalan di queue.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="grid size-9 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-40"
                        aria-label="Tutup panel upload"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
                    {recoveryNotice && (
                        <div className="mb-4 flex items-center justify-between gap-3 border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
                            <span>Metadata album sebelumnya dipulihkan. File yang sama akan melanjutkan chunk yang sudah tersimpan.</span>
                            <button type="button" onClick={() => { localStorage.removeItem(uploadDraftKey); setRecoveryNotice(false); }} className="font-bold underline underline-offset-2">Abaikan</button>
                        </div>
                    )}
                    <div
                        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                        onDragOver={(event) => event.preventDefault()}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        className={`grid min-h-36 place-items-center border border-dashed px-5 text-center transition ${
                            dragging ? "border-[#e35336] bg-[#fff4f0]" : "border-slate-300 bg-white hover:border-slate-500"
                        }`}
                    >
                        <div className="py-5">
                            <span className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-slate-950 text-white">
                                <Upload size={17} aria-hidden="true" />
                            </span>
                            <p className="text-sm font-semibold text-slate-900">Letakkan gambar atau video di sini</p>
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                className="mt-1 text-xs font-semibold text-[#d9472a] underline decoration-[#d9472a]/30 underline-offset-4"
                            >
                                atau pilih dari perangkat
                            </button>
                            <input
                                ref={inputRef}
                                type="file"
                                multiple
                                accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,image/*,video/mp4,video/quicktime"
                                className="sr-only"
                                onChange={(event) => {
                                    addFiles(Array.from(event.target.files ?? []));
                                    event.target.value = "";
                                }}
                            />
                        </div>
                    </div>

                    {entries.length > 0 && (
                        <div className="mt-5 border-y border-slate-200 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
                                <span className="text-xs font-bold text-slate-800">{entries.length} file</span>
                                <span className="text-[11px] text-slate-500">{completed} selesai</span>
                            </div>
                            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                                {entries.map((entry) => {
                                    const video = entry.file.type.startsWith("video/") || /\.(mp4|mov)$/i.test(entry.file.name);
                                    return (
                                        <div key={entry.id} className="grid grid-cols-[32px_minmax(0,1fr)_32px] gap-3 px-3 py-3">
                                            <span className="grid size-8 place-items-center rounded bg-slate-100 text-slate-500">
                                                {video ? <FileVideo size={16} /> : <FileImage size={16} />}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate text-xs font-semibold text-slate-800">{entry.file.name}</p>
                                                    <span className="shrink-0 text-[10px] text-slate-400">{readableBytes(entry.file.size)}</span>
                                                </div>
                                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                                    <input
                                                        value={entry.title}
                                                        onChange={(event) => updateEntry(entry.id, { title: event.target.value })}
                                                        disabled={entry.status === "uploaded" || submitting}
                                                        aria-label={`Judul ${entry.file.name}`}
                                                        className="h-8 min-w-0 rounded border-slate-200 px-2 text-xs focus:border-[#e35336] focus:ring-[#e35336]"
                                                        placeholder="Judul"
                                                    />
                                                    <input
                                                        value={entry.arenaType}
                                                        onChange={(event) => updateEntry(entry.id, { arenaType: event.target.value })}
                                                        disabled={entry.status === "uploaded" || submitting}
                                                        aria-label={`Jenis arena ${entry.file.name}`}
                                                        className="h-8 min-w-0 rounded border-slate-200 px-2 text-xs focus:border-[#e35336] focus:ring-[#e35336]"
                                                        placeholder={commonArenaType || "Jenis arena (opsional per file)"}
                                                    />
                                                </div>
                                                {entry.status === "uploading" && (
                                                    <div className="mt-2 h-1 overflow-hidden rounded bg-slate-100">
                                                        <span className="block h-full bg-[#e35336] transition-[width]" style={{ width: `${entry.progress}%` }} />
                                                    </div>
                                                )}
                                                {entry.error && <p className="mt-1.5 text-[11px] leading-4 text-red-600">{entry.error}</p>}
                                            </div>
                                            <div className="flex justify-end">
                                                {entry.status === "uploaded" ? (
                                                    <Check size={17} className="mt-1 text-emerald-600" aria-label="Selesai" />
                                                ) : entry.status === "uploading" ? (
                                                    <button type="button" onClick={() => cancelUpload(entry.id)} className="grid size-7 place-items-center text-slate-400 hover:text-red-600" aria-label={`Batalkan ${entry.file.name}`} title="Batalkan upload"><CircleStop size={16} /></button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeEntry(entry.id)}
                                                        disabled={submitting}
                                                        className="grid size-7 place-items-center text-slate-400 hover:text-red-600"
                                                        aria-label={`Hapus ${entry.file.name}`}
                                                    >
                                                        <X size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-700">
                            Lokasi
                            <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1.5 h-10 w-full rounded border-slate-200 bg-white text-sm focus:border-[#e35336] focus:ring-[#e35336]">
                                <option value="">Pilih lokasi</option>
                                {locations.filter((location) => location.is_active).map((location) => (
                                    <option key={location.id} value={location.id}>{location.name}</option>
                                ))}
                            </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-700">
                            Jenis arena umum
                            <input value={commonArenaType} onChange={(event) => setCommonArenaType(event.target.value)} className="mt-1.5 h-10 w-full rounded border-slate-200 bg-white text-sm focus:border-[#e35336] focus:ring-[#e35336]" placeholder="Contoh: Indoor Court" />
                        </label>
                        <label className="text-xs font-semibold text-slate-700">
                            Tanggal pengambilan
                            <input type="date" max={new Date().toISOString().slice(0, 10)} value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} className="mt-1.5 h-10 w-full rounded border-slate-200 bg-white text-sm focus:border-[#e35336] focus:ring-[#e35336]" />
                        </label>
                        <label className="text-xs font-semibold text-slate-700">
                            Kredit
                            <input value={credit} onChange={(event) => setCredit(event.target.value)} className="mt-1.5 h-10 w-full rounded border-slate-200 bg-white text-sm focus:border-[#e35336] focus:ring-[#e35336]" />
                        </label>
                    </div>

                    <fieldset className="mt-5 border-t border-slate-200 pt-4">
                        <legend className="text-xs font-semibold text-slate-700">Tampilkan di section</legend>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {sections.map((section) => {
                                const active = selectedSections.includes(section.key);
                                return (
                                    <label key={section.key} className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-xs font-semibold transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                                        <input
                                            type="checkbox"
                                            checked={active}
                                            onChange={() => setSelectedSections((current) => active ? current.filter((key) => key !== section.key) : [...current, section.key])}
                                            className="sr-only"
                                        />
                                        {active && <Check size={13} />}
                                        {section.name}
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>

                    <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
                        <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-600">
                            <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-0.5 rounded border-slate-300 text-[#e35336] focus:ring-[#e35336]" />
                            <span>Saya mengonfirmasi UB Sport Center memiliki hak untuk menyimpan, memproses, dan mempublikasikan seluruh media ini.</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-3 text-xs text-slate-600">
                            <input type="checkbox" checked={allowDuplicate} onChange={(event) => setAllowDuplicate(event.target.checked)} className="rounded border-slate-300 text-[#e35336] focus:ring-[#e35336]" />
                            Izinkan file identik bila memang disengaja
                        </label>
                    </div>

                    {formError && (
                        <div className="mt-5 flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            <span>{formError}</span>
                        </div>
                    )}
                </div>

                <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
                    <span className="text-[11px] text-slate-500">Queue: {capabilities.queue} / {config.timezone}</span>
                    <div className="flex gap-2">
                        {submitting && <button type="button" onClick={cancelAll} className="h-10 rounded border border-red-200 px-4 text-xs font-bold text-red-600 hover:bg-red-50">Batalkan upload</button>}
                        <button type="button" onClick={onClose} disabled={submitting} className="h-10 rounded border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:border-slate-400 disabled:opacity-40">
                            Tutup
                        </button>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={submitting || pending.length === 0}
                            className="flex h-10 items-center gap-2 rounded bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-[#e35336] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {submitting ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}
                            {submitting ? "Mengunggah" : pending.some((entry) => entry.status === "error") ? "Ulangi yang gagal" : `Upload ${pending.length} file`}
                        </button>
                    </div>
                </footer>
            </section>
        </div>,
        document.body,
    );
}
