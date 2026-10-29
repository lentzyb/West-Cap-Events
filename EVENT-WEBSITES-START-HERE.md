# Event website builder

## Update your existing Netlify site

This is a complete source update for the existing Netlify project. Keep the same Netlify site, environment variables, and Blobs store. No data migration is needed. The storage name and existing registration/integration functions are unchanged.

If GitHub is connected: unzip this package, replace the corresponding project files in the connected repository, commit, and push. Netlify runs `npm run build`, publishes `public`, and deploys `netlify/functions` using the included netlify.toml.

If you previously deployed using the Netlify CLI: run `npm install`, then `npx netlify deploy --build --prod` from this extracted folder linked to the SAME Netlify site.

Do not drag only the public folder onto Netlify: this update also needs the updated Events function and its helper. A static drag-and-drop upload alone will not build/deploy those functions.

## Create a page

1. Open Admin, then create or edit an event.
2. Under Design your event page, switch Build an event website to On.
3. Add an optional cover image (upload JPG/PNG/WebP under 1 MB or paste an HTTPS image URL), video, headline, button text, theme, and accent color.
4. Add highlights, hosts, agenda, gallery, FAQs, and arrival details as desired. Empty sections are hidden. Move sections using the arrow buttons.
5. Preview unsaved page. Preview opens in a new tab on this browser with registration disabled.
6. Select team members and campaigns as usual, then save the event. Its existing link and QR code open the page.

Leave the option Off for a simple registration page. Existing events default to Off. Duplicate Event copies its design and still lets you review routes and change date/time/slug.

Use YouTube/Vimeo links or direct HTTPS MP4/WebM videos; other video URLs open as links. Videos do not autoplay. Hosts use Name | Title | Photo URL per line. Agenda uses Time | Description per line. FAQs use Question | Answer per line. Gallery uses an HTTPS image URL per line. These optional photos and videos load from their configured providers.

Registration confirmation includes an event calendar file and a share button. Calendar and countdown use the event time zone, including daylight saving time.

## Verification

Build and JavaScript syntax checks passed. Mocked backend checks covered create/edit, page persistence, existing campaign routing, public webhook exclusion, and archive behavior. Countdown/calendar timestamp checks covered Central summer and winter offsets. Browser checks covered website toggle, unsaved preview, rendered sections and layout.

Live Bonzo, Calendly, and Monday services were not called. After deployment, use a test event and your own test registration to verify the complete live flow. Those integration endpoints remain unchanged.
