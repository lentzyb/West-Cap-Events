# WCL Event Platform v2

A Netlify-hosted event platform for West Capital Lending.

## Included

- Create and archive events
- One unique registration URL and QR code per event
- Required attendee fields
- Team-member manager
- Select multiple team members for each event
- Route each registration to the selected team member in Bonzo
- Save registrations even if Bonzo is temporarily unavailable
- Bonzo sync status in the admin dashboard
- CSV export with sync status and error details

## Netlify environment variables

Required:

```text
ADMIN_PASSWORD=choose-a-secure-password
BONZO_API_TOKEN=paste-the-token-created-in-bonzo
```

Defaults already built into the app:

```text
BONZO_API_BASE_URL=https://app.getbonzo.com/api
BONZO_CREATE_PROSPECT_PATH=/v3/prospects
```

Only add the two optional variables if Bonzo support or the live API documentation shows a different route.

## Bonzo token scopes

Use a Team Lead or SuperUser token with:

- access-authenticated
- prospects
- campaigns (future-ready)
- pipelines (future-ready)

## Deploy

1. Upload the entire project to a new GitHub repository, or replace the complete contents of the existing repository.
2. Connect it to Netlify.
3. Add the environment variables above.
4. Trigger a clear-cache deploy.
5. Open `/admin`.
6. Add team members using the exact email address tied to each person's Bonzo account.
7. Create an event and check every team member who should appear in its dropdown.
8. Submit one test registration and confirm the Bonzo status shows `completed`.

## Important Bonzo behavior

The app sends the selected team member's Bonzo email in the documented `On-Behalf-Of` header. This is intended for Enterprise SuperUser tokens. If Bonzo returns a permissions or endpoint error, the registration remains safely stored and the exact Bonzo error appears in the admin registration table and CSV export.

## Bonzo prospect ownership

New registrations are sent to:

`POST /api/v3/prospects/create-or-update-and-message`

The selected team member's saved Bonzo email is sent in the `assigned_to` field. The email must exactly match that user's email inside Bonzo. The API token should be created by a Bonzo Team Lead or SuperUser when prospects will be assigned across multiple users.

After deployment, submit a test registration and open **Admin → Events → Registrations**. A successful record displays `completed` under Bonzo. A failed record remains safely stored in Netlify and displays the Bonzo API error.
