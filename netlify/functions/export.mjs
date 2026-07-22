import {
  json,
  requireAdmin,
  slugify,
  registrationPrefix,
  readEvent,
  listAll
} from "./_shared.mjs";

const csvCell = value => {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
};

export default async req => {
  try {
    if (req.method !== "GET") {
      return json({ error: "Method not allowed." }, 405);
    }

    const auth = requireAdmin(req);
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const slug = slugify(url.searchParams.get("slug") || "");
    if (!slug) return json({ error: "Event slug is required." }, 400);

    const event = await readEvent(slug);
    if (!event) return json({ error: "Event not found." }, 404);

    const registrations = await listAll(registrationPrefix(slug));
    registrations.sort((a, b) =>
      String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
    );

    const headers = [
      "First Name",
      "Last Name",
      "NMLS ID",
      "Phone",
      "Email",
      "Referred By",
      "Bonzo Sync",
      "Bonzo Error",
      "Registered At"
    ];

    const rows = registrations.map(item => [
      item.firstName,
      item.lastName,
      item.nmlsId,
      item.phone,
      item.email,
      item.referredBy,
      item.bonzoSync?.status || "",
      item.bonzoSync?.error || "",
      item.createdAt
    ]);

    const csv = [
      headers.map(csvCell).join(","),
      ...rows.map(row => row.map(csvCell).join(","))
    ].join("\r\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${slug}-registrations.csv"`,
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    console.error("export function error", error);
    return json(
      { error: "Unable to export registrations.", details: error.message },
      500
    );
  }
};
