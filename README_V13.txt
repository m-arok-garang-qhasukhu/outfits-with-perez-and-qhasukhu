OUTFITS WITH PEREZ & QHASUKHU — V13 PACKAGE

Start with V13_RELEASE_NOTES.txt and V13_TEST_CHECKLIST.txt.

This is a static Vercel storefront backed by Supabase. Upload the ZIP contents to the root of the existing GitHub repository only after the V13 database migration has been reviewed and applied.

The existing supabase-config.js contains the browser-safe publishable key. Never replace it with a Supabase secret/service-role key.

Admin: /admin.html
Customer account, order tracking and tailoring: /account.html
New migration: V13_MIGRATION.sql

Do not rerun schema.sql, MIGRATION_V11_ORDERS_REVIEWS.sql or V12_SECURE_TRACKING_MIGRATION.sql on the live project.
