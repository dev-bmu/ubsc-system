import {
    CalendarDays,
    Check,
    Clock3,
    Copy,
    Plus,
    Sparkles,
    Trash2,
    X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import "./ScheduleSlotEditor.css";

export const SCHEDULE_WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
] as const;

export type ScheduleWeekday = (typeof SCHEDULE_WEEKDAYS)[number];
export type WeeklyScheduleSlots = Record<string, string[]>;

const DAY_LABELS: Record<ScheduleWeekday, { full: string; short: string }> = {
    Monday: { full: "Senin", short: "Sen" },
    Tuesday: { full: "Selasa", short: "Sel" },
    Wednesday: { full: "Rabu", short: "Rab" },
    Thursday: { full: "Kamis", short: "Kam" },
    Friday: { full: "Jumat", short: "Jum" },
    Saturday: { full: "Sabtu", short: "Sab" },
    Sunday: { full: "Minggu", short: "Min" },
};

const QUICK_TIMES = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

export function createEmptyWeeklySchedule(): WeeklyScheduleSlots {
    return SCHEDULE_WEEKDAYS.reduce<WeeklyScheduleSlots>((schedule, day) => {
        schedule[day] = [];
        return schedule;
    }, {});
}

function isValidTime(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;

    const [hour, minute] = value.split(":").map(Number);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function normalizeTimes(times: unknown): string[] {
    if (!Array.isArray(times)) return [];

    return Array.from(new Set(times.filter(isValidTime))).sort((left, right) => left.localeCompare(right));
}

function normalizeSchedule(value: WeeklyScheduleSlots | null | undefined): WeeklyScheduleSlots {
    return SCHEDULE_WEEKDAYS.reduce<WeeklyScheduleSlots>((schedule, day) => {
        schedule[day] = normalizeTimes(value?.[day]);
        return schedule;
    }, {});
}

function nextTime(time: string): { hour: string; minute: string } {
    const [hour, minute] = time.split(":").map(Number);
    const next = Math.min((23 * 60) + 55, (hour * 60) + minute + 60);

    return {
        hour: String(Math.floor(next / 60)).padStart(2, "0"),
        minute: String(next % 60).padStart(2, "0"),
    };
}

interface ScheduleSlotEditorProps {
    value: WeeklyScheduleSlots | null;
    onChange: (value: WeeklyScheduleSlots) => void;
    error?: string;
    className?: string;
}

export default function ScheduleSlotEditor({
    value,
    onChange,
    error,
    className,
}: ScheduleSlotEditorProps) {
    const [activeDay, setActiveDay] = useState<ScheduleWeekday>("Monday");
    const [draftHour, setDraftHour] = useState("06");
    const [draftMinute, setDraftMinute] = useState("00");
    const schedule = useMemo(() => normalizeSchedule(value), [value]);
    const activeSlots = schedule[activeDay] ?? [];
    const activeDayCount = SCHEDULE_WEEKDAYS.filter((day) => schedule[day].length > 0).length;
    const totalSlotCount = SCHEDULE_WEEKDAYS.reduce((total, day) => total + schedule[day].length, 0);
    const draftTime = `${draftHour}:${draftMinute}`;
    const draftAlreadyExists = activeSlots.includes(draftTime);

    const updateDay = (day: ScheduleWeekday, times: string[]) => {
        onChange({
            ...schedule,
            [day]: normalizeTimes(times),
        });
    };

    const addTime = (time: string) => {
        if (!isValidTime(time) || activeSlots.includes(time)) return;

        updateDay(activeDay, [...activeSlots, time]);
        const next = nextTime(time);
        setDraftHour(next.hour);
        setDraftMinute(next.minute);
    };

    const removeTime = (time: string) => {
        updateDay(activeDay, activeSlots.filter((slot) => slot !== time));
    };

    const copyToDays = (days: readonly ScheduleWeekday[]) => {
        const copied = [...activeSlots];
        onChange(SCHEDULE_WEEKDAYS.reduce<WeeklyScheduleSlots>((next, day) => {
            next[day] = days.includes(day) ? [...copied] : [...schedule[day]];
            return next;
        }, {}));
    };

    return (
        <section className={cn("schedule-studio", className)} data-testid="schedule-slot-editor">
            <div className="schedule-studio__glow" aria-hidden="true" />

            <header className="schedule-studio__header">
                <div className="schedule-studio__identity">
                    <span className="schedule-studio__mark" aria-hidden="true">
                        <CalendarDays size={20} />
                    </span>
                    <div>
                        <span className="schedule-studio__eyebrow">Jadwal operasional</span>
                        <h3>Susun waktu dalam satu kanvas.</h3>
                        <p>Pilih hari, tentukan jam mulai, lalu sistem merapikan urutannya otomatis.</p>
                    </div>
                </div>

                <div className="schedule-studio__summary" aria-live="polite">
                    <span><strong>{activeDayCount}</strong><small>hari aktif</small></span>
                    <i aria-hidden="true" />
                    <span><strong>{totalSlotCount}</strong><small>slot tersedia</small></span>
                </div>
            </header>

            <div className="schedule-studio__day-rail" role="tablist" aria-label="Pilih hari operasional">
                {SCHEDULE_WEEKDAYS.map((day) => {
                    const selected = activeDay === day;
                    const slotCount = schedule[day].length;

                    return (
                        <button
                            key={day}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setActiveDay(day)}
                            className={cn(
                                "schedule-studio__day",
                                selected && "is-active",
                                slotCount > 0 && "has-slots",
                            )}
                        >
                            <span className="schedule-studio__day-name">
                                <span className="schedule-studio__day-full">{DAY_LABELS[day].full}</span>
                                <span className="schedule-studio__day-short">{DAY_LABELS[day].short}</span>
                            </span>
                            <span className="schedule-studio__day-state">
                                {slotCount > 0 ? `${slotCount} waktu` : "Libur"}
                            </span>
                            {slotCount > 0 && (
                                <span className="schedule-studio__day-check" aria-hidden="true">
                                    <Check size={9} strokeWidth={3} />
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="schedule-studio__workspace">
                <div className="schedule-studio__timeline">
                    <div className="schedule-studio__section-heading">
                        <div>
                            <span>Agenda hari ini</span>
                            <h4>{DAY_LABELS[activeDay].full}</h4>
                        </div>
                        <span className={cn("schedule-studio__status", activeSlots.length > 0 && "is-open")}>
                            <i aria-hidden="true" />
                            {activeSlots.length > 0 ? `${activeSlots.length} waktu aktif` : "Sedang libur"}
                        </span>
                    </div>

                    {activeSlots.length > 0 ? (
                        <ol className="schedule-studio__slot-list" aria-label={`Jadwal ${DAY_LABELS[activeDay].full}`}>
                            {activeSlots.map((time, index) => (
                                <li key={time} className="schedule-studio__slot">
                                    <span className="schedule-studio__slot-index">{String(index + 1).padStart(2, "0")}</span>
                                    <span className="schedule-studio__slot-line" aria-hidden="true" />
                                    <span className="schedule-studio__slot-time">{time}</span>
                                    <span className="schedule-studio__slot-note">waktu mulai</span>
                                    <button
                                        type="button"
                                        onClick={() => removeTime(time)}
                                        className="schedule-studio__remove"
                                        aria-label={`Hapus jam ${time} pada ${DAY_LABELS[activeDay].full}`}
                                    >
                                        <X size={14} />
                                    </button>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <div className="schedule-studio__empty">
                            <span aria-hidden="true"><Clock3 size={22} /></span>
                            <div>
                                <strong>Belum ada waktu untuk {DAY_LABELS[activeDay].full}.</strong>
                                <p>Tambahkan waktu dari panel di samping untuk membuka hari ini.</p>
                            </div>
                        </div>
                    )}

                    <div className="schedule-studio__utility">
                        <button type="button" onClick={() => copyToDays(SCHEDULE_WEEKDAYS.slice(0, 5))} disabled={activeSlots.length === 0}>
                            <Copy size={13} aria-hidden="true" /> Salin ke hari kerja
                        </button>
                        <button type="button" onClick={() => copyToDays(SCHEDULE_WEEKDAYS)} disabled={activeSlots.length === 0}>
                            <Copy size={13} aria-hidden="true" /> Salin ke semua hari
                        </button>
                        <button type="button" onClick={() => updateDay(activeDay, [])} disabled={activeSlots.length === 0} className="is-danger">
                            <Trash2 size={13} aria-hidden="true" /> Jadikan libur
                        </button>
                    </div>
                </div>

                <aside className="schedule-studio__composer">
                    <div className="schedule-studio__composer-heading">
                        <span className="schedule-studio__composer-icon" aria-hidden="true"><Sparkles size={15} /></span>
                        <div><span>Tambah waktu</span><strong>{DAY_LABELS[activeDay].full}</strong></div>
                    </div>

                    <div className="schedule-studio__time-builder">
                        <label>
                            <span>Jam</span>
                            <select value={draftHour} onChange={(event) => setDraftHour(event.target.value)} aria-label="Pilih jam">
                                {HOUR_OPTIONS.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
                            </select>
                        </label>
                        <b aria-hidden="true">:</b>
                        <label>
                            <span>Menit</span>
                            <select value={draftMinute} onChange={(event) => setDraftMinute(event.target.value)} aria-label="Pilih menit">
                                {MINUTE_OPTIONS.map((minute) => <option key={minute} value={minute}>{minute}</option>)}
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => addTime(draftTime)}
                            disabled={draftAlreadyExists}
                            className="schedule-studio__add"
                            aria-label={draftAlreadyExists ? `Jam ${draftTime} sudah tersedia` : `Tambahkan jam ${draftTime}`}
                        >
                            <Plus size={18} />
                            <span>{draftAlreadyExists ? "Sudah ada" : "Tambahkan"}</span>
                        </button>
                    </div>

                    <div className="schedule-studio__quick-heading">
                        <span>Pilihan cepat</span>
                        <small>sentuh untuk tambah atau hapus</small>
                    </div>
                    <div className="schedule-studio__quick-grid" aria-label="Pilihan waktu cepat">
                        {QUICK_TIMES.map((time) => {
                            const exists = activeSlots.includes(time);
                            return (
                                <button
                                    key={time}
                                    type="button"
                                    onClick={() => exists ? removeTime(time) : addTime(time)}
                                    className={cn(exists && "is-selected")}
                                    aria-pressed={exists}
                                >
                                    <span>{time}</span>
                                    {exists ? <Check size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                                </button>
                            );
                        })}
                    </div>

                    <p className="schedule-studio__hint">
                        Waktu selesai mengikuti durasi harga yang berlaku pada fasilitas atau unit.
                    </p>
                </aside>
            </div>

            {error && <p className="schedule-studio__error" role="alert">{error}</p>}
        </section>
    );
}
