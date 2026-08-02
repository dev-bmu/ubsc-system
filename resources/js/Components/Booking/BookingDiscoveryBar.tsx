import {
    CalendarDays,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock3,
    MapPin,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";
import {
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type UIEvent as ReactUIEvent,
    type WheelEvent as ReactWheelEvent,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { flushSync } from "react-dom";
import {
    bookingCalendarDateState,
    bookingCalendarReasonLabel,
    type BookingCalendarMetadata,
} from "./useBookingCalendar";

export type BookingTimePreset =
    | "all"
    | "morning"
    | "afternoon"
    | "evening"
    | "night"
    | "custom";

export interface BookingFilterOption {
    value: string;
    label: string;
    count: number;
}

export type BookingAvailabilityLoadState =
    | "idle"
    | "loading"
    | "ready"
    | "refreshing"
    | "error";

export interface BookingDateAvailabilityPreview {
    state: BookingAvailabilityLoadState;
    availableFacilities: number;
    totalFacilities: number;
    availableSlots: number;
    closed: boolean;
    reason: string | null;
    stale?: boolean;
}

interface BookingDiscoveryBarProps {
    value: string;
    onDateChange: (date: string) => void;
    minDate: string;
    calendarMetadata: BookingCalendarMetadata;
    dateSummaries: Record<string, BookingDateAvailabilityPreview>;
    onVisibleDatesChange: (dates: string[]) => void;
    onRetryAvailability: () => void;
    query: string;
    onQueryChange: (query: string) => void;
    category: string;
    onCategoryChange: (category: string) => void;
    location: string;
    onLocationChange: (location: string) => void;
    timePreset: BookingTimePreset;
    onTimePresetChange: (preset: BookingTimePreset) => void;
    selectedStartTimes: string[];
    onSelectedStartTimesChange: (times: string[]) => void;
    availableOnly: boolean;
    onAvailableOnlyChange: (value: boolean) => void;
    categories: BookingFilterOption[];
    locations: BookingFilterOption[];
    resultCount: number;
    totalCount: number;
    onReset: () => void;
}

type OpenPanel = "calendar" | "category" | "location" | "time" | null;
type PanelPlacement = "down" | "up";
type CalendarMotion = "idle" | "dragging" | "settling";

interface CalendarGestureState {
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    startScrollLeft: number;
    lastX: number;
    lastTimestamp: number;
    velocityX: number;
    moved: boolean;
    dragging: boolean;
}

interface DateRailGestureState {
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastTimestamp: number;
    velocityX: number;
    moved: boolean;
    dragging: boolean;
    axis: "pending" | "horizontal" | "vertical";
}

interface CalendarActiveTransition {
    token: number;
    direction: -1 | 1 | null;
    finish: () => void;
}

const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
];

const monthShortNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
];

const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const calendarDayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const accessibleDateFormatter = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
});

const TIME_PRESETS: Array<{
    value: Exclude<BookingTimePreset, "custom">;
    label: string;
    meta: string;
}> = [
    { value: "all", label: "Semua waktu", meta: "00.00 - 24.00" },
    { value: "morning", label: "Pagi", meta: "06.00 - 12.00" },
    { value: "afternoon", label: "Siang", meta: "12.00 - 16.00" },
    { value: "evening", label: "Sore", meta: "16.00 - 19.00" },
    { value: "night", label: "Malam", meta: "19.00 - 24.00" },
];

const TIME_START_OPTIONS = Array.from({ length: 48 }, (_, index) => {
    const hour = Math.floor(index / 2);
    const minutes = index % 2 === 0 ? "00" : "30";
    return `${String(hour).padStart(2, "0")}:${minutes}`;
});

function dateToStr(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function sameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function sameMonth(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function firstDateOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function resolveCalendarPageDirection(
    offsetPages: number,
    velocityPages: number,
): -1 | 1 | null {
    const projectedOffsetPages =
        offsetPages + velocityPages * 0.15;

    if (
        Math.abs(projectedOffsetPages) < 0.26 &&
        !(
            Math.abs(offsetPages) >= 0.045 &&
            Math.abs(velocityPages) >= 0.55
        )
    ) {
        return null;
    }

    return projectedOffsetPages < 0 ||
        (projectedOffsetPages === 0 && offsetPages < 0)
        ? -1
        : 1;
}

function firstDateOfCalendarPair(date: Date): Date {
    const month = date.getMonth();
    return new Date(
        date.getFullYear(),
        month - (month % 2),
        1,
    );
}

function addDays(date: Date, amount: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
}

function getCalendarCells(monthDate: Date): Date[] {
    const first = firstDateOfMonth(monthDate);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayOffset);

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return date;
    });
}

function accessibleDateLabel(date: Date): string {
    return accessibleDateFormatter.format(date);
}

function CalendarMonthGrid({
    monthDate,
    selectedDate,
    today,
    calendarMetadata,
    secondary = false,
    interactive = true,
    onSelect,
}: {
    monthDate: Date;
    selectedDate: Date;
    today: Date;
    calendarMetadata: BookingCalendarMetadata;
    secondary?: boolean;
    interactive?: boolean;
    onSelect: (date: Date) => void;
}) {
    const monthKey =
        monthDate.getFullYear() * 12 + monthDate.getMonth();
    const cells = useMemo(
        () => getCalendarCells(monthDate),
        [monthKey],
    );
    const selectedWeekdayIndex = (selectedDate.getDay() + 6) % 7;
    const selectedDateIsInMonth = sameMonth(selectedDate, monthDate);

    return (
        <div
            className={`booking-calendar-month${secondary ? " booking-calendar-month--secondary" : ""}`}
        >
            <h3>
                <span>{monthNames[monthDate.getMonth()]}</span>
                <small>{monthDate.getFullYear()}</small>
            </h3>
            <div className="booking-calendar-month__grid">
                {calendarDayNames.map((day, index) => (
                    <span
                        key={day}
                        className={`booking-calendar-month__weekday${index === 6 ? " is-red-date" : ""}${selectedDateIsInMonth && index === selectedWeekdayIndex ? " is-selected-weekday" : ""}`}
                    >
                        {day}
                    </span>
                ))}

                {cells.map((date) => {
                    const inMonth = sameMonth(date, monthDate);
                    if (!inMonth) {
                        return (
                            <span
                                key={dateToStr(date)}
                                className="booking-calendar-month__day booking-calendar-month__day--empty"
                                aria-hidden="true"
                            />
                        );
                    }

                    const dateString = dateToStr(date);
                    const dateState = bookingCalendarDateState(
                        calendarMetadata,
                        dateString,
                    );
                    const disabled =
                        date < today || !dateState.bookable;
                    const selected = sameDay(date, selectedDate);
                    const isToday = sameDay(date, today);
                    const isRedDate =
                        dateState.isSunday ||
                        Boolean(dateState.holiday?.isRedDate);
                    const microLabel = isToday ? "hari ini" : null;
                    const closureLabel =
                        bookingCalendarReasonLabel(dateState.reason);
                    const detailLabel = [
                        accessibleDateLabel(date),
                        dateState.holiday?.name,
                        closureLabel,
                    ]
                        .filter(Boolean)
                        .join(", ");

                    return (
                        <button
                            key={dateString}
                            type="button"
                            disabled={disabled}
                            tabIndex={interactive ? undefined : -1}
                            onClick={() => {
                                if (interactive) {
                                    onSelect(date);
                                }
                            }}
                            aria-label={
                                disabled
                                    ? detailLabel
                                    : `Pilih ${detailLabel}`
                            }
                            title={detailLabel}
                            aria-pressed={selected}
                            aria-current={
                                isToday ? "date" : undefined
                            }
                            className={`booking-calendar-month__day${selected ? " is-selected" : ""}${isToday ? " is-today" : ""}${isRedDate ? " is-red-date" : ""}${dateState.holiday ? " is-holiday" : ""}${!dateState.bookable ? " is-closed" : ""}${dateState.reason === "date_closed" ? " is-schedule-closed" : ""}`}
                        >
                            {microLabel && (
                                <small className="booking-calendar-month__day-label">
                                    {microLabel}
                                </small>
                            )}
                            <span>{date.getDate()}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function optionLabel(options: BookingFilterOption[], value: string, fallback: string) {
    return options.find((option) => option.value === value)?.label ?? fallback;
}

export default function BookingDiscoveryBar({
    value,
    onDateChange,
    minDate,
    calendarMetadata,
    dateSummaries,
    onVisibleDatesChange,
    onRetryAvailability,
    query,
    onQueryChange,
    category,
    onCategoryChange,
    location,
    onLocationChange,
    timePreset,
    onTimePresetChange,
    selectedStartTimes,
    onSelectedStartTimesChange,
    availableOnly,
    onAvailableOnlyChange,
    categories,
    locations,
    resultCount,
    totalCount,
    onReset,
}: BookingDiscoveryBarProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const dateRailRef = useRef<HTMLDivElement | null>(null);
    const dateRailGestureRef = useRef<DateRailGestureState | null>(null);
    const dateRailSuppressClickRef = useRef(false);
    const dateRailSuppressClickTimerRef = useRef<number | null>(null);
    const dateRailAnimationTimerRef = useRef<number | null>(null);
    const dateRailWheelRef = useRef({
        delta: 0,
        lastTimestamp: 0,
        lockedUntil: 0,
    });
    const dateRailNativeTouchHandlersRef = useRef<{
        start: (event: TouchEvent) => void;
        move: (event: TouchEvent) => void;
        end: (event: TouchEvent) => void;
        cancel: (event: TouchEvent) => void;
    }>({
        start: () => undefined,
        move: () => undefined,
        end: () => undefined,
        cancel: () => undefined,
    });
    const filterRailRef = useRef<HTMLDivElement | null>(null);
    const panelTriggerRef = useRef<HTMLButtonElement | null>(null);
    const calendarViewportRef = useRef<HTMLDivElement | null>(null);
    const calendarGestureRef = useRef<CalendarGestureState | null>(null);
    const pendingCalendarDirectionRef = useRef<-1 | 1 | null>(null);
    const calendarRecenteringRef = useRef(false);
    const calendarActiveTransitionRef =
        useRef<CalendarActiveTransition | null>(null);
    const calendarTransitionTokenRef = useRef(0);
    const calendarAnimationFrameRef = useRef<number | null>(null);
    const calendarSettleTimerRef = useRef<number | null>(null);
    const calendarReleaseVelocityRef = useRef(0);
    const calendarScrollSampleRef = useRef({
        left: 0,
        timestamp: 0,
        velocity: 0,
    });
    const calendarWheelSessionRef = useRef({
        active: false,
        fastForwarded: false,
        hasScrolled: false,
        lastTimestamp: 0,
    });
    const calendarWheelSessionTimerRef =
        useRef<number | null>(null);
    const calendarNativeTouchPointerRef = useRef<number | null>(
        null,
    );
    const calendarSuppressClickRef = useRef(false);
    const calendarSuppressClickTimerRef = useRef<number | null>(null);
    const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
    const [panelPlacement, setPanelPlacement] =
        useState<PanelPlacement>("down");
    const [panelMaxHeight, setPanelMaxHeight] = useState<number | null>(null);
    const [visibleDayCount, setVisibleDayCount] = useState(9);
    const [filterRailCueVisible, setFilterRailCueVisible] = useState(false);
    const [filterRailCueAtEnd, setFilterRailCueAtEnd] = useState(false);
    const [visibleStart, setVisibleStart] = useState<Date>(() =>
        parseLocalDate(value),
    );
    const [calendarStartMonth, setCalendarStartMonth] = useState<Date>(() =>
        firstDateOfCalendarPair(parseLocalDate(value)),
    );
    const calendarCommittedStartMonthRef =
        useRef(calendarStartMonth);
    const [calendarMotion, setCalendarMotion] =
        useState<CalendarMotion>("idle");

    const selectedDate = useMemo(() => parseLocalDate(value), [value]);
    const today = useMemo(() => parseLocalDate(minDate), [minDate]);
    const minimumCalendarStartMonth = useMemo(
        () => firstDateOfCalendarPair(today),
        [today],
    );
    const days = useMemo(() => {
        const base = new Date(visibleStart);
        base.setHours(0, 0, 0, 0);
        return Array.from(
            { length: visibleDayCount },
            (_, index) => {
                const date = new Date(base);
                date.setDate(base.getDate() + index);
                return date;
            },
        );
    }, [visibleDayCount, visibleStart]);
    const visibleDateKeys = useMemo(
        () => days.map(dateToStr),
        [days],
    );
    const requestableDateKeys = useMemo(
        () =>
            visibleDateKeys.filter(
                (date) =>
                    bookingCalendarDateState(calendarMetadata, date).bookable,
            ),
        [calendarMetadata, visibleDateKeys],
    );
    const selectedAvailability = dateSummaries[value];
    const selectedCalendarDateState = bookingCalendarDateState(
        calendarMetadata,
        value,
    );
    const selectedDateClosed =
        !selectedCalendarDateState.bookable &&
        selectedCalendarDateState.reason !== "past";

    const currentMonthLabel = `${monthNames[visibleStart.getMonth()]} ${visibleStart.getFullYear()}`;
    const canShiftBackward = visibleStart > today;
    const canShiftForward = true;
    const activeCalendarDirection =
        calendarActiveTransitionRef.current?.direction;
    const projectedCalendarStartMonth =
        activeCalendarDirection === -1 ||
        activeCalendarDirection === 1
            ? addMonths(
                  calendarStartMonth,
                  activeCalendarDirection * 2,
              )
            : calendarStartMonth;
    const canShiftCalendarBackward =
        projectedCalendarStartMonth > minimumCalendarStartMonth;
    const canShiftCalendarForward = true;
    const secondaryCalendarMonth = new Date(
        calendarStartMonth.getFullYear(),
        calendarStartMonth.getMonth() + 1,
        1,
    );
    const activeFilterCount =
        Number(Boolean(query.trim())) +
        Number(category !== "all") +
        Number(location !== "all") +
        Number(timePreset !== "all" || selectedStartTimes.length > 0) +
        Number(availableOnly);
    const slotFilterActive =
        timePreset !== "all" ||
        selectedStartTimes.length > 0 ||
        availableOnly;

    useEffect(() => {
        onVisibleDatesChange(requestableDateKeys);
    }, [onVisibleDatesChange, requestableDateKeys]);

    useEffect(() => {
        const nextSelectedDate = parseLocalDate(value);
        setVisibleStart((current) => {
            const currentPageEnd = addDays(
                current,
                Math.max(0, visibleDayCount - 1),
            );

            return nextSelectedDate < current ||
                nextSelectedDate > currentPageEnd
                ? nextSelectedDate
                : current;
        });
    }, [value, visibleDayCount]);

    useEffect(() => {
        setVisibleStart((current) => (current < today ? today : current));
        setCalendarStartMonth((current) => {
            const next =
                current < minimumCalendarStartMonth
                ? minimumCalendarStartMonth
                : firstDateOfCalendarPair(current);
            calendarCommittedStartMonthRef.current = next;
            return next;
        });
    }, [minimumCalendarStartMonth, today]);

    useLayoutEffect(() => {
        const rail = dateRailRef.current;
        if (!rail) return;

        const updateVisibleDayCount = () => {
            const width = rail.getBoundingClientRect().width;
            if (width <= 0) return;

            const minimumCardWidth =
                width < 340 ? 66 : width < 720 ? 70 : width < 980 ? 76 : 82;
            const nextCount = Math.max(
                4,
                Math.min(9, Math.floor(width / minimumCardWidth)),
            );
            setVisibleDayCount((current) =>
                current === nextCount ? current : nextCount,
            );
        };

        updateVisibleDayCount();
        const observer =
            typeof ResizeObserver === "function"
                ? new ResizeObserver(updateVisibleDayCount)
                : null;
        observer?.observe(rail);
        window.addEventListener("resize", updateVisibleDayCount);

        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", updateVisibleDayCount);
        };
    }, []);

    useLayoutEffect(() => {
        const rail = filterRailRef.current;
        if (!rail) return;

        let frame = 0;
        const updateCue = () => {
            const maximumScroll = Math.max(
                0,
                rail.scrollWidth - rail.clientWidth,
            );
            const shouldShow = maximumScroll > 4;
            const isAtEnd =
                shouldShow && rail.scrollLeft >= maximumScroll - 4;

            setFilterRailCueVisible((current) =>
                current === shouldShow ? current : shouldShow,
            );
            setFilterRailCueAtEnd((current) =>
                current === isAtEnd ? current : isAtEnd,
            );
        };
        const scheduleUpdate = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(updateCue);
        };

        updateCue();
        scheduleUpdate();
        rail.addEventListener("scroll", scheduleUpdate, { passive: true });
        window.addEventListener("resize", scheduleUpdate);
        const observer =
            typeof ResizeObserver === "function"
                ? new ResizeObserver(scheduleUpdate)
                : null;
        observer?.observe(rail);

        return () => {
            window.cancelAnimationFrame(frame);
            observer?.disconnect();
            rail.removeEventListener("scroll", scheduleUpdate);
            window.removeEventListener("resize", scheduleUpdate);
        };
    }, []);

    useEffect(
        () => () => {
            if (dateRailSuppressClickTimerRef.current !== null) {
                window.clearTimeout(
                    dateRailSuppressClickTimerRef.current,
                );
            }
            if (dateRailAnimationTimerRef.current !== null) {
                window.clearTimeout(dateRailAnimationTimerRef.current);
            }
        },
        [],
    );

    useEffect(() => {
        const rail = dateRailRef.current;
        if (!rail) return;

        const handleTouchStart = (event: TouchEvent) =>
            dateRailNativeTouchHandlersRef.current.start(event);
        const handleTouchMove = (event: TouchEvent) =>
            dateRailNativeTouchHandlersRef.current.move(event);
        const handleTouchEnd = (event: TouchEvent) =>
            dateRailNativeTouchHandlersRef.current.end(event);
        const handleTouchCancel = (event: TouchEvent) =>
            dateRailNativeTouchHandlersRef.current.cancel(event);

        rail.addEventListener("touchstart", handleTouchStart, {
            capture: true,
            passive: true,
        });
        rail.addEventListener("touchmove", handleTouchMove, {
            capture: true,
            passive: false,
        });
        rail.addEventListener("touchend", handleTouchEnd, {
            capture: true,
            passive: false,
        });
        rail.addEventListener("touchcancel", handleTouchCancel, {
            capture: true,
            passive: true,
        });

        return () => {
            rail.removeEventListener("touchstart", handleTouchStart, true);
            rail.removeEventListener("touchmove", handleTouchMove, true);
            rail.removeEventListener("touchend", handleTouchEnd, true);
            rail.removeEventListener(
                "touchcancel",
                handleTouchCancel,
                true,
            );
        };
    }, []);

    const timeLabel = selectedStartTimes.length
        ? `${selectedStartTimes.length} jam dipilih`
        : TIME_PRESETS.find((preset) => preset.value === timePreset)?.label ??
          "Waktu";
    const activeFilters: Array<{
        id: string;
        label: string;
        onClear: () => void;
    }> = [];

    if (query.trim()) {
        activeFilters.push({
            id: "query",
            label: `Cari / ${query.trim()}`,
            onClear: () => onQueryChange(""),
        });
    }
    if (category !== "all") {
        activeFilters.push({
            id: "category",
            label: optionLabel(categories, category, "Kategori"),
            onClear: () => onCategoryChange("all"),
        });
    }
    if (location !== "all") {
        activeFilters.push({
            id: "location",
            label: optionLabel(locations, location, "Lokasi"),
            onClear: () => onLocationChange("all"),
        });
    }
    if (timePreset !== "all" || selectedStartTimes.length > 0) {
        activeFilters.push({
            id: "time",
            label: timeLabel,
            onClear: () => {
                onSelectedStartTimesChange([]);
                onTimePresetChange("all");
            },
        });
    }
    if (availableOnly) {
        activeFilters.push({
            id: "availability",
            label: "Slot tersedia",
            onClear: () => onAvailableOnlyChange(false),
        });
    }

    const closePanel = (restoreFocus = false) => {
        const trigger = panelTriggerRef.current;
        setOpenPanel(null);

        if (restoreFocus) {
            window.requestAnimationFrame(() => trigger?.focus());
        }
    };

    useEffect(() => {
        if (!openPanel) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpenPanel(null);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                const trigger = panelTriggerRef.current;
                setOpenPanel(null);
                window.requestAnimationFrame(() => trigger?.focus());
                return;
            }

            if (
                event.key === "Tab" &&
                openPanel !== "calendar" &&
                window.matchMedia("(max-width: 767px)").matches
            ) {
                const panel = rootRef.current?.querySelector<HTMLElement>(
                    `#booking-${openPanel}-filter`,
                );
                const focusable = panel
                    ? Array.from(
                          panel.querySelectorAll<HTMLElement>(
                              "button:not([disabled])",
                          ),
                      )
                    : [];
                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (
                    event.shiftKey &&
                    first &&
                    document.activeElement === first
                ) {
                    event.preventDefault();
                    last?.focus();
                } else if (
                    !event.shiftKey &&
                    last &&
                    document.activeElement === last
                ) {
                    event.preventDefault();
                    first?.focus();
                }
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [openPanel]);

    useEffect(() => {
        if (
            !openPanel ||
            openPanel === "calendar" ||
            (!window
                .matchMedia(
                    "(max-width: 767px), (max-height: 520px)",
                )
                .matches)
        ) {
            return;
        }

        const bookingSection =
            rootRef.current?.closest<HTMLElement>(".booking-section") ??
            null;
        const previousBodyOverflow = document.body.style.overflow;
        bookingSection?.classList.add("booking-section--panel-open");
        document.body.style.overflow = "hidden";
        const frame = window.requestAnimationFrame(() => {
            rootRef.current
                ?.querySelector<HTMLButtonElement>(
                    `#booking-${openPanel}-filter .booking-filter-panel__close`,
                )
                ?.focus();
        });

        return () => {
            window.cancelAnimationFrame(frame);
            bookingSection?.classList.remove(
                "booking-section--panel-open",
            );
            document.body.style.overflow = previousBodyOverflow;
        };
    }, [openPanel, panelPlacement]);

    useLayoutEffect(() => {
        if (!openPanel) {
            setPanelPlacement("down");
            setPanelMaxHeight(null);
            return;
        }

        const updatePanelPosition = () => {
            if (openPanel === "calendar") {
                setPanelPlacement("down");
                setPanelMaxHeight(null);
                return;
            }

            if (window.matchMedia("(max-width: 767px)").matches) {
                setPanelPlacement("down");
                setPanelMaxHeight(Math.max(280, window.innerHeight - 24));
                return;
            }

            const trigger = rootRef.current?.querySelector<HTMLElement>(
                `[aria-controls="booking-${openPanel}-filter"]`,
            );
            const panel = rootRef.current?.querySelector<HTMLElement>(
                `#booking-${openPanel}-filter`,
            );
            if (!trigger || !panel) return;

            const triggerRect = trigger.getBoundingClientRect();
            const gap = 2;
            const spaceBelow = Math.max(
                0,
                window.innerHeight - triggerRect.bottom - gap,
            );
            const spaceAbove = Math.max(0, triggerRect.top - gap);
            const desiredHeight = Math.min(panel.scrollHeight, 576);
            const comfortableHeight = Math.min(desiredHeight, 320);
            const panelFitsBelow = spaceBelow >= desiredHeight;
            const panelFitsAbove = spaceAbove >= desiredHeight;

            const nextPlacement =
                panelFitsAbove && !panelFitsBelow
                    ? "up"
                    : spaceBelow < comfortableHeight &&
                        spaceAbove > spaceBelow
                    ? "up"
                    : "down";
            const availableSpace =
                nextPlacement === "up" ? spaceAbove : spaceBelow;

            setPanelPlacement(nextPlacement);
            setPanelMaxHeight(
                Math.max(176, Math.floor(availableSpace)),
            );
        };

        updatePanelPosition();
        window.addEventListener("resize", updatePanelPosition);

        return () => {
            window.removeEventListener("resize", updatePanelPosition);
        };
    }, [openPanel]);

    const positionedPanelClass =
        panelPlacement === "up" ? " booking-filter-panel--up" : "";
    const positionedPanelStyle =
        panelMaxHeight === null
            ? undefined
            : ({
                  "--booking-panel-max-height": `${panelMaxHeight}px`,
              } as CSSProperties);

    const clearDateRailAnimation = () => {
        if (dateRailAnimationTimerRef.current !== null) {
            window.clearTimeout(dateRailAnimationTimerRef.current);
            dateRailAnimationTimerRef.current = null;
        }

        const rail = dateRailRef.current;
        if (!rail) return;

        rail.classList.remove(
            "is-dragging",
            "is-rebounding",
            "is-shifting-forward",
            "is-shifting-backward",
        );
        rail.style.removeProperty("--booking-date-drag-x");
    };

    const clearDateRailClickSuppression = () => {
        dateRailSuppressClickRef.current = false;
        if (dateRailSuppressClickTimerRef.current !== null) {
            window.clearTimeout(dateRailSuppressClickTimerRef.current);
            dateRailSuppressClickTimerRef.current = null;
        }
    };

    const armDateRailClickSuppression = (duration = 240) => {
        dateRailSuppressClickRef.current = true;
        if (dateRailSuppressClickTimerRef.current !== null) {
            window.clearTimeout(dateRailSuppressClickTimerRef.current);
        }
        dateRailSuppressClickTimerRef.current = window.setTimeout(() => {
            dateRailSuppressClickRef.current = false;
            dateRailSuppressClickTimerRef.current = null;
        }, duration);
    };

    const animateDateRailPage = (direction: -1 | 1) => {
        const rail = dateRailRef.current;
        if (!rail) return;

        if (dateRailAnimationTimerRef.current !== null) {
            window.clearTimeout(dateRailAnimationTimerRef.current);
        }
        rail.classList.remove(
            "is-dragging",
            "is-rebounding",
            "is-shifting-forward",
            "is-shifting-backward",
        );
        rail.style.removeProperty("--booking-date-drag-x");
        void rail.offsetWidth;
        rail.classList.add(
            direction === 1
                ? "is-shifting-forward"
                : "is-shifting-backward",
        );
        dateRailAnimationTimerRef.current = window.setTimeout(() => {
            rail.classList.remove(
                "is-shifting-forward",
                "is-shifting-backward",
            );
            dateRailAnimationTimerRef.current = null;
        }, 340);
    };

    const reboundDateRail = () => {
        const rail = dateRailRef.current;
        if (!rail) return;

        if (dateRailAnimationTimerRef.current !== null) {
            window.clearTimeout(dateRailAnimationTimerRef.current);
        }
        rail.classList.remove(
            "is-dragging",
            "is-shifting-forward",
            "is-shifting-backward",
        );
        rail.classList.add("is-rebounding");
        void rail.offsetWidth;
        rail.style.setProperty("--booking-date-drag-x", "0px");
        dateRailAnimationTimerRef.current = window.setTimeout(() => {
            rail.classList.remove("is-rebounding");
            rail.style.removeProperty("--booking-date-drag-x");
            dateRailAnimationTimerRef.current = null;
        }, 280);
    };

    const shiftDays = (direction: -1 | 1): boolean => {
        let shifted = false;

        flushSync(() => {
            setVisibleStart((current) => {
                const candidate = addDays(
                    current,
                    direction * visibleDayCount,
                );
                const next = candidate < today ? today : candidate;

                if (sameDay(current, next)) {
                    return current;
                }

                shifted = true;
                return next;
            });
        });

        if (shifted) {
            animateDateRailPage(direction);
        } else {
            reboundDateRail();
        }

        return shifted;
    };

    const beginDateRailGesture = (
        pointerId: number,
        clientX: number,
        clientY: number,
        timestamp: number,
    ) => {
        clearDateRailAnimation();
        clearDateRailClickSuppression();
        dateRailGestureRef.current = {
            pointerId,
            startX: clientX,
            startY: clientY,
            lastX: clientX,
            lastTimestamp: timestamp,
            velocityX: 0,
            moved: false,
            dragging: false,
            axis: "pending",
        };
    };

    const updateDateRailGesture = (
        rail: HTMLDivElement,
        pointerId: number,
        clientX: number,
        clientY: number,
        timestamp: number,
    ): boolean => {
        const gesture = dateRailGestureRef.current;
        if (!gesture || gesture.pointerId !== pointerId) return false;

        const deltaX = clientX - gesture.startX;
        const deltaY = clientY - gesture.startY;
        const absoluteX = Math.abs(deltaX);
        const absoluteY = Math.abs(deltaY);
        const elapsed = Math.max(
            1,
            timestamp - gesture.lastTimestamp,
        );
        const instantVelocity =
            (clientX - gesture.lastX) / elapsed;

        gesture.velocityX =
            gesture.velocityX * 0.65 + instantVelocity * 0.35;
        gesture.lastX = clientX;
        gesture.lastTimestamp = timestamp;

        if (gesture.axis === "vertical") {
            return false;
        }

        if (gesture.axis === "pending") {
            if (absoluteX < 4 && absoluteY < 6) return false;

            if (absoluteY >= 9 && absoluteY > absoluteX * 1.5) {
                gesture.axis = "vertical";
                return false;
            }

            if (absoluteX < 4 || absoluteX <= absoluteY * 1.04) {
                return false;
            }
            gesture.axis = "horizontal";
        }

        if (!gesture.dragging) {
            gesture.dragging = true;
            gesture.moved = true;
            dateRailSuppressClickRef.current = true;
            rail.classList.add("is-dragging");
            window.getSelection()?.removeAllRanges();
        }

        const maximumOffset = Math.min(
            96,
            rail.clientWidth * 0.22,
        );
        const resistance =
            !canShiftBackward && deltaX > 0 ? 0.28 : 1;
        const offset = Math.max(
            -maximumOffset,
            Math.min(maximumOffset, deltaX * resistance),
        );
        rail.style.setProperty(
            "--booking-date-drag-x",
            `${offset}px`,
        );

        return true;
    };

    const finishDateRailGesture = (
        rail: HTMLDivElement,
        pointerId: number,
        clientX: number,
        timestamp: number,
        cancelled = false,
        clickSuppressionDuration = 240,
    ): boolean => {
        const gesture = dateRailGestureRef.current;
        if (!gesture || gesture.pointerId !== pointerId) return false;

        dateRailGestureRef.current = null;
        rail.classList.remove("is-dragging");

        if (!gesture.moved) {
            rail.style.removeProperty("--booking-date-drag-x");
            return false;
        }

        armDateRailClickSuppression(clickSuppressionDuration);

        const deltaX = clientX - gesture.startX;
        const threshold = Math.min(
            38,
            Math.max(14, rail.clientWidth * 0.04),
        );
        const hasRecentVelocity =
            Math.max(0, timestamp - gesture.lastTimestamp) <= 110;
        const isFastSwipe =
            hasRecentVelocity &&
            Math.abs(gesture.velocityX) >= 0.2 &&
            Math.abs(deltaX) >= 6;

        if (
            !cancelled &&
            (Math.abs(deltaX) >= threshold || isFastSwipe)
        ) {
            const direction: -1 | 1 =
                Math.abs(deltaX) >= 3
                    ? deltaX < 0
                        ? 1
                        : -1
                    : gesture.velocityX < 0
                      ? 1
                      : -1;

            shiftDays(direction);
            return true;
        }

        reboundDateRail();
        return true;
    };

    const handleDateRailPointerDown = (
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        if (
            !event.isPrimary ||
            event.pointerType === "touch" ||
            (event.pointerType === "mouse" && event.button !== 0)
        ) {
            return;
        }

        beginDateRailGesture(
            event.pointerId,
            event.clientX,
            event.clientY,
            event.timeStamp,
        );
    };

    const handleDateRailPointerMove = (
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        if (event.pointerType === "touch") return;

        const dragging = updateDateRailGesture(
            event.currentTarget,
            event.pointerId,
            event.clientX,
            event.clientY,
            event.timeStamp,
        );
        if (!dragging) return;

        try {
            if (
                !event.currentTarget.hasPointerCapture(
                    event.pointerId,
                )
            ) {
                event.currentTarget.setPointerCapture(
                    event.pointerId,
                );
            }
        } catch {
            // The rail remains usable while the pointer stays over it.
        }

        event.preventDefault();
    };

    const releaseDateRailPointer = (
        event: ReactPointerEvent<HTMLDivElement>,
        cancelled = false,
    ) => {
        if (event.pointerType === "touch") return;

        try {
            if (
                event.currentTarget.hasPointerCapture(event.pointerId)
            ) {
                event.currentTarget.releasePointerCapture(
                    event.pointerId,
                );
            }
        } catch {
            // A cancelled pointer may release capture before React runs.
        }

        const moved = finishDateRailGesture(
            event.currentTarget,
            event.pointerId,
            event.clientX,
            event.timeStamp,
            cancelled,
        );
        if (moved) event.preventDefault();
    };

    const findNativeTouch = (
        touches: TouchList,
        identifier: number,
    ): Touch | null => {
        for (let index = 0; index < touches.length; index += 1) {
            const touch = touches.item(index);
            if (touch?.identifier === identifier) return touch;
        }
        return null;
    };

    const handleDateRailNativeTouchStart = (event: TouchEvent) => {
        if (event.touches.length !== 1) {
            const rail = dateRailRef.current;
            const gesture = dateRailGestureRef.current;
            if (rail && gesture) {
                finishDateRailGesture(
                    rail,
                    gesture.pointerId,
                    gesture.lastX,
                    event.timeStamp || window.performance.now(),
                    true,
                    480,
                );
            }
            return;
        }

        const touch = event.touches.item(0);
        if (!touch) return;

        beginDateRailGesture(
            touch.identifier,
            touch.clientX,
            touch.clientY,
            event.timeStamp || window.performance.now(),
        );
    };

    const handleDateRailNativeTouchMove = (event: TouchEvent) => {
        const rail = dateRailRef.current;
        const gesture = dateRailGestureRef.current;
        if (!rail || !gesture) return;

        if (event.touches.length !== 1) {
            finishDateRailGesture(
                rail,
                gesture.pointerId,
                gesture.lastX,
                event.timeStamp || window.performance.now(),
                true,
                480,
            );
            return;
        }

        const touch = findNativeTouch(
            event.touches,
            gesture.pointerId,
        );
        if (!touch) return;

        const dragging = updateDateRailGesture(
            rail,
            gesture.pointerId,
            touch.clientX,
            touch.clientY,
            event.timeStamp || window.performance.now(),
        );
        if (dragging && event.cancelable) {
            event.preventDefault();
        }
    };

    const releaseDateRailNativeTouch = (
        event: TouchEvent,
        cancelled = false,
    ) => {
        const rail = dateRailRef.current;
        const gesture = dateRailGestureRef.current;
        if (!rail || !gesture) return;

        const touch = findNativeTouch(
            event.changedTouches,
            gesture.pointerId,
        );
        const moved = finishDateRailGesture(
            rail,
            gesture.pointerId,
            touch?.clientX ?? gesture.lastX,
            event.timeStamp || window.performance.now(),
            cancelled,
            480,
        );
        if (moved && !cancelled && event.cancelable) {
            event.preventDefault();
        }
    };

    dateRailNativeTouchHandlersRef.current = {
        start: handleDateRailNativeTouchStart,
        move: handleDateRailNativeTouchMove,
        end: (event) => releaseDateRailNativeTouch(event),
        cancel: (event) => releaseDateRailNativeTouch(event, true),
    };

    const handleDateRailClickCapture = (
        event: ReactMouseEvent<HTMLDivElement>,
    ) => {
        if (
            !dateRailSuppressClickRef.current ||
            event.detail === 0
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        clearDateRailClickSuppression();
    };

    const handleDateRailWheel = (
        event: ReactWheelEvent<HTMLDivElement>,
    ) => {
        const horizontalDelta =
            Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.8
                ? event.deltaX
                : 0;

        if (horizontalDelta === 0) return;

        const now = event.timeStamp || performance.now();
        const session = dateRailWheelRef.current;

        if (now - session.lastTimestamp > 140) {
            session.delta = 0;
        }
        session.lastTimestamp = now;

        if (now < session.lockedUntil) return;

        session.delta += horizontalDelta;
        if (Math.abs(session.delta) < 48) return;

        const direction: -1 | 1 = session.delta > 0 ? 1 : -1;
        session.delta = 0;
        const shifted = shiftDays(direction);
        session.lockedUntil = now + (shifted ? 340 : 220);
    };

    const shiftCalendarMonth = (direction: -1 | 1) => {
        const current = calendarCommittedStartMonthRef.current;
        const next = new Date(
            current.getFullYear(),
            current.getMonth() + direction * 2,
            1,
        );
        const clampedNext =
            next < minimumCalendarStartMonth
                ? minimumCalendarStartMonth
                : next;
        calendarCommittedStartMonthRef.current = clampedNext;
        setCalendarStartMonth(clampedNext);
    };

    const clearCalendarAnimationHandles = () => {
        calendarTransitionTokenRef.current += 1;
        calendarActiveTransitionRef.current = null;
        if (calendarAnimationFrameRef.current !== null) {
            window.cancelAnimationFrame(
                calendarAnimationFrameRef.current,
            );
            calendarAnimationFrameRef.current = null;
        }
        if (calendarSettleTimerRef.current !== null) {
            window.clearTimeout(calendarSettleTimerRef.current);
            calendarSettleTimerRef.current = null;
        }
    };

    const clearCalendarWheelSession = () => {
        if (calendarWheelSessionTimerRef.current !== null) {
            window.clearTimeout(
                calendarWheelSessionTimerRef.current,
            );
            calendarWheelSessionTimerRef.current = null;
        }
        calendarWheelSessionRef.current = {
            active: false,
            fastForwarded: false,
            hasScrolled: false,
            lastTimestamp: 0,
        };
    };

    const clearCalendarClickSuppression = () => {
        calendarSuppressClickRef.current = false;
        if (calendarSuppressClickTimerRef.current !== null) {
            window.clearTimeout(calendarSuppressClickTimerRef.current);
            calendarSuppressClickTimerRef.current = null;
        }
    };

    const armCalendarClickSuppression = () => {
        calendarSuppressClickRef.current = true;
        if (calendarSuppressClickTimerRef.current !== null) {
            window.clearTimeout(calendarSuppressClickTimerRef.current);
        }
        calendarSuppressClickTimerRef.current = window.setTimeout(() => {
            calendarSuppressClickRef.current = false;
            calendarSuppressClickTimerRef.current = null;
        }, 160);
    };

    const animateCalendarScroll = (
        targetLeft: number,
        direction: -1 | 1 | null = null,
    ) => {
        const viewport = calendarViewportRef.current;
        if (!viewport) {
            pendingCalendarDirectionRef.current = null;
            calendarRecenteringRef.current = false;
            calendarActiveTransitionRef.current = null;
            setCalendarMotion("idle");
            return;
        }

        if (calendarSettleTimerRef.current !== null) {
            window.clearTimeout(calendarSettleTimerRef.current);
            calendarSettleTimerRef.current = null;
        }
        if (calendarAnimationFrameRef.current !== null) {
            window.cancelAnimationFrame(
                calendarAnimationFrameRef.current,
            );
            calendarAnimationFrameRef.current = null;
        }

        const startLeft = viewport.scrollLeft;
        const distance = targetLeft - startLeft;
        const pageWidth = Math.max(1, viewport.clientWidth);
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        const springFrequency = 20;
        const maxVelocity = pageWidth * 2.4;
        const distanceDirection = Math.sign(distance);
        let initialVelocity = Math.max(
            -maxVelocity,
            Math.min(maxVelocity, calendarReleaseVelocityRef.current),
        );

        if (
            distanceDirection !== 0 &&
            initialVelocity * distanceDirection > 0
        ) {
            const noOvershootVelocity =
                Math.abs(distance) * springFrequency * 0.92;
            initialVelocity =
                distanceDirection *
                Math.min(Math.abs(initialVelocity), noOvershootVelocity);
        }
        calendarReleaseVelocityRef.current = 0;

        calendarRecenteringRef.current = true;
        viewport.classList.add("is-recentering");
        setCalendarMotion("settling");

        const transitionToken =
            calendarTransitionTokenRef.current + 1;
        calendarTransitionTokenRef.current = transitionToken;
        let finished = false;
        const complete = () => {
            if (
                finished ||
                calendarActiveTransitionRef.current?.token !==
                    transitionToken
            ) {
                return;
            }

            finished = true;
            if (calendarAnimationFrameRef.current !== null) {
                window.cancelAnimationFrame(
                    calendarAnimationFrameRef.current,
                );
            }
            viewport.scrollLeft = targetLeft;
            calendarAnimationFrameRef.current = null;
            calendarActiveTransitionRef.current = null;

            if (direction !== null) {
                pendingCalendarDirectionRef.current = null;
                shiftCalendarMonth(direction);
                return;
            }

            viewport.classList.remove("is-recentering");
            calendarRecenteringRef.current = false;
            setCalendarMotion("idle");
        };
        calendarActiveTransitionRef.current = {
            token: transitionToken,
            direction,
            finish: complete,
        };

        if (reducedMotion || Math.abs(distance) <= 0.5) {
            complete();
            return;
        }

        const startedAt = window.performance.now();
        const initialDisplacement = startLeft - targetLeft;
        const springCoefficient =
            initialVelocity + springFrequency * initialDisplacement;
        const step = (timestamp: number) => {
            if (
                calendarActiveTransitionRef.current?.token !==
                transitionToken
            ) {
                return;
            }

            const elapsed = Math.max(
                0,
                (timestamp - startedAt) / 1000,
            );
            const decay = Math.exp(-springFrequency * elapsed);
            const displacement =
                (initialDisplacement + springCoefficient * elapsed) *
                decay;
            const velocity =
                (springCoefficient -
                    springFrequency *
                        (initialDisplacement +
                            springCoefficient * elapsed)) *
                decay;

            viewport.scrollLeft = targetLeft + displacement;

            if (
                elapsed < 0.42 &&
                (Math.abs(displacement) > 0.65 ||
                    Math.abs(velocity) > 12)
            ) {
                calendarAnimationFrameRef.current =
                    window.requestAnimationFrame(step);
                return;
            }

            complete();
        };

        calendarAnimationFrameRef.current =
            window.requestAnimationFrame(step);
    };

    const settleCalendarScroll = () => {
        const viewport = calendarViewportRef.current;
        if (
            !viewport ||
            calendarRecenteringRef.current ||
            calendarActiveTransitionRef.current
        ) {
            return;
        }

        if (calendarSettleTimerRef.current !== null) {
            window.clearTimeout(calendarSettleTimerRef.current);
            calendarSettleTimerRef.current = null;
        }

        const pageWidth = viewport.clientWidth;
        if (pageWidth <= 0) {
            pendingCalendarDirectionRef.current = null;
            calendarReleaseVelocityRef.current = 0;
            setCalendarMotion("idle");
            return;
        }

        const offsetFromCenter = viewport.scrollLeft - pageWidth;
        const offsetPages = offsetFromCenter / pageWidth;
        const velocityPages =
            calendarReleaseVelocityRef.current / pageWidth;
        const pendingDirection =
            pendingCalendarDirectionRef.current;
        const snappedDirection = resolveCalendarPageDirection(
            offsetPages,
            velocityPages,
        );
        const direction = pendingDirection ?? snappedDirection;
        const directionAllowed =
            direction === 1 ||
            (direction === -1 && canShiftCalendarBackward);

        pendingCalendarDirectionRef.current = null;

        if (direction !== null && directionAllowed) {
            animateCalendarScroll(
                pageWidth * (1 + direction),
                direction,
            );
            return;
        }

        if (Math.abs(offsetFromCenter) <= 1) {
            calendarReleaseVelocityRef.current = 0;
            setCalendarMotion("idle");
            return;
        }

        animateCalendarScroll(pageWidth);
    };

    const scheduleCalendarScrollSettle = (delay = 48) => {
        if (calendarSettleTimerRef.current !== null) {
            window.clearTimeout(calendarSettleTimerRef.current);
        }
        calendarSettleTimerRef.current = window.setTimeout(
            settleCalendarScroll,
            delay,
        );
    };

    const finishActiveCalendarTransition = () => {
        const activeTransition =
            calendarActiveTransitionRef.current;
        if (!activeTransition) {
            return null;
        }

        flushSync(() => {
            activeTransition.finish();
        });
        return activeTransition;
    };

    const cancelCalendarPointerGesture = () => {
        const gesture = calendarGestureRef.current;
        const viewport = calendarViewportRef.current;
        if (!gesture || !viewport) {
            return;
        }

        calendarGestureRef.current = null;
        if (viewport.hasPointerCapture(gesture.pointerId)) {
            viewport.releasePointerCapture(gesture.pointerId);
        }
        viewport.classList.remove("is-pointer-dragging");
        if (gesture.moved) {
            armCalendarClickSuppression();
        }

        calendarReleaseVelocityRef.current = 0;
        const pageWidth = viewport.clientWidth;
        if (pageWidth > 0) {
            viewport.scrollLeft = pageWidth;
        }
        setCalendarMotion("idle");
    };

    const reconcileOrphanedCalendarScroll = () => {
        const viewport = calendarViewportRef.current;
        if (
            !viewport ||
            calendarActiveTransitionRef.current ||
            calendarRecenteringRef.current
        ) {
            return;
        }

        const pageWidth = viewport.clientWidth;
        if (pageWidth <= 0) {
            return;
        }

        const offsetFromCenter = viewport.scrollLeft - pageWidth;
        if (Math.abs(offsetFromCenter) <= 1) {
            return;
        }

        const offsetPages = offsetFromCenter / pageWidth;
        const orphanedDirection = resolveCalendarPageDirection(
            offsetPages,
            calendarReleaseVelocityRef.current / pageWidth,
        );
        const directionAllowed =
            orphanedDirection === 1 ||
            (orphanedDirection === -1 &&
                calendarCommittedStartMonthRef.current >
                    minimumCalendarStartMonth);

        if (calendarSettleTimerRef.current !== null) {
            window.clearTimeout(calendarSettleTimerRef.current);
            calendarSettleTimerRef.current = null;
        }
        pendingCalendarDirectionRef.current = null;
        calendarReleaseVelocityRef.current = 0;
        calendarRecenteringRef.current = true;
        viewport.classList.add("is-recentering");
        viewport.scrollLeft = pageWidth;
        calendarScrollSampleRef.current = {
            left: pageWidth,
            timestamp: window.performance.now(),
            velocity: 0,
        };
        viewport.classList.remove("is-recentering");
        calendarRecenteringRef.current = false;
        setCalendarMotion("idle");

        if (orphanedDirection !== null && directionAllowed) {
            flushSync(() => {
                shiftCalendarMonth(orphanedDirection);
            });
        }
    };

    const requestCalendarShift = (direction: -1 | 1) => {
        cancelCalendarPointerGesture();

        const finishedTransition =
            finishActiveCalendarTransition();
        reconcileOrphanedCalendarScroll();

        const projectedTargetMonth = addMonths(
            calendarCommittedStartMonthRef.current,
            direction * 2,
        );

        if (
            projectedTargetMonth < minimumCalendarStartMonth ||
            (direction === 1 && !canShiftCalendarForward)
        ) {
            return;
        }

        const viewport = calendarViewportRef.current;
        const pageWidth = viewport?.clientWidth ?? 0;
        if (!viewport || pageWidth <= 0) {
            calendarRecenteringRef.current = true;
            setCalendarMotion("settling");
            shiftCalendarMonth(direction);
            return;
        }

        clearCalendarAnimationHandles();
        calendarReleaseVelocityRef.current = finishedTransition
            ? direction * pageWidth * 1.15
            : 0;
        pendingCalendarDirectionRef.current = direction;
        animateCalendarScroll(
            pageWidth * (1 + direction),
            direction,
        );
    };

    const handleCalendarPointerDown = (
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        if (
            !event.isPrimary ||
            (event.pointerType === "mouse" && event.button !== 0)
        ) {
            return;
        }

        if (event.pointerType === "touch") {
            clearCalendarClickSuppression();
            if (calendarSettleTimerRef.current !== null) {
                window.clearTimeout(
                    calendarSettleTimerRef.current,
                );
                calendarSettleTimerRef.current = null;
            }
            finishActiveCalendarTransition();
            reconcileOrphanedCalendarScroll();
            calendarReleaseVelocityRef.current = 0;
            calendarNativeTouchPointerRef.current =
                event.pointerId;
            return;
        }

        const finishedTransition =
            finishActiveCalendarTransition();

        if (
            !finishedTransition &&
            (pendingCalendarDirectionRef.current !== null ||
                calendarRecenteringRef.current ||
                calendarMotion !== "idle")
        ) {
            clearCalendarAnimationHandles();
            pendingCalendarDirectionRef.current = null;
            calendarRecenteringRef.current = false;
            event.currentTarget.classList.remove(
                "is-recentering",
                "is-pointer-dragging",
            );
            setCalendarMotion("idle");
        }

        clearCalendarClickSuppression();
        calendarReleaseVelocityRef.current = 0;
        calendarGestureRef.current = {
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            startX: event.clientX,
            startY: event.clientY,
            startScrollLeft: event.currentTarget.scrollLeft,
            lastX: event.clientX,
            lastTimestamp: event.timeStamp,
            velocityX: 0,
            moved: false,
            dragging: false,
        };
    };

    const handleCalendarPointerMove = (
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        const gesture = calendarGestureRef.current;
        if (
            !gesture ||
            gesture.pointerId !== event.pointerId
        ) {
            return;
        }

        const deltaX = event.clientX - gesture.startX;
        const deltaY = event.clientY - gesture.startY;
        const absoluteX = Math.abs(deltaX);
        const absoluteY = Math.abs(deltaY);
        const elapsed = Math.max(
            1,
            event.timeStamp - gesture.lastTimestamp,
        );
        const instantVelocity =
            (event.clientX - gesture.lastX) / elapsed;

        gesture.velocityX =
            gesture.velocityX * 0.65 + instantVelocity * 0.35;
        gesture.lastX = event.clientX;
        gesture.lastTimestamp = event.timeStamp;

        if (
            !gesture.dragging &&
            absoluteX < absoluteY * 1.15
        ) {
            return;
        }

        if (!gesture.moved && absoluteX >= 6) {
            gesture.moved = true;
            armCalendarClickSuppression();
            window.getSelection()?.removeAllRanges();
        }

        if (!gesture.dragging) {
            if (absoluteX < 6) {
                return;
            }
            gesture.dragging = true;
            event.currentTarget.classList.add(
                "is-pointer-dragging",
            );
            setCalendarMotion("dragging");
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.setPointerCapture(event.pointerId);
            }
        }

        event.preventDefault();
        event.currentTarget.scrollLeft =
            gesture.startScrollLeft - deltaX;
    };

    const releaseCalendarPointer = (
        event: ReactPointerEvent<HTMLDivElement>,
        cancelled = false,
    ) => {
        if (
            event.pointerType === "touch" &&
            calendarNativeTouchPointerRef.current ===
                event.pointerId
        ) {
            if (cancelled) {
                return;
            }

            calendarNativeTouchPointerRef.current = null;
            scheduleCalendarScrollSettle(96);
            return;
        }

        const gesture = calendarGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) {
            return;
        }

        calendarGestureRef.current = null;
        event.currentTarget.classList.remove(
            "is-pointer-dragging",
        );
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        if (!gesture.moved) {
            return;
        }

        armCalendarClickSuppression();

        if (gesture.dragging) {
            event.preventDefault();
            const releaseAge = Math.max(
                0,
                event.timeStamp - gesture.lastTimestamp,
            );
            calendarReleaseVelocityRef.current =
                cancelled || releaseAge > 90
                    ? 0
                    : -gesture.velocityX * 1000;
            settleCalendarScroll();
        }
    };

    const releaseCalendarNativeTouch = () => {
        if (calendarNativeTouchPointerRef.current === null) {
            return;
        }

        calendarNativeTouchPointerRef.current = null;
        scheduleCalendarScrollSettle(96);
    };

    const handleCalendarWheelCapture = (
        event: ReactWheelEvent<HTMLDivElement>,
    ) => {
        const horizontalIntent =
            Math.abs(event.deltaX) >
            Math.abs(event.deltaY) * 0.75;
        if (!horizontalIntent) {
            return;
        }

        const timestamp =
            event.timeStamp > 0
                ? event.timeStamp
                : window.performance.now();
        const session = calendarWheelSessionRef.current;
        const startsNewSession =
            !session.active ||
            timestamp - session.lastTimestamp > 120;

        if (startsNewSession) {
            session.active = true;
            session.fastForwarded = false;
            session.hasScrolled = false;
        }
        session.lastTimestamp = timestamp;

        if (
            !session.fastForwarded &&
            calendarActiveTransitionRef.current
        ) {
            finishActiveCalendarTransition();
            session.fastForwarded = true;
        }

        if (calendarWheelSessionTimerRef.current !== null) {
            window.clearTimeout(
                calendarWheelSessionTimerRef.current,
            );
        }
        calendarWheelSessionTimerRef.current =
            window.setTimeout(() => {
                calendarWheelSessionTimerRef.current = null;
                calendarWheelSessionRef.current = {
                    active: false,
                    fastForwarded: false,
                    hasScrolled: false,
                    lastTimestamp: 0,
                };
                if (!calendarRecenteringRef.current) {
                    settleCalendarScroll();
                }
            }, 120);
    };

    const handleCalendarScroll = (
        event: ReactUIEvent<HTMLDivElement>,
    ) => {
        if (calendarRecenteringRef.current) {
            return;
        }

        const viewport = event.currentTarget;
        const pageWidth = viewport.clientWidth;
        const timestamp =
            event.timeStamp > 0
                ? event.timeStamp
                : window.performance.now();
        const sample = calendarScrollSampleRef.current;
        const elapsed = timestamp - sample.timestamp;
        if (
            calendarWheelSessionRef.current.active &&
            pageWidth > 0 &&
            Math.abs(viewport.scrollLeft - pageWidth) > 3
        ) {
            calendarWheelSessionRef.current.hasScrolled = true;
        }

        if (sample.timestamp > 0 && elapsed > 0 && elapsed < 120) {
            const instantVelocity =
                ((viewport.scrollLeft - sample.left) / elapsed) * 1000;
            sample.velocity =
                sample.velocity * 0.68 + instantVelocity * 0.32;
        } else {
            sample.velocity = 0;
        }
        sample.left = viewport.scrollLeft;
        sample.timestamp = timestamp;
        calendarReleaseVelocityRef.current = sample.velocity;

        if (
            pageWidth > 0 &&
            Math.abs(viewport.scrollLeft - pageWidth) > 3
        ) {
            armCalendarClickSuppression();
            setCalendarMotion((current) =>
                current === "settling" ? current : "dragging",
            );
        }

        if (
            !calendarGestureRef.current?.dragging &&
            !calendarWheelSessionRef.current.active &&
            calendarNativeTouchPointerRef.current === null
        ) {
            scheduleCalendarScrollSettle(96);
        }
    };

    useEffect(() => {
        if (openPanel !== "calendar") {
            return;
        }

        const viewport = calendarViewportRef.current;
        if (!viewport || !("onscrollend" in viewport)) {
            return;
        }

        const handleScrollEnd = () => {
            if (
                calendarGestureRef.current?.dragging ||
                calendarRecenteringRef.current ||
                calendarNativeTouchPointerRef.current !== null
            ) {
                return;
            }

            if (
                calendarWheelSessionRef.current.active &&
                !calendarWheelSessionRef.current.hasScrolled
            ) {
                return;
            }

            clearCalendarWheelSession();
            settleCalendarScroll();
        };

        viewport.addEventListener("scrollend", handleScrollEnd);
        return () => {
            viewport.removeEventListener(
                "scrollend",
                handleScrollEnd,
            );
        };
    }, [
        calendarStartMonth,
        canShiftCalendarBackward,
        openPanel,
    ]);

    const handleCalendarKeyDown = (
        event: ReactKeyboardEvent<HTMLDivElement>,
    ) => {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            requestCalendarShift(-1);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            requestCalendarShift(1);
        }
    };

    const handleCalendarClickCapture = (
        event: ReactMouseEvent<HTMLDivElement>,
    ) => {
        if (!calendarSuppressClickRef.current || event.detail === 0) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        clearCalendarClickSuppression();
    };

    useEffect(() => {
        if (openPanel === "calendar") {
            return;
        }

        clearCalendarAnimationHandles();
        clearCalendarWheelSession();
        clearCalendarClickSuppression();
        calendarGestureRef.current = null;
        calendarNativeTouchPointerRef.current = null;
        pendingCalendarDirectionRef.current = null;
        calendarRecenteringRef.current = false;
        calendarReleaseVelocityRef.current = 0;
        calendarScrollSampleRef.current = {
            left: 0,
            timestamp: 0,
            velocity: 0,
        };
        setCalendarMotion("idle");
    }, [openPanel]);

    useEffect(
        () => () => {
            clearCalendarAnimationHandles();
            clearCalendarWheelSession();
            clearCalendarClickSuppression();
        },
        [],
    );

    useLayoutEffect(() => {
        if (openPanel !== "calendar") {
            return;
        }

        const viewport = calendarViewportRef.current;
        if (!viewport) {
            return;
        }

        const recenter = () => {
            const pageWidth = viewport.clientWidth;
            if (pageWidth <= 0) {
                return;
            }

            const activeGesture = calendarGestureRef.current;
            if (
                activeGesture &&
                viewport.hasPointerCapture(activeGesture.pointerId)
            ) {
                viewport.releasePointerCapture(activeGesture.pointerId);
            }
            calendarGestureRef.current = null;
            pendingCalendarDirectionRef.current = null;
            calendarReleaseVelocityRef.current = 0;
            viewport.classList.remove("is-pointer-dragging");
            clearCalendarAnimationHandles();

            calendarRecenteringRef.current = true;
            viewport.classList.add("is-recentering");
            viewport.scrollLeft = pageWidth;
            calendarScrollSampleRef.current = {
                left: pageWidth,
                timestamp: window.performance.now(),
                velocity: 0,
            };
            viewport.classList.remove("is-recentering");
            calendarRecenteringRef.current = false;
            setCalendarMotion("idle");
        };

        recenter();
        let observedWidth = viewport.clientWidth;
        const observer =
            typeof ResizeObserver === "function"
                ? new ResizeObserver(() => {
                      const nextWidth = viewport.clientWidth;
                      if (
                          nextWidth <= 0 ||
                          nextWidth === observedWidth
                      ) {
                          return;
                      }
                      observedWidth = nextWidth;

                      const activeTransition =
                          calendarActiveTransitionRef.current;
                      if (activeTransition) {
                          const activeDirection =
                              activeTransition.direction;
                          activeTransition.finish();
                          if (activeDirection !== null) {
                              return;
                          }
                      }

                      recenter();
                  })
                : null;
        observer?.observe(viewport);

        return () => {
            observer?.disconnect();
        };
    }, [calendarStartMonth, openPanel]);

    const selectRailDate = (date: Date) => {
        const next = new Date(date);
        next.setHours(0, 0, 0, 0);
        const dateState = bookingCalendarDateState(
            calendarMetadata,
            dateToStr(next),
        );

        if (next < today || !dateState.bookable) {
            return;
        }

        onDateChange(dateToStr(next));
    };

    const selectCalendarDate = (date: Date) => {
        const next = new Date(date);
        next.setHours(0, 0, 0, 0);
        const dateState = bookingCalendarDateState(
            calendarMetadata,
            dateToStr(next),
        );

        if (next < today || !dateState.bookable) {
            return;
        }

        setVisibleStart(next);
        onDateChange(dateToStr(next));
        closePanel(true);
    };

    const togglePanel = (
        panel: Exclude<OpenPanel, null>,
        trigger: HTMLButtonElement,
    ) => {
        panelTriggerRef.current = trigger;
        if (panel === "calendar") {
            const visibleMonth =
                firstDateOfCalendarPair(visibleStart);
            clearCalendarAnimationHandles();
            clearCalendarWheelSession();
            pendingCalendarDirectionRef.current = null;
            calendarRecenteringRef.current = false;
            setCalendarMotion("idle");
            const nextCalendarStartMonth =
                visibleMonth < minimumCalendarStartMonth
                    ? minimumCalendarStartMonth
                    : visibleMonth;
            calendarCommittedStartMonthRef.current =
                nextCalendarStartMonth;
            setCalendarStartMonth(nextCalendarStartMonth);
        }
        setOpenPanel((current) => (current === panel ? null : panel));
    };

    const toggleStartTime = (time: string) => {
        const next = selectedStartTimes.includes(time)
            ? selectedStartTimes.filter((item) => item !== time)
            : [...selectedStartTimes, time].sort();
        onSelectedStartTimesChange(next);
        onTimePresetChange(next.length ? "custom" : "all");
    };

    return (
        <div id="booking-finder" ref={rootRef} className="booking-finder">
            {openPanel && openPanel !== "calendar" && (
                <button
                    type="button"
                    className="booking-filter-backdrop"
                    aria-label="Tutup panel filter"
                    tabIndex={-1}
                    onClick={() => closePanel(true)}
                />
            )}

            <div className="booking-finder__toolbar">
                <div className="booking-finder__identity">
                    <SlidersHorizontal aria-hidden="true" />
                    <div>
                        <span>Temukan arena</span>
                        <strong>
                            <span className="booking-finder__result-number">
                                {String(resultCount).padStart(2, "0")}
                            </span>
                            <span className="booking-finder__result-unit">
                                arena
                            </span>
                        </strong>
                    </div>
                </div>

                <label className="booking-finder__search">
                    <Search aria-hidden="true" />
                    <input
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                        placeholder="Cari fasilitas atau unit"
                        aria-label="Cari fasilitas atau unit"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => onQueryChange("")}
                            aria-label="Hapus pencarian"
                        >
                            <X aria-hidden="true" />
                        </button>
                    )}
                </label>

                <div className="booking-finder__filter-rail">
                    <div
                        ref={filterRailRef}
                        className="booking-finder__filters"
                        role="group"
                        aria-label="Filter daftar fasilitas"
                        aria-describedby="booking-filter-swipe-instruction"
                    >
                        <div className="booking-filter-control">
                        <button
                            type="button"
                            className={`booking-filter-trigger${category !== "all" ? " is-active" : ""}`}
                            onClick={(event) =>
                                togglePanel("category", event.currentTarget)
                            }
                            aria-expanded={openPanel === "category"}
                            aria-haspopup="dialog"
                            aria-controls="booking-category-filter"
                        >
                            <span>{optionLabel(categories, category, "Semua kategori")}</span>
                            <ChevronDown aria-hidden="true" />
                        </button>
                        {openPanel === "category" && (
                            <div
                                id="booking-category-filter"
                                role="dialog"
                                aria-label="Filter kategori fasilitas"
                                data-lenis-prevent=""
                                data-lenis-prevent-touch=""
                                className={`booking-filter-panel booking-filter-panel--options${positionedPanelClass}`}
                                style={positionedPanelStyle}
                            >
                                <button
                                    type="button"
                                    className="booking-filter-panel__close"
                                    onClick={() => closePanel(true)}
                                    aria-label="Tutup filter kategori"
                                >
                                    <X aria-hidden="true" />
                                </button>
                                <header>
                                    <span>Kategori fasilitas</span>
                                    <small>{categories.length - 1} pilihan</small>
                                </header>
                                <div className="booking-filter-options">
                                    {categories.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            aria-pressed={
                                                category === option.value
                                            }
                                            className={category === option.value ? "is-selected" : ""}
                                            onClick={() => {
                                                onCategoryChange(option.value);
                                                closePanel(true);
                                            }}
                                        >
                                            <span>{option.label}</span>
                                            <small>{String(option.count).padStart(2, "0")}</small>
                                            {category === option.value && <Check aria-hidden="true" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="booking-filter-control">
                        <button
                            type="button"
                            className={`booking-filter-trigger${location !== "all" ? " is-active" : ""}`}
                            onClick={(event) =>
                                togglePanel("location", event.currentTarget)
                            }
                            aria-expanded={openPanel === "location"}
                            aria-haspopup="dialog"
                            aria-controls="booking-location-filter"
                        >
                            <MapPin aria-hidden="true" />
                            <span>{optionLabel(locations, location, "Semua lokasi")}</span>
                            <ChevronDown aria-hidden="true" />
                        </button>
                        {openPanel === "location" && (
                            <div
                                id="booking-location-filter"
                                role="dialog"
                                aria-label="Filter lokasi fasilitas"
                                data-lenis-prevent=""
                                data-lenis-prevent-touch=""
                                className={`booking-filter-panel booking-filter-panel--options${positionedPanelClass}`}
                                style={positionedPanelStyle}
                            >
                                <button
                                    type="button"
                                    className="booking-filter-panel__close"
                                    onClick={() => closePanel(true)}
                                    aria-label="Tutup filter lokasi"
                                >
                                    <X aria-hidden="true" />
                                </button>
                                <header>
                                    <span>Lokasi fasilitas</span>
                                    <small>{locations.length - 1} lokasi</small>
                                </header>
                                <div className="booking-filter-options">
                                    {locations.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            aria-pressed={
                                                location === option.value
                                            }
                                            className={location === option.value ? "is-selected" : ""}
                                            onClick={() => {
                                                onLocationChange(option.value);
                                                closePanel(true);
                                            }}
                                        >
                                            <span>{option.label}</span>
                                            <small>{String(option.count).padStart(2, "0")}</small>
                                            {location === option.value && <Check aria-hidden="true" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="booking-filter-control booking-filter-control--time">
                        <button
                            type="button"
                            className={`booking-filter-trigger${timePreset !== "all" || selectedStartTimes.length ? " is-active" : ""}`}
                            onClick={(event) =>
                                togglePanel("time", event.currentTarget)
                            }
                            aria-expanded={openPanel === "time"}
                            aria-haspopup="dialog"
                            aria-controls="booking-time-filter"
                        >
                            <Clock3 aria-hidden="true" />
                            <span>{timeLabel}</span>
                            <ChevronDown aria-hidden="true" />
                        </button>
                        {openPanel === "time" && (
                            <div
                                id="booking-time-filter"
                                role="dialog"
                                aria-label="Filter slot waktu"
                                data-lenis-prevent=""
                                data-lenis-prevent-touch=""
                                className={`booking-filter-panel booking-filter-panel--time${positionedPanelClass}`}
                                style={positionedPanelStyle}
                            >
                                <button
                                    type="button"
                                    className="booking-filter-panel__close"
                                    onClick={() => closePanel(true)}
                                    aria-label="Tutup filter waktu"
                                >
                                    <X aria-hidden="true" />
                                </button>
                                <header>
                                    <span>Rentang waktu</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelectedStartTimesChange([]);
                                            onTimePresetChange("all");
                                        }}
                                    >
                                        Reset
                                    </button>
                                </header>
                                <p className="booking-time-filter-note">
                                    Daftar arena langsung menyesuaikan waktu yang
                                    Anda pilih.
                                </p>
                                <div className="booking-time-presets">
                                    {TIME_PRESETS.map((preset) => (
                                        <button
                                            key={preset.value}
                                            type="button"
                                            aria-pressed={
                                                timePreset === preset.value &&
                                                selectedStartTimes.length === 0
                                            }
                                            className={
                                                timePreset === preset.value &&
                                                selectedStartTimes.length === 0
                                                    ? "is-selected"
                                                    : ""
                                            }
                                            onClick={() => {
                                                onSelectedStartTimesChange([]);
                                                onTimePresetChange(preset.value);
                                            }}
                                        >
                                            <span>{preset.label}</span>
                                            <small>{preset.meta}</small>
                                        </button>
                                    ))}
                                </div>
                                <div className="booking-time-exact">
                                    <div>
                                        <span>Jam mulai spesifik</span>
                                        <small>Pilih lebih dari satu</small>
                                    </div>
                                    <div className="booking-time-exact__grid">
                                        {TIME_START_OPTIONS.map((time) => (
                                            <button
                                                key={time}
                                                type="button"
                                                aria-pressed={selectedStartTimes.includes(
                                                    time,
                                                )}
                                                className={selectedStartTimes.includes(time) ? "is-selected" : ""}
                                                onClick={() => toggleStartTime(time)}
                                            >
                                                {time.replace(":", ".")}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                        <button
                            type="button"
                            role="switch"
                            aria-checked={availableOnly}
                            className={`booking-availability-toggle${availableOnly ? " is-active" : ""}`}
                            onClick={() => onAvailableOnlyChange(!availableOnly)}
                            aria-label="Tampilkan hanya arena dengan jadwal tersedia"
                        >
                            <span className="booking-availability-toggle__track">
                                <span />
                            </span>
                            <span>Hanya tersedia</span>
                        </button>
                    </div>

                    <span
                        id="booking-filter-swipe-instruction"
                        className="booking-finder__sr-only"
                    >
                        Geser daftar filter secara horizontal untuk melihat
                        pilihan lain.
                    </span>
                    <span
                        className={`booking-finder__swipe-cue${filterRailCueVisible ? " is-visible" : ""}${filterRailCueAtEnd ? " is-backward" : ""}`}
                        aria-hidden="true"
                    >
                        {filterRailCueAtEnd && <ChevronLeft />}
                        <i />
                        {!filterRailCueAtEnd && <ChevronRight />}
                    </span>
                </div>
            </div>

            <div className="booking-date-navigator">
                <div className="booking-filter-control booking-date-navigator__month">
                    <button
                        type="button"
                        className="booking-month-trigger"
                        onClick={(event) =>
                            togglePanel("calendar", event.currentTarget)
                        }
                        aria-expanded={openPanel === "calendar"}
                        aria-haspopup="dialog"
                        aria-controls="booking-calendar-filter"
                        aria-label="Buka kalender reservasi"
                    >
                        <CalendarDays aria-hidden="true" />
                        <span className="booking-month-trigger__copy">
                            <small>Periode</small>
                            <strong>{currentMonthLabel}</strong>
                        </span>
                        <ChevronDown aria-hidden="true" />
                    </button>

                    {openPanel === "calendar" && (
                        <div
                            id="booking-calendar-filter"
                            role="dialog"
                            aria-label="Pilih tanggal reservasi"
                            data-lenis-prevent=""
                            data-lenis-prevent-touch=""
                            className={`booking-filter-panel booking-calendar-panel${secondaryCalendarMonth ? "" : " booking-calendar-panel--single"}${positionedPanelClass}`}
                            style={positionedPanelStyle}
                        >
                            <div className="booking-calendar-panel__nav">
                                <span>(Pilih tanggal)</span>
                                <div className="booking-calendar-panel__actions">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            requestCalendarShift(-1)
                                        }
                                        disabled={
                                            !canShiftCalendarBackward
                                        }
                                        aria-label="Periode dua bulan sebelumnya"
                                    >
                                        <ChevronLeft aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            requestCalendarShift(1)
                                        }
                                        disabled={
                                            !canShiftCalendarForward
                                        }
                                        aria-label="Periode dua bulan berikutnya"
                                    >
                                        <ChevronRight aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className="booking-calendar-panel__close"
                                        onClick={() => closePanel(true)}
                                        aria-label="Tutup kalender"
                                    >
                                        <X aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                            <div
                                ref={calendarViewportRef}
                                className={`booking-calendar-panel__viewport is-${calendarMotion}`}
                                role="group"
                                aria-roledescription="carousel kalender dua bulan"
                                aria-label={`${monthNames[calendarStartMonth.getMonth()]} ${calendarStartMonth.getFullYear()} hingga ${monthNames[secondaryCalendarMonth.getMonth()]} ${secondaryCalendarMonth.getFullYear()}`}
                                tabIndex={0}
                                onPointerDownCapture={
                                    handleCalendarPointerDown
                                }
                                onPointerMoveCapture={
                                    handleCalendarPointerMove
                                }
                                onPointerUpCapture={
                                    releaseCalendarPointer
                                }
                                onPointerCancelCapture={(event) =>
                                    releaseCalendarPointer(event, true)
                                }
                                onLostPointerCapture={(event) =>
                                    releaseCalendarPointer(event, true)
                                }
                                onTouchEndCapture={
                                    releaseCalendarNativeTouch
                                }
                                onTouchCancelCapture={
                                    releaseCalendarNativeTouch
                                }
                                onDragStart={(event) =>
                                    event.preventDefault()
                                }
                                onWheelCapture={
                                    handleCalendarWheelCapture
                                }
                                onScroll={handleCalendarScroll}
                                onKeyDown={handleCalendarKeyDown}
                                onClickCapture={handleCalendarClickCapture}
                            >
                                <div className="booking-calendar-panel__track">
                                    {([-1, 0, 1] as const).map(
                                        (pageOffset) => {
                                            const pageStartMonth =
                                                addMonths(
                                                    calendarStartMonth,
                                                    pageOffset * 2,
                                                );
                                            const pageSecondaryMonth =
                                                addMonths(
                                                    pageStartMonth,
                                                    1,
                                                );
                                            const interactive =
                                                pageOffset === 0;

                                            return (
                                                <div
                                                    key={pageOffset}
                                                    className="booking-calendar-panel__page"
                                                    aria-hidden={
                                                        !interactive
                                                    }
                                                >
                                                    <div className="booking-calendar-panel__months">
                                                        <CalendarMonthGrid
                                                            monthDate={
                                                                pageStartMonth
                                                            }
                                                            selectedDate={
                                                                selectedDate
                                                            }
                                                            today={today}
                                                            calendarMetadata={
                                                                calendarMetadata
                                                            }
                                                            interactive={
                                                                interactive
                                                            }
                                                            onSelect={
                                                                selectCalendarDate
                                                            }
                                                        />
                                                        <CalendarMonthGrid
                                                            monthDate={
                                                                pageSecondaryMonth
                                                            }
                                                            selectedDate={
                                                                selectedDate
                                                            }
                                                            today={today}
                                                            calendarMetadata={
                                                                calendarMetadata
                                                            }
                                                            secondary
                                                            interactive={
                                                                interactive
                                                            }
                                                            onSelect={
                                                                selectCalendarDate
                                                            }
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        },
                                    )}
                                </div>
                            </div>
                            <span
                                className="booking-calendar-panel__announcement"
                                role="status"
                                aria-live="polite"
                            >
                                {`${monthNames[calendarStartMonth.getMonth()]} hingga ${monthNames[secondaryCalendarMonth.getMonth()]} ${secondaryCalendarMonth.getFullYear()}`}
                            </span>
                        </div>
                    )}
                </div>

                <div
                    ref={dateRailRef}
                    className="booking-date-rail"
                    data-lenis-prevent-touch=""
                    role="group"
                    aria-roledescription="carousel tanggal"
                    aria-label="Tanggal reservasi"
                    onPointerDownCapture={handleDateRailPointerDown}
                    onPointerMoveCapture={handleDateRailPointerMove}
                    onPointerUpCapture={releaseDateRailPointer}
                    onPointerCancelCapture={(event) =>
                        releaseDateRailPointer(event, true)
                    }
                    onLostPointerCapture={(event) =>
                        releaseDateRailPointer(event, true)
                    }
                    onClickCapture={handleDateRailClickCapture}
                    onWheel={handleDateRailWheel}
                    style={
                        {
                            "--booking-visible-days": Math.max(
                                1,
                                days.length,
                            ),
                        } as CSSProperties
                    }
                >
                    {days.map((date, index) => {
                        const dateStr = dateToStr(date);
                        const active = value === dateStr;
                        const isToday = sameDay(date, today);
                        const isPast = date < today;
                        const datePolicy = bookingCalendarDateState(
                            calendarMetadata,
                            dateStr,
                        );
                        const policyClosed =
                            !datePolicy.bookable &&
                            datePolicy.reason !== "past";
                        const isRedDate =
                            datePolicy.isSunday ||
                            Boolean(datePolicy.holiday?.isRedDate);
                        const previousDate = index > 0 ? days[index - 1] : null;
                        const startsNewMonth =
                            date.getDate() === 1 ||
                            (previousDate !== null &&
                                date.getMonth() !== previousDate.getMonth());
                        const keepsDateContext =
                            isToday || index === 0 || startsNewMonth;
                        const availability = dateSummaries[dateStr];
                        const availabilityPending =
                            !policyClosed &&
                            availability?.state === "loading";
                        const availabilityRefreshing =
                            !policyClosed &&
                            availability?.state === "refreshing";
                        const availabilityLabel = policyClosed
                            ? datePolicy.reason === "date_closed"
                                ? "Tutup"
                                : "Belum dibuka"
                            : !availability
                              ? null
                              : availability.state === "loading"
                              ? "Memeriksa"
                            : availability.closed
                              ? "Tutup"
                              : availability.state === "error" &&
                                  !availability.stale
                                ? "Periksa lagi"
                                : availability.state === "idle"
                                  ? null
                                  : `${availability.availableSlots} jadwal`;
                        const ariaAvailability = policyClosed
                            ? bookingCalendarReasonLabel(datePolicy.reason)
                            : !availability
                            ? "ketersediaan belum diperiksa"
                            : availability.state === "loading"
                              ? "ketersediaan sedang diperiksa"
                            : availability.state === "refreshing"
                              ? `${availability.availableFacilities} arena dan ${availability.availableSlots} jadwal tersedia dari data sementara, sedang diperbarui`
                            : availability.closed
                              ? "reservasi tutup"
                              : availability.state === "error" &&
                                  !availability.stale
                                ? "ketersediaan gagal diperbarui"
                                : `${availability.availableFacilities} arena dan ${availability.availableSlots} jadwal tersedia`;

                        return (
                            <button
                                key={dateStr}
                                type="button"
                                onClick={() => selectRailDate(date)}
                                disabled={isPast || policyClosed}
                                data-booking-date={dateStr}
                                className={`booking-date-card${active ? " is-active" : ""}${availabilityPending ? " is-availability-loading" : ""}${availabilityRefreshing ? " is-availability-refreshing" : ""}${policyClosed || availability?.closed ? " is-closed" : ""}${isRedDate ? " is-red-date" : ""}${datePolicy.holiday ? " is-holiday" : ""}${availability?.stale && availability.state === "error" ? " is-stale" : ""}`}
                                aria-pressed={active}
                                aria-label={`${active ? "Dipilih, " : "Pilih "}${accessibleDateLabel(date)}${datePolicy.holiday ? `, ${datePolicy.holiday.name}` : ""}, ${ariaAvailability}`}
                                title={
                                    datePolicy.holiday
                                        ? datePolicy.holiday.name
                                        : undefined
                                }
                            >
                                <span className="booking-date-card__weekday">
                                    {dayNames[date.getDay()]}
                                </span>
                                <strong>{String(date.getDate()).padStart(2, "0")}</strong>
                                <span
                                    className={`booking-date-card__footer${availabilityLabel ? " has-availability" : ""}${keepsDateContext ? " has-date-context" : ""}`}
                                >
                                    <small>
                                        {isToday
                                            ? "Hari ini"
                                            : monthShortNames[date.getMonth()]}
                                    </small>
                                    {availabilityLabel && (
                                        <em>{availabilityLabel}</em>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="booking-date-navigator__arrows">
                    <button
                        type="button"
                        onClick={() => shiftDays(-1)}
                        disabled={!canShiftBackward}
                        aria-label="Tanggal sebelumnya"
                    >
                        <ChevronLeft aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => shiftDays(1)}
                        disabled={!canShiftForward}
                        aria-label="Tanggal berikutnya"
                    >
                        <ChevronRight aria-hidden="true" />
                    </button>
                </div>
            </div>

            {activeFilters.length > 0 && (
                <div
                    className="booking-finder__active-filters"
                    aria-label="Filter aktif"
                >
                    <span>(Filter aktif)</span>
                    <div data-lenis-prevent-touch="">
                        {activeFilters.map((filter) => (
                            <button
                                key={filter.id}
                                type="button"
                                onClick={filter.onClear}
                                aria-label={`Hapus filter ${filter.label}`}
                            >
                                <span>{filter.label}</span>
                                <X aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="booking-finder__reset-all"
                        onClick={() => {
                            onReset();
                            closePanel();
                        }}
                    >
                        Reset semua
                    </button>
                </div>
            )}

            <div
                className={`booking-finder__status${!selectedDateClosed && selectedAvailability?.state === "loading" ? " is-loading" : ""}${!selectedDateClosed && selectedAvailability?.state === "refreshing" ? " is-refreshing" : ""}${!selectedDateClosed && selectedAvailability?.state === "error" ? " is-error" : ""}${selectedDateClosed ? " is-closed" : ""}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                <p>
                    {selectedDateClosed ? (
                        <>
                            {bookingCalendarReasonLabel(
                                selectedCalendarDateState.reason,
                            )}
                            .
                        </>
                    ) : selectedAvailability?.state === "loading" ? (
                        <>Memeriksa jadwal seluruh arena...</>
                    ) : selectedAvailability?.state === "error" &&
                      !selectedAvailability.stale ? (
                        <>Ketersediaan belum dapat diperbarui.</>
                    ) : selectedAvailability?.closed ? (
                        <>Reservasi tutup pada tanggal ini.</>
                    ) : selectedAvailability ? (
                        <>
                            <strong>
                                {selectedAvailability.availableFacilities}
                            </strong>{" "}
                            arena ·{" "}
                            <strong>{selectedAvailability.availableSlots}</strong>{" "}
                            jadwal tersedia
                        </>
                    ) : (
                        <>
                            <strong>{resultCount}</strong> dari {totalCount} arena
                            sesuai pilihan
                        </>
                    )}
                </p>
                {!selectedDateClosed &&
                    selectedAvailability?.state === "refreshing" && (
                    <span className="booking-finder__refresh-note">
                        Memperbarui
                    </span>
                )}
                {!selectedDateClosed &&
                    selectedAvailability?.state === "error" &&
                    !selectedAvailability.stale && (
                    <button type="button" onClick={onRetryAvailability}>
                        Periksa lagi
                    </button>
                    )}
                {!selectedDateClosed &&
                    selectedAvailability?.state === "error" &&
                    selectedAvailability.stale && (
                        <button type="button" onClick={onRetryAvailability}>
                            Perbarui data
                        </button>
                    )}
                {selectedCalendarDateState.holiday && (
                    <span className="booking-finder__holiday-status">
                        {selectedCalendarDateState.holiday.name}
                    </span>
                )}
                {slotFilterActive && (
                    <span className="booking-finder__slot-status">
                        Daftar arena mengikuti waktu yang dipilih
                    </span>
                )}
                {activeFilterCount > 0 && (
                    <span>
                        {resultCount} tampil · {activeFilterCount} filter
                    </span>
                )}
            </div>
        </div>
    );
}
