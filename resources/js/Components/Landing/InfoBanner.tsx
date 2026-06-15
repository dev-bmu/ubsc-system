import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";

const ANNOUNCEMENTS_FALLBACK = [
    "Jadwal Zumba 10.00-12.00 ✦ Jadwal Aerobik Saat ini Sedang Tutup",
    "Dapatkan Diskon 20% untuk Pendaftaran Member Tahunan Bulan Ini",
    "UB Sport Center Buka Setiap Hari: 06.00 - 21.00 WIB",
];

export default function InfoBanner() {
    const { announcements } = usePage<PageProps>().props;
    const messages =
        announcements && announcements.length > 0
            ? announcements
            : ANNOUNCEMENTS_FALLBACK;

    const [index, setIndex] = useState(0);

    useEffect(() => {
        setIndex(0);
    }, [messages.length]);

    useEffect(() => {
        const timer = setInterval(() => {
            setIndex((prev) => (prev + 1) % messages.length);
        }, 4000);
        return () => clearInterval(timer);
    }, [messages.length]);

    return (
        <div className="fixed top-0 left-0 right-0 z-[55] h-8 w-full bg-[#252525] border-b border-white/10 flex items-center justify-center overflow-hidden px-4">
            <AnimatePresence mode="wait">
                <motion.p
                    key={index}
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -15, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="font-clash font-semibold text-[11px] lg:text-[16px] text-white/80 tracking-wide text-center"
                >
                    {messages[index]}
                </motion.p>
            </AnimatePresence>
        </div>
    );
}
