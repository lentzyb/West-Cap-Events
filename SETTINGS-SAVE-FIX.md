# Verified notification settings

Upload the extracted contents into the existing GitHub repository and let Netlify finish deploying. Refresh the admin page to load the new scripts.

Open Recruiter follow-up. Settings load separately from candidate history, so a slow history request no longer prevents the saved switches from appearing. Controls are disabled until the stored settings load successfully.

Choose On for recruiter Notifications, then click Save notification settings. Wait for "Notification settings saved and verified · On." Set the daily outreach report to On and click Save report settings; wait for its own "saved and verified · On" confirmation. Refresh and confirm both remain On.

Saving reads the settings back from storage before confirming success. An HTML timeout response is shown as a readable error and cannot count as a successful save. In-progress or unsaved edits are protected from older status loads. Saving settings does not send email; the manual send buttons remain available separately.

If verification fails, refresh to check the stored setting before trying again. These changes were tested locally with mocked storage and email services; production persistence must be confirmed after deployment.
