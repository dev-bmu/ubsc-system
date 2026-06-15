import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps<TData> {
    table: Table<TData>;
}

export default function Pagination<TData>({ table }: PaginationProps<TData>) {
    const { pageIndex, pageSize } = table.getState().pagination;
    const pageCount = table.getPageCount();
    const totalRows = table.getFilteredRowModel().rows.length;
    const from = pageIndex * pageSize + 1;
    const to = Math.min((pageIndex + 1) * pageSize, totalRows);

    const btnBase =
        "flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-medium transition-colors";

    return (
        <div className="flex flex-col items-center justify-between gap-3 px-1 pt-4 md:flex-row">
            <p className="text-xs text-gray-500">
                Showing{" "}
                <span className="font-medium text-gray-900">
                    {totalRows === 0 ? 0 : from}–{to}
                </span>{" "}
                of{" "}
                <span className="font-medium text-gray-900">{totalRows}</span>{" "}
                results
            </p>

            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className={cn(
                        btnBase,
                        "bg-white shadow-[0_2px_8px_rgb(0,0,0,0.06)]",
                        !table.getCanPreviousPage()
                            ? "cursor-not-allowed opacity-40"
                            : "hover:bg-gray-50",
                    )}
                    aria-label="Previous page"
                >
                    <ChevronLeft size={15} />
                </button>

                {Array.from({ length: pageCount }, (_, i) => i).map((page) => (
                    <button
                        key={page}
                        type="button"
                        onClick={() => table.setPageIndex(page)}
                        className={cn(
                            btnBase,
                            page === pageIndex
                                ? "bg-gray-900 text-white shadow-[0_2px_8px_rgb(0,0,0,0.15)]"
                                : "bg-white text-gray-700 shadow-[0_2px_8px_rgb(0,0,0,0.06)] hover:bg-gray-50",
                        )}
                    >
                        {page + 1}
                    </button>
                ))}

                <button
                    type="button"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className={cn(
                        btnBase,
                        "bg-white shadow-[0_2px_8px_rgb(0,0,0,0.06)]",
                        !table.getCanNextPage()
                            ? "cursor-not-allowed opacity-40"
                            : "hover:bg-gray-50",
                    )}
                    aria-label="Next page"
                >
                    <ChevronRight size={15} />
                </button>
            </div>

            <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500" htmlFor="page-size">
                    Per page
                </label>
                <select
                    id="page-size"
                    value={pageSize}
                    onChange={(e) =>
                        table.setPageSize(Number(e.target.value))
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
