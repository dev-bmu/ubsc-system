import {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";
import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { ADMIN_TOKENS } from "./tokens";
import Pagination from "./Pagination";

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    searchColumn?: string;
    searchPlaceholder?: string;
    toolbar?: ReactNode;
    emptyMessage?: string;
}

export default function DataTable<TData, TValue>({
    columns,
    data,
    searchColumn,
    searchPlaceholder = "Search…",
    toolbar,
    emptyMessage = "No records found.",
}: DataTableProps<TData, TValue>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

    const table = useReactTable({
        data,
        columns,
        state: { sorting, columnFilters },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: { pagination: { pageSize: 10 } },
    });

    return (
        <div className={`p-5 ${ADMIN_TOKENS.CARD_LARGE}`}>
            {(searchColumn || toolbar) && (
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    {searchColumn && (
                        <div className="flex h-10 items-center gap-2 rounded-2xl bg-gray-50 px-4 md:w-72">
                            <Search size={14} className="shrink-0 text-gray-400" />
                            <input
                                type="search"
                                placeholder={searchPlaceholder}
                                value={
                                    (table
                                        .getColumn(searchColumn)
                                        ?.getFilterValue() as string) ?? ""
                                }
                                onChange={(e) =>
                                    table
                                        .getColumn(searchColumn)
                                        ?.setFilterValue(e.target.value)
                                }
                                className="w-full border-0 bg-transparent p-0 text-sm text-gray-700 placeholder:text-gray-400 focus:ring-0"
                            />
                        </div>
                    )}
                    {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        {table.getHeaderGroups().map((hg) => (
                            <tr key={hg.id} className="border-b border-gray-100">
                                {hg.headers.map((header) => {
                                    const sorted = header.column.getIsSorted();
                                    const canSort = header.column.getCanSort();
                                    return (
                                        <th
                                            key={header.id}
                                            className={cn(
                                                "pb-3 pt-1 text-left font-clash text-[11px] font-medium uppercase tracking-wider text-gray-400",
                                                canSort && "cursor-pointer select-none hover:text-gray-700",
                                            )}
                                            onClick={header.column.getToggleSortingHandler()}
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                          header.column.columnDef.header,
                                                          header.getContext(),
                                                      )}
                                                {canSort && (
                                                    <span className="text-gray-300">
                                                        {sorted === "asc" ? (
                                                            <ChevronUp size={12} />
                                                        ) : sorted === "desc" ? (
                                                            <ChevronDown size={12} />
                                                        ) : (
                                                            <ChevronsUpDown size={12} />
                                                        )}
                                                    </span>
                                                )}
                                            </span>
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.length > 0 ? (
                            table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className="border-b border-gray-50 transition-colors hover:bg-gray-50/60"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td
                                            key={cell.id}
                                            className="py-3.5 pr-4 text-gray-700"
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="py-16 text-center text-sm text-gray-400"
                                >
                                    {emptyMessage}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination table={table} />
        </div>
    );
}
