import { ImageIcon, Trash2, UploadCloud, Video } from "lucide-react";
import { useCallback, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPT = { "image/jpeg": [], "image/png": [], "image/webp": [] };

// ─── Single-file mode ─────────────────────────────────────────────────────────

interface SingleDropzoneProps {
    label?: string;
    currentUrl?: string | null;
    onFileSelect: (file: File | null) => void;
    onRemoveExisting?: () => void;
}

export function SingleDropzone({
    label = "Gambar Utama",
    currentUrl,
    onFileSelect,
    onRemoveExisting,
}: SingleDropzoneProps) {
    const [preview, setPreview] = useState<string | null>(null);
    const [currentRemoved, setCurrentRemoved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onDrop = useCallback(
        (accepted: File[], rejected: FileRejection[]) => {
            setError(null);
            if (rejected.length > 0) {
                setError(rejected[0].errors[0]?.message ?? "File tidak valid.");
                return;
            }
            if (accepted[0]) {
                setPreview(URL.createObjectURL(accepted[0]));
                setCurrentRemoved(false);
                onFileSelect(accepted[0]);
            }
        },
        [onFileSelect],
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: ACCEPT,
        maxSize: MAX_SIZE,
        maxFiles: 1,
    });

    const displayUrl = preview ?? (currentRemoved ? null : currentUrl) ?? null;

    return (
        <div className="flex flex-col gap-2">
            <span className="font-clash text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label}
            </span>

            {displayUrl ? (
                <div className="group relative overflow-hidden rounded-[22px] ring-1 ring-[#F8B5A8]/60">
                    <img
                        src={displayUrl}
                        alt="Preview"
                        className="h-48 w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            if (preview) {
                                URL.revokeObjectURL(preview);
                                setPreview(null);
                                onFileSelect(null);
                                return;
                            }

                            setCurrentRemoved(true);
                            onRemoveExisting?.();
                        }}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/92 text-rose-500 opacity-0 shadow-[0_14px_24px_-18px_rgba(15,23,42,.45)] transition-opacity group-hover:opacity-100"
                        aria-label="Hapus gambar"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            ) : (
                <div
                    {...getRootProps()}
                    className={cn(
                        "flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed transition-all",
                        isDragActive
                            ? "border-[#E35336] bg-[#FFF7F5]"
                            : "border-[#F8B5A8]/80 bg-white hover:border-[#E35336]/70 hover:bg-[#FFF7F5]/70",
                    )}
                >
                    <input {...getInputProps()} />
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_16px_28px_-22px_rgba(227,83,54,.95)]">
                        <UploadCloud size={20} />
                    </div>
                    <p className="text-center text-xs font-medium text-slate-500">
                        {isDragActive
                            ? "Lepaskan file di sini"
                            : "Drag & drop atau klik untuk upload"}
                        <br />
                        <span className="text-slate-400">
                            JPG, PNG, WebP - max 5 MB
                        </span>
                    </p>
                </div>
            )}

            {error && (
                <p className="text-xs text-rose-500">{error}</p>
            )}
        </div>
    );
}

// ─── Video single-file dropzone ───────────────────────────────────────────────

const VIDEO_MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const VIDEO_ACCEPT = { "video/mp4": [], "video/webm": [] };

interface VideoDropzoneProps {
    label?: string;
    currentUrl?: string | null;
    onFileSelect: (file: File | null) => void;
}

export function VideoDropzone({
    label = "Video",
    currentUrl,
    onFileSelect,
}: VideoDropzoneProps) {
    const [fileName, setFileName] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const onDrop = useCallback(
        (accepted: File[], rejected: FileRejection[]) => {
            setError(null);
            if (rejected.length > 0) {
                const msg = rejected[0].errors[0]?.message ?? "File ditolak.";
                setError(msg.replace("50000000 bytes", "50 MB"));
                return;
            }
            if (accepted[0]) {
                setFileName(accepted[0].name);
                onFileSelect(accepted[0]);
            }
        },
        [onFileSelect],
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: VIDEO_ACCEPT,
        maxSize: VIDEO_MAX_SIZE,
        maxFiles: 1,
    });

    const hasFile = fileName !== null || currentUrl;

    return (
        <div className="flex flex-col gap-2">
            <span className="font-clash text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label}
            </span>

            {hasFile ? (
                <div className="group relative flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <Video size={18} className="shrink-0 text-slate-400" />
                    <span className="flex-1 truncate font-bdo text-xs text-slate-600">
                        {fileName ?? currentUrl}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            setFileName(null);
                            onFileSelect(null);
                        }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-rose-400 shadow-sm transition hover:text-rose-600"
                        aria-label="Hapus video"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            ) : (
                <div
                    {...getRootProps()}
                    className={cn(
                        "flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed transition-all",
                        isDragActive
                            ? "border-[#E35336] bg-[#FFF7F5]"
                            : "border-[#F8B5A8]/80 hover:border-[#E35336]/70 hover:bg-[#FFF7F5]/70",
                    )}
                >
                    <input {...getInputProps()} />
                    <Video size={22} className="text-gray-400" />
                    <p className="text-center text-xs text-gray-500">
                        {isDragActive ? "Lepaskan di sini" : "Drag & drop atau klik untuk upload"}
                        <br />
                        <span className="text-gray-400">MP4, WebM - maks 50 MB</span>
                    </p>
                </div>
            )}

            {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>
    );
}

// ─── Multi-file mode ──────────────────────────────────────────────────────────

export interface ExistingMedia {
    id: number;
    url: string;
    name: string;
}

interface MultiDropzoneProps {
    label?: string;
    existing?: ExistingMedia[];
    onFilesChange: (files: File[]) => void;
    onRemoveExisting: (id: number) => void;
}

export function MultiDropzone({
    label = "Galeri",
    existing = [],
    onFilesChange,
    onRemoveExisting,
}: MultiDropzoneProps) {
    const [previews, setPreviews] = useState<
        { file: File; url: string }[]
    >([]);
    const [error, setError] = useState<string | null>(null);

    const onDrop = useCallback(
        (accepted: File[], rejected: FileRejection[]) => {
            setError(null);
            if (rejected.length > 0) {
                setError(
                    rejected[0].errors[0]?.message ?? "Beberapa file ditolak.",
                );
            }
            if (accepted.length > 0) {
                const newPreviews = accepted.map((file) => ({
                    file,
                    url: URL.createObjectURL(file),
                }));
                setPreviews((prev) => {
                    const next = [...prev, ...newPreviews];
                    onFilesChange(next.map((item) => item.file));
                    return next;
                });
            }
        },
        [onFilesChange],
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: ACCEPT,
        maxSize: MAX_SIZE,
    });

    const removePreview = (index: number) => {
        setPreviews((prev) => {
            const removed = prev[index];
            if (removed) {
                URL.revokeObjectURL(removed.url);
            }

            const next = prev.filter((_, i) => i !== index);
            onFilesChange(next.map((item) => item.file));
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-2">
            <span className="font-clash text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label}
            </span>

            {(existing.length > 0 || previews.length > 0) && (
                <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
                    {existing.map((img) => (
                        <div
                            key={img.id}
                            className="group relative overflow-hidden rounded-2xl ring-1 ring-[#F8B5A8]/50"
                        >
                            <img
                                src={img.url}
                                alt={img.name}
                                className="h-24 w-full object-cover"
                            />
                            <button
                                type="button"
                                onClick={() => onRemoveExisting(img.id)}
                                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-xl bg-white/90 text-rose-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                                aria-label="Hapus gambar"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                    {previews.map((p, i) => (
                        <div
                            key={p.url}
                            className="group relative overflow-hidden rounded-2xl ring-2 ring-[#F8B5A8]/70"
                        >
                            <img
                                src={p.url}
                                alt="Gambar baru"
                                className="h-24 w-full object-cover"
                            />
                            <button
                                type="button"
                                onClick={() => removePreview(i)}
                                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-xl bg-white/90 text-rose-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                                aria-label="Hapus gambar"
                            >
                                <Trash2 size={12} />
                            </button>
                            <span className="absolute bottom-1 left-1 rounded-lg bg-[#E35336] px-1.5 py-0.5 text-[9px] font-medium text-white">
                                Baru
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div
                {...getRootProps()}
                className={cn(
                    "flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[24px] border-2 border-dashed transition-all",
                    isDragActive
                        ? "border-[#E35336] bg-[#FFF7F5]"
                        : "border-[#F8B5A8]/80 hover:border-[#E35336]/70 hover:bg-[#FFF7F5]/70",
                )}
            >
                <input {...getInputProps()} />
                <div className="flex items-center gap-1.5 text-[#B93D2A]">
                    <ImageIcon size={16} />
                    <span className="text-xs font-semibold">
                        {isDragActive ? "Lepaskan di sini" : "Tambah gambar"}
                    </span>
                </div>
            </div>

            {error && (
                <p className="text-xs text-rose-500">{error}</p>
            )}
        </div>
    );
}
