const baseUrl = () => (process.env.BONZO_API_BASE_URL || "https://app.getbonzo.com/api").replace(/\/+$/, "");
const createPath = () => process.env.BONZO_CREATE_PROSPECT_PATH || "/v3/prospects/create-or-update-and-message";

export const bonzoConfigured = () => Boolean(process.env.BONZO_API_TOKEN);

const parseResponse = async response => {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { raw: text.slice(0, 2000) }; }
};

export async function createBonzoProspect({ registration, recruiterEmail }) {
  const token = process.env.BONZO_API_TOKEN || "";
  if (!token) throw new Error("BONZO_API_TOKEN is not configured.");
  if (!recruiterEmail) throw new Error("The selected team member does not have a Bonzo email address.");

  // Bonzo's create-or-update endpoint upserts the prospect and assigns ownership
  // through the assigned_to field. The value must match the user's Bonzo email.
  const payload = {
    first_name: registration.firstName,
    last_name: registration.lastName,
    email: registration.email,
    phone: registration.phone,
    assigned_to: recruiterEmail,
    source: `WCL Event: ${registration.eventName}`,
    external_id: registration.id,
    notes: [
      `Event: ${registration.eventName}`,
      `NMLS ID: ${registration.nmlsId}`,
      `Invited by: ${registration.referredBy}`
    ].join("\n")
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${baseUrl()}${createPath()}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await parseResponse(response);
    if (!response.ok) {
      const apiMessage = data?.message || data?.error || data?.errors || data?.raw;
      const message = typeof apiMessage === "string"
        ? apiMessage
        : apiMessage
          ? JSON.stringify(apiMessage)
          : `Bonzo returned HTTP ${response.status}.`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return { status: response.status, data };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Bonzo did not respond within 15 seconds.");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
