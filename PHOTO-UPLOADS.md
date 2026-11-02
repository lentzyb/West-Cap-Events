# Upload event gallery photos

This complete update includes all previous website, notification and Monday Hires/source features. Deploy it to the same Netlify site, including functions. No additional keys or photo-hosting account are needed.

1. Open an event in Admin and turn Build an event website On.
2. Find Event photo gallery and click Upload Photos.
3. Select multiple JPG, PNG or WebP images from your computer. Use up to 20 photos per event, with source files under 15 MB each. HEIC files must be exported as JPG first.
4. Wait for the thumbnail previews. Large images are resized to a maximum of 2048 pixels on the longest side.
5. Click Remove on any unwanted photo.
6. Preview the page, then Save Changes or Create Event. Your existing event link and QR code open the saved gallery.

The optional image-link field remains available. Uploaded photos are stored in your existing site's persistent storage and stay available after redeploying the same Netlify site. Photos are public through the event page; no visitor login is required to view them.

Uploads finish before the event can be saved. Files that fail are reported individually and do not prevent successfully uploaded photos from being used. Removing a photo from the gallery removes it from that event page; it does not permanently delete the stored file, which might be reused by another event. Cancelling an edit leaves its already uploaded photos stored but does not publish them into the event.

Do not deploy only the public folder; the new media function is required. After deployment, test a two-photo upload, save the event, reopen it and check the gallery from your event link.
