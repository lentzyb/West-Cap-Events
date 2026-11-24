# Shared-device registration and check-in

Prepare each tablet or laptop in its normal browser while connected to the internet, within seven days of the event.

1. Open the published event registration link. Scroll to **Shared-device offline mode** and click **Prepare this device for offline use**. Wait until the page says **Prepared**.
2. Open the private **Staff check-in** link from the admin Events page on the same device. Click **Prepare this device for offline use** there too. This downloads the full attendee roster, including plus-ones, and stores staff access on this device.
3. Keep the same browser and device for the event. Registration offers **Register another person** for a shared kiosk. Check-in supports local name search, check-in and undo. A newly collected registration is available to check in on that same prepared device.
4. Reconnect after the event, leave either page open, and click **Sync saved entries**. Verify that the pending count reaches zero before clearing browser data or handing the device back.

Saved entries remain in the browser until the server acknowledges them. A stable request ID prevents a lost response or retry from creating the same registration twice. Registrations sync before their related check-ins. Server validation failures stay visible for staff review; attendance changed elsewhere is held for review instead of being overwritten. Only discard an unsynced entry after preserving any information you still need.

Each device has its own offline queue and roster. Offline devices do not share new walk-ins or attendance changes with one another. Use one device for both registration and check-in of walk-ins, or wait for connectivity before checking those people in elsewhere.

First-time visitors on their own phones still need internet to load the public QR link. Offline mode is for devices prepared in advance, not an offline public website. Use staff-controlled devices. Do not use private browsing, clear site data, or uninstall the browser before all entries sync. Re-prepare to refresh the roster and event details; prepared event data expires after seven days. Unsent entries are retained for sync even after preparation expires.

Bonzo transfers, Calendly and other online services require connectivity. The offline registration confirmation explicitly says **Saved on this device** until syncing completes. Keep an event page open during sync; syncing is not guaranteed while the browser is closed.
