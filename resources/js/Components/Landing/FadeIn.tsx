import { motion } from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";

function LightweightFadeIn({
    children,
    className,
}: {
    children: ReactNode;
    className: string;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        const node = rootRef.current;
        if (!node) return;

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
    }, []);

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
    if (lightweight) {
        return (
            <LightweightFadeIn className={className}>
                {children}
            </LightweightFadeIn>
        );
    }

    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        >
            {children}
        </motion.div>
    );
}
