import HeroBottomBar from "@/Components/Landing/HeroBottomBar";
import GymTrafficBadge from "@/Components/Landing/GymTrafficBadge";
import AnimatedBookingLink from "@/Components/News/AnimatedBookingLink";
import bg from "@/../assets/images/bg-herobooking.avif";

export default function BookingHero() {
    return (
        <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute left-0 right-0 top-0 h-[45vh] overflow-hidden xl:hidden">
                <img
                    src={bg}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-cover object-center"
                />
            </div>
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 top-[45vh] bg-black xl:hidden" />
            <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/2 overflow-hidden xl:block">
                <img
                    src={bg}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-cover object-center"
                />
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-black xl:block" />

            <section
                className="relative w-full h-screen min-h-[700px] grid grid-rows-[45vh_1fr] xl:grid-rows-1 xl:grid-cols-2"
                id="booking-hero"
            >
                <div className="relative flex flex-col justify-end">
                    <div className="relative z-10 p-8 pb-12 xl:p-12 xl:pb-16">
                        <img
                            src="/assets/hero/star.png"
                            alt=""
                            aria-hidden
                            className="mb-4 h-12 w-12 xl:h-16 xl:w-16"
                        />
                        <h1 className="font-bdo font-medium text-[clamp(2rem,2.7vw,52px)] leading-[1.1] tracking-[-0.017em] text-white">
                            Booking Sekarang
                        </h1>
                    </div>
                </div>

                <div className="flex flex-col justify-center overflow-hidden px-8 py-12 xl:px-20 xl:py-20">
                    <h2 className="font-archivo font-extrabold text-[clamp(2rem,2.7vw,52px)] leading-[1.1] tracking-[-0.017em] text-white">
                        Fasilitas Terbaik Kami
                    </h2>

                    <p className="font-bdo font-light text-[clamp(0.875rem,0.94vw,18px)] text-white/70 mt-6 max-w-lg leading-relaxed">
                        Mengenal lebih dekat cerita, nilai, dan dedikasi kami{" "}
                        <span className="font-medium text-white">
                            dalam menghadirkan layanan olahraga terbaik untuk
                            semua kalangan.
                        </span>
                    </p>

                    <div className="flex flex-col gap-4 mt-12">
                        <AnimatedBookingLink
                            label="Booking sekarang juga!"
                            href="/coming-soon"
                        />
                        <GymTrafficBadge />
                    </div>
                </div>
            </section>

            <HeroBottomBar
                variant="transparent"
                sectionNumber="06/"
                sectionLabel="bookingpage"
                description="Temukan fasilitas terbaik dan booking sesi latihan Anda dengan mudah."
                targetId="booking-content"
                showVideo={false}
            />
        </div>
    );
}
