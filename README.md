# Daily outreach report

Start with DAILY-REPORT-SETUP.md for the daily report to Brian at 9 AM Eastern. The complete package also includes the Bonzo receiver; see BONZO-FOLLOWUP-SETUP.md.

# Bonzo outreach tracking

Start with BONZO-FOLLOWUP-SETUP.md for this version. Connected Bonzo hooks stop post-event reminders; Monday is separate. Historical Bonzo API import is not included.

# Recruiter notification update

See NOTIFICATIONS-INDEPENDENT.md for current notification behavior. This supersedes older instructions about Monday pausing emails or automatically stopping reminders.

# West Cap Event Platform

For personal Gmail testing, start with **GMAIL-TESTING-SETUP.md**.

The package includes all prior features. Other guides:

- MONDAY-HIRES-UPDATE.md: Monday board, Hires and Candidate Source reporting
- NOTIFICATIONS-SETUP.md: original Resend setup and notification workflows
- EVENT-WEBSITES-START-HERE.md: event website builder
- PHOTO-UPLOADS.md: gallery uploads
- COVER-VIDEO-CROPS-COLORS.md: cover video, photo shapes and color styles

Run `npm ci`, `npm test`, and `npm run build`. Deploy to the same Netlify site, including functions.

## Targeted Bonzo outreach checks

Set `BONZO_API_TOKEN` in Netlify Functions, using an account with access to the event recruiters' prospects and conversation history. The server uses GET requests to `https://app.getbonzo.com/api/v3/prospects` with a contact search and `/prospects/{id}/messages`. Search results must match normalized email or phone with no conflicting shared contact field before any messages are fetched. Search pagination is bounded; a broad result, denied permission, invalid payload, rate limit, or unfinished check holds reminders and appears as Unverified. A missing visible prospect does not prove the person is absent from Bonzo.

Diagnostics advance one candidate page per request and bypass the old global index migration. Background report/reminder workers refresh ended, external event follow-ups in batches of three with an eight-minute budget. A candidate check stops once qualifying post-event outreach is found; background refresh skips already contacted candidates. Completed checks cache for ten minutes, while webhooks keep matching message state current. Only message metadata is stored, never message content or the API token. Existing hook-only setups retain their previous behavior. Current schema: https://app.getbonzo.com/docs/v3

When search cannot find a known record, the admin candidate diagnostic accepts a Bonzo prospect URL or numeric ID. The server reads that record directly and saves a candidate-specific link only after exact contact verification. Subsequent checks revalidate the linked record before fetching its messages. Permission denial, missing records and conflicting contacts do not create a link.

Bonzo metadata validation revision 2 refreshes older saved classifications at equal provider timestamps, recognizes answered outgoing calls, and reports API direction counts plus the newest returned message timestamp. A successful local build must be followed by a Published Netlify deployment; a failed function upload leaves the prior site active.
