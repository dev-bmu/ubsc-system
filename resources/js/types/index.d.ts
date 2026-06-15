export type IdentityCategory = "umum" | "warga_kampus";
export type IdentityStatus = "unverified" | "pending" | "verified" | "rejected";

export interface User {
    id: number;
    name: string;
    email: string;
    email_verified_at?: string;
    avatar?: string | null;
    avatar_url?: string | null;
    phone_number?: string | null;
    birth_place?: string | null;
    birth_date?: string | null;
    identity_category?: IdentityCategory | null;
    identity_number?: string | null;
    identity_status?: IdentityStatus;
    role?: string | null;
    permissions?: string[];
}

export type AdminNotificationTone = "info" | "success" | "warning" | "critical";

export interface AdminNotificationItem {
    id: string;
    title: string;
    description: string;
    time: string;
    read: boolean;
    important?: boolean;
    tone: AdminNotificationTone;
    source?: string;
    href?: string;
    actionLabel?: string;
}

export interface AdminNotificationsPayload {
    items: AdminNotificationItem[];
    unread_count: number;
    important_count: number;
    generated_at: string;
}

export type PageProps<
    T extends Record<string, unknown> = Record<string, unknown>,
> = T & {
    auth: {
        user: User | null;
    };
    flash?: {
        success?: string | null;
        error?: string | null;
    };
    announcements?: string[];
    admin_notifications?: AdminNotificationsPayload;
    gym_traffic?: string;
};

// ─── Facility Types ───────────────────────────────────────────────────────────

export interface FacilityCategory {
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    sort_order: number;
    facilities_count?: number;
}

export interface FacilityMedia {
    id: number;
    url: string;
    name: string;
    order_column: number;
}

export interface FacilityItem {
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    location?: string | null;
    venue_type?: string | null;
    capacity?: number;
    active_slots?: Record<string, string[]> | null;
    class_code?: string | null;
    rating?: number;
    display_metadata?: Record<string, unknown> | null;
    is_active: boolean;
    sort_order: number;
    category: FacilityCategory;
    hero?: FacilityMedia | null;
    gallery: FacilityMedia[];
    prices_count?: number;
    units_count?: number;
}

// ─── Identity Queue Types ─────────────────────────────────────────────────────

export interface IdentityUser {
    id: number;
    name: string;
    email: string;
    phone_number?: string | null;
    identity_category: IdentityCategory;
    identity_number?: string | null;
    identity_status: IdentityStatus;
    has_document: boolean;
    document_url: string | null;
    updated_at: string;
}

// ─── News Types ───────────────────────────────────────────────────────────────

export interface NewsCategory {
    id: number;
    name: string;
    slug: string;
    news_count?: number;
}

export type NewsStatus = "draft" | "published" | "archived";

export interface NewsItem {
    id: number;
    title: string;
    slug: string;
    excerpt?: string | null;
    status: NewsStatus;
    published_at?: string | null;
    updated_at: string;
    category?: NewsCategory | null;
    author: { id: number; name: string; avatar_url?: string | null; avatar?: string | null };
    thumbnail?: string | null;
}

// ─── InfoBanner Types ─────────────────────────────────────────────────────────

export interface InfoBannerItem {
    id: number;
    message: string;
    is_active: boolean;
    sort_order: number;
}

// ─── CMS Types ────────────────────────────────────────────────────────────────

export interface PromoItem {
    id: number;
    title?: string | null;
    is_active: boolean;
    sort_order: number;
    slide_url?: string | null;
}

export interface SponsorItem {
    id: number;
    name: string;
    is_active: boolean;
    sort_order: number;
    logo_url?: string | null;
}

export interface AdminReelItem {
    id: number;
    title: string;
    is_active: boolean;
    thumbnail_url?: string | null;
    video_url?: string | null;
}

export interface TestimonialItem {
    id: number;
    author_name: string;
    author_role: string;
    quote: string;
    is_active: boolean;
    sort_order: number;
    image_url?: string | null;
    logo_url?: string | null;
}

export interface ReviewItem {
    id: number;
    reviewer_name: string;
    rating: number;
    text: string;
    is_approved: boolean;
    created_at: string;
}

// ─── Booking / Transaction Types ──────────────────────────────────────────────

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";
export type PaymentStatus = "UNPAID" | "PAID" | "EXPIRED" | "FAILED";
export type UserCategory  = "warga_ub" | "umum";

export interface BookingTransaction {
    id: number;
    amount: number;
    payment_status: PaymentStatus;
    receipt_number?: string | null;
    xendit_invoice_id?: string | null;
    checkout_url: string | null;
    paid_at: string | null;
}

export interface RecentTransaction {
    id: number;
    amount: number;
    user_name: string;
    paid_at: string;        // human-readable "5 menit lalu"
    type: string;           // "Booking" | "Membership"
}

export interface RecentActivity {
    id: number;
    type: "booking" | "membership" | "payment";
    title: string;
    subtitle: string;
    time: string;           // human-readable
}

export interface AdminBooking {
    id: number;
    user_id: number | null;
    facility_id: number;
    facility_unit_id: number | null;
    booking_date: string;       // YYYY-MM-DD
    start_time: string;         // HH:MM
    end_time: string;           // HH:MM
    subtotal_price: number;
    status: BookingStatus;
    notes: string | null;
    customer_name: string;
    customer_phone: string | null;
    is_free: boolean;
    user_category: UserCategory;
    facility_name: string;
    facility_unit_name: string | null;
    transaction: BookingTransaction | null;
}

export type MembershipStatus = "active" | "expired" | "cancelled";

export interface MembershipPlanItem {
    id: number;
    name: string;
    description: string | null;
    public_badge?: string | null;
    savings_label?: string | null;
    cta_label?: string | null;
    card_image_url?: string | null;
    price: number;
    duration_months: number;
    features: string[];
    is_active: boolean;
    sort_order: number;
    active_members_count: number;
}

export interface AdminMembership {
    id: number;
    user_id: number | null;
    membership_plan_id: number | null;
    renewed_from_membership_id?: number | null;
    renewed_from_label?: string | null;
    created_by_name?: string | null;
    created_via?: string | null;
    plan_name: string | null;
    customer_name: string;
    customer_phone: string | null;
    start_date: string;          // YYYY-MM-DD
    end_date: string;            // YYYY-MM-DD
    status: MembershipStatus;
    transaction: BookingTransaction | null;
    histories?: Array<{
        id: number;
        action: string;
        plan_name: string;
        start_date: string;
        end_date: string;
        transaction_id: number | null;
        receipt_number: string | null;
        renewed_from_membership_id: number | null;
        renewed_from_label: string | null;
        actor_name: string | null;
        actor_type: string;
        amount: number | null;
        payment_status: string | null;
        created_at: string | null;
    }>;
}
