import { useEffect, useState } from "react";

interface AuthVisualPanelProps {
    alt?: string;
    active?: boolean;
}

const AUTH_VISUAL_IMAGE =
    "/assets/images/ub-sport-center-gym-enterence.png";

/**
 * Shared visual plane for every account-related modal.
 * Keeping this in one component prevents membership and authentication
 * experiences from drifting apart as the artwork evolves.
 */
export default function AuthVisualPanel({
    alt = "UB Sport Center gym entrance",
    active = true,
}: AuthVisualPanelProps) {
    const [imageReady, setImageReady] = useState(false);

    useEffect(() => {
        if (!active) setImageReady(false);
    }, [active]);

    return (
        <div className="auth-modal-visual relative hidden h-full basis-[55.41%] shrink-0 overflow-hidden bg-[#151515] lg:block">
            {active && (
                <img
                    src={AUTH_VISUAL_IMAGE}
                    alt={alt}
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${
                        imageReady ? "opacity-100" : "opacity-0"
                    }`}
                    draggable={false}
                    decoding="async"
                    onLoad={() => setImageReady(true)}
                />
            )}
            <div className="auth-visual-vignette absolute inset-0" />
        </div>
    );
}
