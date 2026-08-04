# ShotByDiallo Studio CRM

## Current local build

- Focused public positioning: music videos and business video production
- Four-step project request form
- CRM overview, leads, projects, clients, tasks and marketing views
- Interactive lead creation and filtering using local browser storage
- Supabase database schema with owner-scoped row-level security
- Website media library with placement tracking
- Client preview, delivery, completion and review message templates
- Contact lists, newsletter consent and referral tracking
- Manual invoices, deposits and payment records
- French contract builder, printable contract previews and accounting receipts

The local CRM interface is a working prototype. Its sample data and newly added
leads remain in the browser until Supabase is connected.

## Production connection

1. Create a dedicated Supabase project for ShotByDiallo.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Add the project URL and publishable key to the website environment.
4. Replace the current Formspree submission with a secure server endpoint that
   creates a lead and sends the client confirmation email.
5. Add Supabase authentication to `/admin`.
6. Replace local browser storage in `assets/js/admin.js` with database queries.
7. Connect email, calendar and payment providers only after their credentials
   are configured.

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

The `/admin` page must not be published without authentication.
