# WCL Event Platform — Bonzo Campaign Library Edition

This version stores Bonzo webhooks in a reusable library instead of requiring URLs to be pasted for every event.

## Setup

Netlify environment variable:

- `ADMIN_PASSWORD`

`BONZO_API_TOKEN` is not used.

## Workflow

1. Add team members.
2. In Bonzo, create an owner/campaign webhook.
3. Save it in **Bonzo Campaign Library** with a name, owner, campaign label, and webhook URL.
4. Create an event and choose one saved webhook for each selected team member.
5. Registrants select who invited them. The registration is posted to that person’s chosen Bonzo webhook.

Existing events keep a snapshot of the webhook route chosen when the event was created.
