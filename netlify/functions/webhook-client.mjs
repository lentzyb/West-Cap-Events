const cleanText = value => String(value ?? "").trim();

const validateWebhookUrl = rawUrl => {
  let url;
  try {
    url = new URL(cleanText(rawUrl));
  } catch {
    throw new Error("The Bonzo webhook URL is invalid.");
  }

  const hostname = url.hostname.toLowerCase();
  const isBonzoHost = hostname === "app.getbonzo.com" || hostname.endsWith(".getbonzo.com");
  if (url.protocol !== "https:" || !isBonzoHost) {
    throw new Error("Webhook URLs must be secure Bonzo URLs ending in getbonzo.com.");
  }

  return url.toString();
};

const extractError = async response => {
  const text = await response.text();
  if (!text) return `Bonzo webhook returned HTTP ${response.status}.`;

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.message === "string") return parsed.message;
    if (typeof parsed?.error === "string") return parsed.error;
    if (parsed?.errors && typeof parsed.errors === "object") {
      return Object.entries(parsed.errors)
        .map(([field, message]) => `${field}: ${Array.isArray(message) ? message.join(", ") : message}`)
        .join("; ");
    }
    return text;
  } catch {
    return text;
  }
};

export const sendBonzoWebhook = async ({ webhookUrl, registration }) => {
  const url = validateWebhookUrl(webhookUrl);

  const payload = {
    first_name: registration.firstName,
    last_name: registration.lastName,
    email: registration.email,
    phone: registration.phone,
    field_1: registration.nmlsId,
    field_2: registration.eventName,
    field_3: registration.referredBy,
    lead_source: `WCL Event Registration - ${registration.eventName}`
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const error = new Error(await extractError(response));
    error.status = response.status;
    throw error;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = { status: "ok" };
  }

  return { status: response.status, data };
};
