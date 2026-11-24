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

## Second update (after the first live report)

The first report on the fixed code showed 41 Unverified rows with real reasons: 36 "no matching prospect", 4 unclassified direction, 1 HTTP 404.

1. **Search covers the whole team, not only the assigned recruiter.** The search ran against the recruiter's own Bonzo records and stopped there when that worked, so a candidate held under a teammate (an import or a campaign) was reported as not visible. It now searches the recruiter's records and then every record the API account can see.
2. **"Not in Bonzo" is its own report category.** A candidate with no Bonzo record under the recruiter or the team is no longer mixed in with failed checks.
3. **A deleted or merged Bonzo record no longer fails the check.** A remembered or manually linked prospect ID that returns 404 is skipped and the candidate is searched for again.
4. **Unclassified messages now say what they are.** The status shows the message type and status and lists the field names Bonzo returned (names only), so the direction rule can be finished from the next CSV export.

123 automated tests and the build passed.

## Third update: Not in Bonzo goes to recruiters

A candidate with no Bonzo record is now reported as **Not in Bonzo** in the daily outreach report and in the recruiter reminder email, instead of being held as Unverified. The recruiter email marks each such candidate "Not in Bonzo" with the instruction to add them and follow up, and the summary line counts them. Checks that fail (errors, rate limits, unclassified messages) are still held as Unverified.

124 automated tests and the build passed.
