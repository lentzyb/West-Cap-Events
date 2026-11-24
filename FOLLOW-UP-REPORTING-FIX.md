# Recruiter follow-up reporting fix

Three defects made the outreach report and recruiter reminders show candidates as Unverified (or hold every reminder) even when the Bonzo check had worked.

## What changed

1. **Rate limits no longer fail the rest of the list.** One HTTP 429 from Bonzo used to start a 60-second cooldown during which every remaining candidate was stamped "Bonzo rate limit reached" and reported Unverified. Verification now waits out the limit (honoring Retry-After, capped at three minutes) and resumes the same candidates. Requests are also spaced 150 ms apart by default; set `BONZO_API_MIN_INTERVAL_MS` in Netlify to change that.
2. **A finished check stays valid for three hours instead of ten minutes.** Previously a verified "Needs outreach" result reverted to "Bonzo verification pending" ten minutes later, so Admin, the CSV download and manual sends showed Unverified whenever the worker had not just run, and a candidate list too long to verify inside ten minutes could never finish. The hourly run renews every check well inside the three-hour window. While a re-check is running, the last finished result stands; a re-check that fails still reports Unverified.
3. **One verification cycle no longer repeats its own work.** Continuation passes carry the cycle's start time, so checks finished earlier in the cycle are reused. Manual "send now" requests still require checks no older than five minutes.
4. **Messages without a direction field are handled more precisely.** A delivered message is classified as sent or received when its sender or recipient field exactly equals the candidate's own phone or email. An unclassifiable message only holds a candidate as Unverified if it could be post-event outreach (successful status, after the event ended); older history no longer blocks the check.
5. **The candidate diagnostic lists the field names Bonzo returns** (names only, never values) and the count of unclassified post-event messages.

## Still to confirm against live Bonzo data

Item 4's sender/recipient matching assumes field names such as `to`, `from`, `to_number`, `from_number`. Open one candidate diagnostic for someone a recruiter texted after an event and read the "Message fields returned by Bonzo" line. If the direction lives in a different field, `netlify/lib/_bonzo-message.mjs` is the one place to add it.

## Deploy

Upload the extracted contents to the same GitHub repository and let Netlify publish. No environment variable changes are required. Cached checks from the previous version are re-verified on the next run.

120 automated tests and the build passed. No live Bonzo request or email was sent during development.
