# NHYM 2026 database deployment

This version adds a Cloudflare Worker API, D1 storage, registration IDs and `/admin`.

## One-time Cloudflare setup
1. In Cloudflare Dashboard open **Storage & databases > D1 SQL database > Create**.
2. Name it `nhym2026-registration`.
3. Copy its Database ID and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.jsonc`.
4. In the D1 database Console, run the full contents of `schema.sql` once.
5. In your Worker **Settings > Variables and Secrets**, add a secret named `ADMIN_TOKEN`. Use a long private random value and never commit it to GitHub.
6. In Worker build settings use:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
7. Commit/push all files to GitHub. Cloudflare will rebuild automatically.

## Using the system
- Public registration: `/` (or `/#register`)
- Admin page: `/admin`
- New submissions are stored as `PENDING` and receive IDs such as `NHYM26-000001`.
- In `/admin`, enter the private `ADMIN_TOKEN`, load registrations, and change status to `PAYMENT_VERIFIED`, `APPROVED`, or `REJECTED`.

## Security notes
- Do not put `ADMIN_TOKEN` in source code, GitHub, screenshots, or public messages.
- A payment reference is evidence to check, not proof of payment. Verify it against the bank/UPI record before marking `PAYMENT_VERIFIED` or `APPROVED`.
- This package does not automatically send approval email yet. Status is stored in D1; email delivery can be added separately after the database flow is tested.
