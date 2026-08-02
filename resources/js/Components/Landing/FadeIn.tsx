import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import { motion } from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";

function LightweightFadeIn({
    children,
    className,
}: {
    children: ReactNode;
    className: string;
}) {
    const entranceReady = useHomepageEntranceReady();
    const rootRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        const node = rootRef.current;
        if (!node || !entranceReady) return;

        if (!("IntersectionObserver" in window)) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setIsVisible(true);
                observer.disconnect();
            },
            {
                threshold: 0,
                rootMargin: "0px 0px 8% 0px",
            },
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [entranceReady]);

    useEffect(() => {
        if (!isVisible) return;

        const timeout = window.setTimeout(() => setIsComplete(true), 1120);

        return () => window.clearTimeout(timeout);
    }, [isVisible]);

    return (
        <div
            ref={rootRef}
            className={`lightweight-section-entrance ${
                isVisible ? "is-visible" : ""
            } ${isComplete ? "is-complete" : ""} ${className}`}
        >
            {children}
        </div>
    );
}

export default function FadeIn({
    children,
    className = "",
    lightweight = false,
}: {
    children: ReactNode;
    className?: string;
    lightweight?: boolean;
}) {
    const entranceReady = useHomepageEntranceReady();
    const rootRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const node = rootRef.current;
        if (lightweight || !entranceReady || !node || isVisible) return;

        if (!("IntersectionObserver" in window)) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setIsVisible(true);
                observer.disconnect();
            },
            {
                threshold: 0.2,
                rootMargin: "0px",
            },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [entranceReady, isVisible, lightweight]);

    if (lightweight) {
        return (
            <LightweightFadeIn className={className}>
                {children}
            </LightweightFadeIn>
        );
    }

    return (
        <motion.div
            ref={rootRef}
            className={className}
            initial={{ opacity: 0, y: 32 }}
            animate={
                isVisible
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 32 }
            }
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        >
            {children}
        </motion.div>
    );
}
