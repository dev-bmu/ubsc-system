const ArrowIcon: React.FC = () => (
    <svg
        width="15"
        height="15"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M6 16H26M26 16L16 6M26 16L16 26"
            stroke="white"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

interface ReservasiButtonProps {
    label?: string;
    href?: string;
    size?: "default" | "compact" | "review";
    onClick?: () => void;
    ariaLabel?: string;
    ariaExpanded?: boolean;
    ariaControls?: string;
    buttonRef?: React.Ref<HTMLButtonElement>;
}

export default function ReservasiButton({
    label = "Mulai Reservasi",
    href = "/coming-soon",
    size = "default",
    onClick,
    ariaLabel,
    ariaExpanded,
    ariaControls,
    buttonRef,
}: ReservasiButtonProps) {
    const className = [
        "reservasi-btn",
        size === "compact" ? "reservasi-btn--compact" : "",
        size === "review" ? "reservasi-btn--review" : "",
    ]
        .filter(Boolean)
        .join(" ");
    const content = (
        <>
            <div className="reservasi-btn-fill" />

            <div className="reservasi-icon-wrap">
                <div className="reservasi-arrow-track">
                    <div className="reservasi-arrow-slot">
                        <ArrowIcon />
                    </div>
                    <div className="reservasi-arrow-slot">
                        <ArrowIcon />
                    </div>
                </div>
            </div>

            <div className="reservasi-text-wrap">
                <div className="reservasi-text-track">
                    <div className="reservasi-text-slot reservasi-text-1">
                        {label}
                    </div>
                    <div className="reservasi-text-slot reservasi-text-2">
                        {label}
                    </div>
                </div>
            </div>
        </>
    );

    return (
        <>
            <style>{`
                .reservasi-btn {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    background-color: #E8E8E8;
                    border: none;
                    border-radius: 9999px;
                    padding: 5px 24px 5px 5px;
                    cursor: pointer;
                    overflow: hidden;
                    height: 46px;
                    width: 100%;
                    max-width: 192px;
                    outline: none;
                    -webkit-tap-highlight-color: transparent;
                }
                .reservasi-btn-fill {
                    position: absolute;
                    left: 5px;
                    top: 5px;
                    bottom: 5px;
                    width: 36px;
                    border-radius: 9999px;
                    background-color: #FF0000;
                    z-index: 0;
                    transition: width 0.5s cubic-bezier(0.76, 0, 0.24, 1);
                    pointer-events: none;
                }
                .reservasi-btn:hover .reservasi-btn-fill {
                    width: calc(100% - 10px);
                }
                .reservasi-icon-wrap {
                    position: relative;
                    z-index: 1;
                    width: 36px;
                    height: 36px;
                    overflow: hidden;
                    flex-shrink: 0;
                    border-radius: 9999px;
                }
                .reservasi-arrow-track {
                    display: flex;
                    width: 72px;
                    height: 100%;
                    transform: translateX(-36px);
                    transition: transform 0.5s cubic-bezier(0.76, 0, 0.24, 1);
                }
                .reservasi-btn:hover .reservasi-arrow-track {
                    transform: translateX(0px);
                }
                .reservasi-arrow-slot {
                    width: 36px;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .reservasi-text-wrap {
                    position: relative;
                    z-index: 1;
                    overflow: hidden;
                    height: 36px;
                    padding-left: 12px;
                    padding-right: 4px;
                }
                .reservasi-text-track {
                    display: flex;
                    flex-direction: column;
                    transform: translateY(0px);
                    transition: transform 0.5s cubic-bezier(0.76, 0, 0.24, 1);
                }
                .reservasi-btn:hover .reservasi-text-track {
                    transform: translateY(-36px);
                }
                .reservasi-text-slot {
                    height: 36px;
                    display: flex;
                    align-items: center;
                    font-size: 13px;
                    font-weight: 600;
                    letter-spacing: -0.3px;
                    white-space: nowrap;
                    line-height: 1;
                    font-family: inherit;
                }
                @media (min-width: 1280px) {
                    .reservasi-btn {
                        height: 64px;
                        width: fit-content;
                        max-width: none;
                        padding: 6px 32px 6px 6px;
                    }
                    .reservasi-btn-fill {
                        left: 6px; top: 6px; bottom: 6px; width: 52px;
                    }
                    .reservasi-btn:hover .reservasi-btn-fill {
                        width: calc(100% - 12px);
                    }
                    .reservasi-icon-wrap { width: 52px; height: 52px; }
                    .reservasi-arrow-track { width: 104px; transform: translateX(-52px); }
                    .reservasi-btn:hover .reservasi-arrow-track { transform: translateX(0px); }
                    .reservasi-arrow-slot { width: 52px; }
                    .reservasi-text-wrap { height: 52px; padding-left: 16px; }
                    .reservasi-btn:hover .reservasi-text-track { transform: translateY(-52px); }
                    .reservasi-text-slot {
                        height: 52px;
                        font-size: clamp(0.875rem, 0.94vw, 18px);
                    }
                    .reservasi-btn svg { width: 21px; height: 21px; }
                    .reservasi-btn--compact {
                        height: 51px;
                        padding: 5px 26px 5px 5px;
                    }
                    .reservasi-btn--compact .reservasi-btn-fill {
                        left: 5px; top: 5px; bottom: 5px; width: 42px;
                    }
                    .reservasi-btn--compact:hover .reservasi-btn-fill {
                        width: calc(100% - 10px);
                    }
                    .reservasi-btn--compact .reservasi-icon-wrap {
                        width: 42px;
                        height: 42px;
                    }
                    .reservasi-btn--compact .reservasi-arrow-track {
                        width: 84px;
                        transform: translateX(-42px);
                    }
                    .reservasi-btn--compact:hover .reservasi-arrow-track {
                        transform: translateX(0px);
                    }
                    .reservasi-btn--compact .reservasi-arrow-slot {
                        width: 42px;
                    }
                    .reservasi-btn--compact .reservasi-text-wrap {
                        height: 42px;
                        padding-left: 13px;
                    }
                    .reservasi-btn--compact:hover .reservasi-text-track {
                        transform: translateY(-42px);
                    }
                    .reservasi-btn--compact .reservasi-text-slot {
                        height: 42px;
                        font-size: clamp(0.75rem, 0.75vw, 14px);
                    }
                    .reservasi-btn--compact svg {
                        width: 17px;
                        height: 17px;
                    }
                }
                .reservasi-btn--review {
                    width: fit-content;
                    max-width: none;
                    height: 50px;
                    padding: 5px 18px 5px 5px;
                }
                .reservasi-btn--review .reservasi-btn-fill {
                    left: 5px; top: 5px; bottom: 5px; width: 40px;
                }
                .reservasi-btn--review:hover .reservasi-btn-fill {
                    width: calc(100% - 10px);
                }
                .reservasi-btn--review .reservasi-icon-wrap {
                    width: 40px;
                    height: 40px;
                }
                .reservasi-btn--review .reservasi-arrow-track {
                    width: 80px;
                    transform: translateX(-40px);
                }
                .reservasi-btn--review:hover .reservasi-arrow-track {
                    transform: translateX(0);
                }
                .reservasi-btn--review .reservasi-arrow-slot {
                    width: 40px;
                }
                .reservasi-btn--review .reservasi-text-wrap {
                    height: 40px;
                    padding-left: 11px;
                    padding-right: 0;
                }
                .reservasi-btn--review:hover .reservasi-text-track {
                    transform: translateY(-40px);
                }
                .reservasi-btn--review .reservasi-text-slot {
                    height: 40px;
                    font-size: 10px;
                }
                .reservasi-btn--review svg {
                    width: 16px;
                    height: 16px;
                }
                .reservasi-text-1 { color: #111111; }
                .reservasi-text-2 { color: #FFFFFF; }
            `}</style>

            {onClick ? (
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={onClick}
                    className={className}
                    aria-label={ariaLabel ?? label}
                    aria-expanded={ariaExpanded}
                    aria-controls={ariaControls}
                >
                    {content}
                </button>
            ) : (
                <a
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={
                        href.startsWith("http") ? "noopener noreferrer" : undefined
                    }
                    className={className}
                    aria-label={ariaLabel ?? label}
                >
                    {content}
                </a>
            )}
        </>
    );
}
