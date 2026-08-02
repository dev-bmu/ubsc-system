import { useMemo } from "react";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export interface BookingCalendarMonth {
    key: string;
    year: number;
    month: number;
    isOpen: boolean;
    closedDates: string[];
}

export interface BookingCalendarHoliday {
    date: string;
    name: string;
    type: "national" | "collective_leave" | "other";
    isRedDate: boolean;
}

export interface BookingCalendarMetadata {
    locale: string;
    timezone: string;
    weekStartsOn: number;
    weekendDays: number[];
    minDate: string;
    maxDate: string | null;
    defaultDate: string;
    firstOpenMonth: string | null;
    lastOpenMonth: string | null;
    revision: string | null;
    hasSchedulePolicy: boolean;
    months: Record<string, BookingCalendarMonth>;
    holidays: Record<string, BookingCalendarHoliday>;
    endpoint: string | null;
}

export type BookingCalendarClosureReason =
    | "past"
    | "outside_window"
    | "month_closed"
    | "date_closed"
    | null;

export interface BookingCalendarDateState {
    date: string;
    bookable: boolean;
    reason: BookingCalendarClosureReason;
    holiday: BookingCalendarHoliday | null;
    isSunday: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseLocalDate(value: string): Date {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function dateToString(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

function lastDateOfMonth(key: string): string | null {
    if (!MONTH_PATTERN.test(key)) return null;
    const [year, month] = key.split("-").map(Number);
    return dateToString(new Date(year, month, 0));
}

export function monthKeyForDate(value: string | Date): string {
    if (value instanceof Date) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
    }

    return value.slice(0, 7);
}

function normalizeType(
    value: unknown,
): BookingCalendarHoliday["type"] {
    if (
        value === "collective_leave" ||
        value === "cuti_bersama" ||
        value === "collective"
    ) {
        return "collective_leave";
    }

    if (value === "national" || value === "national_holiday") {
        return "national";
    }

    return "other";
}

function normalizeHoliday(
    value: unknown,
    fallbackDate?: string,
): BookingCalendarHoliday | null {
    if (typeof value === "string" && fallbackDate && DATE_PATTERN.test(fallbackDate)) {
        return {
            date: fallbackDate,
            name: value.trim() || "Hari libur nasional",
            type: "national",
            isRedDate: true,
        };
    }

    if (!isRecord(value)) return null;
    const date =
        typeof value.date === "string" && DATE_PATTERN.test(value.date)
            ? value.date
            : fallbackDate;
    if (!date || !DATE_PATTERN.test(date)) return null;

    const rawName =
        typeof value.name === "string"
            ? value.name
            : typeof value.label === "string"
              ? value.label
              : typeof value.title === "string"
                ? value.title
                : "";

    return {
        date,
        name: rawName.trim() || "Hari libur nasional",
        type: normalizeType(value.type ?? value.kind),
        isRedDate:
            typeof value.is_red_date === "boolean"
                ? value.is_red_date
                : typeof value.isRedDate === "boolean"
                  ? value.isRedDate
                  : true,
    };
}

function normalizeHolidays(value: unknown): Record<string, BookingCalendarHoliday> {
    const holidays: Record<string, BookingCalendarHoliday> = {};

    if (Array.isArray(value)) {
        value.forEach((item) => {
            const holiday = normalizeHoliday(item);
            if (holiday) holidays[holiday.date] = holiday;
        });
        return holidays;
    }

    if (!isRecord(value)) return holidays;
    Object.entries(value).forEach(([date, item]) => {
        const holiday = normalizeHoliday(item, date);
        if (holiday) holidays[holiday.date] = holiday;
    });

    return holidays;
}

function normalizeClosedDates(value: unknown, monthKey: string): string[] {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value.filter(
                (date): date is string =>
                    typeof date === "string" &&
                    DATE_PATTERN.test(date) &&
                    date.startsWith(`${monthKey}-`),
            ),
        ),
    ).sort();
}

function normalizeMonth(
    value: unknown,
    fallbackKey?: string,
): BookingCalendarMonth | null {
    if (typeof value === "boolean" && fallbackKey && MONTH_PATTERN.test(fallbackKey)) {
        const [year, month] = fallbackKey.split("-").map(Number);
        return {
            key: fallbackKey,
            year,
            month,
            isOpen: value,
            closedDates: [],
        };
    }

    if (!isRecord(value)) return null;
    const numericYear =
        typeof value.year === "number" && Number.isInteger(value.year)
            ? value.year
            : null;
    const numericMonth =
        typeof value.month === "number" && Number.isInteger(value.month)
            ? value.month
            : null;
    const candidateKey =
        typeof value.key === "string"
            ? value.key
            : typeof value.month_key === "string"
              ? value.month_key
              : numericYear && numericMonth
                ? `${numericYear}-${String(numericMonth).padStart(2, "0")}`
                : fallbackKey;

    if (!candidateKey || !MONTH_PATTERN.test(candidateKey)) return null;
    const [year, month] = candidateKey.split("-").map(Number);
    if (month < 1 || month > 12) return null;

    const isOpen =
        typeof value.is_open === "boolean"
            ? value.is_open
            : typeof value.isOpen === "boolean"
              ? value.isOpen
              : false;

    return {
        key: candidateKey,
        year,
        month,
        isOpen,
        closedDates: normalizeClosedDates(
            value.closed_dates ?? value.closedDates,
            candidateKey,
        ),
    };
}

function normalizeMonths(value: unknown): Record<string, BookingCalendarMonth> {
    const months: Record<string, BookingCalendarMonth> = {};

    if (Array.isArray(value)) {
        value.forEach((item) => {
            const month = normalizeMonth(item);
            if (month) months[month.key] = month;
        });
        return months;
    }

    if (!isRecord(value)) return months;
    Object.entries(value).forEach(([key, item]) => {
        const month = normalizeMonth(item, key);
        if (month) months[month.key] = month;
    });

    return months;
}

function unwrapPayload(value: unknown): Record<string, unknown> | null {
    if (!isRecord(value)) return null;

    if (isRecord(value.booking_calendar)) return value.booking_calendar;
    if (isRecord(value.calendar)) return value.calendar;
    if (isRecord(value.data)) {
        if (isRecord(value.data.booking_calendar)) {
            return value.data.booking_calendar;
        }
        return value.data;
    }

    return value;
}

export function normalizeBookingCalendar(
    value: unknown,
    fallbackToday: string,
): BookingCalendarMetadata {
    const source = unwrapPayload(value);
    const windowPayload = isRecord(source?.window) ? source.window : null;
    const normalizedToday = DATE_PATTERN.test(fallbackToday)
        ? fallbackToday
        : dateToString(new Date());
    const monthsValue = source?.months ?? source?.schedules;
    const months = normalizeMonths(monthsValue);
    const explicitOpenMonths = Array.isArray(source?.open_months)
        ? new Set(
              source.open_months.filter(
                  (month): month is string =>
                      typeof month === "string" && MONTH_PATTERN.test(month),
              ),
          )
        : null;
    if (explicitOpenMonths) {
        Object.values(months).forEach((month) => {
            month.isOpen = explicitOpenMonths.has(month.key);
        });
    }
    const monthKeys = Object.keys(months).sort();
    const hasSchedulePolicy =
        source !== null &&
        (Object.prototype.hasOwnProperty.call(source, "months") ||
            Object.prototype.hasOwnProperty.call(source, "schedules"));
    const rawMinDate =
        windowPayload?.min_date ??
        windowPayload?.minDate ??
        source?.min_date ??
        source?.minDate;
    const rawMaxDate =
        windowPayload?.max_date ??
        windowPayload?.maxDate ??
        source?.max_date ??
        source?.maxDate;
    const minDate =
        typeof rawMinDate === "string" && DATE_PATTERN.test(rawMinDate)
            ? rawMinDate
            : normalizedToday;
    const derivedMaxDate =
        monthKeys.length > 0
            ? lastDateOfMonth(monthKeys[monthKeys.length - 1])
            : null;
    const maxDate =
        typeof rawMaxDate === "string" && DATE_PATTERN.test(rawMaxDate)
            ? rawMaxDate
            : rawMaxDate === null
              ? null
              : derivedMaxDate;
    const endpoint =
        typeof source?.endpoint === "string"
            ? source.endpoint
            : typeof source?.url === "string"
              ? source.url
              : null;
    const rawDefaultDate =
        windowPayload?.default_date ??
        windowPayload?.defaultDate ??
        source?.default_date ??
        source?.defaultDate;
    const defaultDate =
        typeof rawDefaultDate === "string" &&
        DATE_PATTERN.test(rawDefaultDate)
            ? rawDefaultDate
            : minDate;
    const rawFirstOpenMonth =
        windowPayload?.first_open_month ??
        windowPayload?.firstOpenMonth ??
        source?.first_open_month;
    const rawLastOpenMonth =
        windowPayload?.last_open_month ??
        windowPayload?.lastOpenMonth ??
        source?.last_open_month;
    const firstOpenMonth =
        typeof rawFirstOpenMonth === "string" &&
        MONTH_PATTERN.test(rawFirstOpenMonth)
            ? rawFirstOpenMonth
            : null;
    const lastOpenMonth =
        typeof rawLastOpenMonth === "string" &&
        MONTH_PATTERN.test(rawLastOpenMonth)
            ? rawLastOpenMonth
            : null;
    const weekendDays = Array.isArray(source?.weekend_days)
        ? source.weekend_days.filter(
              (day): day is number =>
                  typeof day === "number" &&
                  Number.isInteger(day) &&
                  day >= 0 &&
                  day <= 6,
          )
        : [0];

    return {
        locale:
            typeof source?.locale === "string" ? source.locale : "id-ID",
        timezone:
            typeof source?.timezone === "string"
                ? source.timezone
                : "Asia/Jakarta",
        weekStartsOn:
            typeof source?.week_starts_on === "number" &&
            Number.isInteger(source.week_starts_on)
                ? source.week_starts_on
                : 1,
        weekendDays: weekendDays.length > 0 ? weekendDays : [0],
        minDate,
        maxDate,
        defaultDate,
        firstOpenMonth,
        lastOpenMonth,
        revision:
            typeof (source?.schedule_revision ?? source?.revision) ===
                "string" ||
            typeof (source?.schedule_revision ?? source?.revision) ===
                "number"
                ? String(source?.schedule_revision ?? source?.revision)
                : null,
        hasSchedulePolicy,
        months,
        holidays: normalizeHolidays(
            source?.holidays ?? source?.public_holidays,
        ),
        endpoint,
    };
}

export function bookingCalendarDateState(
    metadata: BookingCalendarMetadata,
    date: string,
): BookingCalendarDateState {
    const parsed = DATE_PATTERN.test(date) ? parseLocalDate(date) : null;
    const holiday = metadata.holidays[date] ?? null;
    const isSunday = parsed?.getDay() === 0;

    if (!parsed || date < metadata.minDate) {
        return { date, bookable: false, reason: "past", holiday, isSunday };
    }
    if (metadata.maxDate && date > metadata.maxDate) {
        return {
            date,
            bookable: false,
            reason: "outside_window",
            holiday,
            isSunday,
        };
    }

    if (metadata.hasSchedulePolicy) {
        const month = metadata.months[monthKeyForDate(date)];
        if (!month?.isOpen) {
            return {
                date,
                bookable: false,
                reason: "month_closed",
                holiday,
                isSunday,
            };
        }
        if (month.closedDates.includes(date)) {
            return {
                date,
                bookable: false,
                reason: "date_closed",
                holiday,
                isSunday,
            };
        }
    }

    return { date, bookable: true, reason: null, holiday, isSunday };
}

export function bookingCalendarReasonLabel(
    reason: BookingCalendarClosureReason,
): string {
    switch (reason) {
        case "past":
            return "Tanggal telah berlalu";
        case "outside_window":
            return "Jadwal belum dibuka";
        case "month_closed":
            return "Reservasi bulan ini belum dibuka";
        case "date_closed":
            return "Reservasi ditutup pada tanggal ini";
        default:
            return "";
    }
}

export function openBookingMonthKeys(
    metadata: BookingCalendarMetadata,
): string[] {
    if (!metadata.hasSchedulePolicy) return [];

    return Object.values(metadata.months)
        .filter((month) => month.isOpen)
        .map((month) => month.key)
        .sort();
}

export default function useBookingCalendar(
    initialPayload: unknown,
    synchronizedPayload: unknown,
    fallbackToday: string,
) {
    const metadata = useMemo(
        () =>
            normalizeBookingCalendar(
                synchronizedPayload ?? initialPayload,
                fallbackToday,
            ),
        [fallbackToday, initialPayload, synchronizedPayload],
    );

    const openMonthKeys = useMemo(
        () => openBookingMonthKeys(metadata),
        [metadata],
    );

    return {
        metadata,
        openMonthKeys,
    };
}
