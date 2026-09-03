import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CursorPaginationState {
    perPage: number;
    count: number;
    hasNext: boolean;
    hasPrevious: boolean;
    nextCursor: string | null;
    previousCursor: string | null;
    total?: number;
    onNavigate: (cursor: string | null) => void;
    onPerPageChange: (perPage: number) => void;
}

interface CursorPaginationProps {
    pagination: CursorPaginationState;
}

export default function CursorPagination({ pagination }: CursorPaginationProps) {
    const buttonClass =
        "flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-sm font-medium shadow-[0_2px_8px_rgb(0,0,0,0.06)] transition-colors";

    return (
        <div className="flex flex-col items-center justify-between gap-3 px-1 pt-4 md:flex-row">
            <p className="text-xs text-gray-500" aria-live="polite">
                Menampilkan{" "}
                <span className="font-medium text-gray-900">
                    {pagination.count}
                </span>{" "}
                data
                {typeof pagination.total === "number" && (
                    <>
                        {" "}dari{" "}
                        <span className="font-medium text-gray-900">
                            {pagination.total}
                        </span>
                    </>
                )}
            </p>

            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => pagination.onNavigate(pagination.previousCursor)}
                    disabled={!pagination.hasPrevious || !pagination.previousCursor}
                    className={cn(
                        buttonClass,
                        !pagination.hasPrevious || !pagination.previousCursor
                            ? "cursor-not-allowed opacity-40"
                            : "hover:bg-gray-50",
                    )}
                    aria-label="Halaman sebelumnya"
                >
                    <ChevronLeft size={15} />
                </button>

                <span className="min-w-24 text-center font-bdo text-[11px] font-semibold text-gray-500">
                    Navigasi aman
                </span>

                <button
                    type="button"
                    onClick={() => pagination.onNavigate(pagination.nextCursor)}
                    disabled={!pagination.hasNext || !pagination.nextCursor}
                    className={cn(
                        buttonClass,
                        !pagination.hasNext || !pagination.nextCursor
                            ? "cursor-not-allowed opacity-40"
                            : "hover:bg-gray-50",
                    )}
                    aria-label="Halaman berikutnya"
                >
                    <ChevronRight size={15} />
                </button>
            </div>

            <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500" htmlFor="cursor-page-size">
                    Per halaman
                </label>
                <select
                    id="cursor-page-size"
                    value={pagination.perPage}
                    onChange={(event) =>
                        pagination.onPerPageChange(Number(event.target.value))
                    }
                    className="h-8 rounded-xl border-0 bg-white py-0 pl-2 pr-7 text-xs shadow-[0_2px_8px_rgb(0,0,0,0.06)] focus:ring-1 focus:ring-gray-900"
                >
                    {[10, 20, 50].map((size) => (
                        <option key={size} value={size}>
                            {size}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
