import { json, slugify, readEvent, listAll } from "./_shared.mjs";

export default async req => {
  try {
    if (req.method !== "GET") return json({ error:"Method not allowed." },405);
    const slug = slugify(new URL(req.url).searchParams.get("slug") || "");
    const event = await readEvent(slug);
    if (!event || event.archived) return json({ error:"Event not found." },404);
    const allowed = new Set(event.recruiterIds || []);
    const recruiters = (await listAll("recruiter:"))
      .filter(r => r.active && allowed.has(r.id))
      .sort((a,b)=>String(a.name).localeCompare(String(b.name)))
      .map(({id,name})=>({id,name}));
    return json({ recruiters });
  } catch (error) {
    return json({ error:"Unable to load referral options.", details:error.message },500);
  }
};
