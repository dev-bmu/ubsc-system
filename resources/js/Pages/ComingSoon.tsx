import { motion } from "framer-motion";
import { Link, Head } from "@inertiajs/react";
import bola from "@/../assets/images/bola ubsc.avif";

export default function ComingSoon() {
    return (
        <>
            <Head>
                <title>Segera Hadir — UB Sport Center</title>
            </Head>

            <div className="relative h-screen w-full overflow-hidden bg-[#020202] select-none text-white">
                {/* 1. BACKGROUND EFFECT: Biru Misterius #0369B3 */}
                <div className="absolute inset-0 z-0 overflow-hidden">
                    {/* Glow Utama Kanan Atas */}
                    <motion.div 
                        animate={{ 
                            scale: [1, 1.2, 1],
                            opacity: [0.4, 0.7, 0.4],
                            x: [0, 30, 0],
                            y: [0, -30, 0]
                        }}
                        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute -right-[5%] -top-[10%] h-[100vh] w-[100vh] rounded-full bg-[#0369B3]/40 blur-[120px] lg:blur-[180px]" 
                    />

                    {/* Glow Pendukung Kiri Bawah */}
                    <motion.div 
                        animate={{ 
                            scale: [1.2, 1, 1.2],
                            opacity: [0.2, 0.4, 0.2] 
                        }}
                        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                        className="absolute -left-[10%] -bottom-[10%] h-[70vh] w-[70vh] rounded-full bg-[#0369B3]/20 blur-[100px]" 
                    />
                </div>

                {/* 2. FLOATING PARTICLES (Efek Debu Mewah) */}
                <div className="absolute inset-0 z-10 pointer-events-none">
                    {[...Array(15)].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{ 
                                opacity: 0, 
                                x: Math.random() * 100 + "%", 
                                y: Math.random() * 100 + "%" 
                            }}
                            animate={{ 
                                y: ["-10%", "110%"],
                                opacity: [0, 0.4, 0] 
                            }}
                            transition={{ 
                                duration: Math.random() * 10 + 15, 
                                repeat: Infinity, 
                                delay: Math.random() * 10 
                            }}
                            className="absolute h-1 w-1 rounded-full bg-blue-200/40 blur-[1px]"
                        />
                    ))}
                </div>

                {/* 3. NOISE TEXTURE (Kesan Premium) */}
                <div className="pointer-events-none absolute inset-0 z-20 opacity-[0.05] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app')]" />

                {/* 4. MAIN CONTENT LAYER */}
                <div className="relative z-30 flex h-full flex-col justify-between px-8 py-10 lg:px-20 lg:py-16">
                    
                    {/* Header Info */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 2.2, duration: 1 }}
                    >
                        <p className="font-bdo text-[10px] uppercase tracking-[0.4em] text-white/50 lg:text-xs">
                            Official UB Sport Center
                        </p>
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 2.5, duration: 1 }}
                            className="mt-4 max-w-[280px] font-bdo text-sm font-light leading-relaxed text-gray-300 lg:max-w-md lg:text-lg"
                        >
                            Kami sedang meracik sesuatu yang <span className="text-[#0369B3] font-semibold">superior</span>. Nantikan pengalamannya segera.
                        </motion.p>
                    </motion.div>

                    {/* TITLE SECTION: Responsive & No Overflow */}
                    <div className="flex flex-col overflow-hidden lg:overflow-visible py-4">
                        <motion.h1
                            initial={{ y: "100%", skewY: 7, opacity: 0 }}
                            animate={{ y: 0, skewY: 0, opacity: 1 }}
                            transition={{ duration: 1.2, delay: 1.8, ease: [0.16, 1, 0.3, 1] }}
                            className="font-clash font-extrabold leading-[0.8] tracking-tighter text-white text-[clamp(3.5rem,14vw,16rem)]"
                        >
                            COMING
                        </motion.h1>

                        <div className="flex items-center gap-1 sm:gap-3 lg:gap-5">
                            <motion.h1
                                initial={{ y: "100%", skewY: 7, opacity: 0 }}
                                animate={{ y: 0, skewY: 0, opacity: 1 }}
                                transition={{ duration: 1.2, delay: 2, ease: [0.16, 1, 0.3, 1] }}
                                className="font-clash font-extrabold leading-[0.8] tracking-tighter text-white text-[clamp(3.5rem,14vw,16rem)]"
                            >
                                SO
                            </motion.h1>

                            {/* Bola Animation */}
                            <motion.div
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: "spring", delay: 2.2, stiffness: 80 }}
                                className="relative flex items-center justify-center"
                            >
                                <motion.img
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                                    src={bola}
                                    alt="bola"
                                    className="w-[11vw] min-w-[3.5rem] max-w-[12rem] object-contain drop-shadow-[0_0_40px_rgba(3,105,179,0.5)]"
                                    draggable={false}
                                />
                            </motion.div>

                            <motion.h1
                                initial={{ y: "100%", skewY: 7, opacity: 0 }}
                                animate={{ y: 0, skewY: 0, opacity: 1 }}
                                transition={{ duration: 1.2, delay: 2.1, ease: [0.16, 1, 0.3, 1] }}
                                className="font-clash font-extrabold leading-[0.8] tracking-tighter text-white text-[clamp(3.5rem,14vw,16rem)]"
                            >
                                N!
                            </motion.h1>
                        </div>
                    </div>

                    {/* Footer Navigation */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 2.8 }}
                        className="flex items-center justify-between"
                    >
                        <Link
                            href="/"
                            className="group flex items-center gap-3 font-bdo text-[10px] font-medium uppercase tracking-widest text-gray-500 transition-colors hover:text-white lg:text-xs"
                        >
                            <span className="h-px w-6 bg-gray-800 transition-all group-hover:w-10 group-hover:bg-white" />
                            Kembali ke Beranda
                        </Link>
                        
                        <div className="hidden md:block text-[10px] text-white/20 uppercase tracking-[0.3em] font-bdo">
                            Est. 2026 — UB Sport Center
                        </div>
                    </motion.div>
                </div>

                {/* 5. LUXURY PRELOADER OVERLAY */}
                <motion.div
                    initial={{ y: 0 }}
                    animate={{ y: "-100%" }}
                    transition={{ duration: 1.2, delay: 1.5, ease: [0.85, 0, 0.15, 1] }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black"
                >
                    <div className="relative overflow-hidden p-8">
                        <motion.img
                            initial={{ y: 60, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            src="/ubsc.svg"
                            alt="Logo"
                            className="w-28 lg:w-40"
                            draggable={false}
                        />
                        <motion.div 
                            initial={{ x: "-150%" }}
                            animate={{ x: "150%" }}
                            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                        />
                    </div>
                </motion.div>
            </div>
        </>
    );
}
