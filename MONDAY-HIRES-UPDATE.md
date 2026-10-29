# Monday Hires and Candidate Source update

Deploy this complete ZIP to the SAME Netlify site. It includes the event website builder, recruiter notifications, and the new Hires source report.

Keep MONDAY_BOARD_ID set to 18424671786. Keep MONDAY_API_TOKEN unchanged if its owner has access to the new board. The connection still uses your Netlify environment variables. No new Monday connection is required for the site.

The new reader detects the Hires group and prioritizes the Candidate Source column. No start-date filter is applied to Hires. Orientation is still recognized when present; a candidate who has already moved to Hires also stops reminders. Active Roster remains supported if present.

After deployment, open Settings and click Check / Refresh Monday Connection. It will show the connected board ID, detected groups, contact columns and Candidate Source. Then open Analytics and select Sync Monday & Refresh.

Analytics adds Hires by Candidate Source plus a searchable hire list. All Hires items count in the source summary, including those without a matching event registration. Recorded Candidate Source and matched event names are displayed separately. Blank and SELECT SOURCE values are grouped as Not specified. Counts are unique Monday item IDs, so two separate candidate items with the same name are not automatically merged. Existing event ROI attribution remains available.

The reader uses paginated requests, deduplicates repeated item IDs, and handles a board with Hires but no Orientation group. Recruiter reminders still require a unique email or phone match; a source label by itself does not identify a candidate.

This is a read-only Monday integration. Changes appear when Analytics is refreshed; this build does not install a Monday webhook or a real-time push listener. The notification worker also checks the board before sending when notifications are enabled.

Mocked tests verified the board switch, exact Candidate Source preference, Hires matching, source totals, pagination, placeholders and reminder completion, together with existing notification tests. The private live board was not accessed from this session; confirm detection and sample hires after deployment.
