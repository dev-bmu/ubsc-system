const ArrowIcon: React.FC = () => (
    <svg
        width="21"
        height="21"
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

interface DaftarButtonProps {
    onClick?: () => void;
    label?: string;
    disabled?: boolean;
    href?: string;
}

export default function DaftarButton({
    onClick,
    label = "Daftar Sekarang",
    href = "https://api.whatsapp.com/send/?phone=6285280809080&text=Halo+UB+Sport+Center+%F0%9F%92%AA%0A%0ASaya+tertarik+untuk+mendaftar+%2AMembership+Gym%2A.+Mohon+informasi+mengenai+paket+yang+tersedia%2C+prosedur+pendaftaran%2C+dan+langkah+aktivasi+membership.%0A%0ATerima+kasih+%F0%9F%98%8A&type=phone_number&app_absent=0",
    disabled = false,
}: DaftarButtonProps) {
    return (
        <>
            <style>{`
                .daftar-btn {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    background-color: #E8E8E8;
                    border: none;
                    border-radius: 9999px;
                    padding: 6px 32px 6px 6px;
                    cursor: pointer;
                    overflow: hidden;
                    height: 64px;
                    outline: none;
                    -webkit-tap-highlight-color: transparent;
                }
                .daftar-btn-fill {
                    position: absolute;
                    left: 6px;
                    top: 6px;
                    bottom: 6px;
                    width: 52px;
                    border-radius: 9999px;
                    background-color: #E8190A;
                    z-index: 0;
                    transition: width 0.5s cubic-bezier(0.76, 0, 0.24, 1);
                    pointer-events: none;
                }
                .daftar-btn:hover .daftar-btn-fill {
                    width: calc(100% - 12px);
                }
                .daftar-icon-wrap {
                    position: relative;
                    z-index: 1;
                    width: 52px;
                    height: 52px;
                    overflow: hidden;
                    flex-shrink: 0;
                    border-radius: 9999px;
                }
                .daftar-arrow-track {
                    display: flex;
                    width: 104px;
                    height: 100%;
                    transform: translateX(-52px);
                    transition: transform 0.5s cubic-bezier(0.76, 0, 0.24, 1);
                }
                .daftar-btn:hover .daftar-arrow-track {
                    transform: translateX(0px);
                }
                .daftar-arrow-slot {
                    width: 52px;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .daftar-text-wrap {
                    position: relative;
                    z-index: 1;
                    overflow: hidden;
                    height: 52px;
                    padding-left: 16px;
                    padding-right: 4px;
                }
                .daftar-text-track {
                    display: flex;
                    flex-direction: column;
                    transform: translateY(0px);
                    transition: transform 0.5s cubic-bezier(0.76, 0, 0.24, 1);
                }
                .daftar-btn:hover .daftar-text-track {
                    transform: translateY(-52px);
                }
                .daftar-text-slot {
                    height: 52px;
                    display: flex;
                    align-items: center;
                    font-size: 18px;
                    font-weight: 600;
                    letter-spacing: -0.3px;
                    white-space: nowrap;
                    line-height: 1;
                    font-family: inherit;
                }
                .daftar-text-1 { color: #111111; }
                .daftar-text-2 { color: #FFFFFF; }
                .daftar-btn:disabled {
                    cursor: not-allowed;
                    opacity: 0.55;
                }
                .daftar-btn:disabled .daftar-btn-fill,
                .daftar-btn:disabled .daftar-arrow-track,
                .daftar-btn:disabled .daftar-text-track {
                    transition: none;
                }
            `}</style>

            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="daftar-btn"
                aria-label={label}
            >
                <div className="daftar-btn-fill" />

                <div className="daftar-icon-wrap">
                    <div className="daftar-arrow-track">
                        <div className="daftar-arrow-slot">
                            <ArrowIcon />
                        </div>
                        <div className="daftar-arrow-slot">
                            <ArrowIcon />
                        </div>
                    </div>
                </div>

                <div className="daftar-text-wrap">
                    <div className="daftar-text-track">
                        <div className="daftar-text-slot daftar-text-1">
                            {label}
                        </div>
                        <div className="daftar-text-slot daftar-text-2">
                            {label}
                        </div>
                    </div>
                </div>
            </a>
        </>
    );
}
