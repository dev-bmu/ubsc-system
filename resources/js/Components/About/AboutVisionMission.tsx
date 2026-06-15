import SectionDivider from "@/Components/Landing/SectionDivider";
import AccordionItem from "@/Components/About/AccordionItem";
import visionImage from "@/../assets/images/vission.avif";
interface VisionItem {
    id: number;
    number: string;
    title: string;
    badgeText: string;
    bigNumber: string;
    bigNumberLabel: string;
    innerHeading: string;
    redLabel: string;
    description: string;
    image: string;
    initialIsOpen?: boolean;
}

const DUMMY_VISIONS: VisionItem[] = [
    {
        id: 1,
        number: "01",
        title: "Profil Kami dan Arah Pengembangan",
        badgeText: "Eksistensi",
        bigNumber: "01",
        bigNumberLabel: "Progresif",
        innerHeading:
            "Tempat Di Mana Dedikasi Bertemu Dengan Fasilitas Berkualitas dan Terbaik",
        redLabel: "Prioritas Kami",
        description:
            "UB Sport Center merupakan pusat olahraga milik Universitas Brawijaya yang dikelola oleh PT Brawijaya Multi Usaha, kami selalu berfokus pada peningkatan layanan, kualitas fasilitas, dan kenyamanan pengguna. Pengembangan diarahkan secara terstruktur, adaptif, dan berkelanjutan.",
        image: visionImage,
        initialIsOpen: true,
    },
    {
        id: 2,
        number: "02",
        title: "Visi Menuju Masa Depan",
        badgeText: "Visi Kami",
        bigNumber: "02",
        bigNumberLabel: "Berkelanjutan",
        innerHeading:
            "Komitmen Kami dalam Mendukung Aktivitas Olahraga Berkualitas",
        redLabel: "Komitmen Kami",
        description:
            "Menjadi perusahaan yang sehat, Profesional, dan Berkinerja Unggul sebagai penopang utama pendapatan Universitas Brawijaya. Pada diri UB Sport Center ditanamkan untuk selalu berkomitmen dalam menghadirkan lingkungan olahraga yang profesional dan nyaman melalui pengelolaan fasilitas yang optimal.",
        image: visionImage
    },
    {
        id: 3,
        number: "03",
        title: "Misi Untuk Kemajuan",
        badgeText: "Misi Kami",
        bigNumber: "03",
        bigNumberLabel: "Implementasi",
        innerHeading:
            "Mewujudkan Lingkungan Olahraga yang Kompetitif, Suportif, dan Berstandar Tinggi",
        redLabel: "Standar Kami",
        description:
            "(1) Mempunyai Performa Bisnis yang Sehat. (2) SDM yang Berintegritas dan Dikelola secara Profesional. (3) Memiliki Kinerja Unggul di Level Nasional dan Internasional. (4) Berjejaring dan Berkolaborasi dengan Segenap Stakeholder. (5) Sebagai Kontributor Utama Pendapatan Universitas Brawijaya.",
        image: visionImage,
    },
];

export default function AboutVisionMission() {
    return (
        <section className="w-full bg-[#F5F7F9]" id="about-vision">
            <div className="mx-auto max-w px-6 py-8 sm:px-10 sm:py-12 lg:px-16 lg:pt-16 xl:px-24 xl:pt-24">
                <SectionDivider
                    number="04"
                    title="Visi & Misi"
                    subtitle="02 aboutpage"
                    theme="light"
                />

                <div className="mt-10 mb-16 grid grid-cols-1 gap-8 xl:grid-cols-12">
                    <div className="xl:col-span-4">
                        <div className="flex items-center gap-2">
                            <div className="h-[17px] w-[17px] flex-shrink-0 rounded bg-[#FF0000]" />
                            <span className="font-bdo font-normal text-[clamp(1rem,1.25vw,24px)] text-black">
                                Visi &amp; Misi
                            </span>
                        </div>
                    </div>

                    <div className="xl:col-span-8">
                        <h2 className="font-bdo font-medium text-[clamp(2rem,2.7vw,52px)] leading-[1.1] tracking-[-0.017em]text-black">
                            Menetapkan Arah dan Tujuan Perjalanan Perusahaan
                        </h2>
                    </div>
                </div>

                <div className="flex flex-col border-t border-black/10">
                    {DUMMY_VISIONS.map((item) => (
                        <AccordionItem
                            key={item.id}
                            number={item.number}
                            title={item.title}
                            badgeText={item.badgeText}
                            bigNumber={item.bigNumber}
                            bigNumberLabel={item.bigNumberLabel}
                            innerHeading={item.innerHeading}
                            redLabel={item.redLabel}
                            description={item.description}
                            image={item.image}
                            initialIsOpen={item.initialIsOpen}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
