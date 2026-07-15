import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NewsItem } from "@/Components/Landing/NewsCard";

export type PublicNewsCategory = "Berita" | "Artikel";

export type NewsFeedMeta = {
    current_page: number;
    per_page: number;
    last_page?: number;
    total?: number;
    has_more_pages: boolean;
};

export type NewsFeedPage<T extends NewsItem = NewsItem> = {
    items: T[];
    meta: NewsFeedMeta;
};

type UsePaginatedNewsFeedOptions<T extends NewsItem> = {
    category: PublicNewsCategory;
    pageSize: number;
    fallbackItems: T[];
    initialPage?: NewsFeedPage<T>;
    prewarmNextPage?: boolean;
};

function makeLocalPage<T extends NewsItem>(
    items: T[],
    pageSize: number,
): NewsFeedPage<T> {
    return {
        items: items.slice(0, pageSize),
        meta: {
            current_page: 1,
            per_page: pageSize,
            last_page: Math.max(1, Math.ceil(items.length / pageSize)),
            total: items.length,
            has_more_pages: items.length > pageSize,
        },
    };
}

function normalizeInitialPage<T extends NewsItem>(
    initialPage: NewsFeedPage<T> | undefined,
    fallbackItems: T[],
    pageSize: number,
): NewsFeedPage<T> {
    if (!initialPage) {
        return makeLocalPage(fallbackItems, pageSize);
    }

    if (initialPage.meta.per_page === pageSize) {
        return initialPage;
    }

    const hasInitialItems = initialPage.items.length > 0;
    const total = hasInitialItems
        ? (initialPage.meta.total ?? initialPage.items.length)
        : fallbackItems.length;
    const items = hasInitialItems
        ? initialPage.items.slice(0, pageSize)
        : fallbackItems.slice(0, pageSize);

    return {
        items,
        meta: {
            current_page: 1,
            per_page: pageSize,
            last_page: Math.max(1, Math.ceil(total / pageSize)),
            total,
            has_more_pages: total > pageSize,
        },
    };
}

function getPageCount(meta: NewsFeedMeta) {
    if (meta.last_page !== undefined) {
        return Math.max(1, meta.last_page);
    }

    return meta.has_more_pages
        ? Math.max(1, meta.current_page + 1)
        : Math.max(1, meta.current_page);
}

export function usePaginatedNewsFeed<T extends NewsItem>({
    category,
    pageSize,
    fallbackItems,
    initialPage,
    prewarmNextPage = true,
}: UsePaginatedNewsFeedOptions<T>) {
    const requestKey = `${category}:${pageSize}`;
    const latestRequestKeyRef = useRef(requestKey);
    const resolvedInitialPage = useMemo(
        () => normalizeInitialPage(initialPage, fallbackItems, pageSize),
        [fallbackItems, initialPage, pageSize],
    );
    const initialPageIndex = Math.max(
        0,
        resolvedInitialPage.meta.current_page - 1,
    );
    const [currentPage, setCurrentPage] = useState(initialPageIndex);
    const [pageCount, setPageCount] = useState(() =>
        getPageCount(resolvedInitialPage.meta),
    );
    const [pageCache, setPageCache] = useState<Record<number, T[]>>(() => ({
        [initialPageIndex]: resolvedInitialPage.items,
    }));
    const [isLoadingPage, setIsLoadingPage] = useState(false);
    const [pageError, setPageError] = useState<string | null>(null);
    const inflightPages = useRef(new Set<number>());
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        latestRequestKeyRef.current = requestKey;
        abortRef.current?.abort();
        inflightPages.current.clear();

        const nextInitialIndex = Math.max(
            0,
            resolvedInitialPage.meta.current_page - 1,
        );

        setCurrentPage(nextInitialIndex);
        setPageCount(getPageCount(resolvedInitialPage.meta));
        setIsLoadingPage(false);
        setPageError(null);
        setPageCache({
            [nextInitialIndex]: resolvedInitialPage.items,
        });
    }, [requestKey, resolvedInitialPage]);

    const fetchPage = useCallback(
        async (pageIndex: number, options?: { silent?: boolean }) => {
            if (pageCache[pageIndex] || inflightPages.current.has(pageIndex)) {
                return;
            }

            inflightPages.current.add(pageIndex);
            const controller = new AbortController();

            if (!options?.silent) {
                abortRef.current?.abort();
                abortRef.current = controller;
                setPageError(null);
                setIsLoadingPage(true);
            }

            try {
                const url = route("news.feed", {
                    category,
                    page: pageIndex + 1,
                    per_page: pageSize,
                });
                const response = await fetch(url, {
                    headers: {
                        Accept: "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                    },
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const payload = (await response.json()) as NewsFeedPage<T>;

                if (latestRequestKeyRef.current !== requestKey) {
                    return;
                }

                setPageCache((cache) => ({
                    ...cache,
                    [Math.max(0, payload.meta.current_page - 1)]: payload.items,
                }));
                setPageCount(getPageCount(payload.meta));
            } catch (error) {
                if ((error as Error).name !== "AbortError") {
                    console.warn(`Failed to load ${category} page`, error);
                    if (!options?.silent) {
                        setPageError(
                            "Konten belum bisa dimuat. Silakan coba lagi.",
                        );
                    }
                }
            } finally {
                inflightPages.current.delete(pageIndex);

                if (!options?.silent) {
                    setIsLoadingPage(false);
                }
            }
        },
        [category, pageCache, pageSize, requestKey],
    );

    const requestPage = useCallback(
        (pageIndex: number) => {
            const clampedPage = Math.min(Math.max(pageIndex, 0), pageCount - 1);

            setCurrentPage(clampedPage);

            if (!pageCache[clampedPage]) {
                void fetchPage(clampedPage);
            }
        },
        [fetchPage, pageCache, pageCount],
    );

    useEffect(() => {
        if (!prewarmNextPage) return;

        const nextPage = currentPage + 1;

        if (nextPage >= pageCount || pageCache[nextPage]) return;

        const warm = () => void fetchPage(nextPage, { silent: true });
        const idleId =
            "requestIdleCallback" in window
                ? window.requestIdleCallback(warm, { timeout: 1200 })
                : globalThis.setTimeout(warm, 220);

        return () => {
            if ("cancelIdleCallback" in window && typeof idleId === "number") {
                window.cancelIdleCallback(idleId);
                return;
            }

            if (typeof idleId === "number") {
                globalThis.clearTimeout(idleId);
            }
        };
    }, [currentPage, fetchPage, pageCache, pageCount, prewarmNextPage]);

    useEffect(() => () => abortRef.current?.abort(), []);

    return {
        currentPage,
        currentItems: pageCache[currentPage] ?? [],
        pageCount,
        requestPage,
        isLoadingPage,
        pageError,
        retryPage: () => fetchPage(currentPage),
    };
}
