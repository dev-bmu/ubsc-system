# Product Requirements Document: Galeri Fasilitas UB Sport Center

## Document Control

| Field | Value |
| --- | --- |
| Product | Galeri Fasilitas |
| Version | 1.0 |
| Status | Approved for implementation |
| Decision date | 14 July 2026 |
| Primary locale | Indonesian |
| Future locale | English |
| Public domain | https://ubsportcenter.co.id |
| Admin placement | Content > Galeri Fasilitas |
| Technical baseline | Laravel 12, React 18, Inertia 2, Spatie Media Library 11 |

## 1. Executive Summary

Galeri Fasilitas is a standalone media CMS for publishing images and short videos into three permanent visual sections:

1. Arena Indoor
2. Lokasi Eksklusif
3. Arena Outdoor

The gallery replaces the temporary visual media currently used on the public Facility page while preserving the existing page composition:

- Indoor remains a curated grid.
- Exclusive remains a horizontal carousel.
- Outdoor remains a horizontal carousel.
- A separate complete gallery provides progressive browsing, search, filters, and a premium lightbox.

This module is not a Facility catalog. It must not depend on, mutate, merge with, or replace the existing Facility model, Facility detail pages, Facility media collections, booking flows, or branch pages. A gallery item is an independent visual record.

The system must remain fast with hundreds or thousands of items, support professional editorial operations, and make all indexable content available to users and search engines without hidden text, cloaking, or other spam techniques.

## 2. Problem Statement

The current public gallery content is tied to temporary frontend data and external placeholder images. Administrators cannot:

- Upload and publish real gallery media.
- Curate the same media independently across multiple sections.
- Schedule publication.
- Search and manage a growing archive efficiently.
- Publish responsive media derivatives.
- Expose crawlable, server-rendered gallery content.
- Audit editorial changes and permissions.

Loading every image at once is not viable as the collection grows. A direct replacement also risks empty sections, broken layouts, excessive media transfer, slow low-end devices, and loss of search visibility.

## 3. Product Goals

### 3.1 Primary goals

- Give authorized staff a complete image and video publishing workflow.
- Keep one physical source upload even when an item appears in multiple sections.
- Preserve the visual identity and existing public section formats.
- Make the main Facility page curated and the complete archive progressively browsable.
- Deliver responsive media with minimal initial transfer and no unnecessary public JavaScript.
- Provide fast typo-tolerant search and useful filters at scale.
- Make gallery pages crawlable through server-rendered HTML, real links, canonical URLs, and media sitemaps.
- Support Indonesian now and English later without duplicate uploads.
- Provide auditable, permission-controlled operations.

### 3.2 Success measures

- Core Web Vitals at the 75th percentile:
  - LCP no more than 2.5 seconds.
  - INP no more than 200 milliseconds.
  - CLS no more than 0.1.
- WCAG 2.2 AA conformance for public and admin workflows.
- Public search response p95 no more than 400 milliseconds when Meilisearch is healthy.
- Cached gallery page server response p75 no more than 800 milliseconds from the primary Indonesian audience.
- No video payload is downloaded before explicit user intent to open or play it.
- At least 99 percent of valid single-image processing jobs succeed without manual intervention.
- Failed files in a bulk batch do not invalidate successful files.
- Published media is reflected in public queries, cache, search index, and sitemaps within five minutes.
- No existing Facility, booking, branch, news, or admin media behavior regresses.

Search ranking position is not a deterministic deliverable and cannot honestly be guaranteed. The release target is maximum technical eligibility, useful content, strong local and national relevance, and measurable organic growth without violating search engine policies.

## 4. Non-Goals

The first release does not include:

- New user-created gallery categories.
- Albums or galleries linked to a Facility record.
- Facility detail navigation from gallery cards.
- Public comments, likes, ratings, or user uploads.
- Watermarks.
- A public original-file download control.
- A Recycle Bin.
- Automatic AI-written public metadata.
- Hidden SEO text, off-screen keyword blocks, opacity-zero text, content behind images that users cannot access, or crawler-only content.
- Changes to existing Facility uploads, Facility pages, booking, pricing, branches, news, or other destination pages.

## 5. Product Principles

1. One source of truth: MySQL stores editorial state and metadata.
2. One source upload: section placement never duplicates a physical master.
3. Public derivatives only: original files remain private.
4. Progressive by default: only near-viewport media is requested.
5. No empty launch: each public section switches from placeholders atomically.
6. User-visible SEO: structured data must match information users can access.
7. CSS-first presentation: motion and layout use CSS where practical; JavaScript exists only for state, accessibility, search, upload, and media playback.
8. Failure isolation: one failed media job cannot break a batch or public page.
9. Explicit permissions: viewing, editing, publishing, and deleting are separate capabilities.
10. Reversible publication: unpublish is reversible; hard delete is intentionally destructive.

## 6. Scope

### 6.1 Admin scope

- A new Content > Galeri Fasilitas destination.
- Responsive media index.
- Single and bulk upload.
- Image and video processing status.
- Metadata editing in Indonesian and optional English.
- Multi-section assignment.
- Main-section curation.
- Scheduling and publication controls.
- Search, combined filters, saved personal views, and bulk actions.
- Location management.
- CSV metadata import and export.
- Audit history.
- Anonymous gallery analytics.
- In-app and selected email notifications.

### 6.2 Public scope

- Curated gallery content inside the existing Facility page.
- A complete gallery landing page.
- Three permanent category pages.
- Progressive loading in batches of 24.
- Search and filters on complete gallery pages only.
- Shareable, accessible image and video lightbox.
- Responsive images and adaptive video.
- Indonesian metadata, future English metadata, canonical URLs, structured data, and media sitemaps.

### 6.3 Infrastructure scope

- Private object storage with a local-storage fallback adapter.
- CDN for public derivatives.
- Redis queues and cache.
- FFmpeg and ffprobe for video.
- HEIC-capable image processing.
- Laravel Scout and Meilisearch.
- Inertia server-side rendering.
- Queue supervision, scheduler monitoring, backups, and centralized logs.

## 7. Fixed Taxonomy

### 7.1 Sections

Sections are seeded, permanent records. Admin users cannot create or delete them.

| Key | Indonesian label | Public slug | Main quota | Main format |
| --- | --- | --- | --- | --- |
| indoor | Arena Indoor | indoor | 7 | Curated grid |
| exclusive | Lokasi Eksklusif | eksklusif | 6 | Horizontal carousel |
| outdoor | Arena Outdoor | outdoor | 8 | Horizontal carousel |

Each section has an independent public activation flag. Labels are translatable while internal keys remain stable.

### 7.2 Initial locations

- Veteran
- Dieng
- Exclusive

Location is a separate field from section. Therefore section Exclusive and location Exclusive may coexist without sharing database meaning.

Authorized users may create additional locations. A location used by media cannot be deleted; it may be renamed or archived.

### 7.3 Arena type

Arena type is manually entered free text with:

- Case and whitespace normalization.
- Suggestions from existing values.
- Near-duplicate warnings.
- No forced dependency on a Facility record.

## 8. Users and Permissions

### 8.1 Permission keys

- view-facility-gallery
- manage-facility-gallery
- publish-facility-gallery
- delete-facility-gallery

### 8.2 Default role policy

| Capability | Administrator | Manager | Staff Central |
| --- | --- | --- | --- |
| View | Yes | Yes | Yes |
| Create and edit | Yes | Yes | Yes |
| Submit for review | Yes | Yes | Yes |
| Publish and schedule | Yes | Yes | No by default |
| Unpublish | Yes | Yes | No by default |
| Hard delete | Yes | Yes | No by default |
| Manage locations | Yes | Yes | Configurable |
| View analytics and audit | Yes | Yes | Configurable |

These defaults are seeded only. The existing Role & Access page remains the authority and can change every assignment later.

### 8.3 Permission rules

- Backend authorization is mandatory for every action; hiding a button is not authorization.
- Bulk actions require permission for every affected operation.
- A user without publish permission can only move valid content to Ready for Review.
- A publisher may publish their own content; two-person approval is not mandatory.
- Hard delete requires delete permission even if the same user can publish.

## 9. Information Architecture

### 9.1 Admin

Content > Galeri Fasilitas contains:

1. Media
2. Upload
3. Kurasi
4. Lokasi
5. Analitik
6. Audit

The Media view has these status tabs:

- Semua
- Draft
- Diproses
- Perlu Review
- Terjadwal
- Terbit
- Disembunyikan
- Gagal

Desktop uses a dense thumbnail table. Mobile uses compact item cards without removing any action.

### 9.2 Public routes

- /facilities remains the current Facility page.
- /facilities/gallery is the complete gallery.
- /facilities/gallery/indoor is the Indoor collection.
- /facilities/gallery/eksklusif is the Exclusive collection.
- /facilities/gallery/outdoor is the Outdoor collection.
- The future English locale uses /en/... routes and localized slugs determined during i18n implementation.

The lightbox uses a query state such as ?media=UUID. This state is shareable but canonicalizes to the containing gallery or category page; it is not an independent thin SEO page.

## 10. Domain Model

### 10.1 Gallery item

A GalleryItem is one independent image or video and has no facility_id or album_id.

Core fields:

| Field | Requirement |
| --- | --- |
| id | Internal numeric primary key |
| uuid | Stable unique public identifier |
| media_type | image or video |
| status | Editorial and processing state |
| location_id | Required active location |
| captured_at | Optional date of capture |
| publish_at | Optional scheduled publication in Asia/Jakarta |
| published_at | Actual first publication timestamp |
| credit | Defaults to UB Sport Center |
| source_sha256 | Indexed duplicate-detection hash |
| source_mime | MIME detected from file bytes |
| source_bytes | Original byte count |
| source_width and source_height | Validated dimensions |
| duration_ms | Required for video |
| rights_confirmed_at | Required before review |
| rights_confirmed_by | User confirming publication rights |
| created_by and updated_by | Audit ownership |
| lock_version | Optimistic concurrency control |
| processing_error_code | Machine-readable failure reason |
| processing_error_detail | Restricted admin detail |
| timestamps | Created and updated timestamps |

Public visibility is derived, not manually duplicated. An item is public only when:

- Its state is Published.
- Its publication time is not in the future.
- It has at least one section placement.
- The requested section is activated.
- Its required derivatives exist.

### 10.2 Translations

GalleryItemTranslation contains:

- gallery_item_id
- locale
- title
- arena_type
- alt_text
- caption
- search_aliases

There is one unique row per item and locale.

The Indonesian title, arena type, and alt text are required before review. Caption is manual and optional. English fields are optional until English launch. Missing English content temporarily falls back to Indonesian, but English pages must not be released at scale until human-reviewed English metadata is sufficiently complete.

### 10.3 Section placement

GalleryItemSection contains:

- gallery_item_id
- section_key
- featured_position, nullable and unique within a section
- sort_rank
- assigned_by
- timestamps

One item may have multiple placement rows. Each row owns its own position, featured slot, and display number.

Main-card numbering is computed from current section order. It is not permanently written into item metadata.

### 10.4 Locations

GalleryLocation contains:

- id
- stable slug
- display name
- active flag
- timestamps

Archiving prevents new assignment but preserves historical media.

### 10.5 Upload batches

GalleryUploadBatch tracks:

- uuid
- user
- file totals
- completed, failed, and pending counts
- resumable upload state
- common metadata draft
- created, completed, and expiry timestamps

Each file has an independent processing record. Batch success is never all-or-nothing.

### 10.6 Audit records

GalleryAuditLog is append-only and records:

- Actor
- Action
- Item or batch UUID
- Before and after values for editorial fields
- Permission-sensitive action context
- Timestamp
- Request correlation ID

After hard deletion, the audit row retains only non-file operational facts and the final metadata snapshot. It does not provide restoration.

### 10.7 Analytics records

Raw anonymous events are retained for 90 days, then reduced to daily aggregates. No raw IP address or persistent cross-site identifier is stored.

## 11. State Machine

### 11.1 States

- Draft
- Processing
- Ready for Review
- Scheduled
- Published
- Unpublished
- Failed

### 11.2 Allowed transitions

| From | To | Trigger |
| --- | --- | --- |
| Draft | Processing | Source upload completed |
| Processing | Draft | Derivatives completed but metadata remains incomplete |
| Processing | Ready for Review | Derivatives complete and required metadata is valid |
| Processing | Failed | Non-recoverable processing attempt |
| Failed | Processing | Authorized retry |
| Draft | Ready for Review | Metadata and derivatives become valid |
| Ready for Review | Scheduled | Publisher sets a future time |
| Ready for Review | Published | Publisher publishes now |
| Scheduled | Published | Scheduler reaches publish_at |
| Scheduled | Ready for Review | Schedule is cancelled |
| Published | Unpublished | Authorized manual unpublish |
| Unpublished | Ready for Review | Content is prepared for republish |

Any metadata change that invalidates a published item must block saving or require unpublishing first. Replacing the physical source creates new processing derivatives and does not silently expose partially processed output.

### 11.3 Scheduling

- All editorial times are entered and displayed in Asia/Jakarta.
- One schedule applies to every section placement of the item.
- Precision is one minute.
- There is no automatic unpublish end time.
- A monitor flags a schedule as late when it remains unpublished more than two minutes after publish_at.
- Scheduling and publishing are idempotent.

## 12. Admin Requirements

### 12.1 Media index

The index must provide:

- Search by title, UUID, arena type, location, editor, and file name.
- Combined filters for status, section, location, media type, year, editor, and publication range.
- Sort by updated, created, scheduled, published, title, and section position.
- Saved personal filter views.
- Result counts and selected counts.
- Bulk submit, schedule, publish, unpublish, section assignment, export, and delete where authorized.
- A processing status and actionable failure message.
- A clear indication when an item is used in more than one section.

### 12.2 Single upload

The user:

1. Drops or selects one file.
2. Sees local validation immediately.
3. Uploads into private staging.
4. Receives duplicate detection results.
5. Waits asynchronously for processing.
6. Completes metadata and section placement.
7. Confirms publication rights.
8. Saves Draft or submits for review.

### 12.3 Bulk upload

- A batch accepts up to 20 mixed image and video files.
- Per-file progress, pause where technically supported, cancel, and retry are available.
- Common metadata may set location, arena type, sections, credit, capture date, and schedule.
- Title, alt text, poster or focal point, and rights confirmation are reviewed per item.
- No item is published directly from an unreviewed bulk form.
- Successful files remain Draft when another file fails.
- Failed files can be retried without reupload when the staged source is valid.
- Abandoned upload chunks expire after 24 hours.

### 12.4 Draft resilience

- Form changes autosave locally and to the server after a short idle period.
- Upload sessions are resumable after navigation or a temporary disconnection.
- A restored draft clearly shows which data came from local recovery.
- Browser storage never contains the full media file after the upload is complete.

### 12.5 Duplicate handling

The server computes a streaming SHA-256 hash.

When a match exists, the admin sees:

- Existing thumbnail.
- Existing title, status, and sections.
- Reuse existing item.
- Continue as a distinct item.
- Cancel upload.

Duplicates are warnings, not hard validation failures.

### 12.6 Item editor

The editor contains:

- Indonesian metadata.
- Optional English metadata.
- Arena type autocomplete.
- Location selector with permission-gated inline creation.
- Capture date.
- Section assignments.
- Image focal point or video poster controls.
- Caption and credit.
- Search aliases.
- Subtitle file for spoken video.
- Rights confirmation.
- Publication and schedule controls.
- Processing, audit, and section-usage context.

The primary visible action depends on permission and state: Save Draft, Submit for Review, Schedule, or Publish.

The initial alt text suggestion is built deterministically from the title, arena type, and location. It is never accepted as final without explicit admin review.

### 12.7 Curation

Each section has:

- A fixed featured board with 7, 6, or 8 slots.
- Accessible drag-and-drop using the existing dnd-kit dependency.
- Keyboard reorder alternatives.
- Move to position and move to top commands.
- A searchable remainder list ordered newest first.
- A preview at desktop and mobile proportions.
- A section activation control.

Only the featured board requires manual ordering. The remaining complete collection is newest first unless an admin assigns an explicit priority. This hybrid model remains usable beyond 500 items.

If a featured item is unpublished or deleted, the next eligible item fills the public slot. The admin receives a notification and can recurate later.

### 12.8 Section activation

- Current placeholders remain visible until a section has enough eligible items to fill its quota.
- Admin preview must pass validation before activation.
- Activating a section swaps the complete section data source atomically.
- Sections activate independently.
- If an activated section later has zero eligible items, the entire section is hidden publicly and the admin receives a critical warning.

### 12.9 Deletion

Single hard delete:

- Shows thumbnail, title, current placements, and consequences.
- Uses a standard explicit confirmation.

Bulk hard delete:

- Shows the affected count and published count.
- Requires typed confirmation in the form HAPUS N ITEM.

On confirmation:

1. Public visibility is removed immediately in a transaction.
2. Search and cache invalidation is queued.
3. Original, derivatives, poster, subtitle, and CDN objects are purged asynchronously.
4. Audit facts remain.
5. The operation cannot be restored from the application.

Backups are disaster recovery, not a user-facing Recycle Bin.

### 12.10 CSV

- Export includes UUID and editable metadata, not media binaries.
- Import may update existing rows by UUID.
- Import cannot create a public item without a valid source upload.
- Every row is validated independently and returns a downloadable error report.
- Import changes respect optimistic locking, permissions, audit logging, and publication validation.

### 12.11 Concurrent editing

- lock_version is returned with every editable payload.
- A stale update receives a conflict response rather than overwriting newer data.
- The UI displays the newer editor and changed fields.
- Users may reload, compare, and reapply their changes.

### 12.12 Notifications

In-app:

- Item submitted for review.
- Item approved or returned.
- Scheduled item published.
- Processing failed.
- Schedule is late.
- Featured slot was auto-filled.
- Activated section became empty.

Email:

- Batch processing failure.
- Repeated scheduler or queue failure.
- Critical storage or derivative failure.

## 13. Image Pipeline

### 13.1 Accepted inputs

- JPEG and JPG
- PNG
- WebP
- HEIC and HEIF

SVG, animated GIF, executable formats, and files whose extension conflicts with detected bytes are rejected.

### 13.2 Input limits

- Maximum source size: 20 MB.
- Maximum decoded resolution: 24 megapixels.
- Minimum longest edge: 1600 pixels.
- Portrait, landscape, and square are accepted.

### 13.3 Processing sequence

1. Upload into a private staging namespace.
2. Detect MIME from file bytes.
3. Validate decoded dimensions and decompression limits.
4. Scan for malware where the deployment supports ClamAV.
5. Compute SHA-256.
6. Correct orientation.
7. Convert color profile to sRGB.
8. Remove EXIF, GPS, device, and other private metadata from public outputs.
9. Preserve only required internal technical metadata.
10. Generate responsive derivatives.
11. Verify every derivative can be decoded.
12. Mark the source ready or failed.

### 13.4 Derivatives

Target widths are 320, 480, 768, 1024, 1440, and 1920 pixels, without upscaling.

The browser receives:

- AVIF where supported.
- WebP where supported.
- JPEG or PNG fallback according to transparency.
- Width and height attributes.
- srcset and sizes matched to the actual layout.
- A very small neutral placeholder that does not trigger layout shift.

Card crops are generated from the focal point. The lightbox preserves the source aspect ratio.

Originals remain private. Public file names use a stable descriptive slug plus a content hash. CDN cache headers are immutable for versioned derivatives.

## 14. Video Pipeline

### 14.1 Accepted inputs

- MP4
- MOV
- HEVC and H.265 sources from supported iPhone uploads

### 14.2 Input limits

- Maximum source size: 250 MB.
- Maximum duration: 90 seconds.
- Maximum input resolution: 4K.
- The system never upscales video.

### 14.3 Processing sequence

1. Upload directly to private object storage through a resumable multipart session when available.
2. Inspect with ffprobe.
3. Validate duration, dimensions, codecs, container, streams, and rotation.
4. Scan and hash the source.
5. Transcode asynchronously with FFmpeg.
6. Generate 480p, 720p, and 1080p renditions where the source supports them.
7. Produce adaptive HLS output plus a broadly compatible H.264 and AAC MP4 fallback.
8. Generate poster candidates and a default poster.
9. Verify output manifests and sample decode.
10. Make derivatives eligible for publication.

The HLS playback controller must be dynamically loaded only when a user opens a video on a browser without native HLS support. It must not enter the initial public bundle.

### 14.4 Playback behavior

- Grid and carousel cards never autoplay.
- A card uses a responsive poster and a familiar play icon.
- The video file is not prefetched.
- Opening the lightbox still does not play automatically.
- Playback starts only after explicit user action.
- Audio is preserved.
- Closing or navigating away pauses playback and releases unnecessary buffers.
- One video at most may occupy the featured quota of each main section.
- The complete gallery has no total video count limit.

### 14.5 Posters and subtitles

- The default poster is selected automatically.
- Admin may choose another timestamp or upload a poster.
- Poster focal point is editable.
- A WebVTT subtitle is required when spoken audio carries information not available in visible metadata.

## 15. Public Facility Page

### 15.1 Data behavior

- The existing Facility page layout and its unrelated sections remain unchanged.
- Activated gallery sections request only their curated quota.
- One item may appear in multiple sections without duplicate source downloads when the derivative URL and required size match.
- Search and filter controls do not appear on the Facility page.
- Each card displays title, arena type, location, and computed section number according to its established design.
- Clicking a card opens the lightbox; it never opens a Facility detail page.

### 15.2 Existing formats

- Arena Indoor: curated grid.
- Lokasi Eksklusif: horizontal carousel.
- Arena Outdoor: horizontal carousel.

Carousel progress, count, and item name must derive from the same zero-based active index and total. At the last item, every indicator must visibly show completion rather than a half-progress ambiguity.

### 15.3 Empty and degraded states

- A public section with no eligible items is omitted, not replaced with an empty message.
- A failed image derivative uses a controlled local fallback and logs an error.
- A search outage cannot remove curated Facility page media because curated reads come from MySQL and cache, not Meilisearch.

## 16. Complete Public Gallery

### 16.1 Grid

- 24 records per canonical page.
- Four columns on wide desktop.
- Three columns on tablet.
- Two columns on mobile.
- Stable card aspect ratios and reserved dimensions prevent layout shifts.
- CSS Grid is used instead of masonry.
- Original aspect ratio appears in the lightbox.
- The root complete gallery returns each UUID once even when it belongs to multiple sections.
- Category pages may show the same UUID because each category is a valid independent placement.
- In a category context, the visible number is its section order.
- In the root gallery or search context, the visible number is the ordinal position in the active result order and is not stored as item metadata.

### 16.2 Progressive loading

The visible control reads Tampilkan 24 berikutnya and includes a count such as 24 dari 368.

It must be a real anchor to the next URL, such as ?page=2. JavaScript progressively enhances the link by appending results without a full reload. Without JavaScript, normal pagination still works.

Requirements:

- Every page has a unique URL.
- Every paginated page self-canonicalizes.
- Sequential next-page anchors are server rendered.
- Appended navigation updates browser history.
- Back navigation restores results, filters, and scroll position.
- The system stops cleanly at the final record.

### 16.3 Search and filters

Search exists only on complete gallery pages.

Search capabilities:

- Typo tolerance.
- Prefix matching.
- Indonesian query normalization.
- Search aliases.
- Synonyms for common sports and venue terms.
- Weighted relevance.
- Facet counts.
- Suggestions.
- Recent searches stored locally on the device.
- Keyboard navigation.
- Clear zero-result recovery suggestions.
- Shareable query state.

Filters:

- Section.
- Arena type.
- Location.
- Media type.
- Capture year, falling back to publication year.

Sort:

- Curated.
- Newest.
- Oldest.
- Alphabetical.

Curated is the default. Featured positions rank first, explicit priority follows, and the unranked remainder is newest first.

### 16.4 Search index

MySQL is the source of truth. Laravel Scout synchronizes only publicly eligible records to Meilisearch.

Suggested relevance order:

1. Indonesian or active-locale title.
2. Search aliases.
3. Arena type.
4. Location.
5. Caption.

Search index operations are queued and idempotent. If Meilisearch is unavailable, the UI enters a visible degraded mode with a limited MySQL title, type, and location search rather than failing the entire gallery.

## 17. Lightbox

### 17.1 Desktop

- Full-stage media presentation.
- Compact metadata panel.
- Previous and next controls.
- Counter and media name.
- Optional filmstrip.
- Fullscreen.
- Share.
- Info panel closed by default but always user-accessible.

### 17.2 Mobile

- Edge-to-edge media respecting safe areas.
- Swipe navigation.
- Pinch zoom for images.
- Double tap zoom.
- Bottom-sheet metadata.
- Large touch targets.
- No controls hidden behind browser chrome.

### 17.3 Accessibility and state

- Dialog semantics and an accessible name.
- Focus trap.
- Escape closes.
- Arrow keys navigate.
- Focus returns to the triggering card.
- Screen reader announces the current item and total.
- Browser URL updates to ?media=UUID.
- Direct URLs load the requested item plus neighboring records in current filter order.
- Previous and next stop at collection boundaries while progressively fetching the next batch when needed.
- Reduced-motion mode removes nonessential transitions.

There is no public download button and no original URL is exposed. The product does not claim that screenshots or browser-level saving can be completely prevented.

## 18. API and Server Contracts

Exact route names may follow repository conventions, but the behavior must include:

### 18.1 Admin contracts

- List and filter media.
- Create resumable upload session.
- Complete or cancel upload.
- Read and update item with lock_version.
- Submit for review.
- Schedule, publish, and unpublish.
- Retry processing.
- Bulk actions with idempotency key.
- Read and update per-section curation.
- Activate section.
- Manage locations.
- Export and validate/import CSV.
- Read analytics and audit data.

### 18.2 Public contracts

- Server-render gallery and category pages.
- Return paginated collection data.
- Execute search and facets.
- Fetch one lightbox item and its current-order neighbors.
- Receive anonymous analytics events.

### 18.3 Contract rules

- Public endpoints return only published fields and public derivatives.
- UUIDs are used in public contracts; internal numeric IDs are not exposed.
- Pagination metadata includes current page, total pages, total records, and next URL.
- Validation failures use stable field-level error codes.
- Bulk operations return per-item results.
- Mutating retryable requests accept idempotency keys.
- Rate limits distinguish admin upload, public search, lightbox fetch, and analytics.

## 19. Caching and Invalidation

- Public curated queries are cached by section and locale.
- Complete gallery pages are cached by locale, category, and page.
- Search result caching is short-lived and excludes sensitive or unbounded keys.
- Media uses immutable content-hashed URLs.
- HTML and JSON use ETag or Last-Modified where applicable.
- Publish, unpublish, update, placement change, and delete dispatch one coordinated invalidation event.
- That event updates MySQL projections, clears application cache, synchronizes search, refreshes sitemaps, purges changed CDN references, and sends IndexNow for affected canonical pages.
- Cache invalidation jobs are idempotent and safe to replay.

## 20. SEO Requirements

### 20.1 Rendering and crawlability

- Public gallery content must exist in the initial HTML through Inertia SSR.
- The initial HTML contains the H1, first 24 cards, semantic links, image elements, dimensions, alt text, and pagination anchors.
- JavaScript enhances the page but is not required to discover content.
- Correct HTTP status codes are returned for success, redirect, not found, and server failure.
- The html lang attribute is id for Indonesian pages.

### 20.2 Canonical host and URLs

- https://ubsportcenter.co.id is the canonical host.
- HTTP redirects permanently to HTTPS.
- www redirects permanently to the non-www host.
- Every indexable page emits one server-rendered canonical link.
- Query URLs for search, filters, sort, and lightbox use noindex where appropriate and canonicalize to the stable category or gallery page.
- Paginated category pages use their own canonical URL.

### 20.3 On-page metadata

- Each stable landing page has a unique, descriptive title and meta description.
- The H1 is visible, natural, and aligned with the actual collection.
- Cards visibly expose title, type, location, and number.
- Captions and credit remain available through the user-openable lightbox info panel.
- Alt text is proposed from title, type, and location but must be reviewed by an admin.
- Descriptive source-derived file names are normalized before public derivative naming.

No text may be rendered solely for crawlers. No keywords may be hidden behind images or made visually inaccessible. Accordions, dialogs, and lightbox panels are acceptable only because users can open and read the same content.

### 20.4 Structured data

Server-rendered JSON-LD may include:

- CollectionPage.
- BreadcrumbList.
- ImageObject for images.
- VideoObject for videos.
- Organization and relevant LocalBusiness data at the site level.

Structured values must match user-accessible facts. VideoObject includes a valid thumbnail, upload date, duration, description, and content or embed URL only when those resources are crawlable as intended.

### 20.5 Sitemaps and discovery

Provide:

- /sitemap.xml as a sitemap index.
- Public page sitemap.
- Image sitemap.
- Video sitemap.

Only published canonical URLs and eligible media are included. lastmod reflects meaningful content changes. Publishing, updating, unpublishing, and deleting trigger sitemap refresh.

IndexNow notifies participating engines about changed canonical pages. Google discovery relies on crawlable links, sitemaps, and Search Console rather than IndexNow.

### 20.6 International SEO

When English launches:

- Indonesian and English have independent URLs.
- hreflang links are bidirectional.
- id-ID, en, and x-default are emitted where valid.
- Canonical URLs remain within the same locale.
- Machine-only untranslated pages are not mass-indexed.
- The same media source can serve localized title, alt, and caption metadata.

### 20.7 Search engine operations

Launch operations require:

- Google Search Console property ownership.
- Bing Webmaster Tools ownership.
- Sitemap submission and monitoring.
- Rich Results Test and URL Inspection validation.
- Image and video indexing reports where available.
- Regular crawl, canonical, duplicate-host, and 404 audits.

## 21. Performance Requirements

### 21.1 Public budgets

- Incremental gallery JavaScript in the initial page: no more than 45 KB gzip, excluding the existing application shell.
- Lightbox, filter panel, and video controller are separate lazy chunks.
- Incremental gallery CSS: no more than 15 KB gzip.
- Initial mobile gallery image transfer at 390 CSS pixels: no more than 1.5 MB for the first 24 cards.
- Initial desktop gallery image transfer: no more than 2.5 MB for the first 24 cards.
- Video transfer before play: zero bytes beyond the poster.
- No third-party gallery script blocks rendering.

### 21.2 Runtime rules

- Reserve dimensions before media loads.
- Use native lazy loading plus near-viewport prefetch where measured useful.
- Preload only the single likely LCP image.
- Avoid large animated filters, persistent blur, and continuous decorative loops.
- Animate transform and opacity only for routine interactions.
- Apply will-change only during active transitions.
- Respect prefers-reduced-motion.
- Use content-visibility only where it does not harm accessibility or search rendering.
- Virtualize long admin lists, not the server-rendered public first page.

### 21.3 Reference devices

Visual and functional verification includes:

- 1920 x 960 desktop at 100 percent browser scale.
- 1366 x 768 desktop.
- 1024 pixel tablet landscape.
- 768 pixel tablet.
- 430, 390, 375, and 320 pixel mobile widths.
- Slow 4G and throttled low-end CPU profiles.
- Touch, mouse, and keyboard input.

## 22. Accessibility Requirements

- WCAG 2.2 AA.
- Semantic figure, image, video, button, link, and dialog elements.
- Meaningful alt text; decorative images use empty alt.
- Captions for meaningful speech.
- Full keyboard operation for upload, table, curation, filters, carousel, and lightbox.
- Visible focus styles.
- Touch targets at least 44 by 44 CSS pixels where feasible.
- Text and control contrast meet AA.
- Status is never communicated through color alone.
- Upload progress and failures are announced through polite live regions.
- Drag-and-drop has keyboard alternatives.
- Zoom does not trap the user.
- Motion reduction is complete, not merely slower.

## 23. Security and Privacy

- All admin endpoints require authentication, CSRF protection, and backend permission checks.
- File validation uses detected bytes, not file extension alone.
- Decode limits protect against image decompression bombs.
- SVG and executable uploads are rejected.
- Originals and upload chunks are private.
- Admin previews use short-lived signed URLs.
- Public CDN paths expose derivatives only.
- EXIF and GPS are stripped from public files.
- Rights confirmation is mandatory before review.
- Metadata is escaped and sanitized before HTML or JSON-LD output.
- Content Security Policy is updated for storage, CDN, and video sources.
- Upload, search, analytics, and signed URL endpoints are rate limited.
- Audit events use correlation IDs and cannot be edited through the application.
- No raw IP or persistent cross-site identifier is stored in gallery analytics.

## 24. Analytics

### 24.1 Events

- gallery_card_impression
- gallery_lightbox_open
- gallery_lightbox_next
- gallery_lightbox_previous
- gallery_media_play
- gallery_media_complete
- gallery_share
- gallery_search
- gallery_zero_result
- gallery_filter_change
- gallery_load_more

### 24.2 Collection rules

- Events do not block navigation or rendering.
- Impression uses IntersectionObserver and is deduplicated within an ephemeral session.
- sendBeacon is preferred for final navigation events.
- Bots and obvious automated traffic are filtered.
- Detailed events expire after 90 days.
- Daily aggregates remain for trend analysis.

### 24.3 Admin reporting

- Published item count.
- Section and media-type distribution.
- Most opened media.
- Search terms.
- Zero-result terms.
- Filter usage.
- Lightbox navigation depth.
- Video starts and completions.
- Processing success and failure rates.

Analytics is operational and editorial guidance, not a ranking manipulation mechanism.

## 25. Reliability and Operations

### 25.1 Queues

Separate queues:

- media-video
- media-image
- media-maintenance
- search-sync
- notifications
- analytics

Video cannot starve image processing or publication jobs.

### 25.2 Job behavior

- Jobs are idempotent.
- Retries use bounded exponential backoff.
- Permanent failures enter failed job storage with an admin-facing reason.
- Publication uses a database lock to prevent duplicate execution.
- Search and cache failures do not roll back an already valid publication; they raise a repair job and alert.

### 25.3 Backups

- Database backup daily.
- Private original media backup daily or storage-versioned equivalent.
- Minimum retention: 30 days.
- Restore procedures are documented and tested before production launch.
- Public derivatives may be regenerated and need not be the primary backup target.

### 25.4 Monitoring

Monitor:

- Queue depth and oldest job age.
- Failed job rate.
- Scheduler heartbeat.
- SSR process health.
- Meilisearch health and index lag.
- Object storage and CDN errors.
- Media processing duration.
- Public 4xx and 5xx rates.
- Core Web Vitals through real-user monitoring.

## 26. Infrastructure Prerequisites

The deployment owner must provide or approve:

- PHP 8.2 or compatible project runtime.
- Redis.
- Persistent queue workers managed by Supervisor or systemd.
- Laravel scheduler running every minute.
- FFmpeg and ffprobe.
- Imagick or libvips compiled with HEIC and HEIF support.
- Private S3-compatible object storage and credentials.
- CDN mapped to public derivatives.
- Meilisearch and protected credentials.
- Node process capability for Inertia SSR.
- TLS and permanent www-to-non-www redirect control.
- Backup destination and restore access.
- Search Console and Bing Webmaster Tools ownership.

If object storage is not ready at implementation start, the filesystem adapter may use private local storage. Production launch with expected long-term video growth should not rely on a single unreplicated VPS disk.

## 27. Failure and Recovery Behavior

| Failure | Required behavior |
| --- | --- |
| One bulk file fails | Keep successful files; show retry on failed file |
| HEIC decoder unavailable | Reject before publication and show infrastructure-specific error |
| FFmpeg fails | Keep source private, mark Failed, allow retry |
| Search unavailable | Offer limited database search; curated pages continue |
| CDN derivative missing | Use controlled fallback, log, queue regeneration |
| Scheduler late | Publish on recovery, mark late, notify |
| Concurrent update | Return conflict; never overwrite silently |
| Item removed during lightbox session | Close or move safely and show a brief unavailable state |
| Section has no public media | Hide section and warn admin |
| Analytics unavailable | Drop or buffer bounded events; never block gallery |
| SSR unavailable | Health check fails deployment; client-only HTML is not accepted as normal production mode |

## 28. Rollout and Migration

### Phase 0: Infrastructure discovery

- Confirm VPS topology and deployment owner.
- Verify Redis, FFmpeg, HEIC support, Node SSR, storage, CDN, and Meilisearch.
- Confirm backup and domain redirect control.

### Phase 1: Domain foundation

- Add gallery tables, models, policies, permissions, state machine, audit, and seed data.
- Keep existing Facility schema and media collections untouched.

### Phase 2: Upload and processing

- Deliver image upload, derivatives, duplicate warning, metadata, batch handling, and queue monitoring.
- Add video processing after the image pipeline is stable.

### Phase 3: Admin editorial workflow

- Deliver index, filters, saved views, editor, review, scheduling, curation, locations, CSV, notifications, and conflicts.

### Phase 4: Public integration

- Add curated data adapters behind per-section feature flags.
- Preserve placeholders until each quota is ready.
- Validate section screenshots at reference viewports.

### Phase 5: Complete gallery and search

- Deliver stable grid, pagination enhancement, filters, Meilisearch, lightbox, and degraded search.

### Phase 6: SEO and observability

- Enable SSR, canonical host redirects, metadata, sitemaps, structured data, hreflang foundation, IndexNow, analytics, and RUM.

### Phase 7: Controlled activation

- Upload and review production media.
- Activate Indoor, Exclusive, and Outdoor independently.
- Monitor errors, search index, Core Web Vitals, and crawl behavior.
- Remove obsolete placeholder references only after rollback confidence.

## 29. Testing Strategy

### 29.1 Unit tests

- State transitions.
- Public visibility derivation.
- Per-section numbering and auto-fill.
- Permission decisions.
- Schedule timing in Asia/Jakarta.
- Search document mapping.
- Focal-point crop calculations.
- Duplicate hash decisions.
- CSV row validation.

### 29.2 Feature and integration tests

- Image and video upload validation.
- Partial bulk failure.
- Processing retry.
- Multi-section placement.
- Draft, review, schedule, publish, unpublish, and delete.
- Role & Access changes take effect.
- Search sync and degraded fallback.
- Cache invalidation.
- Signed URL expiry.
- Sitemap inclusion and removal.
- SSR HTML contents.
- Optimistic locking conflict.

### 29.3 End-to-end tests

- Administrator uploads and publishes one image.
- Staff submits a batch but cannot publish.
- Manager schedules an item.
- Public user searches, filters, loads more, opens a deep-linked lightbox, navigates, and returns without losing position.
- Keyboard-only user operates gallery and lightbox.
- Mobile user swipes and zooms without page-scroll conflict.
- Video remains unloaded until explicit play.

### 29.4 Visual tests

Screenshot baselines:

- 1920 x 960 at 100 percent scale.
- 1366 x 768.
- 1024 and 768 tablet widths.
- 430, 390, 375, and 320 mobile widths.

Validate:

- No text or control overflow.
- No unexpected line breaks.
- No card resizing during load.
- No carousel progress ambiguity.
- No lightbox control overlap.
- Correct safe-area behavior.

### 29.5 Performance tests

- Lighthouse and browser traces under throttling.
- Real-user Core Web Vitals.
- Search load test at expected data size and ten-times growth.
- Queue throughput for 20 mixed files.
- Video transcode saturation and queue isolation.
- CDN cache-hit verification.

### 29.6 Security tests

- MIME spoofing.
- Oversized and malformed files.
- Decompression bombs.
- Unauthorized publish and delete.
- CSRF and rate limits.
- Signed URL reuse after expiry.
- Metadata injection into HTML and JSON-LD.
- CSV formula injection.

## 30. Acceptance Criteria

The product is accepted only when all criteria pass:

1. Existing Facility records and media remain unchanged.
2. One item can appear in multiple sections with one master upload.
3. Main quotas are exactly 7 Indoor, 6 Exclusive, and 8 Outdoor.
4. A maximum of one featured video appears per main section.
5. Current placeholders remain until an authorized atomic activation.
6. Admin can upload 20 mixed files and retry individual failures.
7. JPG, PNG, WebP, HEIC, MP4, MOV, and supported HEVC inputs follow agreed limits.
8. Public originals are inaccessible.
9. Image derivatives are responsive and video is not fetched before play.
10. Draft, review, schedule, publish, unpublish, and failure states behave according to the state machine.
11. Permissions are enforced by the backend and configurable in Role & Access.
12. Scheduled publication operates in Asia/Jakarta and late schedules alert admins.
13. Hard delete removes visibility immediately and purges all media asynchronously.
14. Complete gallery serves 24 items per page with real crawlable next links.
15. Search supports typo tolerance, filters, counts, sorting, and zero-result recovery.
16. Search failure does not break curated sections.
17. Lightbox works with mouse, touch, keyboard, direct URL, focus return, and reduced motion.
18. Initial HTML contains indexable gallery content and correct status codes.
19. Canonicals, sitemaps, JSON-LD, visible metadata, and hreflang foundation validate.
20. No hidden SEO text or crawler-only content exists.
21. WCAG 2.2 AA checks pass.
22. Core Web Vitals and transfer budgets meet the stated release targets.
23. Audit logs, conflict handling, analytics retention, backups, and monitoring are operational.
24. Desktop visuals are verified at 1920 x 960 and mobile visuals at all listed widths.

## 31. Release Gates

### Product gate

- Required production media and metadata are approved.
- Every section has its complete quota.
- Rights confirmations are present.

### Engineering gate

- Automated tests pass.
- No unresolved severity-one or severity-two defect.
- Queue, scheduler, SSR, search, storage, and CDN health checks pass.

### Performance gate

- Transfer budgets pass.
- No video preload.
- Lab and initial field measurements meet or are demonstrably on track for Core Web Vitals.

### Accessibility gate

- Automated scan has no critical issue.
- Manual keyboard, screen reader, touch, zoom, and reduced-motion checks pass.

### SEO gate

- Canonical host is singular.
- SSR HTML, robots directives, sitemaps, pagination links, structured data, and status codes validate.
- Search Console and Bing ownership handoff is documented.

### Operations gate

- Backups and restore test pass.
- Alerts reach an accountable owner.
- Rollback and section deactivation are tested.

## 32. External Dependencies and Owners

All product decisions are resolved. These are deployment dependencies, not unresolved product behavior:

| Dependency | Required owner |
| --- | --- |
| VPS access and service installation | Infrastructure holder |
| Object storage and CDN credentials | Infrastructure holder |
| Redis, Meilisearch, FFmpeg, SSR supervision | Infrastructure holder and developer |
| DNS and canonical host redirect | Domain or infrastructure holder |
| Google Search Console | Marketing or domain owner |
| Bing Webmaster Tools | Marketing or domain owner |
| Google Business Profile | Business profile owner |
| Production media rights | Content owner |
| English translations | Content or localization owner |

## 33. Source References

- Google pagination and incremental loading:
  https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading
- Google image SEO:
  https://developers.google.com/search/docs/appearance/google-images
- Google JavaScript SEO:
  https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google image sitemaps:
  https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps
- Google video structured data:
  https://developers.google.com/search/docs/appearance/structured-data/video
- Google structured data guidelines:
  https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Google spam policies:
  https://developers.google.com/search/docs/essentials/spam-policies
- Google localized versions and hreflang:
  https://developers.google.com/search/docs/specialty/international/localized-versions
- Core Web Vitals:
  https://web.dev/articles/vitals
- IndexNow:
  https://www.indexnow.org/documentation
- Laravel Scout:
  https://laravel.com/docs/12.x/scout
- Laravel queues:
  https://laravel.com/docs/12.x/queues
- Spatie Media Library responsive images:
  https://spatie.be/docs/laravel-medialibrary/v11/responsive-images/getting-started-with-responsive-images
- Meilisearch typo tolerance:
  https://www.meilisearch.com/docs/capabilities/full_text_search/relevancy/typo_tolerance_settings

## 34. Final Decision Record

- Three sections are permanent.
- Gallery records are independent from Facility records.
- Image and video are supported in version one.
- Main page remains curated; the complete archive is progressive.
- Lightbox is the only card destination.
- Indonesian is mandatory; English is prepared through translations.
- Publishing is scheduled but has no automatic expiry.
- Hard delete exists without a Recycle Bin.
- Anonymous operational analytics are permitted.
- Search uses Scout and Meilisearch with a database fallback.
- SEO is user-visible, server-rendered, policy-compliant, and measurable.
- No further product ambiguity remains before technical implementation planning.
