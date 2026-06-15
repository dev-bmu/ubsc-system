import React, { useState, useEffect } from "react";
import { Head, router, useForm, usePage } from "@inertiajs/react";
import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    CalendarCheck2,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    DoorClosed,
    Flame,
    Gauge,
    LayoutGrid,
    Leaf,
    Megaphone,
    Pencil,
    Plus,
    SignalMedium,
    TrendingUp,
    Trash2,
    Users,
    Wallet,
    MoreHorizontal,
    Coins,
    Ticket,
    Star,
    UserCheck,
    BarChart3,
    FileText,
    X,
} from "lucide-react";
import {
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableListItem from "@/Components/Admin/SortableListItem";

    // --- FALLBACK REACT BITS (preserved) ---
    const SplitText = ({ text, className }: { text: string, className?: string, delay?: number }) => (
        <span className={cn("split-text-lite", className)}>{text}</span>
    );
    const ShinyTextBlack = ({ text, className = '' }: { text: string, speed?: number, className?: string }) => (
        <span className={`animate-shiny-black ${className}`}>{text}</span>
    );
    const ShinyText = ({ text, className = '' }: { text: string, speed?: number, className?: string }) => (
        <span className={`animate-shiny-text ${className}`}>{text}</span>
    );

import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { InfoBannerItem, PageProps, RecentActivity } from "@/types";

    // ── Types ──────────────────────────────────────────────────────────────────────

    interface DashboardStats {
        pendingIdentities: number;
        activeFacilities: number;
        todaysBookings: number;
        totalRevenue: number;
        activeMemberships: number;
    }

    interface OccupancyFacility {
        name: string;
        pct: number;
        color: string;
    }

type DashboardProps = PageProps<{
    stats: DashboardStats;
    revenueTrend: number;
    dailyRevenue: number[];
    daysInMonth: number;
    currentDayInMonth: number;
    currentMonthLabel: string;
    occupancyData: OccupancyFacility[];
    recentActivity: RecentActivity[];
    gym_traffic: string;
    info_banners: InfoBannerItem[];
}>;

    // ── Helpers ───────────────────────────────────────────────────────────────────

    function formatRevenue(amount: number): string {
        if (amount >= 1_000_000) {
            return `${(amount / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}JT`;
        }
        if (amount >= 1_000) {
            return `${(amount / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })}rb`;
        }
        return amount.toLocaleString("id-ID");
    }

    function formatRupiahFull(amount: number): string {
        return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
    }

    function getElapsedMonthRevenue(data: number[], currentDayInMonth?: number): number[] {
        if (!data.length) return [];

        const today = Number.isFinite(currentDayInMonth) && currentDayInMonth
            ? currentDayInMonth
            : new Date().getDate();
        const elapsedDays = Math.min(data.length, Math.max(1, today));

        return data.slice(0, elapsedDays);
    }

    // ── Global Styles ─────────────────────────────────────────────────────────────

    const DASHBOARD_STYLES = `
        .font-clash { font-family: 'Clash Display', sans-serif; }
        .font-bdo   { font-family: 'BDO Grotesk', sans-serif; }

        /* ── Shiny text animations ── */
        @keyframes shinyBlackText {
            0%   { background-position: 0% center; }
            100% { background-position: 200% center; }
        }
        .animate-shiny-black {
            background: linear-gradient(115deg, #0f172a 0%, #0f172a 26%, #cbd5e1 38%, #0f172a 50%, #0f172a 76%, #cbd5e1 88%, #0f172a 100%);
            background-size: 200% auto;
            color: transparent;
            -webkit-background-clip: text;
            background-clip: text;
            animation: shinyBlackText 6s linear infinite;
            will-change: background-position;
        }
        @keyframes shinyText {
            0%   { background-position: -200% center; }
            100% { background-position:  200% center; }
        }
        .animate-shiny-text {
            background: linear-gradient(120deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.4) 100%);
            background-size: 200% auto;
            color: transparent;
            -webkit-background-clip: text;
            background-clip: text;
            animation: shinyText linear infinite;
        }

        /* ── Water caustics ── */
        @keyframes caustics {
            0%   { background-position:   0% 50%; opacity: 0.15; }
            50%  { background-position: 100% 50%; opacity: 0.35; }
            100% { background-position:   0% 50%; opacity: 0.15; }
        }
        .water-caustics-effect {
            background: radial-gradient(circle at top left,  rgba(255,255,255,0.3) 0%, transparent 40%),
                        radial-gradient(circle at bottom right, rgba(255,255,255,0.2) 0%, transparent 50%);
            background-size: 150% 150%;
            animation: caustics 8s ease-in-out infinite;
            mix-blend-mode: overlay;
        }

        /* ── Entrance animations ── */
        @keyframes fadeInUp {
            from { opacity: 0; transform: translate3d(0, 28px, 0); }
            to   { opacity: 1; transform: translate3d(0,  0,   0); }
        }
        @keyframes fadeInLeft {
            from { opacity: 0; transform: translate3d(-20px, 0, 0); }
            to   { opacity: 1; transform: translate3d(  0,   0, 0); }
        }
        @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.94); }
            to   { opacity: 1; transform: scale(1);    }
        }
        @keyframes float {
            0%, 100% { transform: translate3d(0,    0, 0); }
            50%       { transform: translate3d(0, -6px, 0); }
        }
        @keyframes pulseGlow {
            0%, 100% { opacity: 0.4; transform: scale(1)   translate3d(0,0,0); }
            50%       { opacity: 1;   transform: scale(1.1) translate3d(0,0,0); }
        }
        @keyframes drawCircle { from { stroke-dashoffset: 251.3; } }
        @keyframes progressFill { from { width: 0%; } }
        @keyframes barGrow {
            from { transform: scaleY(0); transform-origin: bottom; }
            to   { transform: scaleY(1); transform-origin: bottom; }
        }
        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-14px); }
            to   { opacity: 1; transform: translateY(0);     }
        }

        .animate-fade-in-up   { animation: fadeInUp   0.7s  cubic-bezier(0.16,1,0.3,1) forwards; opacity:0; will-change: opacity, transform; }
        .animate-fade-in-left { animation: fadeInLeft  0.55s cubic-bezier(0.16,1,0.3,1) forwards; opacity:0; will-change: opacity, transform; }
        .animate-scale-in     { animation: scaleIn     0.5s  cubic-bezier(0.16,1,0.3,1) forwards; opacity:0; }
        .split-text-lite      { animation: fadeInUp 0.5s ease forwards 50ms; opacity: 0; }
        .animate-float        { animation: float       3.5s  ease-in-out infinite;                 will-change: transform; }
        .animate-pulse-glow   { animation: pulseGlow   2.5s  ease-in-out infinite;                 will-change: opacity, transform; }
        .progress-fill        { animation: progressFill 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        .bar-grow             { animation: barGrow      0.6s cubic-bezier(0.16,1,0.3,1) forwards; }
        .analytics-enter      { animation: slideDown    0.5s cubic-bezier(0.16,1,0.3,1) forwards; }

        /* ── Delays ── */
        .delay-50  { animation-delay:  50ms; }
        .delay-100 { animation-delay: 100ms; }
        .delay-150 { animation-delay: 150ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-250 { animation-delay: 250ms; }
        .delay-300 { animation-delay: 300ms; }
        .delay-400 { animation-delay: 400ms; }
        .delay-500 { animation-delay: 500ms; }
        .delay-600 { animation-delay: 600ms; }

        /* ── Card effects ── */
        @keyframes cardBreath {
            0%, 100% { box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 0 0 1px rgba(226,232,240,0.8); }
            50%       { box-shadow: 0 4px 16px rgba(0,0,0,0.07), 0 0 0 1px rgba(227,83,54,0.2); }
        }
        .card-breath { animation: cardBreath 5s ease-in-out infinite; }

        .card-glint { position: relative; }
        .card-glint::before {
            content: '';
            position: absolute;
            top: 0; left: 20px; right: 20px; height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,1), transparent);
            pointer-events: none;
            z-index: 2;
        }

        /* ── Shimmer sweep ── */
        @keyframes shimmerSweep {
            0%   { transform: translateX(-100%); }
            100% { transform: translateX(200%);  }
        }
        .shimmer-once { position: relative; overflow: hidden; }
        .shimmer-once::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.42) 50%, transparent 100%);
            width: 60%;
            animation: shimmerSweep 1.1s ease-out 0.45s forwards;
            pointer-events: none;
            border-radius: inherit;
        }

        /* ── Button shimmer ── */
        @keyframes btnSheen {
            0%   { left: -80%; }
            100% { left: 120%; }
        }
        .btn-sheen { position: relative; overflow: hidden; }
        .btn-sheen::before {
            content: '';
            position: absolute;
            top: 0; bottom: 0; width: 50%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
            animation: btnSheen 3s ease-in-out 1s infinite;
        }

        /* ── Icon glow ── */
        @keyframes iconGlow {
            0%, 100% {
                box-shadow:
                    0 14px 28px -18px rgba(227,83,54,0.92);
            }
            50% {
                box-shadow:
                    0 18px 34px -18px rgba(227,83,54,1),
                    0 0 20px rgba(227,83,54,0.18);
            }
        }
        .icon-glow { animation: iconGlow 3.5s ease-in-out infinite; }

        @keyframes liveDotBreath {
            0%, 100% { opacity: .88; transform: scale(1); }
            50%      { opacity: 1;   transform: scale(1.18); }
        }
        @keyframes liveDotHalo {
            0%, 100% { opacity: .18; transform: scale(.82); }
            50%      { opacity: .45; transform: scale(1.5); }
        }
        .dashboard-live-dot {
            position: relative;
            display: inline-block;
            flex-shrink: 0;
            border-radius: 999px;
            background: var(--dot-color, #E35336);
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px var(--dot-halo, rgba(227,83,54,.28));
            animation: liveDotBreath 2.8s ease-in-out infinite;
            will-change: transform, opacity;
            isolation: isolate;
        }
        .dashboard-live-dot::after {
            content: '';
            position: absolute;
            inset: -4px;
            z-index: -1;
            border-radius: inherit;
            background: var(--dot-halo, rgba(227,83,54,.22));
            animation: liveDotHalo 2.8s ease-in-out infinite;
            will-change: transform, opacity;
        }
        .dashboard-live-dot-white {
            background: #fff;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(255,255,255,.28);
        }
        .dashboard-live-dot-white::after { background: rgba(255,255,255,.28); }
        .dashboard-live-dot-cyan {
            background: #67E8F9;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(103,232,249,.32);
        }
        .dashboard-live-dot-cyan::after { background: rgba(103,232,249,.32); }
        .dashboard-live-dot-emerald {
            background: #10B981;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(16,185,129,.28);
        }
        .dashboard-live-dot-emerald::after { background: rgba(16,185,129,.28); }
        .dashboard-live-dot-green {
            background: #22c55e;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(34,197,94,.28);
        }
        .dashboard-live-dot-green::after { background: rgba(34,197,94,.28); }
        .dashboard-live-dot-mint {
            background: #34d399;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(52,211,153,.28);
        }
        .dashboard-live-dot-mint::after { background: rgba(52,211,153,.28); }
        .dashboard-live-dot-sky {
            background: #0EA5E9;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(14,165,233,.28);
        }
        .dashboard-live-dot-sky::after { background: rgba(14,165,233,.28); }
        .dashboard-live-dot-amber {
            background: #eab308;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(234,179,8,.28);
        }
        .dashboard-live-dot-amber::after { background: rgba(234,179,8,.28); }
        .dashboard-live-dot-orange {
            background: #f59e0b;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(245,158,11,.28);
        }
        .dashboard-live-dot-orange::after { background: rgba(245,158,11,.28); }
        .dashboard-live-dot-red {
            background: #ef4444;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(239,68,68,.28);
        }
        .dashboard-live-dot-red::after { background: rgba(239,68,68,.28); }
        .dashboard-live-dot-navy {
            background: #15678D;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(21,103,141,.26);
        }
        .dashboard-live-dot-navy::after { background: rgba(21,103,141,.26); }
        .dashboard-live-dot-slate {
            background: #cbd5e1;
            box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 8px rgba(148,163,184,.22);
        }
        .dashboard-live-dot-slate::after { background: rgba(148,163,184,.22); }

        /* ── Stagger children ── */
        .stagger > *:nth-child(1) { animation-delay:  80ms; }
        .stagger > *:nth-child(2) { animation-delay: 140ms; }
        .stagger > *:nth-child(3) { animation-delay: 200ms; }
        .stagger > *:nth-child(4) { animation-delay: 260ms; }
        .stagger > *:nth-child(5) { animation-delay: 320ms; }
        .stagger > *:nth-child(6) { animation-delay: 380ms; }

        /* ── Custom scrollbar ── */
        .custom-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: rgba(227,83,54,0.34) transparent;
        }
        .custom-scrollbar::-webkit-scrollbar       { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(227,83,54,0.34);
            border: 1px solid rgba(255,255,255,0.72);
            border-radius: 999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(227,83,54,0.58); }

        /* ── Badge pulse glow ── */
        @keyframes badgePulseGreen {
            0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
            50%       { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
        }
        @keyframes badgePulseBlue {
            0%, 100% { box-shadow: 0 0 0 0 rgba(56,189,248,0.5); }
            50%       { box-shadow: 0 0 0 5px rgba(56,189,248,0); }
        }
        @keyframes dotPingGreen {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.6; transform: scale(1.35); }
        }
        @keyframes dotPingBlue {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.6; transform: scale(1.4); }
        }
        .badge-aktif {
            background: rgba(16,185,129,0.12);
            border: 1px solid rgba(52,211,153,0.35);
            color: #34d399;
            animation: badgePulseGreen 2.5s ease-in-out infinite;
        }
        .badge-online {
            background: rgba(56,189,248,0.12);
            border: 1px solid rgba(56,189,248,0.35);
            color: #38bdf8;
            animation: badgePulseBlue 2.2s ease-in-out infinite;
        }
        .dot-ping-green { animation: dotPingGreen 2.5s ease-in-out infinite; }
        .dot-ping-blue  { animation: dotPingBlue  2.2s ease-in-out infinite; }

        /* ── Shiny terracotta text ── */
        @keyframes shinyOrangeText {
            0%   { background-position: -200% center; }
            100% { background-position:  200% center; }
        }
        .animate-shiny-orange {
            background: linear-gradient(120deg, #B93D2A 25%, #FFD5CD 50%, #B93D2A 75%);
            background-size: 200% auto;
            color: transparent;
            -webkit-background-clip: text;
            background-clip: text;
            animation: shinyOrangeText 3s linear infinite;
        }

        /* ── Section divider ── */
        .section-divider { position: relative; }
        .section-divider::before {
            content: '';
            position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 3px;
            background: linear-gradient(180deg, #E35336, #B93D2A80, transparent);
            border-radius: 2px;
        }

        /* ── Occupancy bar ── */
        .occ-bar-inner { transition: width 0.9s cubic-bezier(0.16,1,0.3,1), filter 0.3s; }
        .occ-bar-inner:hover { filter: brightness(1.2) saturate(1.3); }

        /* ── Analytics dark panel ── */
        @keyframes analyticsSlide {
            from { opacity: 0; transform: translateY(-18px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .analytics-dark-enter { animation: analyticsSlide 0.45s cubic-bezier(0.16,1,0.3,1) forwards; }

        /* ── Revenue bar chart ── */
        .rev-bar {
            transition: filter 0.15s ease, transform 0.15s ease;
            transform-origin: bottom;
        }
        .rev-bar:hover { filter: brightness(1.12); }
        .rev-bar-active {
            box-shadow: 0 0 0 2px #E35336, 0 0 0 4px rgba(227,83,54,0.15) !important;
        }

        /* ── Chart nav button ── */
        .chart-nav-btn {
            display: flex; align-items: center; justify-content: center;
            width: 32px; height: 32px;
            border-radius: 12px;
            border: 1px solid;
            flex-shrink: 0;
            transition: all 0.2s ease;
        }
        .chart-nav-btn:active { transform: scale(0.88); }
        .chart-nav-btn.enabled {
            border-color: #FFD5CD;
            color: #B93D2A;
            background: #fff;
        }
        .chart-nav-btn.enabled:hover {
            background: #FFF1EE;
            border-color: #EA684F;
            box-shadow: 0 2px 8px rgba(227,83,54,0.15);
        }
        .chart-nav-btn.disabled {
            border-color: #f1f5f9;
            color: #cbd5e1;
            cursor: not-allowed;
            background: #f8fafc;
        }

        /* ── Scrubber track ── */
        .scrubber-track {
            height: 6px;
            background: #f1f5f9;
            border-radius: 99px;
            overflow: visible;
            cursor: pointer;
            position: relative;
        }
        .scrubber-thumb {
            height: 100%;
            border-radius: 99px;
            background: linear-gradient(90deg, #EA684F, #B93D2A);
            position: absolute;
            top: 0;
            transition: left 0.25s cubic-bezier(0.16,1,0.3,1), width 0.25s;
            box-shadow: 0 1px 4px rgba(227,83,54,0.3);
        }

        /* ── Jump input ── */
        .jump-input {
            width: 46px; height: 32px;
            border-radius: 10px;
            border: 1px solid #e2e8f0;
            background: #fff;
            text-align: center;
            font-size: 10px;
            color: #334155;
            outline: none;
            transition: border-color 0.15s, box-shadow 0.15s;
            -moz-appearance: textfield;
        }
        .jump-input::-webkit-outer-spin-button,
        .jump-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .jump-input:focus {
            border-color: #E35336;
            box-shadow: 0 0 0 3px rgba(227,83,54,0.12);
        }
        .jump-go-btn {
            height: 32px; padding: 0 10px;
            border-radius: 10px;
            border: 1px solid #FFD5CD;
            background: #FFF1EE;
            color: #B93D2A;
            font-size: 10px; font-weight: 700;
            cursor: pointer;
            transition: all 0.15s;
        }
        .jump-go-btn:hover { background: #FFD5CD; border-color: #EA684F; }
        .jump-go-btn:active { transform: scale(0.93); }

        .dashboard-font-bdo { font-family: 'BDO Grotesk', sans-serif; }
        .dashboard-visible { overflow: visible; position: relative; }
        .dashboard-visible-only { overflow: visible; }
        .dashboard-y-axis { width: 34px; }
        .dashboard-chart-area { height: 126px; overflow: visible; position: relative; }
        .dashboard-full-visible { height: 100%; overflow: visible; position: relative; }
        .dashboard-full-visible-only { height: 100%; overflow: visible; }
        .dashboard-zero-label { color: #e2e8f0; }
        .dashboard-grid-wrap { inset-block: 0; }
        .dashboard-grid-top { top: 0; border-top: 1px dashed #f1f5f9; }
        .dashboard-grid-mid { top: 50%; border-top: 1px dashed #f1f5f9; }
        .dashboard-grid-base { bottom: 0; border-top: 1px solid #e2e8f0; }
        .dashboard-avg-line {
            border-top: 2px dashed rgba(227,83,54,.72);
            filter: drop-shadow(0 1px 2px rgba(227,83,54,.22));
            z-index: 20;
        }
        .dashboard-avg-label {
            right: 0;
            top: -15px;
            background: #FFF1EE;
            color: #E35336;
            padding: 2px 5px;
            border-radius: 6px;
            line-height: 1.4;
            border: 1px solid #FFD5CD;
            box-shadow: 0 4px 10px rgba(227,83,54,.12);
        }
        .dashboard-tooltip-left { left: 0; transform: translateY(-10px); }
        .dashboard-tooltip-right { right: 0; transform: translateY(-10px); }
        .dashboard-tooltip-center { left: 50%; transform: translateX(-50%) translateY(-10px); }
        .dashboard-tooltip-card {
            min-width: 142px;
            background: #fff;
            box-shadow: 0 12px 30px rgba(227,83,54,.22), 0 2px 8px rgba(15,23,42,.10);
        }
        .dashboard-tooltip-head { background: linear-gradient(90deg, #E35336, #B93D2A); }
        .dashboard-peak-marker {
            left: 50%;
            transform: translateX(-50%);
            line-height: 1;
            z-index: 4;
        }
        .dashboard-bar-peak {
            background: linear-gradient(180deg, #EA684F 0%, #8F2E20 100%);
            box-shadow: 0 0 16px rgba(227,83,54,.4), inset 0 1px 0 rgba(255,255,255,.25);
        }
        .dashboard-bar-above {
            background: linear-gradient(180deg, #F08C78 0%, #E35336 100%);
            box-shadow: 0 0 6px rgba(227,83,54,.18);
        }
        .dashboard-bar-normal { background: linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%); }
        .dashboard-bar-active {
            outline: 2px solid #E35336;
            outline-offset: 2px;
        }
        .dashboard-axis-row { padding-inline: 2px; }
        .dashboard-axis-month { color: #E35336; opacity: .7; }
        .dashboard-legend-peak { background: linear-gradient(135deg,#EA684F,#8F2E20); }
        .dashboard-legend-above { background: linear-gradient(135deg,#F08C78,#E35336); }
        .dashboard-legend-normal { background: linear-gradient(135deg,#e2e8f0,#cbd5e1); }
        .dashboard-touch-scroll { -webkit-overflow-scrolling: touch; }
        .dashboard-activity-delay-1 { animation-delay: 70ms; }
        .dashboard-activity-delay-2 { animation-delay: 140ms; }
        .dashboard-activity-delay-3 { animation-delay: 210ms; }
        .dashboard-activity-delay-4 { animation-delay: 280ms; }
        .dashboard-activity-delay-5 { animation-delay: 350ms; }
        .dashboard-activity-delay-6 { animation-delay: 420ms; }
        .dashboard-activity-delay-7 { animation-delay: 490ms; }
        .dashboard-activity-delay-8 { animation-delay: 560ms; }
        .dashboard-activity-delay-9 { animation-delay: 630ms; }
        .dashboard-activity-delay-10 { animation-delay: 700ms; }
        .dashboard-activity-progress-full { width: 100%; }
        .dashboard-activity-progress-wide { width: 72%; }
        .dashboard-urgency-red { background-color: #ef4444; }
        .dashboard-urgency-orange { background-color: #E35336; }
        .dashboard-urgency-green { background-color: #22c55e; }
        .dashboard-urgency-slate { background-color: #94a3b8; }
        .dashboard-print-date { font-size: 7.5pt; color: #888; }
        .prt-col-no { width: 5%; }
        .prt-col-category { width: 20%; }
        .prt-col-detail { width: 40%; }
        .prt-col-unit { width: 15%; }
        .prt-col-value { width: 20%; }

        .dashboard-header-scale,
        .dashboard-page-scale {
            transform: scale(.9);
            transform-origin: top left;
            width: 111.111111%;
        }
        .dashboard-page-scale {
            margin-bottom: -8rem;
        }
        @media (max-width: 767px) {
            .dashboard-header-scale,
            .dashboard-page-scale {
                transform: none;
                width: 100%;
                margin-bottom: 0;
            }
        }

        .dashboard-metric-bars { height: 28px; }
        .dashboard-metric-bar-1 { height: 36%; }
        .dashboard-metric-bar-2 { height: 44%; }
        .dashboard-metric-bar-3 { height: 54%; }
        .dashboard-metric-bar-4 { height: 76%; }
        .dashboard-metric-bar-5 { height: 45%; }
        .dashboard-metric-bar-6 { height: 58%; }
        .dashboard-metric-bar-7 { height: 68%; }
        .dashboard-metric-bar-8 { height: 43%; }
        .dashboard-metric-bar-9 { height: 62%; }

        /* ── Metric card mini sparkline ── */
        .mini-spark {
            display: flex;
            align-items: flex-end;
            gap: 1px;
            height: 20px;
            overflow: hidden;
        }
        .mini-spark-bar {
            flex: 1;
            border-radius: 2px 2px 0 0;
            transition: height 0.4s cubic-bezier(0.16,1,0.3,1);
        }

        /* ── Print styles ── */
        .print-report-template { display: none; }
        .prt-a4-page {
            width: 210mm;
            height: auto;
            min-height: 150mm;
            box-sizing: border-box;
            padding: 14mm 16mm;
        }
        .prt-header {
            display: flex;
            align-items: flex-start;
            gap: 12pt;
            margin-bottom: 4pt;
        }
        .prt-header-left { flex-shrink: 0; }
        .prt-logo-img {
            width: 68pt; height: 68pt;
            object-fit: contain;
        }
        .prt-header-right { flex: 1; }
        .prt-company-name-main {
            font-family: 'Courier New', Courier, monospace;
            font-size: 18pt; font-weight: bold;
            letter-spacing: 0.08em;
            margin: 0 0 2pt 0;
        }
        .prt-company-name-sub {
            font-family: 'Courier New', Courier, monospace;
            font-size: 10pt; font-weight: bold;
            letter-spacing: 0.10em;
            margin: 1pt 0 3pt 0;
        }
        .prt-company-address {
            font-size: 8pt; line-height: 1.45;
            margin-bottom: 4pt;
            font-family: 'Courier New', Courier, monospace;
        }
        .prt-header-divider {
            border: none;
            border-top: 1.5pt solid #111;
            margin: 3pt 0 4pt 0;
        }
        .prt-doc-title {
            font-family: 'Courier New', Courier, monospace;
            font-size: 15pt; font-weight: bold;
            letter-spacing: 0.04em;
            text-align: center; margin: 0;
        }
        .prt-meta-outer {
            display: flex; gap: 0;
            margin-top: 6pt; margin-bottom: 8pt;
            border: 0.75pt solid #444;
        }
        .prt-meta-left {
            flex: 1; padding: 5pt 8pt 8pt 8pt;
            font-size: 8.5pt;
            border-right: 0.75pt solid #444;
            font-family: 'Courier New', Courier, monospace;
        }
        .prt-kepada-line { display: flex; align-items: baseline; gap: 2pt; }
        .prt-kepada-label { font-weight: bold; white-space: nowrap; }
        .prt-kepada-blank {
            flex: 1; border-bottom: 0.75pt dashed #888;
            min-width: 80pt; height: 10pt; display: inline-block;
        }
        .prt-payment-note {
            margin-top: 22pt; font-size: 8pt; font-weight: bold;
            line-height: 1.75;
            font-family: 'Courier New', Courier, monospace;
            white-space: nowrap;
        }
        .prt-meta-right { width: 230pt; flex-shrink: 0; }
        .prt-meta-right table {
            width: 100%; border-collapse: collapse;
            font-size: 8.5pt;
            font-family: 'Courier New', Courier, monospace;
        }
        .prt-meta-right table td {
            border-bottom: 0.75pt dashed #888;
            border-left: 0.75pt dashed #888;
            padding: 3.5pt 6pt; vertical-align: middle;
        }
        .prt-meta-right table td.meta-label-col {
            width: 45%; font-size: 8pt; color: #555;
            font-weight: normal; white-space: nowrap;
        }
        .prt-meta-right table td.meta-value-col {
            width: 55%; font-size: 8.5pt; font-weight: normal;
        }
        .prt-meta-right table td.meta-value-bold { font-weight: bold; }
        .prt-meta-right table tr:last-child td { border-bottom: none; }
        .prt-report-table {
            width: 100%; border-collapse: collapse;
            margin-bottom: 6pt; font-size: 8.5pt;
            font-family: 'Courier New', Courier, monospace;
        }
        .prt-report-table th {
            border: 0.75pt solid #111; padding: 4pt 6pt;
            text-align: center; font-weight: bold; background: #fff;
            font-family: 'Courier New', Courier, monospace;
        }
        .prt-report-table td {
            border: 0.75pt solid #444; padding: 4.5pt 6pt;
            vertical-align: middle;
            font-family: 'Courier New', Courier, monospace;
        }
        .prt-report-table td.rt-center { text-align: center; }
        .prt-report-table td.rt-right  { text-align: right; }
        .prt-report-table td.rt-bold   { font-weight: bold; }
        .prt-report-table tr.rt-filler td { color: #ddd; border-color: #eee; }
        .prt-bottom-row { display: flex; gap: 0; margin-bottom: 0; }
        .prt-keterangan {
            flex: 1; border: 0.75pt solid #444;
            padding: 5pt 7pt; font-size: 8.5pt; min-height: 64pt;
            font-family: 'Courier New', Courier, monospace;
        }
        .prt-keterangan-label {
            font-weight: bold; font-size: 8pt; display: block;
            margin-bottom: 4pt; border-bottom: 0.5pt solid #ccc; padding-bottom: 2pt;
        }
        .prt-summary { width: 185pt; flex-shrink: 0; }
        .prt-summary table {
            width: 100%; border-collapse: collapse;
            font-size: 8.5pt;
            font-family: 'Courier New', Courier, monospace;
        }
        .prt-summary table td { border: 0.75pt solid #444; padding: 3.5pt 6pt; }
        .prt-summary table td:last-child { text-align: right; }
        .prt-summary table tr.sum-total td { font-weight: bold; }
        .prt-page-footer {
            margin-top: 10pt;
            font-family: 'Courier New', Courier, monospace;
            font-size: 8pt; color: #555;
            display: flex; justify-content: space-between; align-items: center;
            border-top: 0.5pt solid #ccc; padding-top: 5pt;
        }

        @media print {
            @page { size: A4 portrait; margin: 0; }
            body * { visibility: hidden !important; }
            .print-report-template,
            .print-report-template * { visibility: visible !important; }
            .print-report-template {
                display: block !important;
                position: absolute !important;
                top: 0 !important; left: 0 !important;
                width: 100% !important; z-index: 99999 !important;
            }
            .prt-a4-page {
                width: 210mm !important; height: auto !important;
                min-height: unset !important; max-height: 297mm !important;
                overflow: hidden !important; padding: 14mm 16mm !important;
                margin: 0 !important; box-sizing: border-box !important;
                page-break-after: avoid !important; break-after: avoid !important;
            }
            .prt-logo-img {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                width: 68pt !important; height: 68pt !important;
            }
        }
    `;


    // ── ShinyIcon ─────────────────────────────────────────────────────────────────

    function ShinyIcon({ children, className }: { children: React.ReactNode; className?: string }) {
        return (
            <div className={cn(
                "relative flex shrink-0 items-center justify-center rounded-xl",
                "bg-gradient-to-br from-[#F08C78] via-[#E35336] to-[#B93D2A]",
                "text-white shadow-[0_14px_28px_-18px_rgba(227,83,54,0.95)]",
                "[&_svg]:text-white",
                "icon-glow",
                className,
            )}>
                {children}
                <span className="pointer-events-none absolute left-[7px] right-[7px] top-[5px] h-[4px] rounded-full bg-white/35 blur-[1px]" />
            </div>
        );
    }

    function LiveDot({
        color = "#E35336",
        halo = "rgba(227,83,54,0.26)",
        size = "sm",
        className,
    }: {
        color?: string;
        halo?: string;
        size?: "xs" | "sm" | "md";
        className?: string;
    }) {
        const sizeClass = size === "md" ? "h-2.5 w-2.5" : size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2";
        const normalized = color.toLowerCase();
        const toneClass =
            normalized === "#ffffff" || normalized === "#fff" ? "dashboard-live-dot-white"
            : normalized === "#67e8f9" ? "dashboard-live-dot-cyan"
            : normalized === "#10b981" ? "dashboard-live-dot-emerald"
            : normalized === "#22c55e" ? "dashboard-live-dot-green"
            : normalized === "#34d399" ? "dashboard-live-dot-mint"
            : normalized === "#0ea5e9" ? "dashboard-live-dot-sky"
            : normalized === "#eab308" ? "dashboard-live-dot-amber"
            : normalized === "#f59e0b" ? "dashboard-live-dot-orange"
            : normalized === "#ef4444" ? "dashboard-live-dot-red"
            : normalized === "#15678d" ? "dashboard-live-dot-navy"
            : normalized === "#cbd5e1" ? "dashboard-live-dot-slate"
            : undefined;

        return (
            <span
                className={cn("dashboard-live-dot", toneClass, sizeClass, className)}
            />
        );
    }

    // ── PremiumStatCard (preserved) ───────────────────────────────────────────────

    function DashboardMatrixCard({
        icon,
        label,
        value,
        note,
        tone,
        delay,
    }: {
        icon: React.ReactNode;
        label: string;
        value: string;
        note: string;
        tone: "booking" | "emerald" | "sky" | "amber";
        delay: string;
    }) {
        const styles = {
            booking: {
                card: "border-cyan-200/70 bg-[radial-gradient(circle_at_18%_8%,rgba(125,211,252,.42),transparent_32%),radial-gradient(circle_at_86%_92%,rgba(52,211,153,.30),transparent_34%),linear-gradient(135deg,#0B1B3A_0%,#0E3A5F_48%,#0F766E_100%)] text-white shadow-[0_22px_46px_-30px_rgba(8,145,178,.92)]",
                icon: "border-cyan-100/30 bg-white/[.14] text-cyan-100",
                chip: "border-cyan-100/35 bg-cyan-50/14 text-cyan-50",
                bar: "bg-[linear-gradient(180deg,#A7F3D0,#22D3EE_58%,#0EA5E9)]",
                note: "text-cyan-50/82",
                dot: "#67E8F9",
                halo: "rgba(103,232,249,.32)",
            },
            emerald: {
                card: "border-emerald-100 bg-white text-slate-950 shadow-[0_18px_38px_-30px_rgba(16,185,129,.52)]",
                icon: "border-emerald-100 bg-emerald-50 text-emerald-600",
                chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
                bar: "bg-[linear-gradient(180deg,#6ee7b7,#059669)]",
                note: "text-slate-500",
                dot: "#10B981",
                halo: "rgba(16,185,129,.28)",
            },
            sky: {
                card: "border-sky-100 bg-white text-slate-950 shadow-[0_18px_38px_-30px_rgba(14,165,233,.52)]",
                icon: "border-sky-100 bg-sky-50 text-sky-600",
                chip: "border-sky-200 bg-sky-50 text-sky-700",
                bar: "bg-[linear-gradient(180deg,#7dd3fc,#0284c7)]",
                note: "text-slate-500",
                dot: "#0EA5E9",
                halo: "rgba(14,165,233,.28)",
            },
            amber: {
                card: "border-[#F8B5A8] bg-[linear-gradient(135deg,#ffffff_0%,#fff8f0_72%,#FFF1EE_100%)] text-slate-950 shadow-[0_18px_38px_-30px_rgba(227,83,54,.42)]",
                icon: "border-[#FFD5CD] bg-[#FFF1EE] text-[#B93D2A]",
                chip: "border-[#F8B5A8] bg-[#FFD5CD]/70 text-[#B93D2A]",
                bar: "bg-[linear-gradient(180deg,#FFD5CD,#E35336)]",
                note: "text-[#B93D2A]",
                dot: "#E35336",
                halo: "rgba(227,83,54,.28)",
            },
        }[tone];
        const barClasses = [
            "dashboard-metric-bar-1",
            "dashboard-metric-bar-2",
            "dashboard-metric-bar-3",
            "dashboard-metric-bar-4",
            "dashboard-metric-bar-5",
            "dashboard-metric-bar-6",
            "dashboard-metric-bar-7",
            "dashboard-metric-bar-8",
            "dashboard-metric-bar-9",
        ];

        return (
            <article className={cn("animate-fade-in-up relative min-h-[150px] overflow-hidden rounded-[20px] border p-3.5 transition-all duration-300 hover:-translate-y-1", styles.card, delay)}>
                {tone === "booking" && (
                    <>
                        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.13)_0,rgba(255,255,255,.13)_1px,transparent_1px,transparent_23px)] opacity-40" />
                        <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full border border-cyan-100/35" />
                        <div className="pointer-events-none absolute -bottom-14 left-8 h-24 w-24 rounded-full bg-emerald-300/20 blur-2xl" />
                    </>
                )}
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-20" />
                <div className="relative z-10 flex h-full min-h-[124px] flex-col justify-between">
                    <div className="flex items-start justify-between gap-3">
                        <span className={cn("flex h-9 w-9 items-center justify-center rounded-[13px] border shadow-[inset_0_1px_0_rgba(255,255,255,.34)]", styles.icon)}>
                            {icon}
                        </span>
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bdo text-[9px] font-bold uppercase tracking-wide", styles.chip)}>
                            <LiveDot size="xs" color={styles.dot} halo={styles.halo} />
                            Live
                        </span>
                    </div>

                    <div className="mt-3">
                        <p className="break-words font-clash text-[1.15rem] font-bold leading-[1.05] tracking-tight sm:text-[1.25rem]" title={value}>
                            {value}
                        </p>
                        <p className="mt-2 font-bdo text-[12px] font-semibold opacity-85">{label}</p>
                        <div className="dashboard-metric-bars mt-2.5 flex items-end gap-[3px] rounded-[12px] border border-current/10 bg-white/10 px-2 py-1.5">
                            {barClasses.map((barClass, index) => (
                                <span key={barClass} className={cn("flex-1 rounded-t-[3px]", styles.bar, barClass, index < 3 ? "opacity-50" : "opacity-90")} />
                            ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                            <p className={cn("min-w-0 break-words font-bdo text-[11px] font-semibold leading-tight", styles.note)}>{note}</p>
                            <LiveDot size="xs" color={styles.dot} halo={styles.halo} />
                        </div>
                    </div>
                </div>
            </article>
        );
    }

    function PremiumStatCard({
        title, value, subtitle, icon: Icon, decorIcon: DecorIcon, bgGradient, statusDot, statusText, delay
    }: {
        title: string; value: string; subtitle: string; icon: React.ElementType; decorIcon: React.ElementType;
        bgGradient: string; statusDot: string; statusText: string; delay: string;
    }) {
        return (
            <div className={`relative h-[230px] rounded-[24px] overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 cursor-pointer ${bgGradient} animate-fade-in-up ${delay}`}>
                <div className="absolute inset-0 water-caustics-effect pointer-events-none"></div>
                <div className="absolute top-6 left-6 opacity-30 animate-pulse-glow pointer-events-none">
                    <DecorIcon className="w-10 h-10 text-white drop-shadow-md" />
                </div>
                <div className="absolute top-5 right-5 bg-white/10 backdrop-blur-md border border-white/20 px-3.5 py-1.5 rounded-xl flex items-center gap-2 z-10 hover:bg-white/20 transition-colors">
                    <LiveDot size="sm" color="#ffffff" halo="rgba(255,255,255,0.28)" className={statusDot} />
                    <span className="font-bdo text-[11px] font-bold text-white tracking-wide uppercase">{statusText}</span>
                </div>
                <div className="absolute bottom-0 w-full h-[65%] bg-[#12131c] border-t border-white/10 rounded-t-[24px] flex flex-col justify-end p-6 shadow-[inset_0_-20px_40px_-15px_rgba(227,83,54,0.5)]">
                    <div className="absolute -top-6 left-6 bg-white/10 backdrop-blur-xl p-3 rounded-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] animate-float">
                        <Icon className="w-6 h-6 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                    </div>
                    <h3 className="text-white font-clash font-medium text-base mb-4 drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] leading-tight w-4/5">
                        <SplitText text={title} delay={200} />
                    </h3>
                    <div className="flex justify-between items-end mb-3">
                        <span className="font-clash text-3xl font-bold tracking-tight">
                            <ShinyText text={value} speed={3} className="text-white" />
                        </span>
                        <span className="font-bdo text-[11px] text-slate-400 font-medium mb-1.5">{subtitle}</span>
                    </div>
                    <div className="w-full flex items-center gap-1.5 opacity-80">
                        {[...Array(15)].map((_, i) => (
                            <div key={i} className={`h-[3px] rounded-full flex-1 transition-all duration-700 delay-[${i * 50}ms] ${i < 10 ? 'bg-[#EA684F] shadow-[0_0_5px_rgba(234,104,79,0.8)]' : 'bg-white/10'}`}></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ── Smooth bezier helper (preserved, used in AnalyticsPanel) ─────────────────

    function smoothBezierPath(pts: { x: number; y: number }[]): string {
        if (pts.length < 2) return '';
        const d: string[] = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];
        for (let i = 1; i < pts.length; i++) {
            const p0 = pts[Math.max(0, i - 2)];
            const p1 = pts[i - 1];
            const p2 = pts[i];
            const p3 = pts[Math.min(pts.length - 1, i + 1)];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            d.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
        }
        return d.join(' ');
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  INTERACTIVE REVENUE CHART — Complete Redesign
    //  ✅ Windowed bar chart (10 days visible at a time)
    //  ✅ Prev / Next navigation — slides half a window
    //  ✅ Progress scrubber — click anywhere to jump
    //  ✅ Jump-to-date input — type a day number + press Enter / Go
    //  ✅ Tooltips always render ABOVE each bar — never clips, never overflows
    //  ✅ Full x-axis day labels for every visible bar
    //  ✅ Global avg reference line
    //  ✅ Staggered bar entrance animation
    // ════════════════════════════════════════════════════════════════════════════

    function InteractiveRevenueChart({
        data,
        monthLabel,
        currentDayInMonth,
    }: {
        data: number[];
        monthLabel: string;
        currentDayInMonth: number;
    }) {
        const DETAIL_WINDOW_SIZE = 10;

        const chartData  = data && data.length > 0 ? data : Array(30).fill(0);
        const totalDays  = chartData.length;

        // Start at the most-recent window so you land on latest data
        const [winStart,  setWinStart]  = useState(() => Math.max(0, totalDays - DETAIL_WINDOW_SIZE));
        const [viewMode,  setViewMode]  = useState<"month" | "detail">("month");
        const [activeIdx, setActiveIdx] = useState<number | null>(null);
        const [hoverIdx,  setHoverIdx]  = useState<number | null>(null);
        const [jumpDay,   setJumpDay]   = useState('');
        const [isLoaded,  setIsLoaded]  = useState(false);

        useEffect(() => {
            const t = setTimeout(() => setIsLoaded(true), 180);
            return () => clearTimeout(t);
        }, []);

        // Scale uses the whole month, but avg/active stats use elapsed days only.
        const elapsedData = getElapsedMonthRevenue(chartData, currentDayInMonth);
        const maxGlobal   = Math.max(...chartData, 1000);
        const avgGlobal   = elapsedData.length > 0
            ? elapsedData.reduce((a, b) => a + b, 0) / elapsedData.length
            : 0;
        const peakValue   = Math.max(...elapsedData, 0);
        const peakIdx     = peakValue > 0 ? chartData.indexOf(peakValue) : -1;
        const activeDays  = elapsedData.filter(v => v > 0).length;
        const fullMonth  = viewMode === "month";

        // Current visible window
        const effectiveWindowSize = fullMonth ? totalDays : Math.min(DETAIL_WINDOW_SIZE, totalDays);
        const chartStart = fullMonth ? 0 : winStart;
        const winEnd     = fullMonth ? totalDays : Math.min(winStart + effectiveWindowSize, totalDays);
        const windowData = chartData.slice(chartStart, winEnd);
        const canPrev    = !fullMonth && winStart > 0;
        const canNext    = !fullMonth && winEnd < totalDays;

        const slide = (dir: -1 | 1) => {
            setWinStart(s => {
                const next = s + dir * Math.ceil(DETAIL_WINDOW_SIZE / 2);
                return Math.max(0, Math.min(totalDays - DETAIL_WINDOW_SIZE, next));
            });
            setActiveIdx(null);
            setHoverIdx(null);
        };

        const jumpTo = () => {
            const d = parseInt(jumpDay, 10);
            if (isNaN(d) || d < 1 || d > totalDays) return;
            const idx      = d - 1;
            const newStart = Math.min(
                Math.max(0, idx - Math.floor(DETAIL_WINDOW_SIZE / 2)),
                Math.max(0, totalDays - DETAIL_WINDOW_SIZE),
            );
            setWinStart(newStart);
            setViewMode("detail");
            setActiveIdx(idx);
            setHoverIdx(null);
            setJumpDay('');
        };

        // Build bar descriptors for the visible window
        const bars = windowData.map((val, localIdx) => {
            const gi         = chartStart + localIdx;
            const rawH       = maxGlobal > 0 ? (val / maxGlobal) * 100 : 0;
            const heightPct  = val > 0 ? Math.max(rawH, 4) : 1.5;
            const isPeak     = gi === peakIdx;
            const isAboveAvg = val > avgGlobal && !isPeak;
            const isActive   = gi === activeIdx;
            const isHovered  = gi === hoverIdx;
            const day        = gi + 1;
            const tooltipAlign = fullMonth
                ? day <= 3
                    ? "left"
                    : day >= 21
                      ? "right"
                      : "center"
                : localIdx <= 1
                  ? "left"
                  : localIdx >= windowData.length - 2
                    ? "right"
                    : "center";

            return { val, gi, localIdx, heightPct, isPeak, isAboveAvg, isActive, isHovered, tooltipAlign, day };
        });

        // Scrubber thumb geometry
        const maxStart   = Math.max(0, totalDays - DETAIL_WINDOW_SIZE);
        const thumbPct   = totalDays > 0 ? (DETAIL_WINDOW_SIZE / totalDays) * 100 : 100;
        const thumbLeft  = maxStart > 0 ? (winStart / totalDays) * 100 : 0;

        // Avg line as % of chart bar height.
        const avgLinePct = maxGlobal > 0 ? (avgGlobal / maxGlobal) * 100 : 0;
        const avgLineBottom = `calc(${avgLinePct}% + 1px)`;
        const chartDynamicStyles = `
            .dashboard-rev-avg-line { bottom: ${avgLineBottom}; }
            .dashboard-scrubber-thumb-dynamic { left: ${thumbLeft}%; width: ${thumbPct}%; }
            ${bars.map((bar) => `
                .dashboard-rev-tooltip-${bar.gi} { bottom: ${bar.heightPct}%; }
                .dashboard-rev-peak-${bar.gi} { bottom: calc(${bar.heightPct}% + 4px); }
                .dashboard-rev-bar-${bar.gi} {
                    height: ${isLoaded ? `${bar.heightPct}%` : "0%"};
                    transition: height 0.65s cubic-bezier(0.16,1,0.3,1) ${bar.localIdx * 38}ms, filter 0.15s;
                }
                .dashboard-rev-day-${bar.gi} {
                    font-weight: ${bar.gi === peakIdx || bar.isActive ? 700 : 500};
                    color: ${bar.isActive ? "#B93D2A" : bar.gi === peakIdx ? "#E35336" : "#94a3b8"};
                    opacity: ${(!fullMonth || bar.day === 1 || bar.day === totalDays || bar.day % 5 === 0 || bar.isActive || bar.isHovered || bar.gi === peakIdx) ? 1 : 0};
                }
            `).join("")}
        `;

        return (
            <div className="dashboard-font-bdo flex flex-col gap-3 w-full select-none">
                <style dangerouslySetInnerHTML={{ __html: chartDynamicStyles }} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                        {([
                            { key: "month", label: "Bulan" },
                            { key: "detail", label: "10 Hari" },
                        ] as const).map(option => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => {
                                    setViewMode(option.key);
                                    setActiveIdx(null);
                                    setHoverIdx(null);
                                }}
                                className={cn(
                                    "rounded-lg px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wider transition-all",
                                    viewMode === option.key
                                        ? "bg-white text-[#B93D2A] shadow-sm ring-1 ring-[#FFD5CD]"
                                        : "text-slate-400 hover:text-slate-700",
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <span className="font-bdo text-[10px] font-medium text-slate-400">
                        {fullMonth ? `${totalDays} hari dalam satu tampilan` : `Tgl ${chartStart + 1}-${winEnd}`}
                    </span>
                </div>

                {/* ── KPI Strip ── */}
                <div className="grid grid-cols-3 gap-2">
                    {([
                        { label: "Hari Puncak", value: peakIdx >= 0 ? `Tgl ${peakIdx + 1}` : "-", accent: "text-[#E35336]",  bg: "bg-[#FFF1EE]  border-[#FFD5CD]"  },
                        { label: "Rata-rata",   value: formatRevenue(Math.round(avgGlobal)),  accent: "text-slate-800",   bg: "bg-slate-50   border-slate-100"   },
                        { label: "Hari Aktif",  value: `${activeDays} hari`,                   accent: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
                    ] as const).map(s => (
                        <div key={s.label} className={`rounded-xl border px-2.5 py-1.5 ${s.bg}`}>
                            <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{s.label}</p>
                            <p className={`font-clash text-sm font-bold ${s.accent}`}>{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* ── Active day detail banner ── */}
                {activeIdx !== null && (
                    <div className="bg-[#FFF1EE] border border-[#F8B5A8] rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3 animate-scale-in">
                        <div>
                            <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-[#E35336]/80">Detail Hari</p>
                            <p className="font-clash text-sm font-bold text-slate-900">{formatRupiahFull(chartData[activeIdx])}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-bdo text-[9px] text-slate-500 uppercase tracking-wide">{activeIdx + 1} {monthLabel}</p>
                            <p className={cn(
                                "font-bdo text-[10px] font-bold mt-0.5",
                                chartData[activeIdx] > avgGlobal ? "text-emerald-600" :
                                chartData[activeIdx] === 0 ? "text-slate-400" : "text-rose-500"
                            )}>
                                {chartData[activeIdx] > avgGlobal ? '↑ di atas rata-rata' :
                                 chartData[activeIdx] === 0 ? '— tidak ada transaksi' : '↓ di bawah rata-rata'}
                            </p>
                        </div>
                        <button
                            onClick={() => setActiveIdx(null)}
                            className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-lg hover:bg-[#FFD5CD] ml-auto flex-shrink-0"
                            aria-label="Tutup detail hari"
                            title="Tutup detail hari"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* ── Chart Body ── */}
                {/*
                    CRITICAL: overflow: visible on every ancestor of the tooltip
                    so bars near the top never clip the floating tooltip.
                */}
                <div className="dashboard-visible min-w-0 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="dashboard-visible-only flex min-w-0 gap-2">

                        {/* Y-axis labels */}
                        <div className="dashboard-y-axis flex flex-col justify-between text-right flex-shrink-0 pb-7">
                            <span className="font-bdo text-[9px] font-medium text-slate-300">{formatRevenue(maxGlobal)}</span>
                            <span className="font-bdo text-[9px] font-medium text-slate-300">{formatRevenue(Math.round(maxGlobal * 0.5))}</span>
                            <span className="dashboard-zero-label font-bdo text-[9px] font-medium">0</span>
                        </div>

                        {/* Bar + x-axis wrapper */}
                        <div className="dashboard-visible min-w-0 flex-1">

                            {/* Fixed-height bar area — this is the coordinate space for avg line */}
                            <div className="dashboard-chart-area">

                                {/* Grid lines */}
                                <div className="dashboard-grid-wrap absolute inset-x-0 pointer-events-none">
                                    <div className="dashboard-grid-top absolute inset-x-0" />
                                    <div className="dashboard-grid-mid absolute inset-x-0" />
                                    <div className="dashboard-grid-base absolute inset-x-0" />
                                </div>

                                {/* Average reference line */}
                                {avgGlobal > 0 && (
                                    <div className="dashboard-avg-line dashboard-rev-avg-line absolute inset-x-0 pointer-events-none">
                                        <span className="dashboard-avg-label absolute font-bdo text-[8px] font-bold whitespace-nowrap">
                                            avg {formatRevenue(Math.round(avgGlobal))}
                                        </span>
                                    </div>
                                )}

                                {/* Bar columns */}
                                <div className={cn("dashboard-full-visible flex min-w-0 items-end", fullMonth ? "gap-px" : "gap-1.5")}>
                                    {bars.map((bar) => (
                                        <div
                                            key={bar.gi}
                                            className="dashboard-full-visible-only relative flex min-w-0 flex-1 cursor-pointer flex-col items-stretch justify-end"
                                            onClick={() => setActiveIdx(bar.isActive ? null : bar.gi)}
                                            onMouseEnter={() => setHoverIdx(bar.gi)}
                                            onMouseLeave={() => setHoverIdx(null)}
                                        >
                                            {/* ── Tooltip (both hover and active state) ─────────────────────── */}
                                            {/*
                                                Position: bottom = bar's rendered height % (of the 160px column),
                                                so the tooltip sits exactly at the top of the bar.
                                                translateY(-10px) adds a small visual gap.
                                                translateX(-50%) centres it over the bar.
                                                overflow: visible on all parents guarantees it's never clipped.
                                            */}
                                            <div
                                                className={cn(
                                                    `dashboard-rev-tooltip-${bar.gi}`,
                                                    "absolute pointer-events-none w-max z-30",
                                                    "transition-opacity duration-150",
                                                    bar.tooltipAlign === "left"
                                                        ? "dashboard-tooltip-left"
                                                        : bar.tooltipAlign === "right"
                                                          ? "dashboard-tooltip-right"
                                                          : "dashboard-tooltip-center",
                                                    bar.isActive || bar.isHovered
                                                        ? "opacity-100 animate-scale-in"
                                                        : "opacity-0",
                                                )}
                                            >
                                                <div className="dashboard-tooltip-card overflow-hidden rounded-xl ring-2 ring-[#F08C78]">
                                                    <div className="dashboard-tooltip-head flex items-center gap-1.5 px-3 py-1.5">
                                                        <LiveDot size="xs" color="#ffffff" halo="rgba(255,255,255,0.3)" />
                                                        <p
                                                            className="font-bdo text-[9px] font-bold uppercase tracking-widest whitespace-nowrap text-white"
                                                        >
                                                            {bar.day} {monthLabel}
                                                        </p>
                                                    </div>
                                                    <div className="px-3 py-2.5">
                                                        <p className="font-clash text-sm font-bold text-slate-950 whitespace-nowrap">
                                                            {formatRupiahFull(bar.val)}
                                                        </p>
                                                        <p className="mt-0.5 font-bdo text-[9px] font-bold uppercase tracking-wider text-[#E35336]">
                                                            Detail pendapatan
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Peak crown indicator */}
                                            {bar.isPeak && isLoaded && (
                                                <div
                                                    className={cn(`dashboard-rev-peak-${bar.gi}`, "dashboard-peak-marker absolute font-bdo text-[9px] font-bold text-[#E35336] pointer-events-none")}
                                                >
                                                    ▲
                                                </div>
                                            )}

                                            {/* The actual bar */}
                                            <div
                                                className={cn(
                                                    `dashboard-rev-bar-${bar.gi}`,
                                                    "w-full rounded-t-[5px] rev-bar",
                                                    bar.isPeak ? "dashboard-bar-peak" : bar.isAboveAvg ? "dashboard-bar-above" : "dashboard-bar-normal",
                                                    bar.isActive && "dashboard-bar-active",
                                                )}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>{/* end 160px bar area */}

                            {/* X-axis day labels */}
                            <div className={cn("flex min-w-0 mt-2", fullMonth ? "gap-px" : "gap-1.5")}>
                                {bars.map((bar) => {
                                    const showFullMonthLabel =
                                        !fullMonth ||
                                        bar.day === 1 ||
                                        bar.day === totalDays ||
                                        bar.day % 5 === 0 ||
                                        bar.isActive ||
                                        bar.isHovered ||
                                        bar.gi === peakIdx;

                                    return (
                                        <div key={bar.gi} className="min-w-0 flex-1 text-center">
                                            <span className={cn(`dashboard-rev-day-${bar.gi}`, "block truncate font-bdo", fullMonth ? "text-[7px] sm:text-[8px]" : "text-[9px]")}>
                                                {showFullMonthLabel ? bar.day : ""}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                        </div>{/* end bar+x wrapper */}
                    </div>{/* end y+chart flex */}

                    {/* Legend pills */}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100/80">
                        {([
                            { tone: 'dashboard-legend-peak', label: 'Puncak' },
                            { tone: 'dashboard-legend-above', label: 'Di atas avg' },
                            { tone: 'dashboard-legend-normal', label: 'Normal' },
                        ] as const).map(l => (
                            <div key={l.label} className="flex items-center gap-1.5">
                                <div className={cn("w-2.5 h-2.5 rounded-[3px]", l.tone)} />
                                <span className="font-bdo text-[9px] text-slate-400">{l.label}</span>
                            </div>
                        ))}
                    </div>
                </div>{/* end chart body card */}

                {/* ── Navigation Bar ── */}
                <div className={cn("flex items-center gap-2", fullMonth && "opacity-60")}>

                    {/* Prev button */}
                    <button
                        onClick={() => slide(-1)}
                        disabled={!canPrev}
                        className={`chart-nav-btn ${canPrev ? 'enabled' : 'disabled'}`}
                        title="Periode sebelumnya"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Scrubber */}
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                        <div className="dashboard-axis-row flex justify-between">
                            <span className="font-bdo text-[9px] text-slate-400">Tgl {chartStart + 1}</span>
                            <span className="dashboard-axis-month font-bdo text-[9px] font-bold">{monthLabel}</span>
                            <span className="font-bdo text-[9px] text-slate-400">Tgl {winEnd}</span>
                        </div>
                        <div
                            className="scrubber-track"
                            onClick={(e) => {
                                if (fullMonth) {
                                    setViewMode("detail");
                                }
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                setWinStart(Math.round(pct * maxStart));
                                setActiveIdx(null);
                                setHoverIdx(null);
                            }}
                        >
                            <div className="dashboard-scrubber-thumb-dynamic scrubber-thumb" />
                        </div>
                    </div>

                    {/* Next button */}
                    <button
                        onClick={() => slide(1)}
                        disabled={!canNext}
                        className={`chart-nav-btn ${canNext ? 'enabled' : 'disabled'}`}
                        title="Periode berikutnya"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>

                    {/* Jump-to-date */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <input
                            type="number"
                            min={1}
                            max={totalDays}
                            value={jumpDay}
                            onChange={e  => setJumpDay(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && jumpTo()}
                            placeholder="Tgl"
                            className="jump-input"
                        />
                        <button onClick={jumpTo} className="jump-go-btn">
                            Go
                        </button>
                    </div>
                </div>

            </div>
        );
    }

    // ── Premium Identity Queue ────────────────────────────────────────────────────

    function PremiumIdentityQueue({ count, canManageIdentity }: { count: number; canManageIdentity: boolean }) {
        const safeCount    = Math.max(0, count ?? 0);
        const urgencyPct   = Math.min(safeCount * 10, 100);
        const urgencyLabel = safeCount > 5 ? "Prioritas tinggi" : safeCount > 2 ? "Perlu dipantau" : safeCount > 0 ? "Terkendali" : "Bersih";
        const urgencyTone = safeCount > 5 ? "dashboard-urgency-red" : safeCount > 2 ? "dashboard-urgency-orange" : safeCount > 0 ? "dashboard-urgency-green" : "dashboard-urgency-slate";
        const queueStyles = `.dashboard-identity-queue-progress { width: ${urgencyPct}%; }`;
        const queueMessage = safeCount > 0
            ? `${safeCount} akun menunggu validasi identitas.`
            : "Tidak ada akun yang menunggu validasi.";
        const actionLabel = "Kelola Antrean";
        const handleOpenIdentityQueue = () => {
            if (!canManageIdentity) return;
            router.get(route("admin.identity.index"));
        };

        return (
            <div className="animate-fade-in-up delay-400 relative flex flex-col gap-4 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-5 transition-colors hover:border-[#F8B5A8]">
                <style dangerouslySetInnerHTML={{ __html: queueStyles }} />
                <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#F8B5A8]/80 to-transparent" />

                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <ShinyIcon className="h-10 w-10">
                            <UserCheck className="h-4 w-4 text-white" />
                        </ShinyIcon>
                        <div className="min-w-0">
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-[#E35336]">Verifikasi</p>
                            <h2 className="truncate font-clash text-base font-semibold leading-tight text-slate-900">Antrean Identitas</h2>
                            <p className="mt-0.5 line-clamp-1 font-bdo text-[11px] font-medium text-slate-500">{queueMessage}</p>
                        </div>
                    </div>
                    <div className="relative shrink-0">
                        <div className={cn("absolute inset-0 rounded-2xl opacity-10 blur-lg", urgencyTone)} />
                        <div className="relative flex h-14 w-14 flex-col items-center justify-center rounded-2xl border border-[#FFD5CD] bg-[#FFF1EE]/70">
                            <span className="font-clash text-2xl font-bold leading-none text-slate-900">{safeCount}</span>
                            <span className="mt-0.5 font-bdo text-[8px] font-bold uppercase text-slate-400">akun</span>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", urgencyTone)} />
                            <span className="truncate font-bdo text-[12px] font-semibold text-slate-700">{urgencyLabel}</span>
                        </div>
                        <span className={cn("shrink-0 rounded-full border px-2.5 py-1 font-bdo text-[10px] font-bold", canManageIdentity ? "border-emerald-100 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-white text-slate-500")}>
                            {canManageIdentity ? "Akses aktif" : "Read only"}
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white">
                        <div
                            className={cn("dashboard-identity-queue-progress h-full rounded-full transition-all duration-700", urgencyTone)}
                        />
                    </div>
                    <p className="mt-2 font-bdo text-[11px] font-medium leading-relaxed text-slate-500">
                        {safeCount > 0
                            ? "Buka antrean untuk mengecek dokumen dan memberi keputusan verifikasi."
                            : "Antrean kosong. Jumlah baru akan muncul saat ada pengajuan identitas."}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleOpenIdentityQueue}
                    disabled={!canManageIdentity}
                    title={canManageIdentity ? actionLabel : "Role ini belum memiliki akses verify-identity"}
                    className={cn(
                        "group flex w-full items-center justify-center gap-2 rounded-xl py-3 font-clash text-sm font-medium transition-all active:scale-[0.98]",
                        canManageIdentity
                            ? "border border-[#F8B5A8] bg-[#FFF1EE] text-[#8F2E20] hover:bg-[#FFD5CD]"
                            : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400",
                    )}
                >
                    {canManageIdentity ? actionLabel : "Akses dibatasi"}
                    <ChevronRight className={cn("h-4 w-4 transition-transform", canManageIdentity ? "text-[#B93D2A] group-hover:translate-x-1" : "text-slate-400")} />
                </button>
            </div>
        );
    }

    // ── Activity Feed ─────────────────────────────────────────────────────────────

    const ACTIVITY_ICON: Record<RecentActivity["type"], React.ReactNode> = {
        booking:    <CalendarCheck2 className="w-4 h-4 text-[#EA684F]" />,
        membership: <Users          className="w-4 h-4 text-purple-400" />,
        payment:    <CreditCard     className="w-4 h-4 text-emerald-400" />,
    };

    const ACTIVITY_BAR: Record<RecentActivity["type"], string> = {
        booking:    "bg-[#E35336] shadow-[0_0_10px_rgba(227,83,54,0.6)]",
        membership: "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.6)]",
        payment:    "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]",
    };

    const ACTIVITY_DOT: Record<RecentActivity["type"], string> = {
        booking:    "bg-[#E35336]",
        membership: "bg-purple-500",
        payment:    "bg-emerald-500",
    };

    const ACTIVITY_CARD_TONE: Record<RecentActivity["type"], string> = {
        booking:    "border-[#FFD5CD] bg-[#FFF1EE]/45",
        membership: "border-purple-100 bg-purple-50/45",
        payment:    "border-emerald-100 bg-emerald-50/45",
    };

    const ACTIVITY_TYPE_LABEL: Record<RecentActivity["type"], string> = {
        booking:    "Booking",
        membership: "Membership",
        payment:    "Pembayaran",
    };

    const ACTIVITY_TYPE_COLOR: Record<RecentActivity["type"], string> = {
        booking:    "text-[#B93D2A] bg-[#FFF1EE] border-[#FFD5CD]",
        membership: "text-purple-600 bg-purple-50 border-purple-100",
        payment:    "text-emerald-600 bg-emerald-50 border-emerald-100",
    };

    function ActivityFeed({ items }: { items: RecentActivity[] }) {
        if (items.length === 0) {
            return (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 py-12 text-center animate-fade-in-up">
                    <div className="rounded-2xl border border-slate-100 bg-white p-5">
                        <Activity className="h-8 w-8 text-slate-300" />
                    </div>
                    <div>
                        <p className="font-clash text-sm font-semibold text-slate-700">Belum ada aktivitas</p>
                        <p className="mt-1 font-bdo text-[11px] text-slate-400">Aktivitas terbaru akan muncul di sini.</p>
                    </div>
                </div>
            );
        }

        const counts = items.reduce(
            (acc, item) => {
                acc[item.type] += 1;
                return acc;
            },
            { booking: 0, membership: 0, payment: 0 } as Record<RecentActivity["type"], number>,
        );

        return (
            <div className="flex min-h-0 flex-col gap-4">
                <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(counts) as RecentActivity["type"][]).map((type) => (
                        <div key={type} className={cn("rounded-2xl border px-3 py-2.5", ACTIVITY_CARD_TONE[type])}>
                            <div className="flex items-center justify-between gap-2">
                                <span className={cn("h-2 w-2 rounded-full", ACTIVITY_DOT[type])} />
                                <span className="font-clash text-sm font-semibold text-slate-900 tabular-nums">{counts[type]}</span>
                            </div>
                            <p className="mt-1 truncate font-bdo text-[9px] font-bold uppercase tracking-wide text-slate-500">
                                {ACTIVITY_TYPE_LABEL[type]}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="dashboard-touch-scroll custom-scrollbar max-h-[430px] overflow-y-auto overscroll-contain pr-1 sm:max-h-[500px] xl:max-h-[560px]">
                    <div className="relative flex flex-col gap-3 pl-3">
                        <span className="pointer-events-none absolute bottom-4 left-[7px] top-4 w-px bg-gradient-to-b from-[#F8B5A8] via-slate-200 to-transparent" />
                        {items.map((item, index) => {
                            const isFirst   = index === 0;
                            const animDelayClass = `dashboard-activity-delay-${Math.min(index + 1, 10)}`;

                            return (
                                <div
                                    key={`${item.type}-${item.id}`}
                                    className={cn(
                                        "animate-fade-in-up group relative rounded-[20px] border bg-white p-4 transition-all duration-300 hover:-translate-y-0.5",
                                        animDelayClass,
                                        isFirst ? "border-[#F8B5A8] bg-gradient-to-br from-[#FFF1EE]/70 to-white" : "border-slate-100 hover:border-[#F8B5A8]",
                                    )}
                                >
                                    <span className={cn("absolute -left-[11px] top-5 h-3.5 w-3.5 rounded-full border-2 border-white", ACTIVITY_DOT[item.type])} />
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 flex-1 gap-3">
                                            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border", ACTIVITY_CARD_TONE[item.type])}>
                                                {ACTIVITY_ICON[item.type]}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-clash text-sm font-semibold leading-tight text-slate-900">{item.title}</h3>
                                                    {isFirst && (
                                                        <span className="rounded-full border border-[#F8B5A8] bg-[#FFF1EE] px-2 py-0.5 font-bdo text-[9px] font-bold uppercase tracking-wide text-[#B93D2A]">
                                                            Terbaru
                                                        </span>
                                                    )}
                                                    <span className={cn("rounded-full border px-2 py-0.5 font-bdo text-[9px] font-bold uppercase tracking-wide", ACTIVITY_TYPE_COLOR[item.type])}>
                                                        {ACTIVITY_TYPE_LABEL[item.type]}
                                                    </span>
                                                </div>
                                                <p className="mt-1 line-clamp-2 font-bdo text-[11px] leading-relaxed text-slate-500">{item.subtitle}</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-2">
                                            <span className="rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 font-bdo text-[10px] font-semibold text-slate-400 whitespace-nowrap">
                                                {item.time}
                                            </span>
                                            <MoreHorizontal className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
                                        </div>
                                    </div>
                                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
                                        <div className={cn("h-full rounded-full", ACTIVITY_BAR[item.type].split(" ")[0], isFirst ? "dashboard-activity-progress-full" : "dashboard-activity-progress-wide")} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // ── OccupancyCard ─────────────────────────────────────────────────────────────

    function OccupancyCard({ facilities }: { facilities: OccupancyFacility[] }) {
        const overall = facilities.length > 0
            ? Math.round(facilities.reduce((sum, f) => sum + f.pct, 0) / facilities.length)
            : 0;

        const busiest = facilities.length > 0
            ? [...facilities].sort((a, b) => b.pct - a.pct)[0]
            : null;
        const quietest = facilities.length > 0
            ? [...facilities].sort((a, b) => a.pct - b.pct)[0]
            : null;
        const overallLabel = overall >= 75 ? "Padat" : overall >= 45 ? "Stabil" : "Lapang";
        const overallTone = overall >= 75
            ? "text-red-600 bg-red-50 border-red-100"
            : overall >= 45
                ? "text-[#B93D2A] bg-[#FFF1EE] border-[#FFD5CD]"
                : "text-emerald-600 bg-emerald-50 border-emerald-100";
        const occupancyStyles = `
            .dashboard-occupancy-overall { width: ${overall}%; }
            ${facilities.map((f, i) => `
                .dashboard-facility-delay-${i} { animation-delay: ${(i + 4) * 70}ms; }
                .dashboard-facility-dot-${i} { background-color: ${f.color}; }
                .dashboard-facility-progress-${i} { width: ${f.pct}%; background: linear-gradient(90deg, ${f.color}aa, ${f.color}); }
            `).join("")}
        `;

        return (
            <div className="animate-fade-in-up delay-300 relative flex flex-col overflow-hidden rounded-[26px] border border-slate-200/80 bg-white">
                <style dangerouslySetInnerHTML={{ __html: occupancyStyles }} />
                <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#F8B5A8] to-transparent" />

                <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <ShinyIcon className="h-10 w-10">
                            <Activity className="w-4 h-4 text-white" />
                        </ShinyIcon>
                        <div className="min-w-0">
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">Real-time</p>
                            <h2 className="font-clash text-base font-semibold text-slate-900 leading-tight">Okupansi Lapangan</h2>
                            <p className="font-bdo text-[11px] font-medium text-slate-500">{facilities.length} fasilitas aktif</p>
                        </div>
                    </div>
                    <span className={cn("rounded-xl border px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wide", overallTone)}>
                        {overallLabel}
                    </span>
                </div>

                <div className="px-4 pb-4 pt-3 sm:px-5">
                    <div className="relative overflow-hidden rounded-[22px] border border-[#F8B5A8]/70 bg-[radial-gradient(circle_at_86%_12%,rgba(255,255,255,0.30),transparent_30%),linear-gradient(135deg,#EA684F_0%,#E35336_54%,#F08C78_100%)] p-3.5 text-white">
                        <div className="pointer-events-none absolute -right-12 -top-16 h-32 w-32 rounded-full border border-white/20" />
                        <div className="relative z-10">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-white/70">Rata-rata Hari Ini</p>
                                    <div className="mt-1 flex items-end gap-2">
                                        <span className="font-clash text-[3rem] font-bold leading-none tracking-normal">{overall}%</span>
                                        <span className="mb-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 font-bdo text-[10px] font-bold uppercase tracking-wide">
                                            {overallLabel}
                                        </span>
                                    </div>
                                </div>
                                <div className="hidden rounded-2xl border border-white/20 bg-white/15 px-3 py-2 text-right sm:block">
                                    <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-white/70">Lapangan</p>
                                    <p className="font-clash text-lg font-semibold">{facilities.length}</p>
                                </div>
                            </div>

                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/25">
                                <div className="dashboard-occupancy-overall h-full rounded-full bg-white transition-all duration-700" />
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <div className="min-w-0 rounded-2xl border border-white/18 bg-white/14 p-2.5 backdrop-blur">
                                    <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-white/65">Terpadat</p>
                                    <p className="mt-1 truncate font-clash text-sm font-semibold">{busiest?.name ?? "-"}</p>
                                    <p className="mt-0.5 font-bdo text-[10px] font-semibold text-white/80">{busiest ? `${busiest.pct}% terisi` : "0%"}</p>
                                </div>
                                <div className="min-w-0 rounded-2xl border border-white/18 bg-white/14 p-2.5 backdrop-blur">
                                    <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-white/65">Terlapang</p>
                                    <p className="mt-1 truncate font-clash text-sm font-semibold">{quietest?.name ?? "-"}</p>
                                    <p className="mt-0.5 font-bdo text-[10px] font-semibold text-white/80">{quietest ? `${quietest.pct}% terisi` : "0%"}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 rounded-[20px] border border-slate-100 bg-slate-50/70 p-2.5">
                        <div className="mb-2 flex items-center justify-between px-1">
                            <span className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">Detail Lapangan</span>
                            <span className="font-bdo text-[10px] font-bold text-[#B93D2A]">{facilities.length} item</span>
                        </div>
                        {facilities.length > 0 ? (
                            <div className="dashboard-touch-scroll custom-scrollbar max-h-[136px] space-y-2 overflow-y-auto overscroll-contain pr-1 sm:max-h-[148px]">
                                {facilities.map((f, i) => {
                                    const facilityLabel = f.pct >= 75 ? "Padat" : f.pct >= 45 ? "Normal" : "Lapang";
                                    return (
                                        <div key={f.name} className={cn(`dashboard-facility-delay-${i}`, "animate-fade-in-up rounded-2xl border border-slate-100 bg-white p-2.5 transition-all hover:-translate-y-0.5 hover:border-[#F8B5A8]")}>
                                            <div className="mb-1.5 flex items-start justify-between gap-3">
                                                <div className="flex min-w-0 items-center gap-2.5">
                                                    <span className={cn(`dashboard-facility-dot-${i}`, "h-2.5 w-2.5 shrink-0 rounded-full")} />
                                                    <div className="min-w-0">
                                                        <p className="truncate font-clash text-[13px] font-semibold text-slate-900">{f.name}</p>
                                                        <p className="font-bdo text-[9px] font-semibold uppercase tracking-wide text-slate-400">{facilityLabel}</p>
                                                    </div>
                                                </div>
                                                <span className="rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 font-clash text-[11px] font-semibold text-slate-800">{f.pct}%</span>
                                            </div>
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                                <div className={cn(`dashboard-facility-progress-${i}`, "occ-bar-inner h-full rounded-full")} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="py-6 text-center text-sm font-bdo text-slate-400">Belum ada data fasilitas.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Analytics Panel ───────────────────────────────────────────────────────────

    function AnalyticsPanel({
        dailyRevenue,
        occupancyData,
        stats,
        currentMonthLabel,
        currentDayInMonth,
        onClose,
    }: {
        dailyRevenue: number[];
        occupancyData: OccupancyFacility[];
        stats: DashboardStats;
        currentMonthLabel: string;
        currentDayInMonth: number;
        onClose: () => void;
    }) {
        const safeData    = dailyRevenue && dailyRevenue.length > 0 ? dailyRevenue : [];
        const elapsedData = getElapsedMonthRevenue(safeData, currentDayInMonth);
        const maxRev      = Math.max(...safeData, 1);
        const avgRev      = elapsedData.length > 0 ? elapsedData.reduce((a, b) => a + b, 0) / elapsedData.length : 0;
        const peakValue   = Math.max(...elapsedData, 0);
        const peakIdx     = peakValue > 0 ? safeData.indexOf(peakValue) : -1;
        const peakDay     = peakIdx + 1;
        const activeDays  = elapsedData.filter(d => d > 0).length;
        const overallOcc = occupancyData.length > 0
            ? Math.round(occupancyData.reduce((s, f) => s + f.pct, 0) / occupancyData.length)
            : 0;

        const [selectedBar, setSelectedBar] = useState<number | null>(null);

        const kpis = [
            {
                label:  "Hari Puncak",
                value:  peakIdx >= 0 ? `${peakDay} ${currentMonthLabel}` : "-",
                sub:    formatRupiahFull(peakValue),
                accent: "text-[#B93D2A]",
                icon:   "🏆",
                bg:     "bg-[#FFF1EE] border-[#F8B5A8]",
                iconBg: "bg-[#FFD5CD]",
            },
            {
                label:  "Rata-rata Harian",
                value:  formatRevenue(Math.round(avgRev)),
                sub:    `per hari berjalan`,
                accent: "text-slate-800",
                icon:   "📊",
                bg:     "bg-slate-50 border-slate-200",
                iconBg: "bg-slate-100",
            },
            {
                label:  "Hari Aktif",
                value:  `${activeDays}`,
                sub:    `dari ${elapsedData.length} hari berjalan`,
                accent: "text-emerald-700",
                icon:   "✅",
                bg:     "bg-emerald-50 border-emerald-200",
                iconBg: "bg-emerald-100",
            },
            {
                label:  "Rerata Okupansi",
                value:  `${overallOcc}%`,
                sub:    `${occupancyData.length} fasilitas`,
                accent: "text-violet-700",
                icon:   "🏟️",
                bg:     "bg-violet-50 border-violet-200",
                iconBg: "bg-violet-100",
            },
        ];
        const analyticsStyles = `
            ${kpis.map((_, i) => `.dashboard-analytics-kpi-${i} { animation-delay: ${i * 70}ms; }`).join("")}
            ${safeData.map((val, i) => {
                const heightPct  = maxRev > 0 ? (val / maxRev) * 92 : 2;
                const isPeak     = i === peakIdx;
                const isAboveAvg = val > avgRev && !isPeak;
                const isSelected = i === selectedBar;
                return `
                    .dashboard-analytics-bar-${i} {
                        height: ${Math.max(heightPct, 2)}%;
                        background: ${isPeak ? "linear-gradient(180deg, #E35336, #B93D2A)" : isAboveAvg ? "linear-gradient(180deg, #F08C78, #EA684F)" : "#e2e8f0"};
                        box-shadow: ${isPeak ? "0 0 8px rgba(227,83,54,.4)" : "none"};
                        outline: ${isSelected ? "2px solid rgba(227,83,54,.6)" : "none"};
                    }
                `;
            }).join("")}
            .dashboard-analytics-avg-line { bottom: calc(${Math.min((avgRev / maxRev) * 92, 92)}% + 12px); }
            ${occupancyData.map((f, i) => `
                .dashboard-analytics-facility-${i} { animation-delay: ${i * 60 + 200}ms; }
                .dashboard-analytics-dot-${i} { background-color: ${f.color}; box-shadow: 0 0 6px ${f.color}70; }
                .dashboard-analytics-progress-${i} {
                    width: ${f.pct}%;
                    background: linear-gradient(90deg, ${f.color}aa, ${f.color});
                    animation-delay: ${i * 60 + 300}ms;
                }
            `).join("")}
        `;

        return (
            <div className="analytics-dark-enter bg-white rounded-[24px] border border-slate-200/80 shadow-[0_8px_32px_rgba(0,0,0,0.06)] overflow-hidden relative card-glint">
                <style dangerouslySetInnerHTML={{ __html: analyticsStyles }} />
                <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F08C78]/60 to-transparent z-10" />
                <div className="pointer-events-none absolute top-0 right-0 w-72 h-72 bg-[#FFF1EE]/60 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
                <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 bg-violet-50/40 rounded-full translate-y-1/2 -translate-x-1/3 blur-3xl" />

                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-[#FFF1EE]/60 via-white to-white relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F08C78] via-[#E35336] to-[#B93D2A] text-white shadow-[0_14px_28px_-18px_rgba(227,83,54,0.95)]">
                            <BarChart3 className="w-4 h-4 text-white" />
                            <span className="pointer-events-none absolute left-[7px] right-[7px] top-[5px] h-[4px] rounded-full bg-white/35 blur-[1px]" />
                        </div>
                        <div>
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-[#E35336]">Analitik Mendalam</p>
                            <p className="font-clash text-lg font-semibold text-slate-900 leading-tight">Ringkasan {currentMonthLabel}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 border border-transparent hover:border-slate-200"
                        aria-label="Tutup panel analitik"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 border-b border-slate-100 relative z-10">
                    {kpis.map((kpi, i) => (
                        <div
                            key={kpi.label}
                            className={cn(`dashboard-analytics-kpi-${i}`, "rounded-2xl p-4 border animate-fade-in-up relative overflow-hidden", kpi.bg)}
                        >
                            <div className="absolute top-3 right-3 text-base opacity-50">{kpi.icon}</div>
                            <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">{kpi.label}</p>
                            <p className={cn("font-clash text-xl font-bold leading-tight", kpi.accent)}>{kpi.value}</p>
                            <p className="font-bdo text-[10px] text-slate-500 mt-1.5">{kpi.sub}</p>
                        </div>
                    ))}
                </div>

                {safeData.length > 0 && (
                    <div className="px-6 py-5 border-b border-slate-100 relative z-10">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                            <div>
                                <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-slate-400">Distribusi Pendapatan Harian</p>
                                <p className="font-clash text-sm font-semibold text-slate-800 mt-0.5">{currentMonthLabel}</p>
                            </div>
                            <div className="flex items-center gap-3 font-bdo text-[10px] text-slate-400">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-sm bg-[#E35336] inline-block shadow-[0_0_4px_rgba(227,83,54,0.4)]"></span>Puncak
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-sm bg-[#F8B5A8] inline-block"></span>Di atas rata-rata
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-sm bg-slate-200 inline-block"></span>Rendah
                                </span>
                            </div>
                        </div>

                        {selectedBar !== null && (
                            <div className="mb-3 bg-[#FFF1EE] border border-[#F8B5A8] rounded-2xl px-4 py-3 flex items-center justify-between animate-scale-in">
                                <div>
                                    <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-[#E35336]/80">Detail Hari</p>
                                    <p className="font-clash text-base font-bold text-slate-900">{formatRupiahFull(safeData[selectedBar])}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bdo text-[9px] text-slate-500 uppercase tracking-wide">{selectedBar + 1} {currentMonthLabel}</p>
                                    <p className={cn("font-bdo text-[10px] font-bold mt-0.5", safeData[selectedBar] > avgRev ? "text-emerald-600" : safeData[selectedBar] === 0 ? "text-slate-400" : "text-rose-500")}>
                                        {safeData[selectedBar] > avgRev ? '↑ Di atas rata-rata' : safeData[selectedBar] === 0 ? '— Tidak ada transaksi' : '↓ Di bawah rata-rata'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedBar(null)}
                                    className="text-slate-400 hover:text-slate-700 transition-colors ml-3"
                                    aria-label="Tutup detail hari analitik"
                                    title="Tutup detail hari analitik"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        <div className="relative bg-slate-50/70 rounded-2xl p-3 border border-slate-100">
                            <div className="flex items-end gap-[2px] sm:gap-[3px] h-36 w-full">
                                {safeData.map((val, i) => {
                                    const heightPct  = maxRev > 0 ? (val / maxRev) * 92 : 2;
                                    const isPeak     = i === peakIdx;
                                    const isAboveAvg = val > avgRev && !isPeak;
                                    const isSelected = i === selectedBar;
                                    return (
                                        <div
                                            key={i}
                                            className={cn(`dashboard-analytics-bar-${i}`, "relative flex-1 rounded-t-[3px] group cursor-pointer")}
                                            title={`${i + 1} ${currentMonthLabel}: ${formatRupiahFull(val)}`}
                                            onClick={() => setSelectedBar(selectedBar === i ? null : i)}
                                        >
                                            {isPeak && (
                                                <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-bdo text-[9px] font-bold text-[#E35336] whitespace-nowrap">▲</span>
                                            )}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10 whitespace-nowrap">
                                                <div className="bg-white border border-[#F8B5A8] rounded-lg px-2 py-1 shadow-md">
                                                    <p className="font-bdo text-[9px] text-[#E35336] font-bold">{i + 1}</p>
                                                    <p className="font-clash text-[10px] text-slate-800 font-semibold">{formatRevenue(val)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="dashboard-analytics-avg-line absolute left-3 right-3 border-t border-dashed border-[#EA684F]/40 pointer-events-none">
                                <span className="absolute right-0 -top-3.5 font-bdo text-[8px] text-[#E35336]/70 font-bold bg-white px-1 rounded">avg</span>
                            </div>
                        </div>
                        <div className="flex justify-between mt-2 font-bdo text-[9px] text-slate-400">
                            <span>1</span>
                            <span className="text-[#E35336]/70 font-bold">{currentMonthLabel}</span>
                            <span>{safeData.length}</span>
                        </div>
                    </div>
                )}

                {occupancyData.length > 0 && (
                    <div className="px-6 pb-6 pt-5 relative z-10">
                        <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Breakdown Fasilitas</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {occupancyData.map((f, i) => (
                                <div
                                    key={f.name}
                                    className={cn(`dashboard-analytics-facility-${i}`, "flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 animate-fade-in-up hover:bg-white hover:shadow-sm transition-all duration-200")}
                                >
                                    <div className={cn(`dashboard-analytics-dot-${i}`, "w-3 h-3 rounded-full flex-shrink-0")} />
                                    <span className="font-bdo text-[12px] text-slate-600 flex-1 min-w-0 truncate">{f.name}</span>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <div className="w-16 h-[3px] bg-slate-200 rounded-full overflow-hidden">
                                            <div className={cn(`dashboard-analytics-progress-${i}`, "h-full rounded-full progress-fill")} />
                                        </div>
                                        <span className="font-clash text-[13px] font-semibold text-slate-700 w-8 text-right tabular-nums">{f.pct}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── ReportPrintTemplate ───────────────────────────────────────────────────────

    interface ReportPrintTemplateProps {
        stats: DashboardStats;
        revenueTrend: number;
        dailyRevenue: number[];
        currentDayInMonth: number;
        currentMonthLabel: string;
        occupancyData: OccupancyFacility[];
    }

    function ReportPrintTemplate({
        stats, revenueTrend, dailyRevenue, currentDayInMonth, currentMonthLabel, occupancyData,
    }: ReportPrintTemplateProps) {
        const now        = new Date();
        const dateStr    = now.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
        const reportNo   = `LPR/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
        const trendSign  = revenueTrend >= 0 ? "+" : "";

        const safeRevenue    = dailyRevenue ?? [];
        const elapsedRevenue = getElapsedMonthRevenue(safeRevenue, currentDayInMonth);
        const activeDays     = elapsedRevenue.filter(v => v > 0).length;
        const avgRevenue     = elapsedRevenue.length > 0
            ? Math.round(elapsedRevenue.reduce((a, b) => a + b, 0) / elapsedRevenue.length)
            : 0;
        const peakRevenue    = Math.max(...elapsedRevenue, 0);
        const peakDay        = peakRevenue > 0 ? safeRevenue.indexOf(peakRevenue) + 1 : null;

        const rp = (v: number) =>
            new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
        const num = (v: number) => new Intl.NumberFormat("id-ID").format(v);

        const rows: { kategori: string; detail: string; satuan: string; nilai: string }[] = [
            { kategori: "Pendapatan", detail: "Total Pendapatan Bulan Ini",                satuan: currentMonthLabel,    nilai: rp(stats.totalRevenue) },
            { kategori: "Pendapatan", detail: "Rata-rata Pendapatan Harian",               satuan: `${elapsedRevenue.length} hari berjalan`, nilai: rp(avgRevenue) },
            { kategori: "Pendapatan", detail: `Puncak Pendapatan Harian${peakDay ? ` (Tgl ${peakDay})` : ""}`, satuan: peakDay ? "1 hari" : "-", nilai: rp(peakRevenue) },
            { kategori: "Trend",      detail: "Perubahan vs Bulan Lalu",                   satuan: "MoM",                nilai: `${trendSign}${revenueTrend}%` },
            { kategori: "Operasional",detail: "Booking Hari Ini",                          satuan: "transaksi",          nilai: num(stats.todaysBookings) },
            { kategori: "Operasional",detail: "Membership Aktif",                          satuan: "anggota",            nilai: num(stats.activeMemberships) },
            { kategori: "Operasional",detail: "Fasilitas Beroperasi",                      satuan: "unit",               nilai: num(stats.activeFacilities) },
            ...(occupancyData ?? []).map(f => ({
                kategori: "Okupansi", detail: f.name, satuan: "tingkat pemakaian", nilai: `${f.pct}%`,
            })),
        ];

        const MINIMUM_ROWS = 10;
        const fillerCount  = Math.max(0, MINIMUM_ROWS - rows.length);

        return (
            <div className="print-report-template">
                <div className="prt-a4-page">
                    <div className="prt-header">
                        <div className="prt-header-left">
                            <img src="/BES.png" alt="Brawijaya Edusport" className="prt-logo-img" />
                        </div>
                        <div className="prt-header-right">
                            <div className="prt-company-name-main">BRAWIJAYA EDUSPORT</div>
                            <div className="prt-company-name-sub">PT BRAWIJAYA MULTI USAHA</div>
                            <div className="prt-company-address">
                                Jln. Terusan Cibogo No.1 Kota Malang<br />
                                NPWP 3295.65.312
                            </div>
                            <hr className="prt-header-divider" />
                            <div className="prt-doc-title">Laporan Operasional</div>
                        </div>
                    </div>

                    <div className="prt-meta-outer">
                        <div className="prt-meta-left">
                            <div className="prt-payment-note">
                                Bank BRI — Rek. 0048-01-123456-50-9<br />
                                a.n. PT Brawijaya Multi Usaha
                            </div>
                        </div>
                        <div className="prt-meta-right">
                            <table>
                                <tbody>
                                    <tr>
                                        <td className="meta-label-col">No. Laporan</td>
                                        <td className="meta-value-col meta-value-bold">{reportNo}</td>
                                    </tr>
                                    <tr>
                                        <td className="meta-label-col">Tanggal</td>
                                        <td className="meta-value-col">{dateStr}</td>
                                    </tr>
                                    <tr>
                                        <td className="meta-label-col">Periode</td>
                                        <td className="meta-value-col">{currentMonthLabel}</td>
                                    </tr>
                                    <tr>
                                        <td className="meta-label-col">Dibuat oleh</td>
                                        <td className="meta-value-col">Admin Sistem</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <table className="prt-report-table">
                        <thead>
                            <tr>
                                <th className="prt-col-no">No</th>
                                <th className="prt-col-category">Kategori</th>
                                <th className="prt-col-detail">Detail</th>
                                <th className="prt-col-unit">Satuan</th>
                                <th className="prt-col-value">Nilai</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i}>
                                    <td className="rt-center">{i + 1}</td>
                                    <td>{row.kategori}</td>
                                    <td>{row.detail}</td>
                                    <td className="rt-center">{row.satuan}</td>
                                    <td className="rt-right rt-bold">{row.nilai}</td>
                                </tr>
                            ))}
                            {Array.from({ length: fillerCount }).map((_, i) => (
                                <tr key={`filler-${i}`} className="rt-filler">
                                    <td className="rt-center">{rows.length + i + 1}</td>
                                    <td>—</td><td>—</td><td className="rt-center">—</td><td className="rt-right">—</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="prt-bottom-row">
                        <div className="prt-keterangan">
                            <span className="prt-keterangan-label">Keterangan</span>
                            <div></div>
                        </div>
                        <div className="prt-summary">
                            <table>
                                <tbody>
                                    <tr>
                                        <td>Total Pendapatan</td>
                                        <td>{rp(stats.totalRevenue)}</td>
                                    </tr>
                                    <tr>
                                        <td>Booking Hari Ini</td>
                                        <td>{num(stats.todaysBookings)} transaksi</td>
                                    </tr>
                                    <tr>
                                        <td>Membership Aktif</td>
                                        <td>{num(stats.activeMemberships)} orang</td>
                                    </tr>
                                    <tr className="sum-total">
                                        <td>Trend Bulan Ini</td>
                                        <td>{trendSign}{revenueTrend}%</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="prt-page-footer">
                        <span>Halaman 1 dari 1</span>
                        <span className="dashboard-print-date">Dicetak: {dateStr}</span>
                    </div>
                </div>
            </div>
        );
    }

// ── Gym Traffic Widget ────────────────────────────────────────────────────────

type GymTrafficLevel = "Low Occupancy" | "Medium Occupancy" | "High Occupancy" | "We Are Close";

const TRAFFIC_OPTIONS: {
    label: string;
    value: GymTrafficLevel;
    note: string;
    summary: string;
    Icon: React.ElementType;
    dotColor: string;
    dotHalo: string;
    meter: string;
    color: string;
    active: string;
    icon: string;
    iconActive: string;
}[] = [
    {
        label: "Low",
        value: "Low Occupancy",
        note: "Area nyaman",
        summary: "Publik melihat kondisi gym sedang ringan dan nyaman digunakan.",
        Icon: Leaf,
        dotColor: "#22c55e",
        dotHalo: "rgba(34,197,94,0.28)",
        meter: "#22c55e",
        color: "border-emerald-100 bg-white text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50/50",
        active: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 text-emerald-800",
        icon: "bg-emerald-50 text-emerald-600",
        iconActive: "bg-emerald-500 text-white",
    },
    {
        label: "Medium",
        value: "Medium Occupancy",
        note: "Mulai ramai",
        summary: "Admin memberi sinyal area mulai terisi dan perlu ekspektasi antre.",
        Icon: SignalMedium,
        dotColor: "#eab308",
        dotHalo: "rgba(234,179,8,0.28)",
        meter: "#EA684F",
        color: "border-[#FFD5CD] bg-white text-[#8F2E20] hover:border-[#F8B5A8] hover:bg-[#FFF1EE]/60",
        active: "border-[#F8B5A8] bg-gradient-to-br from-[#FFF1EE] via-white to-[#FFD5CD]/70 text-[#8F2E20]",
        icon: "bg-[#FFF1EE] text-[#E35336]",
        iconActive: "bg-[#E35336] text-white",
    },
    {
        label: "High",
        value: "High Occupancy",
        note: "Padat",
        summary: "Kondisi diprioritaskan sebagai peringatan bahwa gym sedang padat.",
        Icon: Flame,
        dotColor: "#ef4444",
        dotHalo: "rgba(239,68,68,0.28)",
        meter: "#ef4444",
        color: "border-red-100 bg-white text-red-700 hover:border-red-200 hover:bg-red-50/55",
        active: "border-red-200 bg-gradient-to-br from-red-50 via-white to-red-50 text-red-800",
        icon: "bg-red-50 text-red-600",
        iconActive: "bg-red-500 text-white",
    },
    {
        label: "We Are Close",
        value: "We Are Close",
        note: "Tutup publik",
        summary: "Status publik berubah jelas bahwa layanan gym sedang tidak dibuka.",
        Icon: DoorClosed,
        dotColor: "#15678D",
        dotHalo: "rgba(21,103,141,0.26)",
        meter: "#15678D",
        color: "border-sky-100 bg-white text-[#15678D] hover:border-sky-200 hover:bg-sky-50/55",
        active: "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-sky-50 text-[#15678D]",
        icon: "bg-sky-50 text-[#15678D]",
        iconActive: "bg-[#15678D] text-white",
    },
];

function GymTrafficWidget({ current }: { current: string }) {
    const [saving, setSaving] = useState(false);

    const set = (value: GymTrafficLevel) => {
        if (value === current || saving) return;
        setSaving(true);
        router.put(route("admin.settings.gym-traffic.update"), { value }, {
            preserveScroll: true,
            onFinish: () => setSaving(false),
        });
    };

    const activeOption = TRAFFIC_OPTIONS.find((opt) => opt.value === current) ?? TRAFFIC_OPTIONS[0];
    const activeIndex = Math.max(0, TRAFFIC_OPTIONS.findIndex((opt) => opt.value === activeOption.value));
    const meterPercent = ((activeIndex + 1) / TRAFFIC_OPTIONS.length) * 100;
    const trafficStyles = `.dashboard-gym-traffic-meter { background: conic-gradient(${activeOption.meter} ${meterPercent}%, rgba(255,255,255,.28) 0); }`;

    return (
        <div className="animate-scale-in group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white transition-all duration-300 hover:-translate-y-0.5">
            <style dangerouslySetInnerHTML={{ __html: trafficStyles }} />
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#F8B5A8] to-transparent" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
                <div className="flex min-w-0 items-center gap-3">
                    <ShinyIcon className="h-10 w-10">
                        <Gauge size={15} className="text-white" />
                    </ShinyIcon>
                    <div className="min-w-0">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">Operasional</p>
                        <p className="font-clash text-base font-semibold text-slate-900 leading-tight">Gym Traffic</p>
                    </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    <LiveDot
                        size="xs"
                        color={saving ? "#f59e0b" : "#22c55e"}
                        halo={saving ? "rgba(245,158,11,0.28)" : "rgba(34,197,94,0.28)"}
                    />
                    {saving ? "Syncing" : "Live"}
                </span>
            </div>

            <div className="relative z-10 flex flex-col gap-4 px-5 pb-5">
                <div className="relative overflow-hidden rounded-[26px] border border-[#F8B5A8]/70 bg-[radial-gradient(circle_at_18%_12%,rgba(255,255,255,0.42),transparent_24%),linear-gradient(135deg,#EA684F_0%,#E35336_52%,#F08C78_100%)] p-4 text-white">
                    <div className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full border border-white/20" />
                    <div className="pointer-events-none absolute -right-6 top-8 h-28 w-28 rounded-full bg-white/10 blur-xl" />
                    <div className="pointer-events-none absolute -bottom-20 -left-12 h-44 w-44 rounded-full bg-red-500/16 blur-2xl" />
                    <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/55 to-transparent" />
                    <div className="relative flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/18 px-3 py-1 font-bdo text-[9px] font-bold uppercase tracking-widest text-white backdrop-blur">
                                <LiveDot size="xs" color={activeOption.dotColor} halo={activeOption.dotHalo} />
                                Status Publik
                            </div>
                            <p className="mt-4 font-clash text-[1.75rem] font-semibold leading-none tracking-normal sm:text-[2rem]">{activeOption.label}</p>
                            <p className="mt-2 max-w-[300px] font-bdo text-[12px] leading-relaxed text-white/78">{activeOption.summary}</p>
                        </div>
                        <div className="dashboard-gym-traffic-meter relative flex h-[86px] w-[86px] shrink-0 items-center justify-center rounded-full p-[7px]">
                            <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-[#FFD5CD]/70 bg-white text-center">
                                <span className="font-bdo text-[8px] font-bold uppercase tracking-widest text-[#EA684F]">Mode</span>
                                <span className="font-clash text-lg font-semibold leading-none text-slate-950">{activeIndex + 1}/4</span>
                            </div>
                        </div>
                    </div>

                    <div className="relative mt-5 grid grid-cols-4 gap-2">
                        {TRAFFIC_OPTIONS.map((opt, index) => {
                            const isActive = current === opt.value;
                            return (
                                <div key={opt.value} className="flex flex-col gap-1.5">
                                    <span className={cn("h-1.5 rounded-full transition-all duration-300", index <= activeIndex ? "bg-white" : "bg-white/24")} />
                                    <span className={cn("truncate font-bdo text-[9px] font-bold uppercase tracking-wide", isActive ? "text-white" : "text-white/55")}>
                                        {opt.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {TRAFFIC_OPTIONS.map((opt) => {
                        const isActive = current === opt.value;
                        const OptionIcon = opt.Icon;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                disabled={saving}
                                onClick={() => set(opt.value)}
                                className={cn(
                                    "relative min-h-[76px] overflow-hidden rounded-[20px] border px-4 py-3 text-left transition-all duration-200",
                                    "shadow-[0_14px_28px_-26px_rgba(227,83,54,0.45)] hover:-translate-y-0.5 hover:shadow-[0_18px_32px_-27px_rgba(227,83,54,0.55)]",
                                    "disabled:cursor-not-allowed disabled:opacity-60",
                                    isActive ? opt.active : opt.color,
                                )}
                            >
                                <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
                                <span className="flex h-full items-center justify-between gap-3">
                                    <span className="flex min-w-0 items-center gap-3">
                                        <span className={cn(
                                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-all duration-200",
                                            isActive ? opt.iconActive : opt.icon,
                                        )}>
                                            <OptionIcon className="h-[17px] w-[17px]" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block font-clash text-sm font-semibold leading-tight">{opt.label}</span>
                                            <span className="mt-1.5 block font-bdo text-[10px] leading-tight text-slate-400">{opt.note}</span>
                                        </span>
                                    </span>
                                    <span className={cn(
                                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border transition-colors",
                                        isActive ? "border-white bg-white/80" : "border-slate-100 bg-slate-50",
                                    )}>
                                        <LiveDot size="sm" color={opt.dotColor} halo={opt.dotHalo} />
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ── Banner Modal ──────────────────────────────────────────────────────────────

interface BannerModalState {
    open: boolean;
    editing: InfoBannerItem | null;
}

function DashBannerModal({ state, onClose }: { state: BannerModalState; onClose: () => void }) {
    const { editing } = state;
    const { data, setData, post, put, processing } = useForm({
        message:    editing?.message    ?? "",
        is_active:  editing?.is_active  ?? true,
        sort_order: editing?.sort_order ?? 0,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editing) {
            put(route("admin.info-banners.update", editing.id), { onSuccess: onClose });
        } else {
            post(route("admin.info-banners.store"), { onSuccess: onClose });
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <ShinyIcon className="h-9 w-9">
                            <Megaphone size={14} className="text-white" />
                        </ShinyIcon>
                        <div>
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">Info Banner</p>
                            <p className="font-clash text-sm font-semibold text-slate-800 leading-tight">
                                {editing ? "Edit Banner" : "Tambah Banner"}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Tutup modal info banner"
                        title="Tutup modal info banner"
                    >
                        <X size={15} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
                    <div className="flex flex-col gap-1.5">
                        <label className="font-bdo text-[11px] font-bold uppercase tracking-widest text-slate-500">Pesan</label>
                        <textarea
                            value={data.message}
                            onChange={(e) => setData("message", e.target.value)}
                            rows={3}
                            maxLength={255}
                            required
                            placeholder="Contoh: UB Sport Center Buka Setiap Hari: 06.00 - 21.00 WIB"
                            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bdo text-sm text-slate-800 placeholder-slate-400 focus:border-[#F08C78] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD5CD] transition-all duration-150"
                        />
                        <p className="text-right font-bdo text-[10px] text-slate-400 tabular-nums">{data.message.length}/255</p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="font-bdo text-[11px] font-bold uppercase tracking-widest text-slate-500">Urutan</label>
                        <input
                            type="number"
                            min={0}
                            value={data.sort_order}
                            onChange={(e) => setData("sort_order", parseInt(e.target.value, 10) || 0)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bdo text-sm text-slate-800 focus:border-[#F08C78] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD5CD] transition-all duration-150"
                            aria-label="Urutan info banner"
                            title="Urutan info banner"
                        />
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100/80">
                        <input
                            type="checkbox"
                            checked={data.is_active}
                            onChange={(e) => setData("is_active", e.target.checked)}
                            className="h-4 w-4 accent-[#E35336]"
                        />
                        <span className="font-bdo text-sm text-slate-700">Tampilkan banner (aktif)</span>
                    </label>
                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl bg-slate-100 px-4 py-2.5 font-clash text-sm font-semibold text-slate-600 ring-1 ring-slate-200/70 transition-all hover:bg-slate-200 hover:-translate-y-px"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={processing || !data.message.trim()}
                            className="relative rounded-xl bg-gradient-to-br from-[#EA684F] to-[#E35336] px-5 py-2.5 font-clash text-sm font-semibold text-white shadow-[0_3px_10px_rgba(15,23,42,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_5px_16px_rgba(15,23,42,0.26)] hover:-translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <span className="pointer-events-none absolute left-0 right-0 top-0 h-px rounded-t-xl bg-white/20" />
                            {processing ? "Menyimpan…" : editing ? "Simpan Perubahan" : "Tambah Banner"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── InfoBanner Panel ──────────────────────────────────────────────────────────

function DashInfoBannerPanel({
    banners,
    onAdd,
    onEdit,
}: {
    banners: InfoBannerItem[];
    onAdd: () => void;
    onEdit: (b: InfoBannerItem) => void;
}) {
    const [items, setItems] = useState<InfoBannerItem[]>(banners);
    useEffect(() => setItems(banners), [banners]);
    const activeCount = banners.filter((banner) => banner.is_active).length;

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIdx = items.findIndex((i) => i.id.toString() === active.id);
        const newIdx = items.findIndex((i) => i.id.toString() === over.id);
        const reordered = arrayMove(items, oldIdx, newIdx);
        setItems(reordered);
        router.post(route("admin.info-banners.reorder"), { ids: reordered.map((i) => i.id) }, { preserveScroll: true });
    };

    const handleDelete = (b: InfoBannerItem) => {
        if (!confirm(`Hapus banner "${b.message.substring(0, 40)}…"?`)) return;
        router.delete(route("admin.info-banners.destroy", b.id), { preserveScroll: true });
    };

    return (
        <div className="animate-scale-in delay-100 relative card-glint overflow-hidden rounded-[24px] border border-slate-200/80 bg-white">
            <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#F8B5A8] to-transparent" />
            <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-[#FFF1EE] blur-3xl" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                    <ShinyIcon className="h-10 w-10">
                        <Megaphone size={15} className="text-white" />
                    </ShinyIcon>
                    <div className="min-w-0">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">Konten</p>
                        <p className="font-clash text-base font-semibold text-slate-900 leading-tight">Info Banner</p>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                        <span className="flex h-7 min-w-7 items-center justify-center rounded-xl bg-amber-50 px-2 font-bdo text-[11px] font-bold text-amber-600 ring-1 ring-amber-200/80">
                            {banners.length}
                        </span>
                        <span className="rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            {activeCount} aktif
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onAdd}
                    className="relative inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-br from-[#EA684F] to-[#B93D2A] px-4 py-2.5 font-clash text-[12px] font-semibold text-white shadow-[0_14px_24px_-16px_rgba(227,83,54,0.9),inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-18px_rgba(227,83,54,0.95)] active:scale-[0.98]"
                >
                    <span className="pointer-events-none absolute left-3 right-3 top-0 h-px rounded-t-xl bg-white/35" />
                    <Plus size={13} />
                    Tambah
                </button>
            </div>
            <div className="relative z-10 border-t border-slate-100/80 px-5 pb-5 pt-4">
                {items.length === 0 ? (
                    <div className="flex min-h-[230px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-8 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm ring-1 ring-slate-200/80">
                            <Megaphone size={18} />
                        </div>
                        <div>
                            <p className="font-clash text-sm font-semibold text-slate-700">Belum ada banner</p>
                            <p className="mt-1 font-bdo text-[11px] text-slate-400">Tambahkan informasi publik pertama.</p>
                        </div>
                    </div>
                ) : (
                    <div
                        className={cn(
                            "dashboard-touch-scroll custom-scrollbar min-h-0 overflow-y-auto overscroll-contain pr-1",
                            items.length > 3 && "max-h-[326px]",
                        )}
                    >
                        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                            <SortableContext items={items.map((i) => i.id.toString())} strategy={verticalListSortingStrategy}>
                                <div className="flex min-h-0 flex-col gap-2">
                                {items.map((b) => (
                                    <SortableListItem key={b.id} id={b.id.toString()}>
                                        <div className="group relative flex min-h-[96px] items-start justify-between gap-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-4 py-3.5 shadow-[0_10px_26px_-24px_rgba(15,23,42,0.65)] transition-all hover:-translate-y-0.5 hover:border-[#F8B5A8] hover:shadow-[0_18px_34px_-28px_rgba(227,83,54,0.65)]">
                                            <span className="pointer-events-none absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-[#F08C78] via-[#E35336] to-transparent opacity-70" />
                                            <div className="min-w-0 flex-1">
                                                <p className="line-clamp-2 font-clash text-[14px] font-medium leading-snug text-slate-800">{b.message}</p>
                                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                                    {b.is_active ? (
                                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-bdo text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                                            <LiveDot size="xs" color="#34d399" halo="rgba(52,211,153,0.28)" />Aktif
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-bdo text-[10px] font-bold text-slate-500 ring-1 ring-inset ring-slate-200">
                                                            <LiveDot size="xs" color="#cbd5e1" halo="rgba(148,163,184,0.22)" />Nonaktif
                                                        </span>
                                                    )}
                                                    <span className="rounded-full bg-white px-2.5 py-1 font-bdo text-[10px] font-bold text-slate-400 ring-1 ring-slate-200/80 tabular-nums">#{b.sort_order}</span>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => onEdit(b)}
                                                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-200/80 transition-all hover:-translate-y-px hover:bg-amber-50 hover:text-amber-600 hover:ring-amber-200"
                                                    aria-label="Edit banner"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(b)}
                                                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-400 ring-1 ring-rose-200/80 transition-all hover:-translate-y-px hover:bg-rose-100 hover:text-rose-600"
                                                    aria-label="Hapus banner"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </SortableListItem>
                                ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </div>
                )}
            </div>
        </div>
    );
}

    // ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
    const {
        auth, stats, revenueTrend, dailyRevenue, daysInMonth, currentDayInMonth,
        currentMonthLabel, occupancyData, recentActivity, gym_traffic, info_banners,
    } = usePage<DashboardProps>().props;

        const firstName     = auth.user?.name?.split(" ")[0] ?? "Admin";
        const trendPositive = revenueTrend >= 0;
        const canManageIdentity = auth.user?.role === "Administrator" || (auth.user?.permissions ?? []).includes("verify-identity");
        const revenueDayLimit = Math.min(
            daysInMonth ?? dailyRevenue?.length ?? 31,
            Math.max(1, currentDayInMonth ?? new Date().getDate()),
        );

    // Mini sparkline for hero card (last 20 days)
    const sparkData = (dailyRevenue ?? []).slice(-20);
    const sparkMax  = Math.max(...sparkData, 1);
    const sparkStyles = sparkData.map((val, i) => {
        const h = sparkMax > 0 ? Math.max((val / sparkMax) * 26, val > 0 ? 3 : 1.5) : 1.5;
        const background = val > 0 ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.12)";
        return `.dashboard-spark-${i} { height: ${h}px; background: ${background}; transition: height .5s cubic-bezier(.16,1,.3,1) ${i * 20}ms; }`;
    }).join("");

    const [showAnalytics, setShowAnalytics] = useState(false);
    const [bannerModal, setBannerModal] = useState<BannerModalState>({ open: false, editing: null });
    const openBannerCreate = () => setBannerModal({ open: true, editing: null });
    const openBannerEdit   = (b: InfoBannerItem) => setBannerModal({ open: true, editing: b });
    const closeBannerModal = () => setBannerModal({ open: false, editing: null });

    return (
        <AdminLayout
            header={
                <div className="dashboard-header-scale flex flex-col gap-1 pt-4 animate-fade-in-up">
                    <style dangerouslySetInnerHTML={{ __html: DASHBOARD_STYLES }} />
                    <style dangerouslySetInnerHTML={{ __html: sparkStyles }} />
                    <span className="font-bdo text-[11px] font-medium tracking-wide text-[#E35336]">
                        Selamat Datang Kembali, {firstName}
                    </span>
                    <h1 className="font-clash text-3xl font-bold uppercase tracking-tight xl:text-4xl">
                        <ShinyTextBlack text="UB Sport System" speed={5} />
                    </h1>
                </div>
            }
        >
            <Head title="Admin Dashboard" />

            {bannerModal.open && (
                <DashBannerModal state={bannerModal} onClose={closeBannerModal} />
            )}

                <div className="dashboard-page-scale flex flex-col gap-6 pt-6 pb-6 overflow-x-hidden">

                    {/* ══════════════════════════════════════════════════════════════
                        ROW 1 — Three columns: Featured Card | Metrics Grid | Chart
                        Mobile: stacked · Tablet (md): 1-col then 2-col · Desktop (lg): 3-col
                    ══════════════════════════════════════════════════════════════ */}
                    <section className="grid grid-cols-1 gap-6 xl:grid-cols-2 2xl:grid-cols-[minmax(340px,1fr)_minmax(340px,1fr)_minmax(420px,1.05fr)] items-stretch">

                        {/* ── Col 1: Featured Revenue Card ── */}
                        <div className="relative order-1 min-w-0 rounded-[28px] overflow-hidden bg-gradient-to-br from-[#E35336] via-[#B93D2A] to-[#8F2E20] p-7 shadow-2xl shadow-[#F8B5A8]/40 flex flex-col justify-between animate-fade-in-up delay-100 group hover:-translate-y-1 hover:shadow-[#F08C78]/50 transition-all duration-500 min-h-[380px] shimmer-once">
                            {/* Decorative layers */}
                            <div className="absolute inset-0 water-caustics-effect pointer-events-none opacity-50"></div>
                            <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.13)_0,rgba(255,255,255,.13)_1px,transparent_1px,transparent_24px)] opacity-45"></div>
                            <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/5 rounded-full pointer-events-none"></div>
                            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-[#EA684F]/20 rounded-full pointer-events-none blur-3xl"></div>
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"></div>

                            {/* Header: label + icon */}
                            <div className="relative z-10 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="bg-white/20 backdrop-blur-md p-1.5 rounded-lg">
                                            <Wallet className="w-4 h-4 text-white" />
                                        </div>
                                        <p className="font-bdo text-[11px] font-bold text-[#FFD5CD] uppercase tracking-widest">Total Pendapatan</p>
                                    </div>
                                    <h2 className="font-clash text-[2rem] font-bold text-white leading-none tracking-tight">
                                        Rp <ShinyText text={formatRevenue(stats.totalRevenue)} speed={4} />
                                    </h2>
                                    <div className="mt-2.5">
                                        <div className={cn(
                                            "inline-flex items-center gap-1 text-[11px] font-bold font-bdo px-2.5 py-1 rounded-lg backdrop-blur-md",
                                            trendPositive
                                                ? "bg-white/15 text-white border border-white/20"
                                                : "bg-red-900/30 text-red-200 border border-red-700/30"
                                        )}>
                                            {trendPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                            {Math.abs(revenueTrend)}% bulan ini
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white/15 backdrop-blur-xl border border-white/25 p-3.5 rounded-2xl shadow-lg animate-float flex-shrink-0">
                                    <TrendingUp className="w-6 h-6 text-white" />
                                </div>
                            </div>

                            {/* Wallet-style sub-stats */}
                            <div className="relative z-10 my-5 flex-1 flex flex-col justify-center">
                                <p className="font-bdo text-[10px] font-bold text-[#F8B5A8]/80 uppercase tracking-widest mb-3">Ringkasan Operasional</p>
                                <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/15 divide-y divide-white/10 overflow-hidden">
                                    {[
                                        { label: "Booking Hari Ini",  value: String(stats.todaysBookings),    Icon: CalendarCheck2 },
                                        { label: "Fasilitas Aktif",   value: String(stats.activeFacilities),  Icon: LayoutGrid     },
                                        { label: "Membership Aktif",  value: String(stats.activeMemberships), Icon: Users          },
                                    ].map(({ label, value, Icon }) => (
                                        <div key={label} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-2.5">
                                                <div className="bg-white/15 p-1.5 rounded-lg">
                                                    <Icon className="w-3.5 h-3.5 text-white" />
                                                </div>
                                                <span className="font-bdo text-[12px] font-medium text-[#FFD5CD]">{label}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-clash text-sm font-bold text-white">{value}</span>
                                                <span className="font-bdo text-[10px] font-bold text-green-300 bg-green-500/20 px-2 py-0.5 rounded-md">Aktif</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Mini sparkline strip — last 20 days revenue preview */}
                            {sparkData.length > 0 && (
                                <div className="relative z-10 mb-4">
                                    <p className="font-bdo text-[9px] text-[#F8B5A8]/60 uppercase tracking-widest mb-1.5">Tren 20 hari terakhir</p>
                                    <div className="flex h-7 items-end gap-[2px]">
                                        {sparkData.map((val, i) => {
                                            return (
                                                <div
                                                    key={i}
                                                    className={cn(`dashboard-spark-${i}`, "flex-1 self-end rounded-sm")}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="relative z-10 grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => window.print()}
                                    className="btn-sheen bg-white text-[#B93D2A] font-clash text-sm font-semibold py-3.5 rounded-xl hover:bg-[#FFF1EE] active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/10"
                                >
                                    <FileText className="w-4 h-4" />
                                    Laporan
                                </button>
                                <button
                                    onClick={() => setShowAnalytics(prev => !prev)}
                                    className={cn(
                                        "btn-sheen border font-clash text-sm font-semibold py-3.5 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-2",
                                        showAnalytics
                                            ? "bg-white/30 backdrop-blur-md border-white/40 text-white"
                                            : "bg-white/15 backdrop-blur-md border-white/30 text-white hover:bg-white/25"
                                    )}
                                >
                                    <BarChart3 className="w-4 h-4" />
                                    Analitik
                                </button>
                            </div>
                        </div>

                        {/* ── Col 2: 2×2 Metrics Grid ── */}
                        <div className="order-3 grid min-w-0 grid-cols-1 content-stretch gap-3 sm:grid-cols-2 xl:order-2">

                            <DashboardMatrixCard
                                icon={<CalendarCheck2 size={18} />}
                                label="Booking Hari Ini"
                                value={String(stats.todaysBookings)}
                                note={`${stats.todaysBookings} reservasi`}
                                tone="booking"
                                delay="delay-100"
                            />

                            <DashboardMatrixCard
                                icon={<Users size={18} />}
                                label="Membership Aktif"
                                value={String(stats.activeMemberships)}
                                note="member aktif"
                                tone="emerald"
                                delay="delay-150"
                            />

                            <DashboardMatrixCard
                                icon={<LayoutGrid size={18} />}
                                label="Fasilitas Aktif"
                                value={String(stats.activeFacilities)}
                                note="fasilitas online"
                                tone="sky"
                                delay="delay-200"
                            />

                            <DashboardMatrixCard
                                icon={<UserCheck size={18} />}
                                label="Antrean Identitas"
                                value={String(stats.pendingIdentities)}
                                note="menunggu review"
                                tone="amber"
                                delay="delay-250"
                            />

                        </div>

                        {/* ── Col 3: Revenue Chart ─────────────────────────────────────────────
                            CRITICAL DESIGN NOTE:
                            overflow is NOT hidden here — it must remain visible so the chart's
                            bar tooltips can appear above bars without being clipped.
                            The card glint, gradient overlays, and decorative lines all stay
                            within their inset bounds and are unaffected by this change.
                        ────────────────────────────────────────────────────────────────────── */}
                        <div
                            className="dashboard-visible-only order-2 animate-fade-in-up delay-400 bg-white rounded-[24px] p-4 sm:p-5 shadow-sm border border-slate-200/80 relative group flex flex-col min-h-[360px] sm:min-h-[380px] card-glint min-w-0 xl:order-3 xl:col-span-2 2xl:col-span-1"
                        >
                            {/* Subtle hover overlay — inset so overflow:visible is fine */}
                            <div className="absolute inset-0 rounded-[24px] bg-gradient-to-br from-[#FFF1EE]/30 via-transparent to-slate-50/20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                            <div className="pointer-events-none absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent z-10" />

                            {/* Chart Header */}
                            <div className="mb-3.5 relative z-10">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <ShinyIcon className="h-10 w-10 flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                                            <TrendingUp className="w-4 h-4 text-white" />
                                        </ShinyIcon>
                                        <div className="min-w-0">
                                            <h2 className="font-clash text-sm font-semibold text-slate-900 leading-tight whitespace-nowrap">
                                                <SplitText text="Grafik Pendapatan" delay={500} />
                                            </h2>
                                            <p className="font-bdo text-[10px] font-medium text-slate-400 mt-0.5 whitespace-nowrap">Pendapatan bulan berjalan</p>
                                        </div>
                                    </div>
                                    <span className={cn(
                                        "flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-bdo text-[10px] font-bold shadow-sm cursor-default flex-shrink-0",
                                        trendPositive
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                            : "bg-rose-50 text-rose-600 border border-rose-100"
                                    )}>
                                        {trendPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                        <span className="whitespace-nowrap">{Math.abs(revenueTrend)}% vs bln lalu</span>
                                    </span>
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-slate-100 to-transparent mb-3 relative z-10" />

                            {/* Chart */}
                            <div className="dashboard-visible-only flex-1 relative z-10">
                                <InteractiveRevenueChart
                                    data={dailyRevenue}
                                    monthLabel={currentMonthLabel}
                                    currentDayInMonth={revenueDayLimit}
                                />
                            </div>
                        </div>

                    </section>

                    {/* ══════════════════════════════════════════════════════════════
                        ANALYTICS PANEL
                    ══════════════════════════════════════════════════════════════ */}
                    {showAnalytics && (
                        <AnalyticsPanel
                            dailyRevenue={dailyRevenue ?? []}
                            occupancyData={occupancyData ?? []}
                            stats={stats}
                            currentMonthLabel={currentMonthLabel}
                            currentDayInMonth={revenueDayLimit}
                            onClose={() => setShowAnalytics(false)}
                        />
                    )}

                {/* ══════════════════════════════════════════════════════════════
                    ROW 2 — Two columns: Gym Traffic | Info Banner
                ══════════════════════════════════════════════════════════════ */}
                <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <GymTrafficWidget current={gym_traffic ?? "Low Occupancy"} />
                    <DashInfoBannerPanel
                        banners={info_banners ?? []}
                        onAdd={openBannerCreate}
                        onEdit={openBannerEdit}
                    />
                </section>

                {/* ══════════════════════════════════════════════════════════════
                    ROW 3 — Left: OccupancyCard + Identity Queue  |  Right: Activity Feed
                ══════════════════════════════════════════════════════════════ */}
                <section className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.65fr)]">

                        <div className="flex h-full flex-col gap-6">
                            <OccupancyCard facilities={occupancyData ?? []} />
                            <PremiumIdentityQueue count={stats.pendingIdentities} canManageIdentity={canManageIdentity} />
                        </div>

                        <div className="animate-fade-in-up delay-500 relative flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm">
                            <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#F8B5A8] to-transparent z-10" />

                            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <ShinyIcon className="h-10 w-10">
                                        <Activity className="w-4 h-4 text-white" />
                                    </ShinyIcon>
                                    <div>
                                        <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">Sistem</p>
                                        <h2 className="font-clash text-base font-semibold text-slate-900">
                                            <SplitText text="Aktivitas Terbaru" delay={600} />
                                        </h2>
                                        <p className="font-bdo text-[11px] font-medium text-slate-400 mt-0.5">Ringkasan kegiatan sistem yang mudah discan</p>
                                    </div>
                                </div>
                                <span className="flex items-center gap-1.5 rounded-xl border border-[#FFD5CD] bg-[#FFF1EE] px-3 py-1.5 font-bdo text-[11px] font-bold uppercase tracking-wide text-[#B93D2A]">
                                    <LiveDot size="xs" color="#E35336" halo="rgba(227,83,54,0.26)" />
                                    {recentActivity?.length ?? 0} Aktivitas
                                </span>
                            </div>

                            <div className="min-h-0">
                                <ActivityFeed items={recentActivity ?? []} />
                            </div>
                        </div>

                    </section>

            </div>

                {/* Print template — hidden on screen */}
                <ReportPrintTemplate
                    stats={stats}
                    revenueTrend={revenueTrend}
                    dailyRevenue={dailyRevenue ?? []}
                    currentDayInMonth={revenueDayLimit}
                    currentMonthLabel={currentMonthLabel}
                    occupancyData={occupancyData ?? []}
                />

            </AdminLayout>
        );
    }
