import { ImageIcon, Trash2, UploadCloud, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPT = {
    "image/jpeg": [],
    "image/png": [],
    "image/webp": [],
    "image/avif": [],
};

// ─── Single-file mode ─────────────────────────────────────────────────────────

interface SingleDropzoneProps {
    label?: string;
    currentUrl?: string | null;
    onFileSelect: (file: File | null) => void;
    onRemoveExisting?: () => void;
    allowRemove?: boolean;
}

export function SingleDropzone({
    label = "Gambar Utama",
    currentUrl,
    onFileSelect,
    onRemoveExisting,
    allowRemove = true,
}: SingleDropzoneProps) {
    const [preview, setPreview] = useState<string | null>(null);
    const previewRef = useRef<string | null>(null);
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
                if (previewRef.current) {
                    URL.revokeObjectURL(previewRef.current);
                }

                const previewUrl = URL.createObjectURL(accepted[0]);
                previewRef.current = previewUrl;
                setPreview(previewUrl);
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

    useEffect(
        () => () => {
            if (previewRef.current) {
                URL.revokeObjectURL(previewRef.current);
                previewRef.current = null;
            }
        },
        [],
    );

    const displayUrl = preview ?? (currentRemoved ? null : currentUrl) ?? null;

    return (
        <div className="flex flex-col gap-2">
            <span className="font-clash text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label}
            </span>

            {displayUrl ? (
                <div
                    {...getRootProps()}
                    className="group relative cursor-pointer overflow-hidden rounded-[22px] ring-1 ring-[#F8B5A8]/60 outline-none focus-within:ring-2 focus-within:ring-[#E35336]/35"
                >
                    <input {...getInputProps()} />
                    <img
                        src={displayUrl}
                        alt="Preview"
                        className="h-48 w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/65 to-transparent px-3 pb-3 pt-10 font-bdo text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        Klik untuk mengganti gambar
                    </span>
                    {(preview || allowRemove) && (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                if (preview) {
                                    URL.revokeObjectURL(preview);
                                    previewRef.current = null;
                                    setPreview(null);
                                    onFileSelect(null);
                                    return;
                                }

                                setCurrentRemoved(true);
                                onRemoveExisting?.();
                            }}
                            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/92 text-rose-500 opacity-100 shadow-[0_14px_24px_-18px_rgba(15,23,42,.45)] transition-opacity focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                            aria-label={preview ? "Batalkan gambar baru" : "Hapus gambar"}
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
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
                            JPG, PNG, WebP, AVIF - max 5 MB
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
    maxFiles?: number;
    onFilesChange: (files: File[]) => void;
    onRemoveExisting: (id: number) => void;
}

export function MultiDropzone({
    label = "Galeri",
    existing = [],
    maxFiles = 24,
    onFilesChange,
    onRemoveExisting,
}: MultiDropzoneProps) {
    const [previews, setPreviews] = useState<
        { file: File; url: string }[]
    >([]);
    const previewsRef = useRef(previews);
    const [error, setError] = useState<string | null>(null);
    const remainingCapacity = Math.max(
        0,
        maxFiles - existing.length - previews.length,
    );

    useEffect(() => {
        previewsRef.current = previews;
    }, [previews]);

    useEffect(
        () => () => {
            previewsRef.current.forEach((preview) =>
                URL.revokeObjectURL(preview.url),
            );
        },
        [],
    );

    const onDrop = useCallback(
        (accepted: File[], rejected: FileRejection[]) => {
            setError(null);
            if (rejected.length > 0) {
                setError(
                    rejected[0].errors[0]?.message ?? "Beberapa file ditolak.",
                );
            }
            if (accepted.length > 0) {
                const acceptedWithinLimit = accepted.slice(
                    0,
                    remainingCapacity,
                );

                if (accepted.length > acceptedWithinLimit.length) {
                    setError(`Maksimal ${maxFiles} gambar dalam satu galeri.`);
                }

                const knownFiles = new Set(
                    previews.map(
                        ({ file }) =>
                            `${file.name}:${file.size}:${file.lastModified}`,
                    ),
                );
                const uniqueFiles = acceptedWithinLimit.filter((file) => {
                    const key = `${file.name}:${file.size}:${file.lastModified}`;

                    if (knownFiles.has(key)) {
                        return false;
                    }

                    knownFiles.add(key);
                    return true;
                });

                if (uniqueFiles.length < acceptedWithinLimit.length) {
                    setError("Gambar yang sama tidak ditambahkan dua kali.");
                }

                const newPreviews = uniqueFiles.map((file) => ({
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
        [maxFiles, onFilesChange, previews, remainingCapacity],
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: ACCEPT,
        maxSize: MAX_SIZE,
        maxFiles: Math.max(1, remainingCapacity),
        disabled: remainingCapacity === 0,
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
                    {existing.map((img, index) => (
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
                                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-xl bg-white/90 text-rose-500 opacity-100 shadow-sm transition-opacity focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                aria-label="Hapus gambar"
                            >
                                <Trash2 size={12} />
                            </button>
                            <span className="absolute bottom-1 left-1 rounded-lg bg-black/72 px-1.5 py-0.5 font-bdo text-[9px] font-semibold text-white backdrop-blur-sm">
                                {index === 0
                                    ? "Cover"
                                    : String(index + 1).padStart(2, "0")}
                            </span>
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
                                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-xl bg-white/90 text-rose-500 opacity-100 shadow-sm transition-opacity focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                aria-label="Hapus gambar"
                            >
                                <Trash2 size={12} />
                            </button>
                            <span className="absolute bottom-1 left-1 rounded-lg bg-[#E35336] px-1.5 py-0.5 font-bdo text-[9px] font-semibold text-white">
                                {existing.length === 0 && i === 0
                                    ? "Cover · Baru"
                                    : `${String(existing.length + i + 1).padStart(2, "0")} · Baru`}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div
                {...getRootProps()}
                className={cn(
                    "flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[24px] border-2 border-dashed transition-all",
                    remainingCapacity === 0 &&
                        "cursor-not-allowed opacity-55",
                    isDragActive
                        ? "border-[#E35336] bg-[#FFF7F5]"
                        : "border-[#F8B5A8]/80 hover:border-[#E35336]/70 hover:bg-[#FFF7F5]/70",
                )}
            >
                <input {...getInputProps()} />
                <div className="flex items-center gap-1.5 text-[#B93D2A]">
                    <ImageIcon size={16} />
                    <span className="text-xs font-semibold">
                        {remainingCapacity === 0
                            ? "Kapasitas galeri penuh"
                            : isDragActive
                              ? "Lepaskan di sini"
                              : "Tambah gambar"}
                    </span>
                </div>
                <span className="font-bdo text-[10px] text-slate-400">
                    {existing.length + previews.length} / {maxFiles} gambar
                </span>
            </div>

            {error && (
                <p className="text-xs text-rose-500">{error}</p>
            )}
        </div>
    );
}
