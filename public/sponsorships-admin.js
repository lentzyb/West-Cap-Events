(() => {
  const endpoint = "/.netlify/functions/sponsorships";
  const form = $("sponsorshipForm");
  const save = form.querySelector('button[type="submit"]');
  const cancel = $("cancelSponsorship");
  const filter = $("sponsorshipFilter");
  const refresh = $("refreshSponsorships");
  const message = $("sponsorshipMessage");
  const loadStatus = $("sponsorshipLoadStatus");
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  let events = [];
  let entries = [];
  let editing = null;
  let loading = false;
  let saving = false;

  function eventLabel(event) {
    return [event.name, event.date, event.archived ? "Archived" : ""].filter(Boolean).join(" · ");
  }

  function render() {
    const labels = new Map(events.map(event => [event.slug, eventLabel(event)]));
    const visible = entries.filter(entry => !filter.value || entry.eventSlug === filter.value);
    const cents = visible.reduce((total, entry) => total + entry.amountCents, 0);
    $("sponsorshipTotal").textContent = `${usd.format(cents / 100)} total · ${visible.length} contribution${visible.length === 1 ? "" : "s"}`;
    const rows = visible.map(entry => {
      const row = document.createElement("tr");
      for (const text of [entry.sponsor, labels.get(entry.eventSlug) ?? entry.eventName, usd.format(entry.amountCents / 100)]) {
        row.insertCell().textContent = text;
      }
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "button secondary";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", "Edit sponsorship for " + entry.sponsor);
      edit.onclick = () => {
        if (saving) return;
        editing = entry;
        form.elements.sponsor.value = entry.sponsor;
        form.elements.amount.value = (entry.amountCents / 100).toFixed(2);
        form.elements.eventSlug.value = entry.eventSlug;
        save.textContent = "Save changes";
        cancel.hidden = false;
        message.textContent = "";
        form.elements.sponsor.focus();
      };
      row.insertCell().append(edit);
      return row;
    });
    $("sponsorshipRows").replaceChildren(...rows);
  }

  window.loadSponsorships = async () => {
    if (loading || saving) return;
    loading = true;
    refresh.disabled = true;
    save.disabled = true;
    loadStatus.textContent = "Loading sponsorships…";
    try {
      const data = await api(endpoint);
      events = data.events.sort((a, b) => a.name.localeCompare(b.name));
      entries = data.entries;
      const eventField = form.elements.eventSlug;
      const selectedEvent = eventField.value;
      const selectedFilter = filter.value;
      const options = events.map(event => new Option(eventLabel(event), event.slug));
      const filterOptions = new Map(events.map(event => [event.slug, eventLabel(event)]));
      for (const entry of entries) {
        if (!filterOptions.has(entry.eventSlug)) filterOptions.set(entry.eventSlug, entry.eventName);
      }
      eventField.replaceChildren(new Option("Choose an event", ""), ...options);
      filter.replaceChildren(new Option("All events", ""), ...Array.from(filterOptions, ([slug, label]) => new Option(label, slug)));
      if (events.some(event => event.slug === selectedEvent)) eventField.value = selectedEvent;
      if (filterOptions.has(selectedFilter)) filter.value = selectedFilter;
      render();
      loadStatus.textContent = events.length ? "" : "Create the event in Events before adding a sponsorship.";
    } catch (error) {
      loadStatus.textContent = error.message;
    } finally {
      loading = false;
      refresh.disabled = false;
      save.disabled = !events.length;
    }
  };

  function resetEditor() {
    editing = null;
    form.reset();
    save.textContent = "Add sponsorship";
    cancel.hidden = true;
  }

  cancel.onclick = () => {
    resetEditor();
    message.textContent = "";
  };
  refresh.onclick = window.loadSponsorships;
  filter.onchange = render;

  form.onsubmit = async event => {
    event.preventDefault();
    if (loading || saving || !events.length) return;
    const body = Object.fromEntries(new FormData(form));
    const method = editing ? "PATCH" : "POST";
    if (editing) Object.assign(body, { id: editing.id, revision: editing.revision });
    saving = true;
    for (const control of form.elements) control.disabled = true;
    message.textContent = "Saving…";
    try {
      const { entry } = await api(endpoint, { method, body: JSON.stringify(body) });
      entries = [entry, ...entries.filter(item => item.id !== entry.id)];
      filter.value = entry.eventSlug;
      resetEditor();
      render();
      message.textContent = "Sponsorship saved.";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      saving = false;
      for (const control of form.elements) control.disabled = false;
    }
  };
})();
