import axios from "axios";
import { useState } from "react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import BookingListItem, { type BookingFacility } from "./BookingListItem";

interface FacilityPrice {
    id: number;
    user_category: string;
    label: string;
    price: number;
    notes?: string | null;
}

interface FacilityUnit {
    id: number;
    name: string;
    image: string;
}

interface BackendFacility {
    id: number;
    name: string;
    slug: string;
    image: string;
    category: string;
    location?: string | null;
    venue_type?: string | null;
    class_code?: string | null;
    rating?: number | null;
    display_metadata?: Record<string, unknown> | null;
    prices?: FacilityPrice[];
    units?: FacilityUnit[];
}

interface Props {
    facilities?: BackendFacility[];
}

interface ApiSlot {
    start_time: string;
    end_time: string;
    label: string;
    price: string;
    status: "available" | "booked";
    remaining: number;
    facility_unit_id?: number | null;
}

const slotKeyFor = (facilityId: number, facilityUnitId?: number | null) =>
    `${facilityId}:${facilityUnitId ?? "parent"}`;

function todayStr(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export default function BookingSection({ facilities = [] }: Props) {
    const [openId, setOpenId] = useState<string>("");
    const [selectedDates, setSelectedDates] = useState<Record<string, string>>(
        {},
    );
    const [slots, setSlots] = useState<Record<string, ApiSlot[]>>({});
    const [loadingSlot, setLoadingSlot] = useState<Record<string, boolean>>({});
    const [slotError, setSlotError] = useState<Record<string, string | null>>(
        {},
    );
    const [selectedUnits, setSelectedUnits] = useState<Record<string, number | null>>({});

    const fetchSlots = async (
        facilityId: number,
        date: string,
        facilityUnitId?: number | null,
    ) => {
        const key = slotKeyFor(facilityId, facilityUnitId);
        setLoadingSlot((p) => ({ ...p, [key]: true }));
        setSlotError((p) => ({ ...p, [key]: null }));
        try {
            const res = await axios.get(route("booking.slots"), {
                params: {
                    facility_id: facilityId,
                    date,
                    ...(facilityUnitId ? { facility_unit_id: facilityUnitId } : {}),
                },
            });
            if (res.data.closed) {
                setSlotError((p) => ({
                    ...p,
                    [key]:
                        res.data.reason === "month_closed"
                            ? "Bulan ini belum dibuka untuk reservasi."
                            : "Fasilitas tutup pada tanggal ini.",
                }));
                setSlots((p) => ({ ...p, [key]: [] }));
            } else if (res.data.requires_unit) {
                setSlotError((p) => ({
                    ...p,
                    [key]: "Pilih unit fasilitas untuk melihat jadwal.",
                }));
                setSlots((p) => ({ ...p, [key]: [] }));
            } else {
                setSlots((p) => ({ ...p, [key]: res.data.slots }));
            }
        } catch {
            setSlotError((p) => ({
                ...p,
                [key]: "Gagal memuat jadwal. Coba lagi.",
            }));
        } finally {
            setLoadingSlot((p) => ({ ...p, [key]: false }));
        }
    };

    const handleToggle = (item: BookingFacility) => {
        const isOpening = openId !== item.id;
        setOpenId(isOpening ? item.id : "");
        if (isOpening) {
            const key = String(item.facilityId);
            const date = selectedDates[key] ?? todayStr();
            const nextUnitId =
                item.selectedUnitId ?? item.units[0]?.id ?? null;

            if (nextUnitId && selectedUnits[key] !== nextUnitId) {
                setSelectedUnits((p) => ({ ...p, [key]: nextUnitId }));
            }

            fetchSlots(item.facilityId, date, nextUnitId);
        }
    };

    const handleDateChange = (item: BookingFacility, date: string) => {
        const key = String(item.facilityId);
        setSelectedDates((p) => ({ ...p, [key]: date }));
        const unitId = item.selectedUnitId ?? item.units[0]?.id ?? null;
        fetchSlots(item.facilityId, date, unitId);
    };

    const handleUnitChange = (item: BookingFacility, unitId: number) => {
        const key = String(item.facilityId);
        setSelectedUnits((p) => ({ ...p, [key]: unitId }));
        fetchSlots(item.facilityId, selectedDates[key] ?? todayStr(), unitId);
    };

    const bookingsData: BookingFacility[] = facilities.map((f, idx) => {
        const key = String(f.id);
        const units = f.units ?? [];
        const selectedUnitId = selectedUnits[key] ?? units[0]?.id ?? null;
        const apiSlots = slots[slotKeyFor(f.id, selectedUnitId)] ?? [];
        return {
            id: String(idx + 1).padStart(2, "0"),
            facilityId: f.id,
            title: `/${f.name}`,
            code: f.class_code ?? `/Arena ${String(idx + 1).padStart(3, "0")}/`,
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location ?? "Veteran",
            badgeType: f.venue_type ?? f.category,
            units,
            selectedUnitId,
            availableSlots: apiSlots.map((s) => ({
                time: s.label,
                price: s.price,
                status: s.status,
                facilityUnitId: s.facility_unit_id ?? null,
            })),
        };
    });

    return (
        <section className="bg-white overflow-x-clip" id="booking-content">
            <div className="mx-auto max-w px-6 pt-8 sm:px-10 sm:pt-12 lg:px-16 xl:px-24 xl:pt-10">
                <SectionDivider
                    number="01"
                    title="Reservasi Disini"
                    subtitle="01 bookingpage"
                    theme="light"
                />
            </div>
            <div className="mx-auto max-w px-6 sm:px-10 lg:px-16 xl:px-24">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mt-16 mb-16">
                    <div className="lg:col-span-3">
                        <div className="flex items-center gap-3">
                            <div className="size-[17px] rounded-[5px] bg-accent-red flex-shrink-0" />
                            <span className="font-bdo font-normal text-[clamp(1rem,1.25vw,24px)] text-black">
                                Reservasi Lewat Website
                            </span>
                        </div>
                    </div>
                    <div className="lg:col-span-9">
                        <h2 className="font-bdo font-medium text-[clamp(2rem,2.7vw,52px)] leading-[1.1] tracking-[-0.021em] text-black">
                            Booking fasilitas olahraga terbaik kami kapan saja,
                            langsung dari website.{" "}
                            <span style={{ color: "#ABABAB" }}>
                                Pilih jadwal, pilih fasilitas,
                            </span>{" "}
                            selesai dalam hitungan menit.
                        </h2>
                    </div>
                </div>

                <div className="flex flex-col w-full border-t border-gray-200">
                    {bookingsData.map((item) => {
                        const dateKey = String(item.facilityId);
                        const slotKey = slotKeyFor(item.facilityId, item.selectedUnitId);
                        return (
                            <BookingListItem
                                key={item.id}
                                item={item}
                                isOpen={openId === item.id}
                                onToggle={() => handleToggle(item)}
                                selectedDate={selectedDates[dateKey] ?? todayStr()}
                                onDateChange={(date) =>
                                    handleDateChange(item, date)
                                }
                                onUnitChange={(unitId) =>
                                    handleUnitChange(item, unitId)
                                }
                                loadingSlots={loadingSlot[slotKey] ?? false}
                                slotError={slotError[slotKey] ?? null}
                            />
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
