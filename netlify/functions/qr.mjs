import QRCode from "qrcode";
import { json, requireAdmin, slugify, readEvent } from "./_shared.mjs";

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

    const siteUrl = process.env.URL || url.origin;
    const registrationUrl = `${siteUrl.replace(/\/$/, "")}/event/${slug}`;
    const svg = await QRCode.toString(registrationUrl, {
      type: "svg",
      margin: 2,
      width: 900,
      errorCorrectionLevel: "H"
    });

    return new Response(svg, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-disposition": `inline; filename="${slug}-qr.svg"`,
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    console.error("qr function error", error);
    return json(
      { error: "Unable to generate QR code.", details: error.message },
      500
    );
  }
};
