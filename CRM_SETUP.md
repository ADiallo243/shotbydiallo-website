# ShotByDiallo Studio CRM

## Launch build

- Focused public positioning: music videos and business video production
- Four-step project request form
- Authenticated CRM overview, leads, projects, clients, tasks and website media views
- Website requests saved to Supabase and shown in the CRM lead inbox
- Email notification through Resend for every successfully saved request
- Supabase database schema with owner-scoped row-level security
- Website media uploads with placement tracking and automatic public-site replacement

Prototype-only finance, contract, marketing and automation screens are not part
of the launch navigation. They should only be enabled after their database and
provider integrations are complete.

## Production connection

1. Run `supabase/schema.sql`, then `supabase/phase2_media.sql` in Supabase.
2. Create the owner profile linked to the Supabase Auth user.
3. Configure these Vercel variables for Production:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`,
   `SHOTBYDIALLO_OWNER_ID`, `RESEND_API_KEY`, `NOTIFICATION_EMAIL`, `EMAIL_FROM`.
4. Keep the Supabase service-role key and Resend key server-only. Never add
   either key to public JavaScript or Git.
   `SUPABASE_URL` must be the base Project URL (for example,
   `https://your-project.supabase.co`), not the REST endpoint ending in
   `/rest/v1`.
5. Sign in at `/admin` with the Supabase Auth email and password.
6. In Supabase **Authentication → URL Configuration**, set the Site URL to
   `https://www.shotbydiallo.com` and add
   `https://www.shotbydiallo.com/admin` as a Redirect URL. This enables the
   CRM password-recovery email to return safely to the live website.

## Live workflow

1. A visitor completes the four-step form.
2. `/api/leads` validates and saves the request in Supabase.
3. Resend emails the configured notification address.
4. The owner signs in to `/admin` and sees the request under Leads.
5. Media uploaded under Website media is stored in the public `site-media`
   bucket. A selected placement replaces the matching public image or video;
   static optimized assets remain as the fallback.

## Financial workflow without online payments

Create the project value when a project is booked. Record each deposit or
payment manually when money arrives by e-transfer, cash, cheque or bank
transfer. The dashboard calculates paid, outstanding and projected amounts from
those entries. Connecting Stripe later can automate the same records, but it is
not required.

## Contracts and receipts

The contract builder starts from the ShotByDiallo French service agreement and
fills the client, project, price, deposit, delivery delay, revisions, scope,
deliverables and notes. Preview the agreement, then use the browser print dialog
to save a PDF. The production version should store every revision and signature
in Supabase. Have the final standard terms reviewed by a qualified Quebec legal
professional before relying on them for every type of production.

## Recommended access

- Owner: full CRM and settings access
- Manager: clients, leads, projects, tasks and marketing
- Contractor: assigned projects and tasks only

The `/admin` page is protected by Supabase password authentication and
owner-scoped row-level security.
