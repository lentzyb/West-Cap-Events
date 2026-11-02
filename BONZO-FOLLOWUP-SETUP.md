# Bonzo outreach tracking setup

This update adds a receiver for outgoing-message event hooks. Monday remains separate, for source and ROI analytics. Existing registration-to-Bonzo campaign webhooks are unchanged.

## Connect it

1. In Netlify, create BONZO_EVENT_HOOK_CODE with the exact Security code shown in your NEW Bonzo hook form. Mark it secret and include Functions and Production. Do not use the notification secret here. Do not put the Bonzo code in source files or screenshots.
2. Deploy this entire project, including functions, to the SAME westcap-events Netlify site.
3. In the new Bonzo hook use:
   - Name: Event Recruiter Follow-up
   - Description: Track Bonzo outreach after events and stop recruiter reminders once a candidate has been contacted, including campaign messages.
   - URL: https://westcap-events.netlify.app/.netlify/functions/bonzo-events
   - Events: messages.outgoing.created and messages.outgoing.updated
   - Additional headers: none; Bonzo supplies X-Bonzo-Code itself.
4. Click Create. Leave the existing Azure hook unchanged. Ensure hooks cover each Bonzo team whose outreach you want tracked.
5. For each event set its date, end time and time zone. With Bonzo tracking enabled, missing/ambiguous end times hold that event's reminder emails; future events wait until they end.

## Verify with your own test candidate

Use a test event that ended earlier today and assign a test candidate to yourself, with your own email saved as the recruiter. Send a Bonzo text/email (or let a campaign send one) after the event end. Refresh Recruiter follow-up. Expect Contacted in Bonzo and a contact timestamp, with Campaign for campaign messages. A queued/failed message or campaign enrollment alone does not qualify. The receiver does not send messages in Bonzo.

If no activity appears, inspect the Bonzo hook delivery status. 401 means the code does not match; 503 means the Netlify variable is missing; 400 means the payload format/timestamps need checking. Do not post private payloads or codes in chat. Live call and campaign payload formats must be verified in your account; the implementation accepts sms, email, call and voicemail records with outgoing direction and sent, delivered or completed status.

Then test an uncontacted candidate, and Retry pending notifications. This can send all pending recruiter notices. Daily summaries continue until recorded outreach or manual stopping. Existing receipts, opt-outs and duplicate prevention remain.

## What it knows

Matching uses normalized email and/or phone, never names. When both fields are present and conflict, the receiver does not assume a match. Qualifying outreach must occur strictly after each event end. The same candidate can therefore be contacted for one event and still need outreach after a later event. Outreach is candidate-level: any qualifying team outreach, including campaigns, satisfies it; it does not prove that the assigned recruiter personally sent the message.

Activity is stored even before attendee upload, so Tuesday outreach received by the connected hook can satisfy a Wednesday upload. Minimal activity metadata is kept; message bodies and hook codes are not saved in activity records.

This version does NOT import historical Bonzo communication or query Bonzo's API. It only knows activity delivered to this receiver after hook connection. Missed hook deliveries and earlier history cannot be treated as verified absence of outreach. The UI says none recorded. A retrospective API integration remains to be verified separately. For older events, review activity manually before enabling reminders. No live Bonzo access or email delivery was tested during development.

Without BONZO_EVENT_HOOK_CODE, the previous independent manual-stop notification behavior remains available. With the variable present, post-event gating and Bonzo matching activate.
