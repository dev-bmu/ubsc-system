import { Head } from "@inertiajs/react";
import axios from "axios";
import {
    Activity,
    AlertOctagon,
    AlertTriangle,
    ArchiveRestore,
    BarChart3,
    BellRing,
    CheckCircle2,
    CircleHelp,
    Clock3,
    CloudCog,
    Database,
    FileCheck2,
    Fingerprint,
    Gauge,
    HardDrive,
    HeartPulse,
    History,
    LockKeyhole,
    MapPinned,
    RefreshCw,
    ServerCog,
    ShieldAlert,
    ShieldCheck,
    Signal,
    TimerReset,
    Users2,
    Workflow,
    XCircle,
    type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { PageProps } from "@/types";
import "./monitoring.css";

type MonitorStatus = "operational" | "degraded" | "outage" | "unknown";
type Severity = "critical" | "warning" | "info";
type MonitorTab = "overview" | "health" | "performance" | "integrity" | "security" | "replication" | "recovery" | "slo";

interface ServiceState {
    key: string;
    name: string;
    category: "dependency" | "scheduler" | "queue" | string;
    status: MonitorStatus;
    observed_at: string | null;
    latency_ms: number | null;
    message: string | null;
}

interface QueueState {
    connection: string;
    queue: string;
    sample_limit: number;
    adapter_status?: "configured" | "unavailable" | string;
    status: MonitorStatus;
    depth: number | null;
    depth_is_capped: boolean;
    reserved: number | null;
    available: number | null;
    delayed: number | null;
    oldest_age_seconds: number | null;
    failed_recent: number | null;
    failed_recent_is_capped: boolean;
    worker_last_seen_at: string | null;
    worker_lag_seconds: number | null;
    message?: string | null;
}

interface SchedulerState {
    last_seen_at: string | null;
    lag_seconds: number | null;
    expected_interval_seconds: number;
    status: MonitorStatus;
}

interface IncidentItem {
    public_id: string;
    title: string;
    summary: string | null;
    severity: Severity;
    status: "open" | "acknowledged" | "resolved";
    started_at: string;
    acknowledged_at: string | null;
    updated_at: string;
}

interface IntegrityCheck {
    key: string;
    title: string;
    domain: "bookings" | "memberships" | "payments" | string;
    severity: Severity;
    count: number;
    status: MonitorStatus;
    description?: string | null;
    recommended_action?: string | null;
    reconciliation?: "safe_candidate" | "manual_review" | string;
    samples?: Array<{
        record_id: number | string;
        related_record_id?: number | string;
    }>;
}

interface IntegrityDomain {
    status: MonitorStatus;
    checks: number;
    violations: number;
    critical: number;
    warning: number;
    info: number;
}

interface IntegrityState {
    available: boolean;
    is_stale: boolean;
    status: MonitorStatus;
    generated_at: string | null;
    expires_at?: string | null;
    duration_ms?: number | null;
    totals: {
        checks: number;
        violations: number;
        critical: number;
        warning: number;
        info: number;
    };
    domains: Record<string, IntegrityDomain>;
    checks?: IntegrityCheck[];
    action_queue?: IntegrityCheck[];
}

interface PerformanceSignal {
    key: string;
    name: string;
    value: number | null;
    unit: string;
    status: MonitorStatus;
    message: string | null;
}

interface PerformanceState {
    status: MonitorStatus;
    signals: PerformanceSignal[];
    window_minutes?: number;
    minimum_samples?: number;
    driver?: string;
    http?: {
        status: MonitorStatus;
        sample_status: string;
        request_count: number;
        error_count: number;
        requests_per_minute: number;
        requests_per_second: number;
        average_ms: number | null;
        p50_ms: number | null;
        p95_ms: number | null;
        p99_ms: number | null;
        error_rate_percent: number | null;
        capacity: {
            status: MonitorStatus;
            tested_requests_per_second: number | null;
            utilization_percent: number | null;
            headroom_requests_per_second: number | null;
            message: string | null;
        };
        scopes: Array<{
            key: string;
            label: string;
            status: MonitorStatus;
            sample_status: string;
            request_count: number;
            requests_per_minute: number;
            average_ms: number | null;
            p50_ms: number | null;
            p95_ms: number | null;
            p99_ms: number | null;
            p95_target_ms: number | null;
            p99_target_ms: number | null;
            error_rate_percent: number | null;
            capacity?: {
                status: MonitorStatus;
                tested_requests_per_second: number | null;
                utilization_percent: number | null;
                headroom_requests_per_second: number | null;
                message: string | null;
            };
        }>;
        message: string | null;
    };
    queues?: {
        status: MonitorStatus;
        sample_status: string;
        processed_count: number;
        failed_count: number;
        jobs_per_minute: number;
        average_wait_ms: number | null;
        p50_wait_ms: number | null;
        p95_wait_ms: number | null;
        p99_wait_ms: number | null;
        average_runtime_ms: number | null;
        p50_runtime_ms: number | null;
        p95_runtime_ms: number | null;
        p99_runtime_ms: number | null;
        error_rate_percent: number | null;
        message: string | null;
        items: Array<QueueState & {
            key: string;
            label: string;
            sample_status: string;
            processed_count: number;
            failed_count: number;
            jobs_per_minute: number;
            p95_wait_ms: number | null;
            p95_runtime_ms: number | null;
            error_rate_percent: number | null;
            workers?: {
                configured_minimum: number;
                configured_maximum: number;
                recommended: number;
                automation_eligible: boolean;
                capacity_limited: boolean;
                reason: string;
            };
        }>;
    };
    database?: {
        supported: boolean;
        driver: string;
        status: MonitorStatus;
        sample_status: string;
        sample_interval_seconds?: number | null;
        connections: {
            active: number | null;
            running: number | null;
            maximum: number | null;
            utilization_percent: number | null;
        };
        queries_per_second: number | null;
        slow_queries_per_minute: number | null;
        lock_waits_current: number | null;
        lock_waits_per_minute: number | null;
        buffer_pool_hit_percent: number | null;
        uptime_seconds: number | null;
        message: string | null;
    };
}

interface CapacityState {
    status: MonitorStatus;
    enabled: boolean;
    enforced: boolean;
    mode: "advisory" | "signed_plan" | string;
    provider: string;
    infrastructure_profile: string;
    evidence: null | {
        public_id: string;
        scope: string;
        tested_instances: number;
        tested_requests_per_second: number;
        operational_requests_per_second: number;
        operational_requests_per_second_per_instance: number;
        generated_at: string | null;
        expires_at: string | null;
    };
    evidence_coverage: {
        required: number;
        verified: number;
        missing_scopes: string[];
    };
    target_coverage: {
        required: number;
        reported: number;
        missing_targets: string[];
        required_observer_cycles: number;
        verified_observer_cycles: number;
        minimum_observer_spacing_seconds: number;
        maximum_observer_spacing_seconds?: number;
    };
    observation: null | {
        observation_id: string;
        observed_at: string | null;
        expires_at: string | null;
        targets: Record<string, {
            kind: string;
            state_token_prefix: string;
            current_instances: number;
            ready_instances: number;
            cpu_utilization_percent: number | null;
            memory_utilization_percent: number | null;
        }>;
    };
    plan: null | {
        plan_id: string;
        status: string;
        signature_valid: boolean;
        fresh: boolean;
        convergence_stalled: boolean;
        convergence_stalled_targets?: string[];
        generated_at: string | null;
        expires_at: string | null;
        targets: Record<string, {
            kind: string;
            state_token_prefix: string;
            current_instances: number;
            raw_recommendation: number;
            desired_instances: number;
            minimum_instances: number;
            maximum_instances: number;
            action: string;
            automation_eligible: boolean;
            capacity_limited: boolean;
            cpu_utilization_percent: number | null;
            memory_utilization_percent: number | null;
            reasons: string[];
        }>;
    };
    policy: {
        web_minimum_instances: number;
        web_maximum_instances: number;
        scale_up_threshold_percent: number;
        scale_down_threshold_percent: number;
        scale_down_stabilization_seconds: number;
    };
    message: string | null;
}

interface SecurityEvent {
    key: string;
    label?: string;
    title?: string;
    count?: number;
    severity: Severity;
    description?: string | null;
}

interface SecurityState {
    status: MonitorStatus;
    telemetry_configured: boolean;
    posture: {
        staff_accounts: number;
        mfa_enabled: number;
        is_capped: boolean;
        sample_limit: number;
    };
    recent_events: {
        count: number | null;
        is_capped: boolean;
        items: SecurityEvent[];
        message: string | null;
    };
}

interface SloObjective {
    key: string;
    name: string;
    indicator: string;
    source: string;
    target_percent: number | null;
    compliance_percent: number | null;
    error_budget_remaining_percent: number | null;
    sample_count?: number;
    expected_samples?: number;
    recorded_samples?: number;
    missing_samples?: number;
    recent_missing_samples?: number;
    bad_samples?: number;
    minimum_samples?: number;
    burn_rates?: Record<string, number | null>;
    evaluation_status?: string;
    status: MonitorStatus;
    message: string | null;
}

interface HistoryPoint {
    started_at: string;
    status: MonitorStatus;
    sample_count: number;
    expected_sample_count: number;
    missing_sample_count: number;
    operational_count: number;
    degraded_count: number;
    outage_count: number;
    unknown_count: number;
    availability_percent: number | null;
}

interface HistoryState {
    available: boolean;
    bucket_minutes: number;
    retention_days: number;
    window_hours: number;
    sample_count: number;
    expected_sample_count: number;
    missing_sample_count: number;
    latest_sample_at: string | null;
    points: HistoryPoint[];
}

interface AlertingState {
    status: "operational" | "degraded" | "local_only" | "misconfigured" | "unconfigured" | "unknown" | string;
    delivery_configured: boolean;
    channels: Array<{
        key: string;
        label: string;
        configured: boolean;
        off_host: boolean;
        message: string;
    }>;
    pending_deliveries: number | null;
    dead_deliveries: number | null;
    oldest_pending_age_seconds?: number | null;
    dispatcher_status?: MonitorStatus;
    dispatcher_last_seen_at?: string | null;
    off_host_canary_status?: MonitorStatus;
    off_host_canary_last_seen_at?: string | null;
    last_delivery_at: string | null;
    last_off_host_delivery_at?: string | null;
    last_off_host_delivery_age_seconds?: number | null;
    off_host_delivery_status?: MonitorStatus;
    message: string;
}

interface AvailabilityState {
    status: MonitorStatus;
    external_monitoring_configured: boolean;
    provider: string | null;
    check_interval_seconds: number | null;
    last_external_check_at: string | null;
    message: string;
}

interface BackupState {
    configured: boolean;
    status: MonitorStatus;
    storage_available?: boolean | null;
    last_verified_at: string | null;
    last_attempt_at?: string | null;
    age_seconds: number | null;
    warning_after_seconds: number;
    outage_after_seconds: number;
    backup_id: string | null;
    size_bytes: number | null;
    immutable_until?: string | null;
    object_lock_mode?: string | null;
    failure_code?: string | null;
    next_due_at?: string | null;
    outage_at?: string | null;
    message: string;
}

interface RecoverySignal {
    configured: boolean;
    status: MonitorStatus;
    observed_at: string | null;
    age_seconds: number | null;
    message: string;
    [key: string]: unknown;
}

interface RecoveryState {
    configured: boolean;
    status: MonitorStatus;
    objectives: { rpo_seconds: number; rto_seconds: number };
    target?: {
        provider: string;
        dataset_id: string;
        primary_region: string;
        recovery_region: string;
        backup_destination_id: string;
        independent_verifier: string;
    };
    signals: Record<string, RecoverySignal>;
    evidence?: {
        available: boolean;
        head_sequence: number | null;
        head_fingerprint: string | null;
        message: string;
        items: RecoveryEvidenceItem[];
    };
    message: string;
}

interface RecoveryEvidenceItem {
    public_id: string;
    sequence: number;
    schema_version: number;
    evidence_type: "pitr_observation" | "backup_verified" | "backup_failed" | "restore_drill" | string;
    status: MonitorStatus;
    operation_id: string;
    backup_id: string;
    provider: string;
    target_environment: string | null;
    source_snapshot_at: string | null;
    recovery_point_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    immutable_until: string | null;
    recorded_at: string | null;
    size_bytes: number | null;
    object_lock_mode: string | null;
    observed_rpo_seconds: number | null;
    observed_rto_seconds: number | null;
    attested: boolean;
    target_matches_current: boolean;
    source_key_id: string | null;
    checks_total: number;
    checks_passed: number;
    failed_checks: string[];
    failure_code: string | null;
}

interface ReplicationState {
    configured: boolean;
    mode?: "standby" | string;
    activation_topology?: string;
    status: MonitorStatus;
    target: {
        provider: string;
        cluster_id: string;
        dataset_id: string;
        environment: string;
        primary_region: string;
        writer_endpoint_id: string;
        reader_endpoint_id: string;
        independent_observer: string;
    };
    policy: {
        mode: string;
        minimum_availability_zones: number;
        minimum_replicas: number;
        minimum_synchronous_replicas: number;
        failover_rto_seconds: number;
        automatic_failback: boolean;
        application_replica_reads: boolean;
        read_after_write_seconds: number;
    };
    current: null | {
        status: MonitorStatus;
        topology_epoch: number;
        writer_fingerprint: string;
        conflicting_writer_fingerprint: string | null;
        replica_count: number;
        healthy_replica_count: number;
        synchronous_replica_count: number;
        maximum_replica_lag_ms: number;
        data_loss_bytes: number;
        control_failure_code: string | null;
        observed_at: string | null;
        last_healthy_at: string | null;
        last_failure_at: string | null;
        checks: Record<string, boolean>;
        attested: boolean;
    };
    signals: Record<string, RecoverySignal>;
    ledger: {
        available: boolean;
        event_count: number | null;
        head_sequence: number | null;
        head_fingerprint: string | null;
        items: Array<{
            public_id: string;
            sequence: number;
            event_type: string;
            status: MonitorStatus;
            topology_epoch: number;
            writer_fingerprint: string;
            previous_writer_fingerprint: string | null;
            observed_at: string | null;
            recorded_at: string | null;
            attested: boolean;
        }>;
        message: string;
    };
    message: string;
}

interface ResilienceState {
    configured: boolean;
    enabled: boolean;
    enforced: boolean;
    status: MonitorStatus;
    target_environment: string;
    provider: string;
    orchestrator: string;
    required_scenarios: string[];
    campaign: {
        status: MonitorStatus;
        campaign_id: string | null;
        completed_at: string | null;
        age_seconds: number | null;
        scenario_count: number;
        passed_count: number;
        failed_count: number;
        aborted_count: number;
        campaign_controls_passed: boolean;
        worst_detection_seconds: number | null;
        worst_recovery_seconds: number | null;
    } | null;
    ledger: {
        status: MonitorStatus;
        observed_at: string | null;
        failure_count: number | null;
    } | null;
    message: string;
}

interface InvoicePdfState {
    status: MonitorStatus;
    prewarm_enabled: boolean;
    connection: string;
    queue: string;
    disk: string;
    archive_configured: boolean;
    template_version: string;
    hot_retention_days: number;
    pending: number | null;
    pending_is_capped: boolean;
    oldest_age_seconds: number | null;
    failed_recent: number | null;
    failed_recent_is_capped: boolean;
    worker_last_seen_at: string | null;
    worker_lag_seconds: number | null;
    renderer_last_seen_at: string | null;
    renderer_last_failure_at: string | null;
    latest_generated_at: string | null;
    latest_size_bytes: number | null;
    latest_render_duration_ms: number | null;
    latest_storage_tier: "hot" | "archive" | null;
    expired_hot: number | null;
    expired_hot_is_capped: boolean;
    storage_free_bytes: number | null;
    storage_total_bytes: number | null;
    storage_free_percent: number | null;
    message: string;
}

interface BoundedCount {
    value: number | null;
    is_capped: boolean;
    sample_limit: number;
}

interface MonitoringSnapshot {
    schema_version: number;
    generated_at: string | null;
    served_at?: string | null;
    snapshot_age_seconds?: number | null;
    snapshot_stale?: boolean;
    cache_ttl_seconds: number;
    environment?: string;
    topology?: "single_node" | "multi_node" | string;
    release?: string | null;
    overall: {
        status: MonitorStatus;
        active_incidents: number;
        highest_severity: Severity | null;
    };
    services: ServiceState[];
    availability?: AvailabilityState;
    queue: QueueState;
    scheduler: SchedulerState;
    incidents: {
        limit: number;
        active_count: number;
        items: IncidentItem[];
    };
    integrity?: IntegrityState;
    performance?: PerformanceState;
    capacity?: CapacityState;
    security?: SecurityState;
    history?: HistoryState;
    alerting?: AlertingState;
    backup?: BackupState;
    recovery?: RecoveryState;
    replication?: ReplicationState;
    resilience?: ResilienceState;
    documents?: InvoicePdfState;
    slos?: {
        window_days: number;
        evaluation_status: "configured" | "partial" | "unconfigured" | string;
        items: SloObjective[];
    };
    usage?: {
        window_minutes: number;
        bookings_created: BoundedCount;
        memberships_created: BoundedCount;
        payments_paid: BoundedCount;
    };
}

type Props = PageProps<{
    snapshot: MonitoringSnapshot;
    snapshot_url?: string;
}>;

const TAB_ITEMS: Array<{ key: MonitorTab; label: string; short: string; icon: LucideIcon }> = [
    { key: "overview", label: "Overview", short: "Overview", icon: Activity },
    { key: "health", label: "Health & Availability", short: "Health", icon: HeartPulse },
    { key: "performance", label: "Performance", short: "Performance", icon: Gauge },
    { key: "integrity", label: "Data Integrity", short: "Integrity", icon: Database },
    { key: "security", label: "Security", short: "Security", icon: ShieldCheck },
    { key: "replication", label: "Database Replication", short: "Replication", icon: Workflow },
    { key: "recovery", label: "Database Recovery", short: "Recovery", icon: ArchiveRestore },
    { key: "slo", label: "SLO & Usage", short: "SLO", icon: BarChart3 },
];

const STATUS_META: Record<MonitorStatus, { label: string; description: string; className: string; icon: LucideIcon }> = {
    operational: {
        label: "Operational",
        description: "Seluruh sinyal terukur berada dalam batas aman.",
        className: "monitor-status--operational",
        icon: CheckCircle2,
    },
    degraded: {
        label: "Degraded",
        description: "Ada penurunan layanan atau pekerjaan yang perlu ditangani.",
        className: "monitor-status--degraded",
        icon: AlertTriangle,
    },
    outage: {
        label: "Incident",
        description: "Layanan kritis atau integritas data sedang terdampak.",
        className: "monitor-status--outage",
        icon: XCircle,
    },
    unknown: {
        label: "Unknown",
        description: "Telemetry belum tersedia atau sudah kedaluwarsa.",
        className: "monitor-status--unknown",
        icon: CircleHelp,
    },
};

const severityClass: Record<Severity, string> = {
    critical: "monitor-severity--critical",
    warning: "monitor-severity--warning",
    info: "monitor-severity--info",
};

const normalizeStatus = (status?: string | null): MonitorStatus => (
    status === "operational" || status === "degraded" || status === "outage"
        ? status
        : "unknown"
);

function formatNumber(value: number | null | undefined, suffix = ""): string {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function formatDateTime(value?: string | null): string {
    if (!value) return "Belum tersedia";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Belum tersedia";
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(date);
}

function relativeTime(value?: string | null, now = Date.now()): string {
    if (!value) return "belum pernah";
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return "waktu tidak diketahui";
    const delta = Math.max(0, Math.round((now - time) / 1000));
    if (delta < 10) return "baru saja";
    if (delta < 60) return `${delta} detik lalu`;
    if (delta < 3600) return `${Math.floor(delta / 60)} menit lalu`;
    if (delta < 86400) return `${Math.floor(delta / 3600)} jam lalu`;
    return `${Math.floor(delta / 86400)} hari lalu`;
}

function durationLabel(seconds?: number | null): string {
    if (seconds === null || seconds === undefined) return "—";
    if (seconds < 60) return `${Math.max(0, Math.round(seconds))} dtk`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} m ${Math.round(seconds % 60)} dtk`;
    return `${Math.floor(seconds / 3600)} j ${Math.floor((seconds % 3600) / 60)} m`;
}

function StatusPill({ status, compact = false }: { status: MonitorStatus; compact?: boolean }) {
    const normalized = normalizeStatus(status);
    const meta = STATUS_META[normalized];
    const Icon = meta.icon;
    return (
        <span className={cn("monitor-status", meta.className, compact && "monitor-status--compact")}>
            <Icon aria-hidden="true" />
            <span>{meta.label}</span>
        </span>
    );
}

function EmptyTelemetry({ title, body }: { title: string; body: string }) {
    return (
        <div className="monitor-empty">
            <div className="monitor-empty__icon"><Signal aria-hidden="true" /></div>
            <div>
                <h3>{title}</h3>
                <p>{body}</p>
            </div>
            <StatusPill status="unknown" compact />
        </div>
    );
}

function MetricCard({
    eyebrow,
    value,
    detail,
    icon: Icon,
    status = "unknown",
}: {
    eyebrow: string;
    value: string;
    detail: string;
    icon: LucideIcon;
    status?: MonitorStatus;
}) {
    return (
        <article className="monitor-metric-card">
            <div className="monitor-metric-card__top">
                <span>{eyebrow}</span>
                <span className={cn("monitor-metric-card__icon", `monitor-metric-card__icon--${normalizeStatus(status)}`)}>
                    <Icon aria-hidden="true" />
                </span>
            </div>
            <strong>{value}</strong>
            <p>{detail}</p>
        </article>
    );
}

function formatBytes(value?: number | null): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    if (value < 1024) return `${value} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let amount = value / 1024;
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
        amount /= 1024;
        unit += 1;
    }
    return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(amount)} ${units[unit]}`;
}

function ReliabilityTrend({ history }: { history?: HistoryState }) {
    if (!history?.available || !history.points?.some((point) => point.sample_count > 0)) {
        return (
            <section className="monitor-card monitor-chart-card">
                <div className="monitor-card__heading">
                    <div><span className="monitor-kicker">Bounded history</span><h2>Reliability pulse</h2></div>
                    <StatusPill status="unknown" compact />
                </div>
                <EmptyTelemetry title="Histori sedang dibentuk" body="Collector menyimpan satu sampel idempoten per menit ke agregat per jam. Grafik akan terisi tanpa menyalin data pelanggan." />
            </section>
        );
    }

    const sampled = history.points.filter((point) => point.sample_count > 0);
    const total = sampled.reduce((sum, point) => sum + point.expected_sample_count, 0);
    const operational = sampled.reduce((sum, point) => sum + point.operational_count, 0);
    const strictAvailability = total > 0 ? (operational / total) * 100 : null;
    const latest = sampled[sampled.length - 1];

    return (
        <section className="monitor-card monitor-chart-card">
            <div className="monitor-card__heading">
                <div><span className="monitor-kicker">Hourly rollup · {history.window_hours}h</span><h2>Reliability pulse</h2></div>
                <div className="monitor-trend__headline">
                    <span>Strict healthy</span>
                    <strong>{formatNumber(strictAvailability, "%")}</strong>
                    <StatusPill status={normalizeStatus(latest?.status)} compact />
                </div>
            </div>
            <div className="monitor-bars" role="img" aria-label={`Keandalan internal ${history.window_hours} jam terakhir`}>
                {history.points.map((point, index) => {
                    const height = point.availability_percent === null
                        ? 5
                        : Math.max(8, Math.min(100, point.availability_percent));
                    return (
                        <div
                            key={point.started_at}
                            className="monitor-bars__item"
                            title={`${formatDateTime(point.started_at)} · ${point.sample_count ? `${formatNumber(point.availability_percent, "%")} operational` : "tanpa sampel"}`}
                        >
                            <span
                                className={`monitor-bars__bar--${normalizeStatus(point.status)}`}
                                style={{ height: `${height}%` }}
                            />
                            {(index === 0 || index === history.points.length - 1 || index % 6 === 0) && (
                                <small>{new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(point.started_at))}</small>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="monitor-trend__foot">
                <span>{formatNumber(history.sample_count)} tercatat · {formatNumber(history.missing_sample_count)} blind spot</span>
                <span>Terakhir {relativeTime(history.latest_sample_at)}</span>
                <span>Retensi {history.retention_days} hari</span>
            </div>
        </section>
    );
}

function OperationsDefense({ alerting, backup, replication, recovery, resilience, documents }: {
    alerting?: AlertingState;
    backup?: BackupState;
    replication?: ReplicationState;
    recovery?: RecoveryState;
    resilience?: ResilienceState;
    documents?: InvoicePdfState;
}) {
    const alertStatus: MonitorStatus = alerting?.status === "operational"
        ? "operational"
        : alerting?.status === "outage"
          ? "outage"
          : alerting?.status === "degraded" || alerting?.status === "misconfigured"
          ? "degraded"
          : "unknown";
    const backupStatus = backup?.configured ? normalizeStatus(backup.status) : "unknown";
    const replicationStatus = replication?.configured ? normalizeStatus(replication.status) : "unknown";
    const recoveryStatus = recovery?.configured ? normalizeStatus(recovery.status) : "unknown";
    const resilienceStatus = resilience?.configured ? normalizeStatus(resilience.status) : "unknown";
    const documentStatus = documents?.prewarm_enabled
        ? normalizeStatus(documents.status)
        : "unknown";

    return (
        <section className="monitor-card monitor-defense-card">
            <div className="monitor-card__heading">
                <div><span className="monitor-kicker">Failure containment</span><h2>Operational defense</h2></div>
                <ShieldCheck aria-hidden="true" />
            </div>
            <div className="monitor-defense-list">
                <article>
                    <div className="monitor-defense-list__icon"><BellRing aria-hidden="true" /></div>
                    <div>
                        <strong>Durable incident delivery</strong>
                        <p>{alerting?.message || "Alert delivery state is not available."}</p>
                        <small>{formatNumber(alerting?.pending_deliveries)} pending · {formatNumber(alerting?.dead_deliveries)} dead letter · off-host {relativeTime(alerting?.last_off_host_delivery_at)} · canary {relativeTime(alerting?.off_host_canary_last_seen_at)}</small>
                    </div>
                    <StatusPill status={alertStatus} compact />
                </article>
                <article>
                    <div className="monitor-defense-list__icon"><Database aria-hidden="true" /></div>
                    <div>
                        <strong>Single-writer replication</strong>
                        <p>{replication?.message || "Replication posture is not available."}</p>
                        <small>
                            {replication?.current
                                ? `Epoch ${replication.current.topology_epoch} · lag ${formatNumber(replication.current.maximum_replica_lag_ms, " ms")} · ${replication.current.synchronous_replica_count} synchronous`
                                : "Menunggu topologi provider bertanda tangan"}
                        </small>
                    </div>
                    <StatusPill status={replicationStatus} compact />
                </article>
                <article>
                    <div className="monitor-defense-list__icon"><TimerReset aria-hidden="true" /></div>
                    <div>
                        <strong>Tested recovery posture</strong>
                        <p>{recovery?.message || "Recovery posture is not available."}</p>
                        <small>
                            {recovery?.configured
                                ? `RPO ${durationLabel(recovery.objectives.rpo_seconds)} · RTO ${durationLabel(recovery.objectives.rto_seconds)} · drill ${relativeTime(recovery.signals?.restore_drill?.observed_at)}`
                                : "Menunggu PITR dan restore drill terverifikasi"}
                        </small>
                    </div>
                    <StatusPill status={recoveryStatus} compact />
                </article>
                <article>
                    <div className="monitor-defense-list__icon"><Workflow aria-hidden="true" /></div>
                    <div>
                        <strong>Controlled resilience game day</strong>
                        <p>{resilience?.message || "Resilience campaign state is not available."}</p>
                        <small>
                            {resilience?.campaign?.campaign_id
                                ? `${resilience.campaign.passed_count}/${resilience.campaign.scenario_count} passed · worst recovery ${durationLabel(resilience.campaign.worst_recovery_seconds)} · ${relativeTime(resilience.campaign.completed_at)}`
                                : "Menunggu kampanye staging bertanda tangan"}
                        </small>
                    </div>
                    <StatusPill status={resilienceStatus} compact />
                </article>
                <article>
                    <div className="monitor-defense-list__icon"><HardDrive aria-hidden="true" /></div>
                    <div>
                        <strong>Verified backup freshness</strong>
                        <p>{backup?.message || "Backup freshness state is not available."}</p>
                        <small>{backup?.configured ? `${formatBytes(backup.size_bytes)} · ${relativeTime(backup.last_verified_at)}` : "Menunggu integrasi backup eksternal"}</small>
                    </div>
                    <StatusPill status={backupStatus} compact />
                </article>
                <article>
                    <div className="monitor-defense-list__icon"><FileCheck2 aria-hidden="true" /></div>
                    <div>
                        <strong>Private invoice pipeline</strong>
                        <p>{documents?.message || "Invoice document telemetry is not available."}</p>
                        <small>
                            {documents
                                ? `${documents.pending_is_capped ? `${formatNumber(documents.pending)}+` : formatNumber(documents.pending)} pending · ${formatNumber(documents.failed_recent)} failed · worker ${relativeTime(documents.worker_last_seen_at)}`
                                : "Menunggu snapshot document pipeline"}
                        </small>
                    </div>
                    <StatusPill status={documentStatus} compact />
                </article>
            </div>
        </section>
    );
}

function ServiceMatrix({ services }: { services: ServiceState[] }) {
    if (!services.length) {
        return <EmptyTelemetry title="Dependency belum dipetakan" body="Jalankan snapshot monitoring untuk mengukur dependency kritis." />;
    }

    return (
        <div className="monitor-table-shell">
            <table className="monitor-table">
                <thead>
                    <tr>
                        <th>Layanan</th>
                        <th>Status</th>
                        <th>Latency</th>
                        <th>Terakhir diperiksa</th>
                        <th>Keterangan</th>
                    </tr>
                </thead>
                <tbody>
                    {services.map((service) => (
                        <tr key={service.key}>
                            <td>
                                <div className="monitor-service-name">
                                    <span className={cn("monitor-service-dot", `monitor-service-dot--${normalizeStatus(service.status)}`)} />
                                    <div><strong>{service.name}</strong><small>{service.category}</small></div>
                                </div>
                            </td>
                            <td><StatusPill status={normalizeStatus(service.status)} compact /></td>
                            <td className="monitor-mono">{formatNumber(service.latency_ms, " ms")}</td>
                            <td>{relativeTime(service.observed_at)}</td>
                            <td>{service.message || "Tidak ada anomali terdeteksi."}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function OverviewPanel({ snapshot }: { snapshot: MonitoringSnapshot }) {
    const perf = snapshot.performance;
    const integrity = snapshot.integrity;
    const requestLatency = perf?.signals?.find((signal) => signal.key === "http_request_latency");
    const operationalServices = snapshot.services.filter((item) => item.status === "operational").length;
    const serviceStatus: MonitorStatus = snapshot.services.length === 0
        ? "unknown"
        : operationalServices === snapshot.services.length
          ? "operational"
          : snapshot.services.some((item) => item.status === "outage") ? "outage" : "degraded";

    return (
        <div className="monitor-panel-stack">
            <div className="monitor-metric-grid">
                <MetricCard
                    eyebrow="Service availability"
                    value={snapshot.services.length ? `${operationalServices}/${snapshot.services.length}` : "—"}
                    detail="Dependency dan proses internal yang terukur sehat."
                    icon={CloudCog}
                    status={serviceStatus}
                />
                <MetricCard
                    eyebrow="P95 response"
                    value={formatNumber(requestLatency?.value, requestLatency?.value === null || requestLatency?.value === undefined ? "" : ` ${requestLatency.unit}`)}
                    detail={requestLatency?.message || "Aktif setelah telemetry request terkumpul."}
                    icon={Gauge}
                    status={requestLatency ? normalizeStatus(requestLatency.status) : "unknown"}
                />
                <MetricCard
                    eyebrow="Integrity violations"
                    value={integrity?.available ? formatNumber(integrity.totals.violations) : "—"}
                    detail={integrity?.is_stale ? "Snapshot integrity sudah kedaluwarsa." : "Booking, membership, dan payment."}
                    icon={Database}
                    status={integrity?.available ? normalizeStatus(integrity.status) : "unknown"}
                />
                <MetricCard
                    eyebrow="Active incidents"
                    value={formatNumber(snapshot.incidents.active_count)}
                    detail="Incident terbuka atau sudah diakui namun belum pulih."
                    icon={AlertOctagon}
                    status={snapshot.incidents.active_count > 0 ? "degraded" : "operational"}
                />
            </div>

            <div className="monitor-two-columns monitor-two-columns--reliability">
                <ReliabilityTrend history={snapshot.history} />
                <OperationsDefense alerting={snapshot.alerting} backup={snapshot.backup} replication={snapshot.replication} recovery={snapshot.recovery} resilience={snapshot.resilience} documents={snapshot.documents} />
            </div>

            <section className="monitor-card">
                <div className="monitor-card__heading">
                    <div><span className="monitor-kicker">Live topology</span><h2>Service & dependency matrix</h2></div>
                    <StatusPill status={serviceStatus} compact />
                </div>
                <ServiceMatrix services={snapshot.services} />
            </section>

            <div className="monitor-two-columns">
                <QueueCard queue={snapshot.queue} />
                <IncidentCard incidents={snapshot.incidents.items} />
            </div>
        </div>
    );
}

function QueueCard({ queue }: { queue: QueueState }) {
    const queueStatus = normalizeStatus(queue.status);
    const depth = queue.depth === null
        ? "—"
        : queue.depth_is_capped ? `${queue.depth}+` : String(queue.depth);
    return (
        <section className="monitor-card monitor-card--dark">
            <div className="monitor-card__heading">
                <div><span className="monitor-kicker">Asynchronous work</span><h2>Queue pulse</h2></div>
                <StatusPill status={queueStatus} compact />
            </div>
            <div className="monitor-queue-number">
                <strong>{depth}</strong>
                <span>job dalam antrean</span>
            </div>
            <div className="monitor-mini-grid">
                <div><span>Available</span><strong>{formatNumber(queue.available)}</strong></div>
                <div><span>Reserved</span><strong>{formatNumber(queue.reserved)}</strong></div>
                <div><span>Delayed</span><strong>{formatNumber(queue.delayed)}</strong></div>
                <div><span>Failed recent</span><strong>{queue.failed_recent === null ? "—" : queue.failed_recent_is_capped ? `${queue.failed_recent}+` : queue.failed_recent}</strong></div>
            </div>
            <div className="monitor-card__foot">
                <span>Oldest {durationLabel(queue.oldest_age_seconds)}</span>
                <span>Worker {relativeTime(queue.worker_last_seen_at)}</span>
            </div>
            {queue.message && <p className="monitor-muted">{queue.message}</p>}
        </section>
    );
}

function IncidentCard({ incidents }: { incidents: IncidentItem[] }) {
    return (
        <section className="monitor-card">
            <div className="monitor-card__heading">
                <div><span className="monitor-kicker">Operational response</span><h2>Active incidents</h2></div>
                <span className="monitor-count">{incidents.length.toString().padStart(2, "0")}</span>
            </div>
            {incidents.length ? (
                <div className="monitor-incident-list">
                    {incidents.slice(0, 5).map((incident) => (
                        <article key={incident.public_id}>
                            <div className={cn("monitor-severity", severityClass[incident.severity])}>{incident.severity}</div>
                            <div><strong>{incident.title}</strong><p>{incident.summary || "Investigasi sedang berlangsung."}</p></div>
                            <time>{relativeTime(incident.started_at)}</time>
                        </article>
                    ))}
                </div>
            ) : (
                <div className="monitor-clear-state"><ShieldCheck aria-hidden="true" /><div><strong>Tidak ada incident aktif</strong><p>Sistem belum mendeteksi gangguan yang membutuhkan koordinasi.</p></div></div>
            )}
        </section>
    );
}

function HealthPanel({ snapshot }: { snapshot: MonitoringSnapshot }) {
    const external = snapshot.availability;
    const externalStatus = external?.external_monitoring_configured
        ? normalizeStatus(external.status)
        : "unknown";

    return (
        <div className="monitor-panel-stack">
            <div className="monitor-two-columns monitor-two-columns--health">
                <section className="monitor-card monitor-health-feature">
                    <div className="monitor-health-feature__icon"><TimerReset aria-hidden="true" /></div>
                    <span className="monitor-kicker">Scheduler heartbeat</span>
                    <h2>{relativeTime(snapshot.scheduler.last_seen_at)}</h2>
                    <p>Ekspektasi heartbeat setiap {durationLabel(snapshot.scheduler.expected_interval_seconds)}. Lag saat ini {durationLabel(snapshot.scheduler.lag_seconds)}.</p>
                    <StatusPill status={normalizeStatus(snapshot.scheduler.status)} />
                </section>
                <QueueCard queue={snapshot.queue} />
            </div>
            <section className="monitor-card">
                <div className="monitor-card__heading"><div><span className="monitor-kicker">Readiness</span><h2>Health & availability detail</h2></div><span className="monitor-muted">bounded probes</span></div>
                <ServiceMatrix services={snapshot.services} />
            </section>
            <div className="monitor-note">
                <Signal aria-hidden="true" />
                <div>
                    <strong>External availability · {external?.provider || "belum terhubung"}</strong>
                    <p>{external?.message || "Uptime probe independen harus berjalan di luar server agar outage total tetap terukur."} Terakhir diterima {relativeTime(external?.last_external_check_at)}.</p>
                </div>
                <StatusPill status={externalStatus} compact />
            </div>
        </div>
    );
}

function PerformancePanel({ performance, capacityControl }: { performance?: PerformanceState; capacityControl?: CapacityState }) {
    if (!performance?.signals?.length) {
        return <EmptyTelemetry title="Performance telemetry belum tersedia" body="Collector belum menghasilkan sinyal performa. Tidak ada nilai nol palsu yang ditampilkan." />;
    }

    const status = normalizeStatus(performance.status);
    const http = performance.http;
    const queues = performance.queues;
    const database = performance.database;
    const iconBySignal: Record<string, LucideIcon> = {
        database_probe_latency: Database,
        queue_oldest_age: Clock3,
        http_request_latency: Activity,
        http_throughput: BarChart3,
        http_error_rate: AlertTriangle,
        queue_wait_p95: TimerReset,
        database_connections: Database,
    };

    if (!http || !queues || !database) {
        return (
            <div className="monitor-panel-stack">
                <div className="monitor-metric-grid">
                    {performance.signals.map((signal) => (
                        <MetricCard key={signal.key} eyebrow={signal.name} value={formatNumber(signal.value, signal.value === null ? "" : ` ${signal.unit}`)} detail={signal.message || "Sinyal terukur dari snapshot terbaru."} icon={iconBySignal[signal.key] || Gauge} status={normalizeStatus(signal.status)} />
                    ))}
                </div>
            </div>
        );
    }

    const capacity = http.capacity;
    const capacityDetail = capacity.tested_requests_per_second === null
        ? capacity.message || "Menunggu baseline load test."
        : `${formatNumber(capacity.headroom_requests_per_second)} req/s headroom dari ${formatNumber(capacity.tested_requests_per_second)} req/s teruji.`;

    return (
        <div className="monitor-panel-stack">
            <div className="monitor-metric-grid">
                <MetricCard eyebrow="Request throughput" value={formatNumber(http.requests_per_minute, " req/min")} detail={`${formatNumber(http.request_count)} request pada window ${performance.window_minutes ?? 5} menit.`} icon={BarChart3} status={normalizeStatus(http.status)} />
                <MetricCard eyebrow="HTTP P95 latency" value={formatNumber(http.p95_ms, " ms")} detail={`P50 ${formatNumber(http.p50_ms, " ms")} · P99 ${formatNumber(http.p99_ms, " ms")}.`} icon={Gauge} status={normalizeStatus(http.status)} />
                <MetricCard eyebrow="Server error rate" value={formatNumber(http.error_rate_percent, "%")} detail={`${formatNumber(http.error_count)} respons 5xx teragregasi tanpa PII.`} icon={AlertTriangle} status={normalizeStatus(http.status)} />
                <MetricCard eyebrow="Proven capacity" value={formatNumber(capacity.utilization_percent, "%")} detail={capacityDetail} icon={Activity} status={normalizeStatus(capacity.status)} />
            </div>

            {capacityControl && (
                <section className="monitor-card">
                    <div className="monitor-card__heading">
                        <div><span className="monitor-kicker">Elastic control plane</span><h2>Capacity planning & autoscaling</h2></div>
                        <StatusPill status={normalizeStatus(capacityControl.status)} compact />
                    </div>
                    <div className="monitor-percentile-strip">
                        <div><span>Mode</span><strong>{capacityControl.mode === "signed_plan" ? "Signed plan" : "Advisory"}</strong><small>{capacityControl.provider || "Provider belum terhubung"}</small></div>
                        <div><span>Evidence coverage</span><strong>{capacityControl.evidence_coverage.verified} / {capacityControl.evidence_coverage.required}</strong><small>{capacityControl.evidence_coverage.missing_scopes.length ? `Missing ${capacityControl.evidence_coverage.missing_scopes.join(", ")}` : `${formatNumber(capacityControl.evidence?.operational_requests_per_second, " public req/s")}`}</small></div>
                        <div><span>Target coverage</span><strong>{capacityControl.target_coverage.reported} / {capacityControl.target_coverage.required}</strong><small>{capacityControl.target_coverage.missing_targets.length ? `Missing ${capacityControl.target_coverage.missing_targets.join(", ")}` : `${capacityControl.target_coverage.verified_observer_cycles} / ${capacityControl.target_coverage.required_observer_cycles} observer cycles · ${capacityControl.target_coverage.minimum_observer_spacing_seconds}-${capacityControl.target_coverage.maximum_observer_spacing_seconds ?? "?"}s spacing`}</small></div>
                        <div><span>Plan</span><strong>{capacityControl.plan?.status || "Unavailable"}</strong><small>{capacityControl.plan?.convergence_stalled ? `Provider belum konvergen${capacityControl.plan.convergence_stalled_targets?.length ? `: ${capacityControl.plan.convergence_stalled_targets.join(", ")}` : ""}` : capacityControl.plan?.signature_valid && capacityControl.plan.fresh ? "Signature valid & fresh" : "Tidak boleh dieksekusi"}</small></div>
                    </div>
                    {capacityControl.plan && Object.keys(capacityControl.plan.targets).length > 0 ? (
                        <div className="monitor-table-shell">
                            <table className="monitor-table monitor-performance-table">
                                <thead><tr><th>Target</th><th>Observed</th><th>Resource pressure</th><th>Raw demand</th><th>Desired</th><th>Safe bounds</th><th>Decision</th><th>Automation</th></tr></thead>
                                <tbody>
                                    {Object.entries(capacityControl.plan.targets).map(([key, target]) => (
                                        <tr key={key}>
                                            <td title={`Provider state ${target.state_token_prefix}`}><div className="monitor-service-name"><span className={cn("monitor-service-dot", `monitor-service-dot--${target.capacity_limited ? "degraded" : "operational"}`)} /><div><strong>{key}</strong><small>{target.kind}</small></div></div></td>
                                            <td className="monitor-mono">{target.current_instances}</td>
                                            <td className="monitor-mono">{formatNumber(target.cpu_utilization_percent, "% CPU")} / {formatNumber(target.memory_utilization_percent, "% memory")}</td>
                                            <td className="monitor-mono">{target.raw_recommendation}</td>
                                            <td className="monitor-mono">{target.desired_instances}</td>
                                            <td className="monitor-mono">{target.minimum_instances}–{target.maximum_instances}</td>
                                            <td className="monitor-mono" title={target.reasons.join(", ")}>{target.action.replaceAll("_", " ")}</td>
                                            <td>{target.automation_eligible ? <StatusPill status="operational" compact /> : <StatusPill status="unknown" compact />}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <EmptyTelemetry title="Signed capacity plan belum tersedia" body={capacityControl.message || "Provider observation dan load evidence diperlukan sebelum automation dapat bergerak."} />
                    )}
                    {capacityControl.message && <p className="monitor-muted monitor-performance-message">{capacityControl.message}</p>}
                </section>
            )}

            <section className="monitor-card monitor-performance-latency">
                <div className="monitor-card__heading">
                    <div><span className="monitor-kicker">Request distribution</span><h2>Latency by traffic scope</h2></div>
                    <span className="monitor-muted">{http.sample_status} · {performance.driver || "database"}</span>
                </div>
                <div className="monitor-percentile-strip">
                    <div><span>P50</span><strong>{formatNumber(http.p50_ms, " ms")}</strong><small>Typical response</small></div>
                    <div><span>Average</span><strong>{formatNumber(http.average_ms, " ms")}</strong><small>Arithmetic mean</small></div>
                    <div><span>P95</span><strong>{formatNumber(http.p95_ms, " ms")}</strong><small>Slowest 5%</small></div>
                    <div><span>P99</span><strong>{formatNumber(http.p99_ms, " ms")}</strong><small>Tail latency</small></div>
                </div>
                {http.scopes.length > 0 ? (
                    <div className="monitor-table-shell">
                        <table className="monitor-table monitor-performance-table">
                            <thead><tr><th>Traffic scope</th><th>Volume</th><th>P50</th><th>P95 / target</th><th>P99 / target</th><th>Capacity</th><th>5xx</th><th>Status</th></tr></thead>
                            <tbody>
                                {http.scopes.map((scope) => (
                                    <tr key={scope.key}>
                                        <td><div className="monitor-service-name"><span className={cn("monitor-service-dot", `monitor-service-dot--${normalizeStatus(scope.status)}`)} /><div><strong>{scope.label}</strong><small>{scope.sample_status}</small></div></div></td>
                                        <td className="monitor-mono">{formatNumber(scope.request_count)} <small>({formatNumber(scope.requests_per_minute)}/min)</small></td>
                                        <td className="monitor-mono">{formatNumber(scope.p50_ms, " ms")}</td>
                                        <td className="monitor-mono">{formatNumber(scope.p95_ms, " ms")} <small>/ {formatNumber(scope.p95_target_ms, " ms")}</small></td>
                                        <td className="monitor-mono">{formatNumber(scope.p99_ms, " ms")} <small>/ {formatNumber(scope.p99_target_ms, " ms")}</small></td>
                                        <td className="monitor-mono" title={scope.capacity?.message || undefined}>{scope.capacity?.tested_requests_per_second === null || scope.capacity?.tested_requests_per_second === undefined ? "—" : `${formatNumber(scope.capacity.utilization_percent, "%")} / ${formatNumber(scope.capacity.tested_requests_per_second)} rps`}</td>
                                        <td className="monitor-mono">{formatNumber(scope.error_rate_percent, "%")}</td>
                                        <td><StatusPill status={normalizeStatus(scope.status)} compact /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <EmptyTelemetry title="Request samples are collecting" body={http.message || "Percentiles become visible after the first bounded metric window."} />}
            </section>

            <section className="monitor-card">
                <div className="monitor-card__heading">
                    <div><span className="monitor-kicker">Asynchronous fleet</span><h2>Queue throughput & latency</h2></div>
                    <StatusPill status={normalizeStatus(queues.status)} compact />
                </div>
                <div className="monitor-percentile-strip monitor-percentile-strip--queue">
                    <div><span>Processed</span><strong>{formatNumber(queues.processed_count)}</strong><small>{formatNumber(queues.jobs_per_minute)} jobs/min</small></div>
                    <div><span>Wait P95</span><strong>{formatNumber(queues.p95_wait_ms, " ms")}</strong><small>Before worker pickup</small></div>
                    <div><span>Runtime P95</span><strong>{formatNumber(queues.p95_runtime_ms, " ms")}</strong><small>Worker execution</small></div>
                    <div><span>Failed</span><strong>{formatNumber(queues.error_rate_percent, "%")}</strong><small>{formatNumber(queues.failed_count)} terminal jobs</small></div>
                </div>
                <div className="monitor-table-shell">
                    <table className="monitor-table monitor-performance-table">
                        <thead><tr><th>Queue lane</th><th>Depth</th><th>Throughput</th><th>Wait P95</th><th>Runtime P95</th><th>Workers</th><th>Failed</th><th>Status</th></tr></thead>
                        <tbody>
                            {queues.items.map((queue) => (
                                <tr key={`${queue.connection}:${queue.queue}`}>
                                    <td><div className="monitor-service-name"><span className={cn("monitor-service-dot", `monitor-service-dot--${normalizeStatus(queue.status)}`)} /><div><strong>{queue.label}</strong><small>{queue.connection} / {queue.queue}</small></div></div></td>
                                    <td className="monitor-mono">{queue.depth === null ? "—" : queue.depth_is_capped ? `${queue.depth}+` : queue.depth}</td>
                                    <td className="monitor-mono">{formatNumber(queue.jobs_per_minute)} /min</td>
                                    <td className="monitor-mono">{formatNumber(queue.p95_wait_ms, " ms")}</td>
                                    <td className="monitor-mono">{formatNumber(queue.p95_runtime_ms, " ms")}</td>
                                    <td className="monitor-mono" title={queue.workers?.reason}>{queue.workers ? `${queue.workers.recommended} · ${queue.workers.configured_minimum}–${queue.workers.configured_maximum}${queue.workers.capacity_limited ? " · max" : ""}` : "—"}</td>
                                    <td className="monitor-mono">{formatNumber(queue.error_rate_percent, "%")}</td>
                                    <td><StatusPill status={normalizeStatus(queue.status)} compact /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="monitor-card monitor-database-capacity">
                <div className="monitor-card__heading">
                    <div><span className="monitor-kicker">Database capacity</span><h2>Connection, query & lock pressure</h2></div>
                    <StatusPill status={normalizeStatus(database.status)} compact />
                </div>
                <div className="monitor-database-grid">
                    <div><span>Connections</span><strong>{formatNumber(database.connections.active)} / {formatNumber(database.connections.maximum)}</strong><small>{formatNumber(database.connections.utilization_percent, "%")} utilized</small></div>
                    <div><span>Running threads</span><strong>{formatNumber(database.connections.running)}</strong><small>Currently executing</small></div>
                    <div><span>Query throughput</span><strong>{formatNumber(database.queries_per_second)}</strong><small>queries / second</small></div>
                    <div><span>Slow queries</span><strong>{formatNumber(database.slow_queries_per_minute)}</strong><small>per minute</small></div>
                    <div><span>Current lock waits</span><strong>{formatNumber(database.lock_waits_current)}</strong><small>{formatNumber(database.lock_waits_per_minute)} / minute</small></div>
                    <div><span>Buffer pool hit</span><strong>{formatNumber(database.buffer_pool_hit_percent, "%")}</strong><small>{database.sample_status}</small></div>
                </div>
                {database.message && <p className="monitor-muted monitor-performance-message">{database.message}</p>}
            </section>

            <div className="monitor-note">
                <Gauge aria-hidden="true" />
                <div><strong>Capacity is evidence-based</strong><p>Nilai throughput berasal dari agregat internal tanpa URL atau identitas pengguna. Persentase kapasitas tetap Unknown sampai load test produksi membuktikan sustainable RPS.</p></div>
                <StatusPill status={status} compact />
            </div>
        </div>
    );
}

function IntegrityPanel({ integrity }: { integrity?: IntegrityState }) {
    if (!integrity?.available) {
        return <EmptyTelemetry title="Data integrity snapshot belum tersedia" body="Jalankan scanner read-only untuk memeriksa invariant booking, membership, dan pembayaran." />;
    }
    const domainEntries = Object.entries(integrity.domains ?? {});
    const queue = integrity.action_queue ?? integrity.checks?.filter((check) => check.count > 0) ?? [];

    return (
        <div className="monitor-panel-stack">
            <div className="monitor-integrity-header">
                <div><span className="monitor-kicker">Last deterministic scan</span><h2>{integrity.totals.violations} pelanggaran dari {integrity.totals.checks} pemeriksaan</h2><p>Generated {formatDateTime(integrity.generated_at)}{integrity.duration_ms ? ` · ${integrity.duration_ms} ms` : ""}</p></div>
                <StatusPill status={integrity.is_stale ? "unknown" : normalizeStatus(integrity.status)} />
            </div>
            <div className="monitor-domain-grid">
                {domainEntries.map(([key, domain]) => (
                    <article key={key} className="monitor-domain-card">
                        <div><Database aria-hidden="true" /><span>{key}</span></div>
                        <strong>{domain.violations}</strong>
                        <p>{domain.checks} checks · {domain.critical} critical · {domain.warning} warning</p>
                        <StatusPill status={normalizeStatus(domain.status)} compact />
                    </article>
                ))}
            </div>
            <section className="monitor-card">
                <div className="monitor-card__heading"><div><span className="monitor-kicker">Action queue</span><h2>Temuan yang perlu ditinjau</h2></div><span className="monitor-count">{queue.length.toString().padStart(2, "0")}</span></div>
                {queue.length ? (
                    <div className="monitor-integrity-list">
                        {queue.map((check) => (
                            <article key={check.key}>
                                <span className={cn("monitor-severity", severityClass[check.severity])}>{check.severity}</span>
                                <div>
                                    <strong>{check.title}</strong>
                                    <p>{check.description || `Invariant ${check.domain} membutuhkan pemeriksaan.`}</p>
                                    <small>
                                        {check.samples?.length
                                            ? `ID sampel: ${check.samples.map((sample) => sample.related_record_id === undefined ? sample.record_id : `${sample.record_id}/${sample.related_record_id}`).join(", ")}`
                                            : "Tidak menampilkan PII."}
                                        {check.recommended_action ? ` · ${check.recommended_action}` : ""}
                                    </small>
                                </div>
                                <strong>{check.count}</strong>
                            </article>
                        ))}
                    </div>
                ) : <div className="monitor-clear-state"><CheckCircle2 aria-hidden="true" /><div><strong>Seluruh invariant lolos</strong><p>Tidak ada anomali booking, membership, atau pembayaran pada snapshot terbaru.</p></div></div>}
            </section>
        </div>
    );
}

function SecurityPanel({ security }: { security?: SecurityState }) {
    if (!security) {
        return <EmptyTelemetry title="Security telemetry belum tersedia" body="Collector belum menghasilkan posture keamanan maupun event teragregasi." />;
    }

    const status = normalizeStatus(security.status);
    const staffAccounts = security.posture.staff_accounts;
    const mfaCoverage = staffAccounts > 0
        ? Math.round((security.posture.mfa_enabled / staffAccounts) * 1000) / 10
        : null;
    const events = security.recent_events.items ?? [];

    return (
        <div className="monitor-panel-stack">
            <div className="monitor-metric-grid">
                <MetricCard eyebrow="Staff accounts" value={security.posture.is_capped ? `${staffAccounts}+` : formatNumber(staffAccounts)} detail={`Sampel dibatasi ${security.posture.sample_limit} akun.`} icon={Users2} status={status} />
                <MetricCard eyebrow="MFA protected" value={formatNumber(security.posture.mfa_enabled)} detail="Akun dengan MFA aktif dan recovery code diakui." icon={ShieldCheck} status={status} />
                <MetricCard eyebrow="MFA coverage" value={formatNumber(mfaCoverage, "%")} detail="Cakupan pada akun staff yang terukur." icon={LockKeyhole} status={mfaCoverage === 100 ? "operational" : mfaCoverage === null ? "unknown" : "degraded"} />
                <MetricCard eyebrow="Recent security events" value={security.recent_events.is_capped && security.recent_events.count !== null ? `${security.recent_events.count}+` : formatNumber(security.recent_events.count)} detail={security.recent_events.message || "Event keamanan teragregasi."} icon={ShieldAlert} status={security.telemetry_configured ? status : "unknown"} />
            </div>
            <section className="monitor-card monitor-security-card">
                <div className="monitor-card__heading"><div><span className="monitor-kicker">Threat signals</span><h2>Security event summary</h2></div><StatusPill status={status} compact /></div>
                {events.length ? (
                    <div className="monitor-security-list">
                        {events.map((event) => (
                            <article key={event.key}><span className={cn("monitor-severity", severityClass[event.severity])}>{event.severity}</span><div><strong>{event.label || event.title || event.key}</strong><p>{event.description || "Sinyal keamanan teragregasi dan sudah disanitasi."}</p></div><strong>{formatNumber(event.count)}</strong></article>
                        ))}
                    </div>
                ) : security.telemetry_configured
                    ? <div className="monitor-clear-state"><ShieldCheck aria-hidden="true" /><div><strong>Tidak ada sinyal berisiko</strong><p>Tidak ada pola keamanan yang melewati threshold pada window ini.</p></div></div>
                    : <EmptyTelemetry title="Event security belum terpusat" body={security.recent_events.message || "Posture MFA tersedia, tetapi event login dan throttle belum terhubung ke telemetry terpusat."} />}
            </section>
            <div className="monitor-note monitor-note--security"><LockKeyhole aria-hidden="true" /><div><strong>Privasi telemetry</strong><p>Halaman ini hanya menampilkan agregat. Password, token, recovery code, detail kartu, dan PII mentah tidak pernah ditampilkan.</p></div></div>
        </div>
    );
}

function replicationEventLabel(type: string): string {
    if (type === "topology_initialized") return "Topology initialized";
    if (type === "failover_completed") return "Failover completed";
    if (type === "failover_failed") return "Failover failed";
    if (type === "failback_completed") return "Failback completed";
    if (type === "replication_outage") return "Replication boundary breached";
    if (type === "replication_recovered") return "Replication recovered";
    if (type === "split_brain_detected") return "Split-brain blocked";
    if (type === "topology_epoch_regression") return "Epoch regression blocked";
    if (type === "drill_completed") return "Failover drill completed";
    return type.replaceAll("_", " ");
}

function ReplicationPanel({ replication }: { replication?: ReplicationState }) {
    if (!replication) {
        return <EmptyTelemetry title="Replication telemetry belum tersedia" body="Control plane belum menghasilkan bukti topologi, writer, fencing, lag, dan event ledger." />;
    }

    if (replication.mode === "standby") {
        return (
            <div className="monitor-panel-stack monitor-replication">
                <section className="monitor-card">
                    <div className="monitor-card__heading">
                        <div><span className="monitor-kicker">Standby capability</span><h2>Replication tersimpan, belum diaktifkan.</h2></div>
                        <StatusPill status="unknown" compact />
                    </div>
                    <div className="monitor-clear-state">
                        <Workflow aria-hidden="true" />
                        <div>
                            <strong>Profil aktif: single node</strong>
                            <p>{replication.message} Kemampuan ini aktif otomatis setelah profil {replication.activation_topology || "multi_node"} dipilih dan seluruh bukti infrastrukturnya lulus.</p>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    const status = replication.configured ? normalizeStatus(replication.status) : "unknown";
    const current = replication.current;
    const signals = replication.signals ?? {};
    const target = replication.target;
    const eventItems = replication.ledger?.items ?? [];
    const controls: Array<{ key: string; title: string; value: string; detail: string; icon: LucideIcon }> = [
        {
            key: "topology",
            title: "Signed topology",
            value: current ? `Epoch ${current.topology_epoch}` : "—",
            detail: signals.topology?.message || "Belum ada observasi provider yang diterima.",
            icon: Workflow,
        },
        {
            key: "fencing",
            title: "Writer fencing",
            value: current?.checks?.stale_writers_fenced === true ? "Fenced" : "Unproven",
            detail: signals.fencing?.message || "Bukti fencing belum tersedia.",
            icon: LockKeyhole,
        },
        {
            key: "lag",
            title: "Maximum lag",
            value: current ? formatNumber(current.maximum_replica_lag_ms, " ms") : "—",
            detail: signals.lag?.message || "Replica lag belum terukur.",
            icon: Signal,
        },
        {
            key: "ledger",
            title: "Evidence ledger",
            value: replication.ledger?.head_sequence === null || replication.ledger?.head_sequence === undefined
                ? "—"
                : `#${replication.ledger.head_sequence}`,
            detail: signals.ledger?.message || replication.ledger?.message || "Ledger belum diverifikasi.",
            icon: Fingerprint,
        },
    ];
    const safeguards = [
        ["single_writer", "Satu writer"],
        ["writer_writable", "Writer writable"],
        ["quorum_healthy", "Quorum sehat"],
        ["stale_writers_fenced", "Writer lama fenced"],
        ["replicas_read_only", "Replica read-only"],
        ["promotion_caught_up", "Promotion caught-up"],
        ["zero_data_loss", "Zero data loss"],
        ["gtid_enabled", "GTID aktif"],
        ["row_binlog", "Row binlog"],
        ["cross_az", "Lintas availability zone"],
    ] as const;
    const targetItems = [
        ["Provider", target?.provider],
        ["Cluster", target?.cluster_id],
        ["Dataset", target?.dataset_id],
        ["Region", target?.primary_region],
        ["Writer endpoint", target?.writer_endpoint_id],
        ["Reader endpoint", target?.reader_endpoint_id],
        ["Observer", target?.independent_observer],
    ];

    return (
        <div className="monitor-panel-stack monitor-replication">
            <section className="monitor-replication-command">
                <div className="monitor-replication-command__copy">
                    <span className="monitor-kicker monitor-kicker--light">Database continuity</span>
                    <h2>Satu writer.<br />Tidak ada asumsi.</h2>
                    <p>{replication.message}</p>
                    <div className="monitor-replication-command__proof">
                        <span><Fingerprint aria-hidden="true" /> Provider attestation</span>
                        <span><LockKeyhole aria-hidden="true" /> Fail-closed controls</span>
                        <span><Workflow aria-hidden="true" /> No automatic failback</span>
                    </div>
                </div>
                <div className="monitor-replication-command__state">
                    <div className="monitor-replication-command__epoch">
                        <span>Current topology epoch</span>
                        <strong>{current ? String(current.topology_epoch).padStart(2, "0") : "—"}</strong>
                        <small>{current?.attested ? "Independently attested" : "Belum terverifikasi"}</small>
                    </div>
                    <div className="monitor-replication-command__metrics">
                        <div><span>Healthy replicas</span><strong>{current ? `${current.healthy_replica_count}/${current.replica_count}` : "—"}</strong></div>
                        <div><span>Synchronous</span><strong>{formatNumber(current?.synchronous_replica_count)}</strong></div>
                        <div><span>Failover target</span><strong>{durationLabel(replication.policy.failover_rto_seconds)}</strong></div>
                        <div><span>Data loss</span><strong>{current ? formatBytes(current.data_loss_bytes) : "—"}</strong></div>
                    </div>
                    <StatusPill status={status} />
                </div>
            </section>

            <div className="monitor-replication-controls">
                {controls.map((control) => {
                    const Icon = control.icon;
                    const controlStatus = normalizeStatus(signals[control.key]?.status);
                    return (
                        <article key={control.key} className={cn("monitor-replication-control", `monitor-replication-control--${controlStatus}`)}>
                            <div><span>{control.title}</span><i><Icon aria-hidden="true" /></i></div>
                            <strong>{control.value}</strong>
                            <p>{control.detail}</p>
                            <small>{relativeTime(signals[control.key]?.observed_at)}</small>
                            <StatusPill status={controlStatus} compact />
                        </article>
                    );
                })}
            </div>

            <div className="monitor-two-columns monitor-replication-detail-grid">
                <section className="monitor-card monitor-replication-topology">
                    <div className="monitor-card__heading">
                        <div><span className="monitor-kicker">Live topology</span><h2>Writer path & trust boundary</h2></div>
                        <ServerCog aria-hidden="true" />
                    </div>
                    <div className="monitor-replication-route">
                        <div className="is-writer"><Database aria-hidden="true" /><span>Writer</span><strong>{current?.writer_fingerprint || "Unbound"}</strong></div>
                        <i><span /></i>
                        <div><ServerCog aria-hidden="true" /><span>Sync standby</span><strong>{formatNumber(current?.synchronous_replica_count)}</strong></div>
                        <i><span /></i>
                        <div><Signal aria-hidden="true" /><span>Read replicas</span><strong>{formatNumber(current?.healthy_replica_count)}</strong></div>
                    </div>
                    {current?.conflicting_writer_fingerprint && (
                        <div className="monitor-replication-conflict" role="alert">
                            <AlertOctagon aria-hidden="true" />
                            <div><strong>Conflicting writer ditolak</strong><p>{current.conflicting_writer_fingerprint} tidak diterima sebagai writer.</p></div>
                        </div>
                    )}
                    <div className="monitor-replication-safeguards">
                        {safeguards.map(([key, label]) => {
                            const passed = current?.checks?.[key] === true;
                            return (
                                <div key={key} className={passed ? "is-passed" : "is-unproven"}>
                                    {passed ? <CheckCircle2 aria-hidden="true" /> : <CircleHelp aria-hidden="true" />}
                                    <span>{label}</span>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className="monitor-card monitor-replication-policy">
                    <div className="monitor-card__heading">
                        <div><span className="monitor-kicker">Bound configuration</span><h2>Provider & read policy</h2></div>
                        <span className="monitor-count">{replication.policy.minimum_availability_zones}AZ</span>
                    </div>
                    <dl>
                        {targetItems.map(([label, value]) => (
                            <div key={label} className={!value ? "is-unbound" : undefined}><dt>{label}</dt><dd>{value || "Belum diikat"}</dd></div>
                        ))}
                    </dl>
                    <div className="monitor-replication-read-policy">
                        <div><LockKeyhole aria-hidden="true" /><span>Transactional reads</span><strong>Writer only</strong></div>
                        <div><Signal aria-hidden="true" /><span>Eventually consistent reads</span><strong>{replication.policy.application_replica_reads ? "Explicitly enabled" : "Disabled"}</strong></div>
                        <p>Booking, membership, payment, authentication, admin, dan read-after-write tidak dialihkan ke replica asinkron.</p>
                    </div>
                </section>
            </div>

            <section className="monitor-card monitor-replication-ledger-card">
                <div className="monitor-card__heading">
                    <div><span className="monitor-kicker">Append-only · signed transitions</span><h2>Replication event ledger</h2></div>
                    <div className="monitor-replication-ledger-head"><span>{replication.ledger?.head_fingerprint || "No chain head"}</span><StatusPill status={normalizeStatus(signals.ledger?.status)} compact /></div>
                </div>
                {eventItems.length ? (
                    <div className="monitor-replication-ledger">
                        {eventItems.map((item) => (
                            <article key={item.public_id}>
                                <span className="monitor-replication-ledger__sequence">{String(item.sequence).padStart(3, "0")}</span>
                                <span className={cn("monitor-service-dot", `monitor-service-dot--${normalizeStatus(item.status)}`)} aria-hidden="true" />
                                <div className="monitor-replication-ledger__copy">
                                    <strong>{replicationEventLabel(item.event_type)}</strong>
                                    <small>Epoch {item.topology_epoch} · writer {item.writer_fingerprint}</small>
                                </div>
                                <div className="monitor-replication-ledger__proof">
                                    <span>{item.attested ? "Provider-signed" : "Unverified"}</span>
                                    <small>{formatDateTime(item.observed_at || item.recorded_at)}</small>
                                </div>
                                <StatusPill status={normalizeStatus(item.status)} compact />
                            </article>
                        ))}
                    </div>
                ) : <EmptyTelemetry title="Belum ada transisi topology" body="Observasi rutin memperbarui satu state; ledger hanya bertambah saat status, writer, atau epoch benar-benar berubah." />}
                <div className="monitor-note monitor-replication-warning">
                    <LockKeyhole aria-hidden="true" />
                    <div><strong>Read-only operational cockpit</strong><p>Promote, failback, dan fencing tetap berada pada provider dengan change control dan dual approval. Dashboard ini tidak menyediakan tombol mutasi topologi.</p></div>
                </div>
            </section>
        </div>
    );
}

function signalString(signal: RecoverySignal | undefined, key: string): string | null {
    const value = signal?.[key];
    return typeof value === "string" && value.trim() !== "" ? value : null;
}

function signalNumber(signal: RecoverySignal | undefined, key: string): number | null {
    const value = signal?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recoveryEvidenceLabel(type: string): string {
    if (type === "pitr_observation") return "PITR observation";
    if (type === "backup_verified") return "Backup verified";
    if (type === "backup_failed") return "Backup failed";
    if (type === "restore_drill") return "Restore drill";
    return type.replaceAll("_", " ");
}

function RecoveryPanel({ recovery }: { recovery?: RecoveryState }) {
    if (!recovery) {
        return <EmptyTelemetry title="Recovery telemetry belum tersedia" body="Control plane belum menghasilkan status PITR, backup immutable, restore drill, dan evidence ledger." />;
    }

    const pitr = recovery.signals?.pitr;
    const backup = recovery.signals?.immutable_backup;
    const restore = recovery.signals?.restore_drill;
    const chain = recovery.signals?.evidence_chain;
    const evidence = recovery.evidence;
    const target = recovery.target;
    const evidenceItems = evidence?.items ?? [];
    const recoveryStatus = recovery.configured ? normalizeStatus(recovery.status) : "unknown";
    const targetItems = [
        { label: "Provider", value: target?.provider },
        { label: "Dataset", value: target?.dataset_id },
        { label: "Primary", value: target?.primary_region },
        { label: "Vault", value: target?.backup_destination_id },
        { label: "Recovery", value: target?.recovery_region },
        { label: "Verifier", value: target?.independent_verifier },
    ];
    const controls: Array<{
        key: string;
        title: string;
        eyebrow: string;
        icon: LucideIcon;
        signal?: RecoverySignal;
        primary: string;
        secondary: string;
        deadline: string | null;
    }> = [
        {
            key: "pitr",
            title: "Point-in-time recovery",
            eyebrow: "Provider capability",
            icon: TimerReset,
            signal: pitr,
            primary: `Lag ${durationLabel(signalNumber(pitr, "lag_seconds"))}`,
            secondary: `Recovery point ${formatDateTime(signalString(pitr, "latest_recovery_point_at"))}`,
            deadline: signalString(pitr, "outage_at"),
        },
        {
            key: "backup",
            title: "Immutable backup",
            eyebrow: "Independent copy",
            icon: HardDrive,
            signal: backup,
            primary: formatBytes(signalNumber(backup, "size_bytes")),
            secondary: `Verified ${relativeTime(backup?.observed_at)} · lock ${signalString(backup, "object_lock_mode") || "unverified"}`,
            deadline: signalString(backup, "outage_at"),
        },
        {
            key: "restore",
            title: "Isolated restore drill",
            eyebrow: "Recovery proof",
            icon: ArchiveRestore,
            signal: restore,
            primary: `RTO ${durationLabel(signalNumber(restore, "observed_rto_seconds"))}`,
            secondary: `RPO ${durationLabel(signalNumber(restore, "observed_rpo_seconds"))} · ${signalString(restore, "target_environment") || "target unverified"}`,
            deadline: signalString(restore, "outage_at"),
        },
        {
            key: "ledger",
            title: "Evidence chain",
            eyebrow: "Tamper evidence",
            icon: Fingerprint,
            signal: chain,
            primary: evidence?.head_sequence === null || evidence?.head_sequence === undefined
                ? "—"
                : `#${evidence.head_sequence}`,
            secondary: evidence?.head_fingerprint
                ? `Head ${evidence.head_fingerprint}`
                : "Chain head belum tersedia",
            deadline: null,
        },
    ];

    return (
        <div className="monitor-panel-stack monitor-recovery">
            <section className="monitor-recovery-command">
                <div className="monitor-recovery-command__copy">
                    <span className="monitor-kicker monitor-kicker--light">Recovery command center</span>
                    <h2>Data dapat dipulihkan,<br />bukan sekadar dicadangkan.</h2>
                    <p>{recovery.message}</p>
                </div>
                <div className="monitor-recovery-objectives" aria-label="Recovery objectives">
                    <div><span>RPO target</span><strong>{durationLabel(recovery.objectives.rpo_seconds)}</strong><small>Kehilangan data maksimum</small></div>
                    <div><span>RTO target</span><strong>{durationLabel(recovery.objectives.rto_seconds)}</strong><small>Waktu pulih maksimum</small></div>
                    <StatusPill status={recoveryStatus} />
                </div>
            </section>

            <div className="monitor-recovery-controls">
                {controls.map((control) => {
                    const Icon = control.icon;
                    const status = control.signal?.configured
                        ? normalizeStatus(control.signal.status)
                        : "unknown";
                    return (
                        <article key={control.key} className={cn("monitor-recovery-control", `monitor-recovery-control--${status}`)}>
                            <div className="monitor-recovery-control__head">
                                <div><span>{control.eyebrow}</span><h3>{control.title}</h3></div>
                                <span className="monitor-recovery-control__icon"><Icon aria-hidden="true" /></span>
                            </div>
                            <strong className="monitor-recovery-control__value">{control.primary}</strong>
                            <p>{control.signal?.message || "Telemetry control belum dikonfigurasi."}</p>
                            <div className="monitor-recovery-control__foot">
                                <span>{control.secondary}</span>
                                {control.deadline && <small>Outage boundary {formatDateTime(control.deadline)}</small>}
                            </div>
                            <StatusPill status={status} compact />
                        </article>
                    );
                })}
            </div>

            <div className="monitor-two-columns monitor-recovery-detail-grid">
                <section className="monitor-card monitor-recovery-topology">
                    <div className="monitor-card__heading">
                        <div><span className="monitor-kicker">Bound recovery target</span><h2>Topology & trust boundary</h2></div>
                        <MapPinned aria-hidden="true" />
                    </div>
                    <div className="monitor-recovery-route" aria-hidden="true">
                        <span>Primary</span><i /><span>Immutable copy</span><i /><span>Recovery</span>
                    </div>
                    <dl className="monitor-recovery-targets">
                        {targetItems.map((item) => (
                            <div key={item.label} className={!item.value ? "is-unbound" : undefined}>
                                <dt>{item.label}</dt>
                                <dd>{item.value || "Belum diikat"}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="monitor-note monitor-recovery-safety">
                        <LockKeyhole aria-hidden="true" />
                        <div><strong>Tidak ada one-click restore</strong><p>Restore production tetap break-glass, dual-control, dilakukan ke target paralel, lalu dipindahkan melalui cutover terverifikasi.</p></div>
                    </div>
                </section>

                <section className="monitor-card monitor-recovery-sequence">
                    <div className="monitor-card__heading">
                        <div><span className="monitor-kicker">Operator sequence</span><h2>Jalur pemulihan aman</h2></div>
                        <span className="monitor-count">05</span>
                    </div>
                    <ol>
                        <li><span>01</span><div><strong>Declare & contain</strong><p>Tetapkan incident commander, hentikan writer yang tidak aman, dan pertahankan bukti.</p></div></li>
                        <li><span>02</span><div><strong>Select recovery point</strong><p>Pilih titik terakhir yang konsisten berdasarkan PITR dan dampak bisnis.</p></div></li>
                        <li><span>03</span><div><strong>Restore in isolation</strong><p>Pulihkan ke jaringan terpisah; jangan menimpa writer production.</p></div></li>
                        <li><span>04</span><div><strong>Prove correctness</strong><p>Uji constraint, akun, otorisasi, booking, membership, payment, dan audit chain.</p></div></li>
                        <li><span>05</span><div><strong>Controlled cutover</strong><p>Rekonsiliasi gap, alihkan traffic bertahap, dan awasi SLO setelah pemulihan.</p></div></li>
                    </ol>
                </section>
            </div>

            <section className="monitor-card monitor-recovery-evidence">
                <div className="monitor-card__heading">
                    <div><span className="monitor-kicker">Append-only · independently attested</span><h2>Recovery evidence ledger</h2></div>
                    <div className="monitor-recovery-evidence__head">
                        <span>{evidence?.message || "Evidence storage belum tersedia."}</span>
                        <StatusPill status={evidence?.available ? normalizeStatus(chain?.status) : "outage"} compact />
                    </div>
                </div>
                {evidenceItems.length ? (
                    <div className="monitor-recovery-ledger">
                        {evidenceItems.map((item) => (
                            <article key={item.public_id}>
                                <span className="monitor-recovery-ledger__sequence">{String(item.sequence).padStart(3, "0")}</span>
                                <span className={cn("monitor-service-dot", `monitor-service-dot--${normalizeStatus(item.status)}`)} aria-hidden="true" />
                                <div className="monitor-recovery-ledger__copy">
                                    <div><strong>{recoveryEvidenceLabel(item.evidence_type)}</strong><small>{item.backup_id}</small></div>
                                    <p>{item.failure_code ? `Failure: ${item.failure_code.replaceAll("_", " ")}` : `${item.checks_passed}/${item.checks_total} controls passed`}</p>
                                </div>
                                <div className="monitor-recovery-ledger__proof">
                                    <span>{item.attested && item.target_matches_current ? `Target-bound · ${item.source_key_id || "key verified"}` : item.attested ? "Target mismatch" : "Local evidence"}</span>
                                    <small>{formatDateTime(item.completed_at || item.recorded_at)}</small>
                                </div>
                                <StatusPill status={normalizeStatus(item.status)} compact />
                            </article>
                        ))}
                    </div>
                ) : (
                    <EmptyTelemetry title="Belum ada evidence recovery" body="Status tetap tidak sehat sampai verifier eksternal mengirim bukti backup dan drill yang sah." />
                )}
            </section>
        </div>
    );
}

function SloPanel({ slos, usage }: { slos?: MonitoringSnapshot["slos"]; usage?: MonitoringSnapshot["usage"] }) {
    const usageMetrics = usage ? [
        { key: "bookings", label: "Booking dibuat", ...usage.bookings_created },
        { key: "memberships", label: "Membership dibuat", ...usage.memberships_created },
        { key: "payments", label: "Pembayaran lunas", ...usage.payments_paid },
    ] : [];

    return (
        <div className="monitor-panel-stack">
            {!slos?.items?.length ? (
                <EmptyTelemetry title="SLO belum memiliki data produksi" body="Target internal dapat dikonfigurasi sekarang; actual dan error budget baru dihitung setelah baseline telemetry cukup." />
            ) : (
                <section className="monitor-card">
                    <div className="monitor-card__heading"><div><span className="monitor-kicker">Service objectives</span><h2>SLO & error budget</h2></div><span className="monitor-muted">{slos.window_days} hari · {slos.evaluation_status}</span></div>
                    <div className="monitor-slo-list">
                        {slos.items.map((objective) => {
                            const budget = objective.error_budget_remaining_percent;
                            return (
                                <article key={objective.key}>
                                    <div className="monitor-slo-list__copy">
                                        <strong>{objective.name}</strong>
                                        <p>{objective.indicator} · {objective.source}</p>
                                        <small>
                                            {formatNumber(objective.recorded_samples ?? objective.sample_count)} tercatat · {formatNumber(objective.missing_samples)} blind spot · {formatNumber(objective.bad_samples)} tidak sehat
                                            {objective.burn_rates?.["1h"] !== undefined ? ` · burn 1j ${formatNumber(objective.burn_rates["1h"], "×")}` : ""}
                                            {objective.evaluation_status === "insufficient_data" ? ` · minimum ${formatNumber(objective.minimum_samples)}` : ""}
                                        </small>
                                    </div>
                                    <div className="monitor-slo-list__actual"><span>Actual</span><strong>{formatNumber(objective.compliance_percent, "%")}</strong></div>
                                    <div className="monitor-slo-list__target"><span>Target</span><strong>{formatNumber(objective.target_percent, "%")}</strong></div>
                                    <div className="monitor-slo-list__bar"><span style={{ width: budget === null ? "0%" : `${Math.max(0, Math.min(100, budget))}%` }} /></div>
                                    <div className="monitor-slo-list__budget"><span>Budget tersisa</span><strong>{formatNumber(budget, "%")}</strong></div>
                                    <StatusPill status={normalizeStatus(objective.status)} compact />
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}

            {!usage ? (
                <EmptyTelemetry title="Capacity usage belum terukur" body="Usage akan menampilkan traffic, booking, membership, queue, storage, dan headroom tanpa menjadikan database transaksi sebagai mesin grafik." />
            ) : (
                <section className="monitor-card">
                    <div className="monitor-card__heading"><div><span className="monitor-kicker">Bounded activity</span><h2>Usage snapshot</h2></div><span className="monitor-muted">{usage.window_minutes} menit</span></div>
                    <div className="monitor-usage-grid">
                        {usageMetrics.map((metric) => (
                            <article key={metric.key}>
                                <span>{metric.label}</span><strong>{metric.value === null ? "—" : metric.is_capped ? `${metric.value}+` : formatNumber(metric.value)}</strong>
                                <p>Aktivitas pada jendela snapshot saat ini.</p>
                                <div><span style={{ width: metric.value === null ? "0%" : `${Math.min(100, (metric.value / Math.max(1, metric.sample_limit)) * 100)}%` }} /></div>
                                <small>{metric.is_capped ? `Melebihi sampel ${metric.sample_limit}` : `Batas baca ${metric.sample_limit} record`}</small>
                            </article>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

export default function MonitoringIndex({ snapshot: initialSnapshot, snapshot_url: snapshotUrl }: Props) {
    const [snapshot, setSnapshot] = useState(initialSnapshot);
    const [tab, setTab] = useState<MonitorTab>(() => {
        if (typeof window === "undefined") return "overview";
        const requested = new URLSearchParams(window.location.search).get("tab") as MonitorTab | null;
        return TAB_ITEMS.some((item) => item.key === requested) ? requested! : "overview";
    });
    const [refreshing, setRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const [now, setNow] = useState(Date.now());
    const mounted = useRef(true);
    const activeRequest = useRef<AbortController | null>(null);
    const endpoint = snapshotUrl || "/ubsc-staff/settings/monitoring/snapshot";

    const refresh = useCallback(async (manual = false) => {
        if (document.visibilityState === "hidden") return;
        if (activeRequest.current !== null) return;

        const controller = new AbortController();
        activeRequest.current = controller;
        if (manual) setRefreshing(true);
        try {
            const response = await axios.get<MonitoringSnapshot>(endpoint, {
                headers: { "X-UBSC-Background-Poll": "1", Accept: "application/json" },
                timeout: 12_000,
                signal: controller.signal,
            });
            if (!mounted.current) return;
            setSnapshot(response.data);
            setRefreshError(null);
        } catch (error) {
            if (axios.isCancel(error)) return;
            if (mounted.current) setRefreshError("Pembaruan telemetry gagal. Snapshot terakhir tetap ditampilkan.");
        } finally {
            if (activeRequest.current === controller) activeRequest.current = null;
            if (mounted.current && manual) setRefreshing(false);
        }
    }, [endpoint]);

    useEffect(() => {
        mounted.current = true;
        const tick = window.setInterval(() => setNow(Date.now()), 10_000);
        const poll = window.setInterval(() => void refresh(false), Math.max(15_000, (snapshot.cache_ttl_seconds || 30) * 1_000));
        const onVisible = () => { if (document.visibilityState === "visible") void refresh(false); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            mounted.current = false;
            activeRequest.current?.abort();
            activeRequest.current = null;
            window.clearInterval(tick);
            window.clearInterval(poll);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [refresh, snapshot.cache_ttl_seconds]);

    const changeTab = (next: MonitorTab) => {
        setTab(next);
        const url = new URL(window.location.href);
        if (next === "overview") url.searchParams.delete("tab"); else url.searchParams.set("tab", next);
        window.history.replaceState(window.history.state, "", url);
    };

    const overallStatus = normalizeStatus(snapshot.overall?.status);
    const overallMeta = STATUS_META[overallStatus];
    const OverallIcon = overallMeta.icon;
    const generatedAgo = relativeTime(snapshot.generated_at, now);
    const generatedAtMs = snapshot.generated_at ? new Date(snapshot.generated_at).getTime() : Number.NaN;
    const isStale = snapshot.snapshot_stale ?? (
        !Number.isFinite(generatedAtMs)
        || generatedAtMs < now - Math.max(60, snapshot.cache_ttl_seconds * 3) * 1_000
    );
    const activePanel = useMemo(() => {
        switch (tab) {
            case "health": return <HealthPanel snapshot={snapshot} />;
            case "performance": return <PerformancePanel performance={snapshot.performance} capacityControl={snapshot.capacity} />;
            case "integrity": return <IntegrityPanel integrity={snapshot.integrity} />;
            case "security": return <SecurityPanel security={snapshot.security} />;
            case "replication": return <ReplicationPanel replication={snapshot.replication} />;
            case "recovery": return <RecoveryPanel recovery={snapshot.recovery} />;
            case "slo": return <SloPanel slos={snapshot.slos} usage={snapshot.usage} />;
            default: return <OverviewPanel snapshot={snapshot} />;
        }
    }, [snapshot, tab]);

    return (
        <AdminLayout>
            <Head title="System Monitoring" />
            <div className="monitor-page">
                <header className="monitor-hero">
                    <div className="monitor-hero__ambient" aria-hidden="true" />
                    <div className="monitor-hero__topline">
                        <span>{(snapshot.environment || "environment").toUpperCase()}</span>
                        <span>OPS / 01</span>
                    </div>
                    <div className="monitor-hero__body">
                        <div>
                            <span className="monitor-kicker monitor-kicker--light">System & operations</span>
                            <h1>Kondisi sistem,<br />tanpa blind spot.</h1>
                            <p>Health, availability, performance, integritas data, keamanan, replication, recovery, SLO, dan kapasitas dalam satu cockpit operasional.</p>
                        </div>
                        <div className={cn("monitor-overall", STATUS_META[isStale ? "unknown" : overallStatus].className)}>
                            <div className="monitor-overall__icon"><OverallIcon aria-hidden="true" /></div>
                            <div><span>Current state</span><strong>{isStale ? "Unknown" : overallMeta.label}</strong><p>{isStale ? "Snapshot sudah kedaluwarsa." : overallMeta.description}</p></div>
                        </div>
                    </div>
                    <div className="monitor-hero__foot">
                        <div><Clock3 aria-hidden="true" /><span>Updated {generatedAgo}</span></div>
                        <div><History aria-hidden="true" /><span>{formatDateTime(snapshot.generated_at)}</span></div>
                        {snapshot.topology && <div><ServerCog aria-hidden="true" /><span>{snapshot.topology === "single_node" ? "Single node" : snapshot.topology === "multi_node" ? "Multi node" : snapshot.topology}</span></div>}
                        {snapshot.release && <div><Workflow aria-hidden="true" /><span>{snapshot.release}</span></div>}
                        <button type="button" onClick={() => void refresh(true)} disabled={refreshing}>
                            <RefreshCw className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
                            {refreshing ? "Memperbarui" : "Refresh snapshot"}
                        </button>
                    </div>
                </header>

                {(refreshError || isStale) && (
                    <div className="monitor-banner" role="status">
                        <AlertTriangle aria-hidden="true" />
                        <span>{refreshError || "Telemetry stale. Status tidak dianggap sehat sampai snapshot baru diterima."}</span>
                    </div>
                )}

                <nav className="monitor-tabs" aria-label="Monitoring sections">
                    {TAB_ITEMS.map((item, index) => {
                        const Icon = item.icon;
                        return (
                            <button key={item.key} type="button" className={tab === item.key ? "is-active" : ""} onClick={() => changeTab(item.key)} aria-current={tab === item.key ? "page" : undefined}>
                                <span>{String(index + 1).padStart(2, "0")}</span><Icon aria-hidden="true" /><strong className="monitor-tabs__full">{item.label}</strong><strong className="monitor-tabs__short">{item.short}</strong>
                            </button>
                        );
                    })}
                </nav>

                <main className="monitor-content">{activePanel}</main>

                <footer className="monitor-page-foot">
                    <div><ServerCog aria-hidden="true" /><span>Internal operational cockpit</span></div>
                    <p>Query dibatasi, telemetry disanitasi, dan status tidak tersedia selalu ditampilkan sebagai Unknown.</p>
                </footer>
            </div>
        </AdminLayout>
    );
}
