import { useState } from "react";
import { motion } from "framer-motion";
import FaqItem from "@/Components/About/FaqItem";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import supportImage from "@/../assets/images/person map.avif";

interface FaqItemData {
    id: number;
    number: string;
    question: string;
    answer: string;
}

const DUMMY_FAQS: FaqItemData[] = [
    {
        id: 1,
        number: "01",
        question: "Siapa saja yang dapat menggunakan fasilitas UB Sport Center?",
        answer: "UB Sport Center dapat digunakan oleh sivitas akademika Universitas Brawijaya maupun masyarakat umum. Setiap pengguna wajib mengikuti ketentuan penggunaan fasilitas serta melakukan pemesanan sesuai prosedur yang telah ditetapkan.",
    },
    {
        id: 2,
        number: "02",
        question: "Bagaimana cara melakukan pemesanan fasilitas?",
        answer: "Pemesanan fasilitas dilakukan melalui website resmi UB Sport Center dengan memilih jenis fasilitas, jadwal penggunaan, dan durasi pemakaian. Setelah melakukan pemesanan, pengguna diwajibkan menyelesaikan proses pembayaran agar reservasi dapat dikonfirmasi.",
    },
    {
        id: 3,
        number: "03",
        question: "Apakah pemesanan harus dilakukan terlebih dahulu?",
        answer: "Ya, pemesanan harus dilakukan terlebih dahulu melalui sistem untuk memastikan ketersediaan fasilitas, mengatur jadwal penggunaan secara tertib, serta menghindari terjadinya benturan jadwal antar pengguna.",
    },
    {
        id: 4,
        number: "04",
        question: "Metode pembayaran apa saja yang tersedia?",
        answer: "Kami menerima berbagai metode pembayaran termasuk tunai, transfer bank, dan pembayaran digital (QRIS, e-wallet).",
    },
    {
        id: 5,
        number: "05",
        question: "Apakah jadwal penggunaan dapat diubah atau dibatalkan?",
        answer: "Perubahan atau pembatalan jadwal penggunaan dapat dilakukan sesuai dengan kebijakan yang berlaku. Ketentuan terkait batas waktu, syarat, dan kemungkinan pengembalian dana dapat dilihat pada halaman syarat dan ketentuan.",
    },
    {
        id: 6,
        number: "06",
        question: "Apakah UB Sport Center melayani kegiatan atau event?",
        answer: "UB Sport Center melayani penggunaan fasilitas untuk kegiatan olahraga, pelatihan, kompetisi, maupun event tertentu, baik dari lingkungan Universitas Brawijaya maupun pihak eksternal, dengan pengajuan dan persetujuan sesuai prosedur yang berlaku.",
    },
];

export default function AboutSectionFaq() {
    const [activeId, setActiveId] = useState<number | null>(null);

    const handleToggle = (id: number) => {
        setActiveId((current) => (current === id ? null : id));
    };

    return (
        <section className="w-full bg-white" id="about-faq">
            <div className="mx-auto w-full px-[clamp(1.5rem,4.5vw,5.5rem)] py-14 sm:py-16 lg:py-20 xl:py-[5.9rem]">
                <SectionDivider
                    number="05"
                    title="Bantuan"
                    subtitle="02 aboutpage"
                    theme="light"
                    outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                    contentClassName="px-3"
                />

                <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-[405px_minmax(0,1fr)] lg:gap-[68px] xl:mt-[4.8rem] xl:grid-cols-[405px_minmax(0,1fr)] xl:gap-[68px]">
                    <div className="lg:sticky lg:top-24 lg:self-start">
                        <ScrollTextReveal
                            as="h2"
                            split="block"
                            delay={80}
                            className="about-vision-text-safe font-bdo text-[clamp(2.25rem,5.3vw,3.1rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-black lg:text-[clamp(2.65rem,2.75vw,3.18rem)]"
                        >
                            FAQ &amp; Bantuan
                        </ScrollTextReveal>
                        <ScrollTextReveal
                            as="p"
                            split="words"
                            stagger={12}
                            delay={180}
                            className="about-vision-text-safe mt-6 max-w-[520px] font-bdo text-[clamp(0.98rem,1.06vw,1.26rem)] font-normal leading-[1.28] tracking-[-0.01em] text-black/38"
                        >
                            UB Sport Center berkomitmen untuk menghadirkan
                            lingkungan yang profesional dan nyaman melalui.
                        </ScrollTextReveal>

                        <div className="mt-14 flex items-end gap-4 sm:mt-[4.5rem] lg:mt-[7.45rem]">
                            <motion.div
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.55 }}
                                transition={{
                                    duration: 0.72,
                                    delay: 0.18,
                                    ease: [0.16, 1, 0.3, 1],
                                }}
                                className="h-[50px] w-[50px] overflow-hidden"
                            >
                                <img
                                    src={supportImage}
                                    alt=""
                                    aria-hidden="true"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                    draggable={false}
                                />
                            </motion.div>
                            <ScrollTextReveal
                                as="span"
                                delay={260}
                                className="about-vision-text-safe pb-[2px] font-bdo text-[clamp(0.88rem,0.9vw,0.98rem)] font-semibold leading-none text-black/45"
                            >
                                Bantuan Pengunjung
                            </ScrollTextReveal>
                        </div>
                    </div>

                    <div className="flex flex-col">
                        {DUMMY_FAQS.map((faq, index) => (
                            <FaqItem
                                key={faq.id}
                                isOpen={activeId === faq.id}
                                onToggle={() => handleToggle(faq.id)}
                                number={faq.number}
                                question={faq.question}
                                answer={faq.answer}
                                revealDelay={120 + index * 55}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
