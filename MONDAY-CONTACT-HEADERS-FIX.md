Monday contact header detection update

Recognizes Personal Email* and Personal Phone*, including punctuation and trailing spaces. All previous Bonzo outreach tracking, daily reports, email notifications and event website features are included.

Replace project files in the existing connected GitHub repository and let Netlify publish the new deployment. Keep the existing Netlify variables. Then open Settings > Check / Refresh Monday Connection. Email and Phone should show the detected headers. Run Sync Monday & Refresh in Analytics to update matches. Empty contact cells cannot match registrants; they need actual email/phone values.

Nine Monday integration tests and the build passed. Live Monday data has not been accessed during this fix.
