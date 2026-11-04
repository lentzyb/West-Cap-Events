# Send recruiter follow-ups whenever you need

Upload this ZIP's extracted contents into your existing GitHub repository and wait for Netlify's production deployment to finish. Keep the same Netlify site and environment variables.

In Admin → Recruiter follow-up, ensure Notifications is On and saved. Click **Send recruiter follow-ups now**. Each active recruiter with a saved notification email receives a current table containing only their assigned eligible candidates. Refresh shortly to see delivery results. The provider accepting an email does not guarantee inbox delivery.

This manual send works even after today's scheduled reminder has already sent. The daily schedule and **Send fresh report now** administrator report remain separate. Each new click requests another email, so avoid repeated clicks while processing.

With Bonzo tracking connected, follow-ups require the event to have ended, with its end date/time/time zone configured. Recorded matching post-event messages (including campaigns), archived events, and manually stopped reminders are excluded. Bonzo tracking reflects received webhook activity; earlier history is not imported. Monday remains an analytics source.

Pending or uncertain deliveries are held out of new manual batches to prevent overlapping sends. Check Recent delivery attempts for delivery issues. If processing is busy, the saved request is retried by a later processing run within its 23-hour window. Notifications must remain On.
