import { Head, usePage } from "@inertiajs/react";
import type { PageProps as ApplicationPageProps } from "@/types";

export type SeoJsonLd = Record<string, unknown>;

export interface SeoHeadPayload {
    title: string;
    description: string;
    canonical: string;
    robots: string;
    image?: string | null;
    image_alt?: string | null;
    type?: string | null;
    site_name?: string | null;
    locale?: string | null;
    previous?: string | null;
    next?: string | null;
    twitter_card?: string | null;
    twitter_title?: string | null;
    twitter_description?: string | null;
    twitter_image?: string | null;
    twitter_image_alt?: string | null;
    json_ld?: SeoJsonLd | null;
}

export interface SeoHeadProps {
    seo?: SeoHeadPayload | null;
}

type SharedSeoPageProps = ApplicationPageProps & {
    seo?: SeoHeadPayload | null;
    csp_nonce?: string;
};

export function serializeSeoJsonLd(jsonLd: SeoJsonLd | null | undefined) {
    if (!jsonLd) {
        return null;
    }

    try {
        const serialized = JSON.stringify(jsonLd);

        if (!serialized) {
            return null;
        }

        return serialized
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e")
            .replace(/&/g, "\\u0026")
            .replace(/\u2028/g, "\\u2028")
            .replace(/\u2029/g, "\\u2029");
    } catch {
        return null;
    }
}

export function SeoHead({ seo }: SeoHeadProps) {
    const pageProps = usePage<SharedSeoPageProps>().props;
    const sharedSeo = pageProps.seo;
    const resolvedSeo = seo ?? sharedSeo;

    if (!resolvedSeo) {
        return null;
    }

    const ogType = resolvedSeo.type ?? "website";
    const ogSiteName = resolvedSeo.site_name ?? "UB Sport Center";
    const ogLocale = resolvedSeo.locale ?? "id_ID";
    const twitterTitle = resolvedSeo.twitter_title ?? resolvedSeo.title;
    const twitterDescription =
        resolvedSeo.twitter_description ?? resolvedSeo.description;
    const twitterImage = resolvedSeo.twitter_image ?? resolvedSeo.image;
    const twitterImageAlt =
        resolvedSeo.twitter_image_alt ?? resolvedSeo.image_alt;
    const twitterCard =
        resolvedSeo.twitter_card ??
        (twitterImage ? "summary_large_image" : "summary");
    const jsonLd = serializeSeoJsonLd(resolvedSeo.json_ld);

    return (
        <Head>
            <title head-key="seo-title">{resolvedSeo.title}</title>
            <meta
                head-key="seo-description"
                name="description"
                content={resolvedSeo.description}
            />
            <meta
                head-key="seo-robots"
                name="robots"
                content={resolvedSeo.robots}
            />
            <link
                head-key="seo-canonical"
                rel="canonical"
                href={resolvedSeo.canonical}
            />

            {resolvedSeo.previous && (
                <link
                    head-key="seo-prev"
                    rel="prev"
                    href={resolvedSeo.previous}
                />
            )}
            {resolvedSeo.next && (
                <link head-key="seo-next" rel="next" href={resolvedSeo.next} />
            )}

            <meta head-key="seo-og-type" property="og:type" content={ogType} />
            <meta
                head-key="seo-og-site-name"
                property="og:site_name"
                content={ogSiteName}
            />
            <meta
                head-key="seo-og-locale"
                property="og:locale"
                content={ogLocale}
            />
            <meta
                head-key="seo-og-title"
                property="og:title"
                content={resolvedSeo.title}
            />
            <meta
                head-key="seo-og-description"
                property="og:description"
                content={resolvedSeo.description}
            />
            <meta
                head-key="seo-og-url"
                property="og:url"
                content={resolvedSeo.canonical}
            />
            {resolvedSeo.image && (
                <meta
                    head-key="seo-og-image"
                    property="og:image"
                    content={resolvedSeo.image}
                />
            )}
            {resolvedSeo.image_alt && (
                <meta
                    head-key="seo-og-image-alt"
                    property="og:image:alt"
                    content={resolvedSeo.image_alt}
                />
            )}

            <meta
                head-key="seo-twitter-card"
                name="twitter:card"
                content={twitterCard}
            />
            <meta
                head-key="seo-twitter-title"
                name="twitter:title"
                content={twitterTitle}
            />
            <meta
                head-key="seo-twitter-description"
                name="twitter:description"
                content={twitterDescription}
            />
            {twitterImage && (
                <meta
                    head-key="seo-twitter-image"
                    name="twitter:image"
                    content={twitterImage}
                />
            )}
            {twitterImageAlt && (
                <meta
                    head-key="seo-twitter-image-alt"
                    name="twitter:image:alt"
                    content={twitterImageAlt}
                />
            )}

            {jsonLd && (
                <script
                    head-key="seo-json-ld"
                    type="application/ld+json"
                    nonce={pageProps.csp_nonce}
                    dangerouslySetInnerHTML={{ __html: jsonLd }}
                />
            )}
        </Head>
    );
}

export default SeoHead;
