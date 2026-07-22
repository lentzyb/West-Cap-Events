# WCL Event Platform — Bonzo Webhook Edition

This version uses Bonzo lead-generation webhooks instead of the Bonzo public API.

## Netlify environment variable

- `ADMIN_PASSWORD`

`BONZO_API_TOKEN` is not used and can be removed after this version is deployed.

## Event setup

1. Create the desired campaign or pipeline destination in Bonzo.
2. Create a Bonzo webhook for the appropriate team/user and select that campaign or pipeline.
3. Copy the generated webhook URL.
4. In the WCL Event Platform, create an event.
5. Select each team member who should appear on the form.
6. Paste the correct event-specific Bonzo webhook URL beside each selected person.

When an attendee selects a team member, the registration is sent to that person's webhook. Bonzo then handles prospect creation, ownership, duplicate rules, and campaign/pipeline enrollment based on the webhook configuration.

## Bonzo payload

The platform sends JSON with:

- `first_name`
- `last_name`
- `email`
- `phone`
- `field_1` = NMLS ID
- `field_2` = Event name
- `field_3` = Invited by
- `lead_source` = WCL Event Registration + event name

## Deploy

Upload the full project to GitHub and connect the repository to Netlify. The publish directory remains `public`, and Netlify Functions are under `netlify/functions`.
