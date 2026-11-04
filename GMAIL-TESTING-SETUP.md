# Test recruiter notifications using your Gmail

No domain or Resend account is required for this option. This complete package also retains all prior event website, video, photo-upload, crop, color, registration and Monday Hires/source features.

## 1. Prepare your personal Gmail

1. Open your Google Account's Security settings and enable 2-Step Verification.
2. Open https://myaccount.google.com/apppasswords while signed into the Gmail account you want to use.
3. Create an App Password named `West Cap Events`.
4. Keep the generated 16-character password private. It is not your normal Gmail password. App Passwords are not available for every account; if the option is missing, check Google's account requirements.

Do not paste your App Password into chat or source files.

## 2. Add the Netlify settings

Open your EXISTING site's Project configuration → Environment variables and add Production values with Functions scope:

| Name | Value |
| --- | --- |
| `EMAIL_PROVIDER` | `gmail` |
| `GMAIL_USER` | Your full Gmail address |
| `GMAIL_APP_PASSWORD` | The Google App Password you generated; spaces are accepted and removed automatically |
| `NOTIFICATION_SECRET` | Keep your existing random secret of at least 32 characters, or create one using a password manager |
| `NOTIFICATION_SITE_URL` | Your production event site's HTTPS origin, without `/admin` or another path |

Keep `ADMIN_PASSWORD`, `MONDAY_API_TOKEN`, and `MONDAY_BOARD_ID` as before. For Gmail, `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` are not required. They may remain saved if you want to switch back later. Gmail messages are always sent from `GMAIL_USER`, labelled `West Cap Events`.

## 3. Deploy

Deploy this complete project through the Git repository connected to the SAME Netlify site, or with the Netlify CLI using `npm ci` and `npx netlify deploy --build --prod`. Deploying only the public folder does not install the email functions. Rebuild/redeploy after changing environment variables.

## 4. Send a connection test first

Leave recruiter Notifications OFF. Open Admin → Recruiter Follow-up, then Refresh. The setup area will show Email provider: gmail and your sender address.

Click **Send test email to my Gmail**. This sends one generic connection test ONLY to `GMAIL_USER`. It does not send candidate details, contact any recruiters, require Monday to be online, or enable daily notifications. Check Inbox, Sent and Spam. An accepted send is not a guarantee of inbox delivery.

If Gmail rejects authentication, verify 2-Step Verification, the full address, and the App Password. Changing your main Google Account password can revoke existing App Passwords, requiring you to generate and save a replacement.

## 5. Test an actual registration

1. Use a disposable test event and test candidate details.
2. Save your OWN address as the assigned test recruiter's notification email in Team Members → Edit Email.
3. In Recruiter Follow-up, choose the daily time/time zone and enable Notifications.
4. Submit one test registration or confirm an Excel import with yourself assigned.
5. Check the initial email, daily follow-up, Stop reminders link, and manual stopping/resuming of reminders. Monday is used only for source/ROI reporting and does not control notification delivery.

Once notifications are enabled, they send to the real addresses saved on assigned recruiters. This is not a global sandbox redirect. Keep the test event assigned to yourself until you're ready to contact others. Existing queued candidates may also be processed when you enable the feature; review the follow-up list first.

The daily scheduler and retry controls work as before. Gmail has account sending limits and may restrict automated sign-ins; this option is intended for low-volume testing. No real Gmail, Monday or recruiter messages were sent during development.

## Delivery retries

Resend supports provider idempotency; Gmail SMTP does not provide that guarantee. The app records a Gmail send before submitting it. If the connection fails after acceptance may have occurred, or a worker stops mid-send, that batch is held as `needs_review` instead of automatically sending another copy. Check the sender's Sent folder before manual recovery. Clear authentication/connection rejection errors remain retryable.

Pending batches from a different provider are also held for review rather than automatically replayed through Gmail. Switching providers does not erase successful-send receipts or stop reasons.

## Switch back to Resend later

Set `EMAIL_PROVIDER=resend`, configure `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL`, and redeploy. If EMAIL_PROVIDER is absent, Resend remains the default for backwards compatibility.
