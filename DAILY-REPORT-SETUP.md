# Daily outreach report

The report is configured ON for blentz@westcapitallending.com at 9 AM America/New_York, including weekends. Deploy this complete project (functions included) to the existing Netlify site. The hourly production scheduler dispatches it at the selected local hour and retries later in the day if a definite failure occurs. It adjusts for daylight saving time.

In Admin > Recruiter follow-up > Your daily outreach report, review/save the recipient and schedule. Use Send today's report now to send the current day's report to the saved address. It does not trigger recruiter reminders and sends at most one daily report per address. Use Download current report CSV for a fresh report at any time. Turning recruiter reminders off does not turn this report off; the report has its own On/Off setting.

The email includes counts and candidate tables for Contacted, Needs outreach (none recorded), Stopped, Waiting/setup needed, Inactive, and Unverified. It groups by event and recruiter. The attached CSV includes all rows, contact information, contact timestamps in UTC, communication channel, campaign flag, and stop reason. For large sections the email shows the first 50; the CSV is complete. Counts are candidate/event records, so one person attending two events can appear twice. Unassigned and missing-contact attendees are included. This is a current snapshot across stored events, not just changes since yesterday.

Bonzo tracking setup is still required to identify Contacted and Needs outreach. Follow BONZO-FOLLOWUP-SETUP.md. When Bonzo is disconnected, candidates are Unverified, rather than confirmed uncontacted. Historical Bonzo API import is not included. Even with hooks connected, no recorded outreach does not prove no message was sent before hook connection or during missed deliveries. Report status shows the last received Bonzo activity. This tracks sent messages, not recipient replies or proof of inbox receipt.

Existing Gmail sender and NOTIFICATION_SECRET settings are reused. There is no additional report environment variable. The report address is configurable in Admin. No live messages were sent during development.

Delivery status is visible in Admin. For Gmail, an interrupted or uncertain send is held as needs_review; inspect the sender's Sent folder rather than blindly resending. Known rejections can retry with the original immutable daily snapshot. Use Download current report CSV if you want refreshed data after an earlier report was built. The next day's report uses a new snapshot.
