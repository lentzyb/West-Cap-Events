Recruiter email redesign

Newly generated recruiter emails use a navy-and-gold header and table with Event, Candidate, Contact details, Status and Stop reminders. Connected Bonzo tracking uses the headline Follow-up needed and says no communication has been recorded in Bonzo since the event ended. This describes recorded activity, not proof that no contact happened outside the integration. When tracking is disconnected the message explicitly says status is unverified.

The event name is displayed prominently, with event date/end time and time zone when saved. Existing recipient routing is preserved: each recruiter only receives their own candidates. Daily summaries and campaign-message suppression continue as before. Previously created retry payloads retain their original format for delivery deduplication.

All previous features are included. Upload the extracted contents to the same GitHub repository and let Netlify publish. No environment variable changes required. RECRUITER-EMAIL-PREVIEW.html is an offline sample with fictional candidates and disabled links.

70 automated tests and build passed. No live email sent during development.
