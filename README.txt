OUTFITS WITH PEREZ & QHASUKHU — V5 CLOUD FOUNDATION

V5 is the next step after the browser prototype. It can run in two modes:

1) DEMO MODE — if Supabase is not configured, the store/admin use browser localStorage.
2) CLOUD MODE — after Supabase is configured, the storefront reads products from the database and the admin can sign in, upload product images and manage the catalog.

FILES
- index.html / styles.css / app.js — storefront
- admin.html / admin.js — admin catalog manager
- database/schema.sql — base database
- database/schema_v5.sql — admin allow-list + storage policies
- database/supabase-config.js — project URL + publishable/anon key placeholders
- database/supabase-client.js — browser client bootstrap
- PRODUCTION_SETUP_V5.txt — launch roadmap

SETUP SUMMARY
1. Create a Supabase project.
2. Run schema.sql, then schema_v5.sql in Supabase SQL Editor.
3. Create an Auth user for the store administrator.
4. Add that user's UUID to public.admin_users using the SQL comment at the bottom of schema_v5.sql.
5. Put your project URL and publishable/anon key into database/supabase-config.js.
6. Open admin.html, sign in and add a real product/image.
7. Open index.html and verify the cloud catalog appears.

SECURITY
The publishable/anon key is safe to ship in the browser when RLS is correctly configured. Never expose a Supabase secret/service-role key in HTML or browser JavaScript.

NEXT PRODUCTION MILESTONE
Orders + customer checkout + secure M-Pesa integration + admin order dashboard. Payment secrets and M-Pesa callbacks belong in a server/Edge Function, not in the browser.
