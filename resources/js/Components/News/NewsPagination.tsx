import { ChevronLeft, ChevronRight } from "lucide-react";
import { startTransition, useCallback, useMemo } from "react";
import type { HTMLAttributes } from "react";

type NewsPaginationProps = HTMLAttributes<HTMLElement> & {
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
    className?: string;
    label: string;
};

type PaginationSlot =
    | { type: "page"; value: number }
    | { type: "gap"; value: string };

function getPaginationSlots(
    currentPage: number,
    pageCount: number,
): PaginationSlot[] {
    if (pageCount <= 7) {
        return Array.from(
            { length: pageCount },
            (_, index): PaginationSlot => ({
                type: "page",
                value: index,
            }),
        );
    }

    const pages =
        currentPage <= 2
            ? [0, 1, 2, 3, pageCount - 1]
            : currentPage >= pageCount - 3
              ? [0, pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1]
              : [0, currentPage - 1, currentPage, currentPage + 1, pageCount - 1];

    const visiblePages = Array.from(new Set(pages))
        .filter((item) => item >= 0 && item < pageCount)
        .sort((a, b) => a - b);

    return visiblePages.reduce<PaginationSlot[]>((slots, item, index) => {
        const previous = visiblePages[index - 1];

        if (previous !== undefined && item - previous > 1) {
            slots.push({ type: "gap", value: `${previous}-${item}` });
        }

        slots.push({ type: "page", value: item });
        return slots;
    }, []);
}

export default function NewsPagination({
    page,
    pageCount,
    onPageChange,
    className = "",
    label,
    ...props
}: NewsPaginationProps) {
    const safePageCount = Math.max(pageCount, 1);
    const currentPage = Math.min(Math.max(page, 0), safePageCount - 1);
    const slots = useMemo(
        () => getPaginationSlots(currentPage, safePageCount),
        [currentPage, safePageCount],
    );
    const isCondensed = safePageCount > 7;
    const canGoPrevious = currentPage > 0;
    const canGoNext = currentPage < safePageCount - 1;
    const changePage = useCallback(
        (nextPage: number) => {
            const clampedPage = Math.min(
                Math.max(nextPage, 0),
                safePageCount - 1,
            );

            if (clampedPage === currentPage) return;

            startTransition(() => {
                onPageChange(clampedPage);
            });
        },
        [currentPage, onPageChange, safePageCount],
    );

    return (
        <nav
            {...props}
            data-density={isCondensed ? "condensed" : "default"}
            className={`news-pagination ${className}`}
            aria-label={label}
        >
            <button
                type="button"
                className="news-pagination__nav news-pagination__nav--previous"
                aria-label="Halaman sebelumnya"
                disabled={!canGoPrevious}
                onClick={() => changePage(currentPage - 1)}
            >
                <ChevronLeft aria-hidden size={14} />
                <span>Previous</span>
            </button>

            <span className="news-pagination__divider" aria-hidden />

            <div className="news-pagination__pages">
                {slots.map((slot, index) => {
                    const key = `${slot.type}-${slot.value}`;

                    return (
                        <span key={key} className="news-pagination__page-wrap">
                            {slot.type === "page" ? (
                                <button
                                    type="button"
                                    className="news-pagination__page"
                                    data-active={slot.value === currentPage}
                                    aria-current={
                                        slot.value === currentPage
                                            ? "page"
                                            : undefined
                                    }
                                    aria-label={`Halaman ${slot.value + 1}`}
                                    onClick={() => changePage(slot.value)}
                                >
                                    <span>{slot.value + 1}</span>
                                </button>
                            ) : (
                                <span
                                    className="news-pagination__ellipsis"
                                    aria-hidden
                                >
                                    ...
                                </span>
                            )}

                            {index < slots.length - 1 && (
                                <span
                                    className="news-pagination__divider"
                                    aria-hidden
                                />
                            )}
                        </span>
                    );
                })}
            </div>

            <span className="news-pagination__divider" aria-hidden />

            <button
                type="button"
                className="news-pagination__nav news-pagination__nav--next"
                aria-label="Halaman berikutnya"
                disabled={!canGoNext}
                onClick={() => changePage(currentPage + 1)}
            >
                <span>Next</span>
                <ChevronRight aria-hidden size={14} />
            </button>
        </nav>
    );
}
