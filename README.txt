OUTFITS WITH PEREZ & QHASUKHU — V7 PRODUCTION FOUNDATION

This package is the production-connected foundation for the deployed store.

IMPORTANT
- database/supabase-config.js contains the browser-safe Supabase publishable/anon key.
- Never put a Supabase secret/service-role key in browser files.
- Admin access is restricted by Supabase Auth + public.admin_users.
- Product records are stored in Supabase when cloud mode is configured.
- Product images are stored in the public product-images bucket.

DEPLOYMENT
1. Replace the corresponding files in the GitHub repository with this V7 package.
2. Commit the changes.
3. Vercel will redeploy from GitHub.
4. Open /admin.html and sign in with the Supabase Auth admin account.
5. Add a test product and verify it appears in the storefront.
6. Delete the test product if desired.

CURRENT PRODUCTION URL
https://axciggoyljregnvlxvxf.supabase.co

NEXT PRODUCTION MILESTONE
- Orders dashboard
- Customer order records
- M-Pesa checkout/callbacks through a secure server/edge function
- Custom domain
- Final security/SEO/policy pass
