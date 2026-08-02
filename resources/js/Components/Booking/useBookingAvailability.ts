import axios from "axios";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type {
    BookingAvailabilityLoadState,
    BookingDateAvailabilityPreview,
} from "./BookingDiscoveryBar";

export type BookingFacilityAvailabilityStatus =
    | "available"
    | "limited"
    | "full"
    | "closed"
    | "no_schedule";

export interface BookingUnitAvailability {
    facility_unit_id: number;
    status: BookingFacilityAvailabilityStatus;
    reason: string | null;
    available_slot_count: number;
    total_slot_count: number;
    available_start_times: string[];
    next_available_at: string | null;
}

export interface BookingFacilityAvailability {
    facility_id: number;
    status: BookingFacilityAvailabilityStatus;
    reason: string | null;
    available_slot_count: number;
    total_slot_count: number;
    available_start_times: string[];
    next_available_at: string | null;
    units: BookingUnitAvailability[];
}

export interface BookingDateAvailability {
    date: string;
    closed: boolean;
    reason: string | null;
    summary: {
        total_facility_count: number;
        available_facility_count: number;
        available_slot_count: number;
    };
    facilities: BookingFacilityAvailability[];
}

export interface BookingAvailabilityEntry {
    state: BookingAvailabilityLoadState;
    data: BookingDateAvailability | null;
    error: string | null;
    fetchedAt: number;
    stale: boolean;
    requestId?: number;
}

interface AvailabilityEnvelope {
    today: string;
    timezone: string;
    from: string;
    days: number;
    dates: Record<string, unknown>;
    generated_at: string;
    calendar?: unknown;
}

interface FetchOptions {
    force?: boolean;
    priority?: boolean;
}

const AVAILABILITY_CACHE_TTL_MS = 15_000;
const AVAILABILITY_POLL_MS = 20_000;
const AVAILABILITY_POLL_JITTER_RATIO = 0.18;
const AVAILABILITY_REQUEST_TIMEOUT_MS = 8_000;
const CROSS_TAB_CHANNEL = "ubsc-booking-availability-v1";
const CROSS_TAB_STORAGE_KEY = "ubsc:booking-availability:event:v1";
const CROSS_TAB_LEASE_STORAGE_KEY =
    "ubsc:booking-availability:leases:v1";
const CROSS_TAB_REQUEST_LEASE_MS = 8_000;
const CROSS_TAB_COORDINATION_MIN_MS = 24;
const CROSS_TAB_COORDINATION_SPREAD_MS = 64;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const VALID_STATUSES = new Set<BookingFacilityAvailabilityStatus>([
    "available",
    "limited",
    "full",
    "closed",
    "no_schedule",
]);

interface CrossTabRequestLease {
    sender: string;
    requestId: number;
    expiresAt: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0
    );
}

function normalizeStartTimes(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;

    const times = value.filter(
        (time): time is string =>
            typeof time === "string" && TIME_PATTERN.test(time),
    );

    return times.length === value.length
        ? Array.from(new Set(times)).sort()
        : null;
}

function normalizeUnit(value: unknown): BookingUnitAvailability | null {
    if (!isObject(value)) return null;

    const startTimes = normalizeStartTimes(value.available_start_times);
    if (
        !isNonNegativeInteger(value.facility_unit_id) ||
        Number(value.facility_unit_id) < 1 ||
        typeof value.status !== "string" ||
        !VALID_STATUSES.has(
            value.status as BookingFacilityAvailabilityStatus,
        ) ||
        !isNonNegativeInteger(value.available_slot_count) ||
        !isNonNegativeInteger(value.total_slot_count) ||
        startTimes === null ||
        !(
            value.next_available_at === null ||
            (typeof value.next_available_at === "string" &&
                TIME_PATTERN.test(value.next_available_at))
        ) ||
        !(value.reason === null || typeof value.reason === "string")
    ) {
        return null;
    }

    return {
        facility_unit_id: value.facility_unit_id,
        status: value.status as BookingFacilityAvailabilityStatus,
        reason: value.reason,
        available_slot_count: value.available_slot_count,
        total_slot_count: value.total_slot_count,
        available_start_times: startTimes,
        next_available_at: value.next_available_at,
    };
}

function normalizeFacility(
    value: unknown,
): BookingFacilityAvailability | null {
    if (!isObject(value)) return null;

    const startTimes = normalizeStartTimes(value.available_start_times);
    const rawUnits = value.units;
    const units = Array.isArray(rawUnits)
        ? rawUnits.map(normalizeUnit)
        : null;

    if (
        !isNonNegativeInteger(value.facility_id) ||
        Number(value.facility_id) < 1 ||
        typeof value.status !== "string" ||
        !VALID_STATUSES.has(
            value.status as BookingFacilityAvailabilityStatus,
        ) ||
        !isNonNegativeInteger(value.available_slot_count) ||
        !isNonNegativeInteger(value.total_slot_count) ||
        startTimes === null ||
        units === null ||
        units.some((unit) => unit === null) ||
        !(
            value.next_available_at === null ||
            (typeof value.next_available_at === "string" &&
                TIME_PATTERN.test(value.next_available_at))
        ) ||
        !(value.reason === null || typeof value.reason === "string")
    ) {
        return null;
    }

    return {
        facility_id: value.facility_id,
        status: value.status as BookingFacilityAvailabilityStatus,
        reason: value.reason,
        available_slot_count: value.available_slot_count,
        total_slot_count: value.total_slot_count,
        available_start_times: startTimes,
        next_available_at: value.next_available_at,
        units: units as BookingUnitAvailability[],
    };
}

function normalizeDay(
    value: unknown,
    expectedDate: string,
): BookingDateAvailability | null {
    if (!isObject(value) || value.date !== expectedDate) return null;

    const summary = value.summary;
    const rawFacilities = value.facilities;
    const facilities = Array.isArray(rawFacilities)
        ? rawFacilities.map(normalizeFacility)
        : null;

    if (
        typeof value.closed !== "boolean" ||
        !(value.reason === null || typeof value.reason === "string") ||
        !isObject(summary) ||
        !isNonNegativeInteger(summary.total_facility_count) ||
        !isNonNegativeInteger(summary.available_facility_count) ||
        !isNonNegativeInteger(summary.available_slot_count) ||
        facilities === null ||
        facilities.some((facility) => facility === null)
    ) {
        return null;
    }

    return {
        date: expectedDate,
        closed: value.closed,
        reason: value.reason,
        summary: {
            total_facility_count: summary.total_facility_count,
            available_facility_count: summary.available_facility_count,
            available_slot_count: summary.available_slot_count,
        },
        facilities: facilities as BookingFacilityAvailability[],
    };
}

function normalizeEnvelope(value: unknown): AvailabilityEnvelope | null {
    if (
        !isObject(value) ||
        typeof value.today !== "string" ||
        !DATE_PATTERN.test(value.today) ||
        typeof value.timezone !== "string" ||
        typeof value.from !== "string" ||
        !DATE_PATTERN.test(value.from) ||
        !isNonNegativeInteger(value.days) ||
        Number(value.days) < 1 ||
        !isObject(value.dates) ||
        typeof value.generated_at !== "string"
    ) {
        return null;
    }

    return value as unknown as AvailabilityEnvelope;
}

function uniqueSortedDates(dates: string[]): string[] {
    return Array.from(
        new Set(dates.filter((date) => DATE_PATTERN.test(date))),
    ).sort();
}

function dayDistance(from: string, to: string): number {
    const parse = (value: string) => {
        const [year, month, day] = value.split("-").map(Number);
        return Date.UTC(year, month - 1, day);
    };

    return Math.round((parse(to) - parse(from)) / 86_400_000);
}

function addDays(date: string, amount: number): string {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(
        Date.UTC(year, month - 1, day + amount),
    ).toISOString().slice(0, 10);
}

function dateInTimeZone(timeZone: string, at = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(at);
    const valueFor = (type: "year" | "month" | "day") =>
        parts.find((part) => part.type === type)?.value ?? "";

    return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
}

function isValidTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat("en-CA", { timeZone }).format();
        return true;
    } catch {
        return false;
    }
}

function millisecondsUntilVenueDateChanges(timeZone: string): number {
    const now = Date.now();
    const currentDate = dateInTimeZone(timeZone, new Date(now));
    let low = now;
    let high = now + 30 * 60 * 60 * 1_000;

    if (dateInTimeZone(timeZone, new Date(high)) === currentDate) {
        return 60 * 60 * 1_000;
    }

    while (high - low > 1_000) {
        const middle = Math.floor((low + high) / 2);
        if (
            dateInTimeZone(timeZone, new Date(middle)) === currentDate
        ) {
            low = middle;
        } else {
            high = middle;
        }
    }

    return Math.max(1_000, high - now + 1_000);
}

function jitteredPollDelay(): number {
    const spread =
        AVAILABILITY_POLL_MS * AVAILABILITY_POLL_JITTER_RATIO;
    return Math.round(
        AVAILABILITY_POLL_MS - spread + Math.random() * spread * 2,
    );
}

function createTabId(): string {
    if (
        typeof globalThis.crypto !== "undefined" &&
        typeof globalThis.crypto.randomUUID === "function"
    ) {
        return globalThis.crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2)}`;
}

function readPersistedRequestLeases(
    at = Date.now(),
): Record<string, CrossTabRequestLease> {
    try {
        const raw = localStorage.getItem(CROSS_TAB_LEASE_STORAGE_KEY);
        if (!raw) return {};

        const parsed: unknown = JSON.parse(raw);
        if (!isObject(parsed)) return {};

        return Object.fromEntries(
            Object.entries(parsed).filter(([date, lease]) => {
                if (!DATE_PATTERN.test(date) || !isObject(lease)) {
                    return false;
                }

                return (
                    typeof lease.sender === "string" &&
                    lease.sender.length > 0 &&
                    typeof lease.requestId === "number" &&
                    Number.isInteger(lease.requestId) &&
                    lease.requestId > 0 &&
                    typeof lease.expiresAt === "number" &&
                    Number.isFinite(lease.expiresAt) &&
                    lease.expiresAt > at &&
                    lease.expiresAt <= at + 60_000
                );
            }),
        ) as Record<string, CrossTabRequestLease>;
    } catch {
        return {};
    }
}

function persistRequestLease(
    dates: string[],
    lease: CrossTabRequestLease,
): void {
    try {
        const leases = readPersistedRequestLeases();
        dates.forEach((date) => {
            leases[date] = lease;
        });
        localStorage.setItem(
            CROSS_TAB_LEASE_STORAGE_KEY,
            JSON.stringify(leases),
        );
    } catch {
        // BroadcastChannel coordination remains available without storage.
    }
}

function releasePersistedRequestLease(
    dates: string[],
    sender: string,
    requestId: number,
): void {
    try {
        const leases = readPersistedRequestLeases();
        dates.forEach((date) => {
            const lease = leases[date];
            if (
                lease?.sender === sender &&
                lease.requestId === requestId
            ) {
                delete leases[date];
            }
        });

        if (Object.keys(leases).length === 0) {
            localStorage.removeItem(CROSS_TAB_LEASE_STORAGE_KEY);
        } else {
            localStorage.setItem(
                CROSS_TAB_LEASE_STORAGE_KEY,
                JSON.stringify(leases),
            );
        }
    } catch {
        // Expiring leases are self-healing if storage becomes unavailable.
    }
}

function stableEntrySnapshot(
    entry: BookingAvailabilityEntry | undefined,
): BookingAvailabilityEntry | undefined {
    if (!entry) return undefined;

    if (entry.state === "loading" || entry.state === "refreshing") {
        if (!entry.data) return undefined;

        return {
            state: "ready",
            data: entry.data,
            error: null,
            fetchedAt: entry.fetchedAt,
            stale: Boolean(entry.data),
        };
    }

    return entry;
}

function waitForCrossTabCoordination(): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(
            resolve,
            CROSS_TAB_COORDINATION_MIN_MS +
                Math.random() * CROSS_TAB_COORDINATION_SPREAD_MS,
        );
    });
}

export default function useBookingAvailability(
    selectedDate: string,
    initialToday: string,
    initialCalendar?: unknown,
) {
    const [entries, setEntries] = useState<
        Record<string, BookingAvailabilityEntry>
    >({});
    const [venueToday, setVenueToday] = useState(() =>
        DATE_PATTERN.test(initialToday)
            ? initialToday
            : dateInTimeZone("Asia/Jakarta"),
    );
    const [venueTimezone, setVenueTimezone] = useState("Asia/Jakarta");
    const [calendarPayload, setCalendarPayload] =
        useState<unknown>(initialCalendar);
    const requestSequenceRef = useRef(0);
    const dateRequestRef = useRef<Record<string, number>>({});
    const datesInFlightRef = useRef<Set<string>>(new Set());
    const deferredDatesRef = useRef<Set<string>>(new Set());
    const fetchDatesRef = useRef<
        (dates: string[], options?: FetchOptions) => Promise<void>
    >(async () => undefined);
    const activeRequestsRef = useRef<
        Map<
            number,
            { controller: AbortController; coveredDates: string[] }
        >
    >(new Map());
    const priorityRequestRef = useRef<{
        id: number;
        controller: AbortController;
    } | null>(null);
    const remoteRequestLeasesRef = useRef<
        Map<
            string,
            { sender: string; requestId: number; expiresAt: number }
        >
    >(new Map());
    const visibleDatesRef = useRef<string[]>([]);
    const tabIdRef = useRef(createTabId());
    const publishCrossTabRef = useRef<
        (message: Record<string, unknown>) => void
    >(() => undefined);
    const sectionVisibleRef = useRef(true);
    const lastVisibleRefreshAtRef = useRef(0);
    const entriesRef = useRef(entries);
    const venueTodayRef = useRef(venueToday);
    const venueTimezoneRef = useRef(venueTimezone);
    const mountedRef = useRef(true);

    useEffect(() => {
        entriesRef.current = entries;
    }, [entries]);

    useEffect(() => {
        if (initialCalendar !== undefined) {
            setCalendarPayload(initialCalendar);
        }
    }, [initialCalendar]);

    const syncVenueClock = useCallback(
        (serverToday?: unknown, serverTimezone?: unknown) => {
            let timezone = venueTimezoneRef.current;

            if (
                typeof serverTimezone === "string" &&
                isValidTimeZone(serverTimezone)
            ) {
                timezone = serverTimezone;
                if (venueTimezoneRef.current !== timezone) {
                    venueTimezoneRef.current = timezone;
                    if (mountedRef.current) setVenueTimezone(timezone);
                }
            }

            let nextToday = venueTodayRef.current;
            if (
                typeof serverToday === "string" &&
                DATE_PATTERN.test(serverToday) &&
                serverToday > nextToday
            ) {
                nextToday = serverToday;
            }

            try {
                const localVenueToday = dateInTimeZone(timezone);
                if (
                    DATE_PATTERN.test(localVenueToday) &&
                    localVenueToday > nextToday
                ) {
                    nextToday = localVenueToday;
                }
            } catch {
                // Keep the last server-confirmed venue date.
            }

            if (nextToday !== venueTodayRef.current) {
                venueTodayRef.current = nextToday;
                if (mountedRef.current) setVenueToday(nextToday);
            }

            return nextToday;
        },
        [],
    );

    useEffect(() => {
        syncVenueClock(initialToday);
    }, [initialToday, syncVenueClock]);

    useEffect(() => {
        const receiveMessage = (value: unknown) => {
            if (!isObject(value) || value.sender === tabIdRef.current) {
                return;
            }

            const sender =
                typeof value.sender === "string" ? value.sender : "";
            if (!sender) return;

            if (value.type === "request") {
                if (
                    !Array.isArray(value.dates) ||
                    typeof value.expiresAt !== "number" ||
                    typeof value.requestId !== "number" ||
                    !Number.isInteger(value.requestId) ||
                    value.requestId < 1
                ) {
                    return;
                }

                const expiresAt = value.expiresAt;
                const now = Date.now();
                if (
                    !Number.isFinite(expiresAt) ||
                    expiresAt <= now ||
                    expiresAt > now + 60_000
                ) {
                    return;
                }

                uniqueSortedDates(
                    value.dates.filter(
                        (date): date is string =>
                            typeof date === "string",
                    ),
                ).forEach((date) => {
                    remoteRequestLeasesRef.current.set(date, {
                        sender,
                        requestId: value.requestId as number,
                        expiresAt,
                    });
                });
                return;
            }

            const releaseRemoteDates = (
                rawDates: unknown,
                requestId: unknown,
            ) => {
                if (
                    !Array.isArray(rawDates) ||
                    typeof requestId !== "number" ||
                    !Number.isInteger(requestId)
                ) {
                    return;
                }

                rawDates.forEach((date) => {
                    if (typeof date !== "string") return;
                    const lease =
                        remoteRequestLeasesRef.current.get(date);
                    if (
                        lease?.sender === sender &&
                        lease.requestId === requestId
                    ) {
                        remoteRequestLeasesRef.current.delete(date);
                    }
                });
            };

            if (value.type === "failure") {
                releaseRemoteDates(value.dates, value.requestId);
                return;
            }

            if (
                value.type !== "result" ||
                !isObject(value.dates) ||
                typeof value.fetchedAt !== "number" ||
                !Number.isFinite(value.fetchedAt) ||
                typeof value.requestId !== "number" ||
                !Number.isInteger(value.requestId) ||
                value.requestId < 1
            ) {
                return;
            }

            const rawDateEntries = Object.entries(value.dates);
            if (value.calendar !== undefined && mountedRef.current) {
                setCalendarPayload(value.calendar);
            }
            releaseRemoteDates(
                rawDateEntries.map(([date]) => date),
                value.requestId,
            );
            const minimumDate = syncVenueClock(
                value.today,
                value.timezone,
            );
            const fetchedAt = Math.min(
                value.fetchedAt,
                Date.now() + 5_000,
            );
            const normalizedDates = new Map<
                string,
                BookingDateAvailability
            >();

            rawDateEntries.forEach(([date, rawDay]) => {
                if (!DATE_PATTERN.test(date) || date < minimumDate) return;
                const newerLease =
                    remoteRequestLeasesRef.current.get(date);
                if (
                    newerLease?.sender === sender &&
                    newerLease.requestId !== value.requestId
                ) {
                    return;
                }
                const day = normalizeDay(rawDay, date);
                if (day) normalizedDates.set(date, day);
            });

            if (normalizedDates.size === 0 || !mountedRef.current) return;

            setEntries((current) => {
                const next = { ...current };
                normalizedDates.forEach((data, date) => {
                    if ((current[date]?.fetchedAt ?? 0) > fetchedAt) return;
                    next[date] = {
                        state: "ready",
                        data,
                        error: null,
                        fetchedAt,
                        stale: false,
                    };
                });
                entriesRef.current = next;
                return next;
            });
        };

        let channel: BroadcastChannel | null = null;
        let storageListener:
            | ((event: StorageEvent) => void)
            | null = null;

        if (typeof window.BroadcastChannel === "function") {
            channel = new BroadcastChannel(CROSS_TAB_CHANNEL);
            channel.addEventListener("message", (event) =>
                receiveMessage(event.data),
            );
            publishCrossTabRef.current = (message) =>
                channel?.postMessage(message);
        } else {
            storageListener = (event: StorageEvent) => {
                if (
                    event.key !== CROSS_TAB_STORAGE_KEY ||
                    !event.newValue
                ) {
                    return;
                }

                try {
                    receiveMessage(JSON.parse(event.newValue));
                } catch {
                    // Ignore malformed or unavailable cross-tab payloads.
                }
            };
            window.addEventListener("storage", storageListener);
            publishCrossTabRef.current = (message) => {
                try {
                    localStorage.setItem(
                        CROSS_TAB_STORAGE_KEY,
                        JSON.stringify({
                            ...message,
                            nonce: `${Date.now()}-${Math.random()}`,
                        }),
                    );
                    localStorage.removeItem(CROSS_TAB_STORAGE_KEY);
                } catch {
                    // Availability still works when storage is unavailable.
                }
            };
        }

        return () => {
            channel?.close();
            if (storageListener) {
                window.removeEventListener("storage", storageListener);
            }
            publishCrossTabRef.current = () => undefined;
        };
    }, [syncVenueClock]);

    const fetchDates = useCallback(
        async (requestedDates: string[], options: FetchOptions = {}) => {
            const minimumDate = syncVenueClock();
            let dates = uniqueSortedDates(requestedDates).filter(
                (date) => date >= minimumDate,
            );
            if (dates.length === 0) return;

            if (options.priority) {
                const currentPriority = priorityRequestRef.current;
                const currentPriorityRequest = currentPriority
                    ? activeRequestsRef.current.get(currentPriority.id)
                    : undefined;
                const alreadyCovered =
                    currentPriorityRequest &&
                    dates.every((date) =>
                        currentPriorityRequest.coveredDates.includes(
                            date,
                        ),
                    );

                if (alreadyCovered && !options.force) return;
                currentPriority?.controller.abort();

                if (options.force) {
                    activeRequestsRef.current.forEach((request) => {
                        if (
                            request.coveredDates.some((date) =>
                                dates.includes(date),
                            )
                        ) {
                            request.controller.abort();
                        }
                    });
                }
            } else {
                await waitForCrossTabCoordination();
                if (!mountedRef.current) return;

                const coordinatedMinimumDate = syncVenueClock();
                dates = dates.filter(
                    (date) => date >= coordinatedMinimumDate,
                );
                if (dates.length === 0) return;
            }

            const now = Date.now();
            remoteRequestLeasesRef.current.forEach(
                (lease, date) => {
                    if (lease.expiresAt <= now) {
                        remoteRequestLeasesRef.current.delete(date);
                    }
                },
            );
            Object.entries(
                readPersistedRequestLeases(now),
            ).forEach(([date, lease]) => {
                if (lease.sender !== tabIdRef.current) {
                    remoteRequestLeasesRef.current.set(date, lease);
                }
            });

            if (
                !(options.force && options.priority) &&
                dates.some((date) =>
                    datesInFlightRef.current.has(date),
                )
            ) {
                dates
                    .filter(
                        (date) =>
                            !datesInFlightRef.current.has(date),
                    )
                    .forEach((date) =>
                        deferredDatesRef.current.add(date),
                    );
                return;
            }

            if (
                !options.force &&
                dates.every((date) => {
                    const cached = entriesRef.current[date];
                    return (
                        cached &&
                        cached.state !== "error" &&
                        now - cached.fetchedAt <
                            AVAILABILITY_CACHE_TTL_MS
                    );
                })
            ) {
                return;
            }

            const from = dates[0];
            const requestedLast = dates[dates.length - 1];
            const days = Math.max(
                1,
                Math.min(14, dayDistance(from, requestedLast) + 1),
            );
            const id = ++requestSequenceRef.current;
            const requestStartedAt = Date.now();
            const controller = new AbortController();
            const coveredDates = Array.from(
                { length: days },
                (_, index) => addDays(from, index),
            );
            const previousEntries = new Map<
                string,
                BookingAvailabilityEntry | undefined
            >(
                coveredDates.map((date) => [
                    date,
                    stableEntrySnapshot(entriesRef.current[date]),
                ]),
            );

            coveredDates.forEach((date) => {
                dateRequestRef.current[date] = id;
                datesInFlightRef.current.add(date);
            });
            activeRequestsRef.current.set(id, {
                controller,
                coveredDates,
            });
            if (options.priority) {
                priorityRequestRef.current = { id, controller };
            }

            const requestLease = {
                sender: tabIdRef.current,
                requestId: id,
                expiresAt:
                    Date.now() + CROSS_TAB_REQUEST_LEASE_MS,
            };
            persistRequestLease(coveredDates, requestLease);
            publishCrossTabRef.current({
                type: "request",
                ...requestLease,
                dates: coveredDates,
            });

            setEntries((current) => {
                const next = { ...current };
                coveredDates.forEach((date) => {
                    const previous = current[date];
                    next[date] = {
                        state: previous?.data ? "refreshing" : "loading",
                        data: previous?.data ?? null,
                        error: null,
                        fetchedAt: previous?.fetchedAt ?? 0,
                        stale: Boolean(previous?.data),
                        requestId: id,
                    };
                });
                entriesRef.current = next;
                return next;
            });

            try {
                const response = await axios.get(
                    route("booking.availability"),
                    {
                        signal: controller.signal,
                        timeout: AVAILABILITY_REQUEST_TIMEOUT_MS,
                        params:
                            days === 1
                                ? { date: from }
                                : { from, days },
                    },
                );
                const envelope = normalizeEnvelope(response.data);

                if (!envelope) {
                    throw new Error("Invalid booking availability response");
                }

                if (
                    envelope.from !== from ||
                    envelope.days !== days ||
                    !isValidTimeZone(envelope.timezone)
                ) {
                    throw new Error(
                        "Mismatched booking availability response",
                    );
                }

                const effectiveToday = syncVenueClock(
                    envelope.today,
                    envelope.timezone,
                );
                if (
                    envelope.calendar !== undefined &&
                    mountedRef.current
                ) {
                    setCalendarPayload(envelope.calendar);
                }
                const fetchedAt = Date.now();
                const normalizedDates = new Map<
                    string,
                    BookingDateAvailability
                >();

                coveredDates.forEach((date) => {
                    const day = normalizeDay(envelope.dates[date], date);
                    if (day) normalizedDates.set(date, day);
                });

                if (normalizedDates.size !== coveredDates.length) {
                    throw new Error("Incomplete booking availability response");
                }

                if (mountedRef.current) {
                    setEntries((current) => {
                        const next = { ...current };
                        normalizedDates.forEach((data, date) => {
                            if (current[date]?.requestId !== id) {
                                return;
                            }
                            if (date < effectiveToday) {
                                const previous =
                                    previousEntries.get(date);
                                if (previous) next[date] = previous;
                                else delete next[date];
                                return;
                            }
                            next[date] = {
                                state: "ready",
                                data,
                                error: null,
                                fetchedAt,
                                stale: false,
                            };
                        });
                        entriesRef.current = next;
                        return next;
                    });
                }

                const publishableDates = Array.from(
                    normalizedDates.entries(),
                ).filter(
                    ([date]) =>
                        dateRequestRef.current[date] === id &&
                        date >= effectiveToday,
                );
                if (publishableDates.length > 0) {
                    publishCrossTabRef.current({
                        type: "result",
                        sender: tabIdRef.current,
                        requestId: id,
                        today: envelope.today,
                        timezone: envelope.timezone,
                        calendar: envelope.calendar,
                        fetchedAt,
                        dates: Object.fromEntries(publishableDates),
                    });
                }
                const unpublishedDates = coveredDates.filter(
                    (date) =>
                        !publishableDates.some(
                            ([publishedDate]) =>
                                publishedDate === date,
                        ),
                );
                if (unpublishedDates.length > 0) {
                    publishCrossTabRef.current({
                        type: "failure",
                        sender: tabIdRef.current,
                        requestId: id,
                        dates: unpublishedDates,
                    });
                }
            } catch (error) {
                const cancelled =
                    axios.isCancel(error) || controller.signal.aborted;
                const effectiveFailureToday = syncVenueClock();

                if (mountedRef.current) {
                    setEntries((current) => {
                        const next = { ...current };
                        coveredDates.forEach((date) => {
                            if (current[date]?.requestId !== id) {
                                return;
                            }

                            if (
                                cancelled ||
                                date < effectiveFailureToday
                            ) {
                                const previous =
                                    previousEntries.get(date);
                                if (previous) next[date] = previous;
                                else delete next[date];
                                return;
                            }

                            const previous = current[date];
                            if (
                                previous?.data &&
                                previous.fetchedAt > requestStartedAt
                            ) {
                                return;
                            }
                            next[date] = {
                                state: "error",
                                data: previous?.data ?? null,
                                error:
                                    "Ketersediaan belum dapat diperbarui.",
                                fetchedAt: previous?.fetchedAt ?? 0,
                                stale: Boolean(previous?.data),
                            };
                        });
                        entriesRef.current = next;
                        return next;
                    });
                }

                publishCrossTabRef.current({
                    type: "failure",
                    sender: tabIdRef.current,
                    requestId: id,
                    dates: coveredDates,
                });
            } finally {
                releasePersistedRequestLease(
                    coveredDates,
                    tabIdRef.current,
                    id,
                );
                activeRequestsRef.current.delete(id);
                if (priorityRequestRef.current?.id === id) {
                    priorityRequestRef.current = null;
                }
                coveredDates.forEach((date) => {
                    if (dateRequestRef.current[date] === id) {
                        delete dateRequestRef.current[date];
                        datesInFlightRef.current.delete(date);
                    }
                });

                const deferredDates = Array.from(
                    deferredDatesRef.current,
                ).filter(
                    (date) =>
                        !datesInFlightRef.current.has(date),
                );
                deferredDates.forEach((date) =>
                    deferredDatesRef.current.delete(date),
                );
                if (deferredDates.length > 0) {
                    window.setTimeout(() => {
                        if (mountedRef.current) {
                            void fetchDatesRef.current(deferredDates);
                        }
                    }, 0);
                }
            }
        },
        [syncVenueClock],
    );
    fetchDatesRef.current = fetchDates;

    const setVisibleDates = useCallback(
        (dates: string[]) => {
            const normalized = uniqueSortedDates(dates);
            visibleDatesRef.current = normalized;
            void fetchDates(normalized);
        },
        [fetchDates],
    );

    const refreshSelected = useCallback(() => {
        void fetchDates([selectedDate], {
            force: true,
            priority: true,
        });
    }, [fetchDates, selectedDate]);

    const ensureDate = useCallback(
        (date: string) => {
            void fetchDates([date], { priority: true });
        },
        [fetchDates],
    );

    const refreshVisibleRange = useCallback(() => {
        const minimumDate = syncVenueClock();
        if (
            !sectionVisibleRef.current ||
            document.visibilityState !== "visible" ||
            !navigator.onLine
        ) {
            return;
        }

        const dates = uniqueSortedDates([
            ...visibleDatesRef.current,
            selectedDate,
        ]).filter((date) => date >= minimumDate);

        if (dates.length > 0) {
            const now = Date.now();
            if (now - lastVisibleRefreshAtRef.current < 2_500) {
                return;
            }
            lastVisibleRefreshAtRef.current = now;
            void fetchDates(dates);
        }
    }, [fetchDates, selectedDate, syncVenueClock]);

    useEffect(() => {
        const section = document.getElementById("booking-content");
        if (!section || !("IntersectionObserver" in window)) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                sectionVisibleRef.current = entry.isIntersecting;
            },
            { rootMargin: "240px 0px", threshold: 0.01 },
        );
        observer.observe(section);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        let pollTimer = 0;
        const schedulePoll = () => {
            pollTimer = window.setTimeout(() => {
                refreshVisibleRange();
                schedulePoll();
            }, jitteredPollDelay());
        };
        schedulePoll();

        window.addEventListener("online", refreshVisibleRange);
        window.addEventListener("focus", refreshVisibleRange);
        document.addEventListener(
            "visibilitychange",
            refreshVisibleRange,
        );

        return () => {
            window.clearTimeout(pollTimer);
            window.removeEventListener("online", refreshVisibleRange);
            window.removeEventListener("focus", refreshVisibleRange);
            document.removeEventListener(
                "visibilitychange",
                refreshVisibleRange,
            );
        };
    }, [refreshVisibleRange]);

    useEffect(() => {
        let midnightTimer = 0;

        const scheduleMidnightRollover = () => {
            let delay = 60_000;
            try {
                delay = millisecondsUntilVenueDateChanges(
                    venueTimezoneRef.current,
                );
            } catch {
                // Retry soon if the runtime rejects the venue time zone.
            }

            midnightTimer = window.setTimeout(() => {
                const previousToday = venueTodayRef.current;
                const currentToday = syncVenueClock();
                if (currentToday > previousToday) {
                    refreshVisibleRange();
                }
                scheduleMidnightRollover();
            }, delay);
        };

        scheduleMidnightRollover();
        return () => window.clearTimeout(midnightTimer);
    }, [refreshVisibleRange, syncVenueClock, venueTimezone]);

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
            activeRequestsRef.current.forEach(({ controller }) =>
                controller.abort(),
            );
            activeRequestsRef.current.clear();
            datesInFlightRef.current.clear();
            deferredDatesRef.current.clear();
            priorityRequestRef.current = null;
        };
    }, []);

    const dateSummaries = useMemo<
        Record<string, BookingDateAvailabilityPreview>
    >(
        () =>
            Object.fromEntries(
                Object.entries(entries).map(([date, entry]) => {
                    const summary = entry.data?.summary;
                    return [
                        date,
                        {
                            state: entry.state,
                            availableFacilities:
                                summary?.available_facility_count ?? 0,
                            totalFacilities:
                                summary?.total_facility_count ?? 0,
                            availableSlots:
                                summary?.available_slot_count ?? 0,
                            closed: entry.data?.closed ?? false,
                            reason: entry.data?.reason ?? entry.error,
                            stale: entry.stale,
                        } satisfies BookingDateAvailabilityPreview,
                    ];
                }),
            ),
        [entries],
    );

    return {
        entries,
        selectedEntry: entries[selectedDate],
        dateSummaries,
        venueToday,
        venueTimezone,
        calendarPayload,
        setVisibleDates,
        ensureDate,
        refreshSelected,
    };
}
