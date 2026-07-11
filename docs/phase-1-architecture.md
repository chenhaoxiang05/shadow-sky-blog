# Shadow Sky Blog — Phase 1 architecture

## Scope

Phase 1 is a responsive, interactive product prototype plus portable production architecture. It intentionally uses fixture content and does not claim to provide real authentication, persistence, uploads, or authorization enforcement yet.

## Target architecture

- Web: Next.js-style React application in TypeScript. Server Components render read paths; Server Actions or route handlers own mutations.
- Domain: framework-independent services for users, invitations, posts, reviews, comments, bookmarks, media, and audit events.
- Data: PostgreSQL schema through Drizzle. Production target is Azure Database for PostgreSQL Flexible Server; local development uses a normal PostgreSQL container.
- Files: a `StorageAdapter` interface. Production uses Azure Blob Storage; local development can use Azurite or filesystem storage.
- Runtime: OCI container with no local durable state. Production target is Azure Container Apps. Sites is only the current preview host.
- Secrets: environment variables locally; Azure Key Vault and managed identity in Azure. No credentials are committed.
- Search: PostgreSQL full-text search first. Azure AI Search can be introduced behind a `SearchAdapter` only after scale or relevance requirements justify it.

## Product routes

| Surface | Planned route | Access |
|---|---|---|
| Home | `/` | Visitor |
| Article list/search | `/articles` | Visitor, filtered by visibility |
| Article detail | `/articles/[slug]` | Policy-dependent |
| Login/logout | `/login`, `POST /logout` | Visitor/member |
| Invite acceptance | `/invite/[token]` | Token holder |
| Profile | `/members/[handle]` | Visitor for public profile |
| My posts/bookmarks | `/studio/posts`, `/bookmarks` | Member+ |
| Review queue | `/admin/reviews` | Editor+ |
| Users/comments/settings | `/admin/users`, `/admin/comments`, `/admin/settings` | Admin+; settings Owner only |

The Phase 1 preview combines these surfaces into one client-side prototype so reviewers can inspect the complete information architecture without a temporary backend.

## Server authorization

Every request resolves an `Actor` from the server session, loads the resource, evaluates a domain policy, and only then reads or mutates data. Client controls are convenience only. The initial policy implementation lives in `lib/authorization.ts`.

Role order: Visitor < Member < Contributor < Author < Editor < Admin < Owner.

- Contributor: create drafts and submit owned posts for review.
- Author: Contributor abilities plus publish owned posts.
- Editor: review, publish, hide, and feature posts.
- Admin: Editor abilities plus manage users and comments.
- Owner: Admin abilities plus roles, security, domains, and site settings.
- Private posts: author and Admin+ only. Members-only posts: authenticated enabled users only. Hidden posts: author and Admin+ only.

Role changes, moderation, review, publish, hide, password/session revocation, invitations, and settings changes create immutable audit events.

## Data model

The PostgreSQL design is defined in `db/schema.ts`. Core relations are:

`users → sessions / invitations / posts / comments / bookmarks / post_likes / media_assets / audit_logs`

`posts → categories / post_tags → tags / comments`

Counters on `posts` are cached aggregates. Likes and bookmarks keep source-of-truth join rows. HTML is stored only after server-side Markdown/structured-content sanitization; source content remains available for editing.

## Security baseline for Phase 2+

- Passwords: Argon2id with per-password salt and server-side pepper; check breached/common passwords; minimum 12 characters; no arbitrary composition rules.
- Sessions: opaque 256-bit tokens; store only token hashes; `HttpOnly`, `Secure`, `SameSite=Lax` cookie; rotation on login/password/role change; inactivity and absolute expiry; per-device revocation.
- CSRF: same-site cookie plus synchronizer token on mutations; strict origin/host validation. Never use GET for state changes.
- XSS: sanitize rendered article HTML with an allowlist; React escaping by default; CSP with nonces; block unsafe URLs and inline event handlers.
- Uploads: authenticated, short-lived server-approved upload; allowlisted MIME + magic-byte validation; size/dimension limits; randomized object keys; malware scanning/quarantine before publish; never trust filename or client MIME.
- Login abuse: rate limits by account and privacy-preserving IP hash, exponential delay, generic errors, audit/alerting, optional MFA for Owner/Admin.
- Database: parameterized queries, least-privileged application role, encrypted connections, private networking in production, tested backups and point-in-time recovery.
- Audit: append-only structured logs with request ID, actor, action, target, outcome, and minimal metadata; never log passwords, tokens, or article private contents.

## Portability boundary

Platform-specific implementations live behind `StorageAdapter`, `MailAdapter`, `SearchAdapter`, `RateLimiter`, and `AuditSink`. No domain service imports Sites APIs. `.openai/hosting.json` therefore contains no durable D1/R2 bindings in Phase 1. Azure migration swaps infrastructure adapters and environment values, not domain logic or the PostgreSQL schema.

## Environment and domains

- local: `http://localhost:3000`
- test: `https://preview.shadowskypan.asia`
- production: `https://blog.shadowskypan.asia`

Each environment has separate database, blob container, secrets, session-cookie namespace, and deployment identity. Production data must never be reused in preview.

## Phase 1 review gate

Before Phase 2, confirm: visual direction; Chinese/English content balance; whether Author may self-publish; whether Members-only pages should be indexed internally; MFA requirement for privileged roles; retention period for audit logs and deleted content.
