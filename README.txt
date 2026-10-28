OUTFITS WITH PEREZ & QHASUKHU — WEBSITE

Static storefront deployed on Vercel, with Supabase for product data, authentication and product images.

Main files: index.html, styles.css, app.js, admin.html, admin.js, supabase-config.js, supabase-client.js.

Admin dashboard: /admin.html. Only a logged-in user whose Auth user ID exists in public.admin_users should be able to manage products. The page now fails closed if Supabase config fails to load.

Products are stored in public.products. Images are uploaded to the product-images Storage bucket.

The browser configuration uses the Supabase project URL and publishable key. Never use a secret/service-role key in browser JavaScript.

If product upload fails, note the exact error displayed. Common causes are missing product-images Storage INSERT policy for authorized admins, missing products INSERT/UPDATE policies, a missing admin_users membership/policy, or a file larger than 6 MB.

Do not rerun schema.sql on the live database unless you have reviewed the statements and specifically intend to modify the database.


BRAND REFRESH (2026)
- Brand positioning now covers Church & Clergy, Official Wear, and Accessories.
- logo.svg is the new P/Q emblem and wordmark.
- Product Quick View shows details and selectable sizes; selected size is carried into the bag and WhatsApp order.
- To allow the expanded categories in Supabase, run MIGRATE_CATEGORIES.sql once in the Supabase SQL Editor. This preserves legacy Men/Women category values.
- Deploy all root files, including logo.svg and MIGRATE_CATEGORIES.sql (SQL file is reference only and is not executed by Vercel).
- Do not change Supabase keys or rerun SETUP_NOW.sql as part of this visual update.
