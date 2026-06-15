import SectionDivider from "@/Components/Landing/SectionDivider";
import ServiceCard from "@/Components/About/ServiceCard";
import aboutcard1 from "../../../assets/images/aboutcard1.avif";
import aboutcard2 from "../../../assets/images/aboutcard2.avif";
import aboutcard3 from "../../../assets/images/aboutcard3.avif";
import aboutcard4 from "../../../assets/images/aboutcard4.avif";

interface ServiceItem {
    id: number;
    numberString: string;
    title: string;
    subtitle: string;
    image: string;
}

const DUMMY_SERVICES: ServiceItem[] = [
    {
        id: 1,
        numberString: "001",
        title: "Pusat Layanan Pengguna",
        subtitle: "Layanan ramah dan responsif",
        image: aboutcard1,
    },
    {
        id: 2,
        numberString: "002",
        title: "Fasilitas Peminjaman Olahraga",
        subtitle: "Alat lengkap dan terawat",
        image: aboutcard2,
    },
    {
        id: 3,
        numberString: "003",
        title: "Bimbingan Pelatih Olahraga",
        subtitle: "Pendamping latihan profesional",
        image: aboutcard3,
    },
    {
        id: 4,
        numberString: "004",
        title: "Penyelenggaraan Event Sport",
        subtitle: "Event tertata dan sukses",
        image: aboutcard4,
    },
];

export default function AboutServices() {
    return (
        <section className="w-full bg-white" id="about-services">
            <div className="mx-auto max-w px-6 py-8 sm:px-10 sm:py-12 lg:px-16 lg:pt-16 xl:px-24 xl:pt-24">
                <SectionDivider
                    number="03"
                    title="Sorotan"
                    subtitle="02 aboutpage"
                    theme="light"
                />

                <div className="mt-10 grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
                    <div className="xl:col-span-3">
                        <div className="flex items-center gap-2">
                            <div className="h-[17px] w-[17px] flex-shrink-0 rounded bg-[#FF0000]" />
                            <span className="font-bdo font-normal text-[clamp(1rem,1.25vw,24px)] text-black">
                                Layanan Unggulan
                            </span>
                        </div>
                    </div>

                    <div className="xl:col-span-6">
                        <h2 className="font-bdo font-medium text-[clamp(2rem,2.7vw,52px)] leading-[1.1] tracking-[-0.017em] text-black xl:text-center">
                            Mendukung Kebutuhan Aktivitas Olahraga Anda
                        </h2>
                    </div>

                    <div className="xl:col-span-3 xl:pt-2">
                        <p className="font-bdo font-normal text-[clamp(1rem,1.04vw,20px)] leading-relaxed text-black/70">
                            Beragam layanan pendukung kami hadir untuk
                            memberikan kenyamanan terbaik bagi pengguna.
                        </p>
                    </div>
                </div>

                <div className="mt-16 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {DUMMY_SERVICES.map((service, i) => (
                        <ServiceCard
                            key={service.id}
                            index={i}
                            numberString={service.numberString}
                            title={service.title}
                            subtitle={service.subtitle}
                            image={service.image}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
