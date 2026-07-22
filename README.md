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
