OUTFITS WITH PEREZ & QHASUKHU — WEBSITE

Static storefront deployed on Vercel, with Supabase for product data, authentication and product images.

Main files: index.html, styles.css, app.js, admin.html, admin.js, supabase-config.js, supabase-client.js.

Admin dashboard: /admin.html. Only a logged-in user whose Auth user ID exists in public.admin_users should be able to manage products. The page now fails closed if Supabase config fails to load.

Products are stored in public.products. Images are uploaded to the product-images Storage bucket.

The browser configuration uses the Supabase project URL and publishable key. Never use a secret/service-role key in browser JavaScript.

If product upload fails, note the exact error displayed. Common causes are missing product-images Storage INSERT policy for authorized admins, missing products INSERT/UPDATE policies, a missing admin_users membership/policy, or a file larger than 6 MB.

Do not rerun schema.sql on the live database unless you have reviewed the statements and specifically intend to modify the database.
