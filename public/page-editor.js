(()=>{
const root=document.getElementById('pageDesigner');
root.innerHTML=`<fieldset style="margin:24px 0"><legend>Design your event page</legend><label style="margin:14px 0">Build an event website<select data-page="enabled"><option value="false">Off — simple registration page</option><option value="true">On — full event website</option></select></label><div id="websiteOptions"><p>Leave optional sections empty to hide them. Save changes to update your existing link and QR code.</p><div class="form-grid">
<label>Heading above event title (optional)<input data-page="eyebrow" placeholder="Leave blank to hide" maxlength="80"></label><label>Registration button<input data-page="buttonText" placeholder="Save My Spot" maxlength="40"></label>
<label class="full">Headline override<input data-page="headline" placeholder="Leave blank to use the event name" maxlength="160"></label>
<label>Seasonal theme<select data-page="seasonalTheme">
<option value="none">None — use your color palette</option>
<option value="christmas">Christmas</option>
<option value="winter">Winter — midnight snow</option>
<option value="spring">Spring — garden blossoms</option>
<option value="summer">Summer — sun &amp; waves</option>
<option value="fall">Fall — autumn leaves</option>
<option value="halloween">Halloween — pumpkins at dusk</option>
<option value="new-year">New Year — midnight sparkles</option>
</select><span class="field-help">Seasonal themes set the page background and card colors. You can still pick an accent and add your own cover.</span></label>
<label id="seasonalVariantField" style="display:none">Seasonal look<select data-page="seasonalVariant"></select></label>
<label>Color palette<select data-page="palette"><option value="classic">Midnight &amp; Gold</option><option value="navy">Navy &amp; Ice Blue</option><option value="cream">Cream &amp; Navy</option><option value="charcoal">Charcoal &amp; Silver</option><option value="forest">Forest &amp; Champagne</option><option value="burgundy">Burgundy &amp; Rose</option><option value="terracotta">Terracotta &amp; Cream</option><option value="custom">Custom</option></select></label><label>Cover image shape<select data-page="coverShape"><option value="arch">Arched — current style</option><option value="square">Square crop</option><option value="full">Full image — no cropping</option><option value="circle">Circular crop</option></select></label><label>Theme<select data-page="theme"><option value="dark">Midnight / warm gold</option><option value="light">Cream / navy</option></select></label><label>Accent color<input data-page="accent" type="color" value="#d8b777"></label>
<label>Cover format<select data-page="coverType"><option value="image">Image</option><option value="video">Video</option></select></label><label class="full">Cover video link<input data-page="coverVideo" placeholder="https://…/clip.mp4"></label><label class="full">Upload a cover video (short clips auto-compress)<input id="coverVideoUpload" type="file" accept="video/*,.mov"><span id="coverVideoStatus" role="status"></span></label><p class="full">Cover videos loop silently behind the title. Add a cover photo below as a fallback. For longer clips, paste a direct MP4/WebM link. Keep this tab open during compression.</p><label class="full">Cover image URL<input data-page="cover" placeholder="https://…"></label><label class="full">Upload a cover photo (auto-resized)<input id="coverUpload" type="file" accept="image/*,.heic,.heif"><span id="coverUploadStatus" role="status"></span></label>
<label class="full">Video URL<input data-page="video" placeholder="YouTube, Vimeo, or direct HTTPS .mp4 / .webm"></label>
<label>Countdown<select data-page="countdown"><option value="true">Show countdown</option><option value="false">Hide countdown</option></select></label>
<label class="full">Highlights — one per line<textarea data-page="highlights" rows="3" placeholder="Drinks on us&#10;Meet the team&#10;Make new connections"></textarea></label>
<label class="full">Hosts — one per line: Name | Title | Photo URL<textarea data-page="hosts" rows="3" placeholder="Jane Smith | Your host | https://…"></textarea></label>
<label class="full">Agenda — one per line: Time | What's happening<textarea data-page="agenda" rows="3" placeholder="5:00 PM | Doors open&#10;5:30 PM | Meet the team"></textarea></label>
<div class="full"><h3>Event photo gallery</h3><button id="chooseGalleryPhotos" class="button secondary" type="button">Upload Photos</button><input id="galleryUpload" type="file" accept="image/*,.heic,.heif" multiple hidden><p>Select up to 20 JPG, PNG or WebP photos from your computer. Larger photos are resized automatically. Save the event to publish your gallery.</p><p id="galleryUploadStatus" role="status" aria-live="polite"></p><div id="galleryPreviews" class="gallery-editor-grid"></div><details><summary>Add or edit image links (optional)</summary><label>One image link per line<textarea data-page="gallery" rows="3"></textarea></label></details></div>
<label class="full">FAQs — one per line: Question | Answer<textarea data-page="faqs" rows="3" placeholder="Can I bring a guest? | Absolutely—have them register too."></textarea></label>
<label class="full">Parking / arrival instructions<textarea data-page="arrival" rows="3" maxlength="2000"></textarea></label>
</div><p>Section order — move sections up or down. Empty sections remain hidden.</p><div id="sectionOrder"></div><button class="button secondary" type="button" id="previewEventPage">Preview unsaved page ↗</button><p id="previewMessage" role="status"></p></div></fieldset>`;
const seasonalLooks = {
  christmas: ["Evergreen & Ivory", "Burgundy Gala", "Candlelit Evergreen", "Champagne Noel", "Black Tie Christmas"],
  winter: ["Midnight Snow", "Glacier Blue", "Alpine Lodge", "Silver Frost", "Twilight Pines"],
  spring: ["Garden Party", "Cherry Blossom", "Lavender Garden", "Fresh Sage", "Spring Citrus"],
  summer: ["Coastal Morning", "Golden Hour", "Palm Terrace", "Poolside Blue", "Mediterranean"],
  fall: ["Autumn Estate", "Cider & Copper", "Maple Evening", "Harvest Cream", "Woodland"],
  halloween: ["Velvet Dusk", "Midnight Masquerade", "Pumpkin & Copper", "Gothic Garden", "Moonlit Manor"],
  "new-year": ["Midnight Champagne", "Silver Soirée", "Art Deco Gold", "Rose Sparkle", "Emerald Countdown"]
};
const seasonalTheme = root.querySelector('[data-page="seasonalTheme"]');
const seasonalVariant = root.querySelector('[data-page="seasonalVariant"]');
function updateSeasonalLooks(value = "1") {
  const looks = seasonalLooks[seasonalTheme.value] ?? [];
  document.getElementById("seasonalVariantField").style.display = looks.length ? "" : "none";
  seasonalVariant.replaceChildren(...looks.map((name, index) => new Option(name, String(index + 1))));
  if (looks.length) seasonalVariant.value = looks[Number(value) - 1] ? value : "1";
}
seasonalTheme.onchange = () => updateSeasonalLooks();
let order=['highlights','video','hosts','agenda','gallery','faqs'];
function draw(){const box=document.getElementById('sectionOrder');box.replaceChildren();order.forEach((name,i)=>{const row=document.createElement('div');row.style='display:flex;gap:12px;align-items:center;margin-bottom:8px';const label=document.createElement('strong');label.textContent=name;label.style='min-width:100px;text-transform:capitalize';row.append(label);[-1,1].forEach(delta=>{const b=document.createElement('button');b.type='button';b.className='button secondary';b.textContent=delta<0?'↑':'↓';b.setAttribute('aria-label',`Move ${name} ${delta<0?'up':'down'}`);b.disabled=i+delta<0||i+delta>=order.length;b.onclick=()=>{[order[i],order[i+delta]]=[order[i+delta],order[i]];draw()};row.append(b)});box.append(row)})}
function updateVisibility(){document.getElementById("websiteOptions").hidden=root.querySelector('[data-page="enabled"]').value!=="true"}
root.querySelector('[data-page="enabled"]').onchange=updateVisibility;
window.pageEditor={read(){const p={sectionOrder:[...order]};root.querySelectorAll('[data-page]').forEach(el=>p[el.dataset.page]=['countdown','enabled'].includes(el.dataset.page)?el.value==='true':el.value);return p},set(p){root.querySelectorAll('[data-page]').forEach(el=>el.value=p[el.dataset.page]??({palette:'classic',seasonalTheme:'none',coverShape:'arch',coverType:'image',theme:'dark',accent:'#d8b777',countdown:true,enabled:false}[el.dataset.page]??''));updateSeasonalLooks(p.seasonalVariant);order=[...new Set([...(p.sectionOrder||[]),'highlights','video','hosts','agenda','gallery','faqs'])].filter(x=>['highlights','video','hosts','agenda','gallery','faqs'].includes(x));window.coverPhotoEditor?.reset();updateVisibility();draw();window.galleryEditor?.reset();window.videoEditor?.reset()}};
const coverInput = document.getElementById('coverUpload');
const coverStatus = document.getElementById('coverUploadStatus');
let coverUpload;
window.coverPhotoEditor = { reset() {
  coverUpload?.abort();
  coverUpload = undefined;
  coverInput.value = '';
  coverInput.disabled = false;
  coverStatus.textContent = '';
}};
coverInput.onchange = async () => {
  const file = coverInput.files[0];
  if (!file) return;
  const controller = new AbortController();
  coverUpload = controller;
  coverInput.disabled = true;
  coverStatus.textContent = 'Preparing and uploading photo…';
  try {
    const photo = await window.mediaPrep.preparePhoto(file);
    controller.signal.throwIfAborted();
    const url = await window.mediaPrep.uploadMedia(photo, controller.signal);
    controller.signal.throwIfAborted();
    root.querySelector('[data-page="cover"]').value = url;
    coverStatus.textContent = 'Photo uploaded. Save the event to publish it.';
  } catch (error) {
    if (!controller.signal.aborted) coverStatus.textContent = error.message;
  } finally {
    if (coverUpload === controller) {
      coverUpload = undefined;
      coverInput.disabled = false;
      coverInput.value = '';
    }
  }
};
function waitForCoverUpload(event) {
  if (!coverUpload) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  coverStatus.textContent = 'Wait for the cover photo to finish uploading.';
}
document.getElementById('eventForm').addEventListener('submit', waitForCoverUpload, true);
document.getElementById('previewEventPage').addEventListener('click', waitForCoverUpload, true);
document.getElementById('previewEventPage').onclick=()=>{const f=document.getElementById('eventForm'),e=Object.fromEntries(new FormData(f));e.page=window.pageEditor.read();try{localStorage.setItem('wclEventPreview',JSON.stringify(e));window.open('/event.html?preview=1','_blank','noopener');document.getElementById('previewMessage').textContent='Preview opened. Registration is disabled in previews.'}catch{document.getElementById('previewMessage').textContent='Preview could not open. Your browser may have blocked storage or popups.'}};
const palettes={classic:['dark','#d8b777'],navy:['dark','#9bd8f5'],cream:['light','#254660'],charcoal:['dark','#d4dce3'],forest:['dark','#e7d5a7'],burgundy:['dark','#f0becb'],terracotta:['light','#963e29']};
root.querySelector('[data-page="palette"]').onchange=e=>{const colors=palettes[e.target.value];if(colors){root.querySelector('[data-page="theme"]').value=colors[0];root.querySelector('[data-page="accent"]').value=colors[1]}};
root.querySelector('[data-page="theme"]').onchange=()=>root.querySelector('[data-page="palette"]').value='custom';
window.pageEditor.set({});
})();
