(() => {
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  function snapshot(entries, events, slug) {
    const rows = entries.filter(entry => !entry.deleted && (!slug || entry.eventSlug === slug));
    const confirmed = rows.filter(entry => (entry.status ?? 'confirmed') === 'confirmed');
    const sum = list => list.reduce((total, entry) => total + (Number(entry.amountCents) || 0), 0);
    const paid = confirmed.filter(entry => entry.invoiceStatus === 'paid');
    const sent = confirmed.filter(entry => entry.invoiceStatus === 'sent');
    const unbilled = confirmed.filter(entry => !entry.invoiceStatus || entry.invoiceStatus === 'not_sent');
    const waiting = rows.filter(entry => entry.status === 'waiting');
    return {
      title: slug ? events.find(event => event.slug === slug)?.name || rows[0]?.eventName || slug : 'All events',
      rows, confirmed: confirmed.length, waiting: waiting.length, declined: rows.filter(entry => entry.status === 'declined').length,
      committed: sum(confirmed), paid: sum(paid), sent: sum(sent), unbilled: sum(unbilled), pipeline: sum(waiting)
    };
  }
  function render(data, now = new Date()) {
    const statuses = { confirmed: 'Confirmed', waiting: 'Waiting to hear back', declined: 'Declined' };
    const invoices = { paid: 'Paid', sent: 'Invoice sent', not_sent: 'Not sent' };
    const rank = { confirmed: 0, waiting: 1, declined: 2 };
    const sorted = [...data.rows].sort((a, b) => (rank[a.status ?? 'confirmed'] - rank[b.status ?? 'confirmed']) || ((b.amountCents || 0) - (a.amountCents || 0)) || a.sponsor.localeCompare(b.sponsor));
    const shown = sorted.slice(0, 24);
    const dollars = cents => money.format(cents / 100);
    const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(now);
    const metric = (label, value) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
    return `<header><div class="brand">WEST CAPITAL LENDING</div><h1>Sponsorship summary</h1><h2>${escape(data.title)}</h2><p>As of ${escape(date)} Eastern</p></header>
      <section class="metrics">${metric('Confirmed commitments', dollars(data.committed))}${metric('Paid', dollars(data.paid))}${metric('Outstanding', dollars(data.committed - data.paid))}</section>
      <section class="collection"><span><b>${dollars(data.sent)}</b> invoiced, awaiting payment</span><span><b>${dollars(data.unbilled)}</b> still to invoice</span></section>
      <section class="pipeline"><strong>${data.confirmed} confirmed</strong><span>${data.waiting} waiting to hear back · ${dollars(data.pipeline)} potential</span><span>${data.declined} declined</span></section>
      <h3>Sponsor commitments &amp; next steps</h3>
      <table><thead><tr><th>Sponsor</th><th>Event</th><th>Contribution</th><th>Status / next step</th></tr></thead><tbody>${shown.map(entry => {
        const status = entry.status ?? 'confirmed';
        const invoice = entry.invoiceStatus ?? 'not_sent';
        const next = status === 'confirmed' ? invoice === 'paid' ? 'Paid' : invoice === 'sent' ? 'Follow up on payment' : 'Send invoice' : status === 'waiting' ? 'Awaiting response' : 'Declined';
        return `<tr><td><b>${escape(entry.sponsor)}</b></td><td>${escape(entry.eventName)}</td><td class="amount">${entry.amountCents == null ? 'TBD' : dollars(entry.amountCents)}${status === 'waiting' && entry.amountCents != null ? ' potential' : ''}</td><td>${escape(statuses[status] || status)}${status === 'confirmed' ? ' · ' + escape(invoices[invoice] || invoice) : ''}<small>${escape(next)}</small></td></tr>`;
      }).join('') || '<tr><td colspan="4">No sponsorships for this selection.</td></tr>'}</tbody></table>
      ${sorted.length > shown.length ? `<p class="note">Showing ${shown.length} of ${sorted.length} sponsors, ordered by status and contribution. Totals include all ${sorted.length}. Use the event filter for a more detailed summary.</p>` : ''}
      <footer>Outstanding includes confirmed commitments only. Potential contributions are excluded from confirmed totals. Payment and invoice statuses reflect your saved tracker entries.</footer>`;
  }
  window.sponsorSummary = { snapshot, render };
  window.openSponsorSummary = async slug => {
    const preview = window.open('', '_blank');
    if (!preview) throw Error('Allow pop-ups to open the sponsorship summary.');
    preview.opener = null;
    preview.document.title = 'Sponsorship summary';
    preview.document.body.textContent = 'Preparing your sponsorship summary…';
    try {
      const fresh = await api('/.netlify/functions/sponsorships');
      const data = snapshot(fresh.entries, fresh.events, slug);
      const style = preview.document.createElement('style');
      style.textContent = `*{box-sizing:border-box}body{margin:0;background:#edf1f5;color:#19354e;font:12px Arial,sans-serif}.toolbar{max-width:760px;margin:20px auto;display:flex;align-items:center;gap:16px}.toolbar button{border:0;border-radius:6px;background:#19354e;color:white;padding:12px 20px;font-weight:bold;cursor:pointer}.sheet{width:7.5in;min-height:10in;margin:0 auto 24px;background:white;padding:26px 30px;box-shadow:0 4px 22px #19354e18}header{border-bottom:3px solid #c4a66a;padding-bottom:12px}.brand{font-size:10px;letter-spacing:2px;font-weight:bold}h1{font-size:27px;margin:10px 0 5px}h2{font-size:16px;margin:0}header p{color:#667786;font-size:10px;margin:6px 0 0}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:17px 0 12px}.metric{background:#f3f6f8;border:1px solid #dce4e9;padding:13px 10px;border-radius:6px}.metric span{display:block;font-size:10px;color:#586d7b}.metric strong{display:block;font-size:23px;margin-top:6px}.collection{display:flex;justify-content:space-between;gap:12px;font-size:11px}.pipeline{display:flex;justify-content:space-between;gap:10px;padding:12px 0;margin-top:10px;border-top:1px solid #dce4e9;border-bottom:1px solid #dce4e9;font-size:11px}h3{font-size:13px;margin:17px 0 9px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}th{text-align:left;background:#19354e;color:white;padding:7px 6px}td{border-bottom:1px solid #e2e7eb;padding:6px;overflow-wrap:anywhere;vertical-align:top}th:first-child{width:25%}th:nth-child(2){width:23%}th:nth-child(3){width:19%}td small{display:block;color:#677987;font-size:9px;margin-top:2px}.amount{white-space:normal}.note,footer{font-size:9px;color:#687985;line-height:1.4}footer{border-top:1px solid #dce4e9;margin-top:14px;padding-top:8px}@page{size:letter portrait;margin:.5in}@media print{body{background:white}.toolbar{display:none}.sheet{margin:0;padding:10px 14px;width:100%;min-height:0;box-shadow:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid}}`;
      preview.document.head.append(style);
      preview.document.body.innerHTML = '<div class="toolbar"><button type="button">Print / Save as PDF</button><span>Choose “Save as PDF” in the print window to export.</span></div><main class="sheet">' + render(data) + '</main>';
      const sheet = preview.document.querySelector('.sheet');
      preview.onbeforeprint = () => { sheet.style.zoom = String(Math.min(1, 920 / sheet.scrollHeight)); };
      preview.onafterprint = () => { sheet.style.zoom = ''; };
      preview.document.querySelector('button').onclick = () => preview.print();
    } catch (error) {
      preview.document.body.textContent = 'Unable to prepare summary. ' + error.message;
      throw error;
    }
  };
})();
