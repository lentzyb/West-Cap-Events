# Recruiter notifications — setup and use

This package includes the event website builder plus recruiter email notifications. Deploy it to the SAME Netlify site and keep existing environment variables and the `wcl-event-platform-v2` Blobs store. Existing events, recruiters, campaigns, registrations and ROI data stay in that store.

## 1. Deploy the complete project

For a Git-connected Netlify site, replace the project files in the linked repository, commit, and push. The included `netlify.toml` builds with `npm run build`, publishes `public`, and deploys `netlify/functions`.

For a CLI-managed site, extract the ZIP, run `npm ci`, link to your existing Netlify site, then run `npx netlify deploy --build --prod`. Deploy functions too; dragging only `public` onto Netlify will not install this update. Scheduled functions run on published production deploys. The deployed Functions list should include `notification-schedule` (Scheduled) and `notification-worker-background` (Background).

## 2. Connect email sending

This version sends through the Resend email API. Create a Resend account, verify a sending domain you control, and create an API key. Add these values in your Netlify site's environment settings with Functions scope, then redeploy:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | Your sending API key, entered directly in Netlify |
| `NOTIFICATION_FROM_EMAIL` | Verified sender, such as `West Cap Events <events@your-verified-domain.com>` |
| `NOTIFICATION_SECRET` | A random secret of at least 32 characters. Use a password manager to generate it. |
| `NOTIFICATION_SITE_URL` | Your existing production site's HTTPS origin, such as `https://your-site.netlify.app`, without a path |

Keep `ADMIN_PASSWORD`, `MONDAY_API_TOKEN`, and `MONDAY_BOARD_ID` configured as before. No secrets belong in the ZIP or repository. Changing `NOTIFICATION_SECRET` invalidates old candidate reminder links.

Email delivery is OFF by default. No notifications have been sent from this build. API keys, a verified sender, production deployment, and live testing still need to be completed in your account.

## 3. Add recruiter emails and enable

Open **Team Members** and use **Edit Email** to save each recruiter's notification email. This edits the existing team member, so their campaigns and Calendly settings remain connected. New team members can include an email when created.

Open **Recruiter Follow-up**. Review setup, select a daily summary hour and time zone, switch Notifications On, and save. Default: **9:00 AM Eastern, every day including weekends**. Daily summaries contain all outstanding event candidates assigned to that recruiter.

New registrations and confirmed imports are queued immediately. A background worker processes the queue; if dispatch or delivery fails, the hourly production schedule retries. Worker overlap is prevented by a lease. Large imports and provider throttling may delay acceptance. The admin status shows the last Monday check, run result and delivery attempts. Provider acceptance is not proof of inbox delivery; check provider logs for bounces.

Previously existing registrants are not automatically backfilled. Registrations and imports received by this version are queued; re-import a historical event's spreadsheet with recruiter assignments if you want those attendees followed up.

## 4. Upload Why West Cap registrants

Use **Import Attendees** for the correct monthly event. XLSX, XLS and CSV are accepted, up to 3 MB and 10,000 rows. The first worksheet is read. The `examples` folder includes an Excel template.

Recognized recruiter headers include **Recruiter**, **Recruiter Name**, **Assigned Recruiter**, **Referred By**, **Team Member**, and **Recruiter Email**. Recruiter names match case-insensitively using full names; saved recruiter email addresses can match too. The preview shows the proposed assignments and recruiter email addresses. Duplicate names, conflicting duplicate rows and unknown names require an explicit selection. Blank Recruiter cells require assignment or an explicit **Unassigned** choice.

Nothing is imported or emailed until **Confirm import**. Unassigned attendees remain in reporting without a notification. Missing recruiter emails stay queued until an email is added. Candidates without email or a valid phone can be imported but cannot be queued for follow-up.

The import replaces the prior imported list for that event. Matching existing attendees retain IDs, and existing notification receipts and stop reasons are retained. Re-uploading the same event candidates does not send another initial notice. A direct registration takes priority over an imported row for the same event/contact. Removed imported attendees stop receiving reminders. A newly created monthly event is a new event, so its new registrations can trigger new notices.

## 5. How reminders stop

Before sending, the worker checks Monday's Orientation / Hires / Active Roster groups using unique email or phone matches. A completed match is recorded permanently for that event candidate. Name-only matches are not sufficient to stop reminders. If Monday cannot be checked or its Orientation group cannot be verified, email sends pause and retry later. Existing analytics matching behavior is retained, including the Active Roster start-date cutoff.

Each email has a **Stop reminders for this candidate** link. Opening it only displays the candidate; it does not change anything. The recruiter chooses **Dropped out**, **Not a fit**, **Not interested**, or **Other**, then submits. The signed link affects only that candidate at that event and is invalid after recruiter reassignment. The candidate's registration and ROI data remain intact.

The **Recruiter Follow-up** tab shows the reason and has a **Resume reminders** control. A candidate already matched to Orientation remains completed. Archived events and inactive recruiters are paused. Resuming affects future reminders; it does not erase the original email receipt.

If a provider request remains uncertain past its safe retry window, its delivery status becomes **needs_review** and affected candidates are held. Verify provider logs before any manual recovery; the worker does not blindly replay an old ambiguous delivery. Queued email batches invalidated by changes are cancelled; remaining candidates can appear in the next daily summary.

## 6. Verify after deployment

1. Create a test event and assign yourself as its recruiter, with your email saved.
2. Submit one test registration. Check CRM success, Calendly and your initial email.
3. Upload the same person with your full recruiter name in the Recruiter column; confirm no second initial email is sent.
4. Add another test registrant through the Excel template. Review the mapping and confirm your email arrives.
5. Use a stop link, select a reason, and confirm the admin tab shows Stopped. Resume it in admin.
6. Put a matching test candidate in Monday Orientation and use Retry pending notifications. Confirm Orientation reached and no further reminders.
7. Confirm the scheduled daily summary runs at the selected local hour in production.

Automated mocked tests cover initial and daily notices, dedupe, Excel assignment review, stable IDs, stop/resume, token tampering, Orientation, Monday failures, provider retries, overlapping workers, time zones and existing registration integrations. No live CRM, Monday or email calls were made during these tests.
