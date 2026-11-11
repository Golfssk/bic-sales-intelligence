# Google Drive sales backend setup

Target: https://drive.google.com/drive/folders/1Pk90DjApf0qqJ7pjK6RCMX53xqs0OrJM

## Implemented
- Browser imports XLSX/XLS/CSV with the existing sales logic.
- Google Drive mode uploads the original file to BIC_SALES_SOURCE_CURRENT.xlsx (or corresponding extension) and then writes BIC_SALES_ACTIVE.json.
- Only the active JSON is loaded on another device; previously imported data is never added twice.
- Short-lived Google OAuth tokens exist only in browser memory. No Drive tokens are stored in localStorage, Supabase, or GitHub.
- Uses the Google Drive resumable upload API, including files larger than the usual Vercel request limit.
- Drive sharing permissions control access; the folder is never set public.
- Supabase mode remains intact until Drive is configured and verified.

## Required one-time configuration by company Google Cloud admin
1. Enable Google Drive API in a Google Cloud project owned by the company.
2. Configure Google Auth Platform, preferably Internal audience for company users. Request the Drive scope https://www.googleapis.com/auth/drive. This is a restricted scope and company approval may be required.
3. Create an OAuth 2.0 Client ID for a Web application, with Authorized JavaScript origin: https://bic-sales-intelligence.vercel.app
4. Copy the public OAuth Client ID ending in .apps.googleusercontent.com (NOT a client secret).
5. In Vercel project bic-sales-intelligence, set VITE_SALES_BACKEND=google-drive and VITE_GOOGLE_CLIENT_ID=<the Web OAuth Client ID>. Redeploy Production.
6. Open the website and click เชื่อม Google Drive using a Google account with permissions on the Sales data folder. Upload the latest Excel once.
7. On each other computer, connect a Google account that can access the same Drive folder, then check the same KPIs.

The ChatGPT Google Drive connector cannot be directly reused by an independently hosted website.

## Safe activation checklist
- Do not make the sales folder public.
- Verify owner and shared viewer access independently.
- Validate the historical sample from 2026-11-04: 3,096 October rows, 335 November rows, 3,431 total.
- Confirm the second device loads exactly that snapshot, not zero or a cumulative overlay.
- Upload again, verify replacement; test a forced failure preserves the old active snapshot.
- Existing Supabase datasets are NOT deleted by this rollout.
- Legacy Supabase Team Workspace and targets editor is unavailable in Drive-only mode; do not assume it moved.
- Scope is broad for direct access to the pre-existing folder; for stricter permissions later consider a Workspace-owned backend and restricted service credentials.

References:
Google identity for browser apps: https://developers.google.com/identity/oauth2/web/guides/overview
Drive upload API: https://developers.google.com/workspace/drive/api/guides/manage-uploads
Drive API scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
