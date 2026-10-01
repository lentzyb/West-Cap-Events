# West Cap Event Platform — Attendee Import Edition

Built from the stable Exact JS Fix baseline.

## New
- Import Attendees button on every event
- Accepts CSV, XLS, and XLSX files up to 3 MB
- Auto-detects common First Name, Last Name, Full Name, Email, Phone, and NMLS headers
- Imported attendees are stored per event in Netlify Blobs
- Re-importing replaces that event's prior imported attendee list
- Event audience is deduplicated across WCL registrations + imported attendees
- Monday matching checks both sources against Orientation + 2026 Active Roster
- Existing WCL registrations are preferred when the same joined candidate exists in both sources
- Permanent recruit attribution and Monday deduplication remain intact
- Analytics adds Imported and Audience columns and labels recruited people as Imported attendee when applicable

All prior admin controls, Bonzo routing, Calendly, event registration, Monday session authentication, permanent recruit attribution, and expandable recruit rows are retained.
