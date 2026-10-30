# Cover videos, photo crops and color palettes

Deploy this full package to the same Netlify site, including functions. All previous event pages, QR codes, Monday Hires/source reporting, notifications, photo uploads and sticky registration fixes are included.

In the event editor:

- **Cover format:** Image or Video.
- **Cover video link:** a direct HTTPS MP4 or WebM link. YouTube/Vimeo links still belong in the separate Video URL section; they are not background cover clips.
- **Upload a cover video:** choose MP4 or WebM up to 4 MB. Use a compressed short clip or a hosted direct video link for a larger file. Uploads are stored with your site and persist across redeploys of the same Netlify site.
- **Cover image:** also acts as the fallback when a video cannot load or autoplay. Videos loop muted, have Play/Pause controls, and do not autoplay when reduced motion or data-saving preferences are detected.
- **Cover image shape:** current arch, square crop, full image without cropping, or circular crop. Shapes apply to image covers; video covers use the wide background layout.
- **Color palette:** Midnight & Gold, Navy & Ice Blue, Cream & Navy, Charcoal & Silver, Forest & Champagne, Burgundy & Rose, Terracotta & Cream, or Custom. Custom accent color and light/dark controls remain available. Button text contrast adjusts to the accent color.

Preview the event, then save it to publish the changes to its existing link. Video upload must finish before you save or preview. Background clips are decorative; place videos requiring audio in the separate video section.

Local tests covered video upload validation, persisted settings, byte-range playback responses and image backward compatibility. Browser testing with a generated sample clip verified looping muted playback, the cover overlay and the pause control. Live Netlify upload/playback should be checked after deployment.
