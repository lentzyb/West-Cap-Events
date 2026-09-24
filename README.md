# WCL Event Platform — Edit, Duplicate & Analytics Edition

## Features
- Create and edit live events without changing the public URL or QR code
- Native calendar picker, start-time picker, optional end-time picker, and time-zone selection
- Add/remove team members and change Bonzo campaign webhook routing on a live event
- Duplicate an event to reuse description, routes, location, and settings
- Event statuses: Upcoming, Today, Completed, Archived
- Per-event registration analytics
- Overall analytics dashboard with registration totals, webhook success rate, event ranking, and team-member leaderboard
- CSV export, QR codes, registration storage, and Bonzo webhook delivery

## Netlify environment variable
`ADMIN_PASSWORD`

`BONZO_API_TOKEN` is not used.

## Deploy
Upload every file and folder in this project to the root of the GitHub repository connected to Netlify. Netlify should run `npm run build` and publish the `public` directory.


## Calendly integration
Team Members can now store a Calendly event link and enable post-registration scheduling. Successful registrations receive a Candidate ID. The public registration page can embed the selected recruiter's Calendly and records calendar shown, event viewed, time selected, and scheduled events into the existing registration record. No Calendly API token is required for browser-based tracking. For server-side cancellation/reschedule tracking, add a Calendly webhook integration in a future version.


## Match diagnostic build
Analytics now shows same-name unmatched Orientation candidates with email/phone match booleans only. No contact values are exposed. Use Kim Nguyen / Vegas OCN as the first validation case.

## Permanent Orientation attribution
This build treats Monday's **Orientation** group as the conversion trigger. When an event registration uniquely matches a person in Orientation by normalized email or phone, the conversion is saved permanently in the existing Netlify Blobs store under `conversion:<registrationId>`.

Analytics automatically checks Monday whenever the Analytics tab loads or is refreshed. Once a recruit is saved, moving that person from Orientation to Active Roster does **not** remove the recruit from historical event analytics.
