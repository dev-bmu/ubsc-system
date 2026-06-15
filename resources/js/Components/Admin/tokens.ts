export const ADMIN_TOKENS = {
    CANVAS: "bg-[#F8F9FA]",

    CARD: "bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
    CARD_LARGE: "bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]",

    PILL_ACTIVE:
        "bg-gray-900 text-white rounded-2xl shadow-[inset_0_1px_0_rgb(255,255,255,0.08)]",
    PILL_INACTIVE:
        "text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-2xl",

    STAT_GRADIENT_ORANGE:
        "bg-gradient-to-br from-orange-400 via-rose-500 to-rose-700",
    STAT_GRADIENT_BLUE:
        "bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-800",
    STAT_GRADIENT_PURPLE:
        "bg-gradient-to-br from-fuchsia-500 via-purple-600 to-purple-900",

    GLASS_OVERLAY:
        "bg-white/10 backdrop-blur-sm ring-1 ring-inset ring-white/15",
} as const;

export type AdminGradient =
    | typeof ADMIN_TOKENS.STAT_GRADIENT_ORANGE
    | typeof ADMIN_TOKENS.STAT_GRADIENT_BLUE
    | typeof ADMIN_TOKENS.STAT_GRADIENT_PURPLE;
