const OpenAI = require("openai");

const REALTOR_FORM_FIELDS = [
  "REALTORS NAME",
  "DATE OF REG",
  "REALTOR ID NO",
  "GENDER",
  "DATE OF BIRTH",
  "ADDRESS OF REALTOR",
  "REALTOR PHONE NO",
  "REALTOR EMAIL ADDRESS",
  "COUNTRY OF LOCATION",
  "PLACE OF REG",
  "STATE CODE",
  "STATIONED CITY/LGA",
  "REG PAYMENT",
  "BANK A/C NO",
  "BANK A/C NAME",
  "BANK",
  "REALTOR NEXT OF KIN NAME",
  "NEXT OF KIN ADDRESS",
  "NEXT OF KIN PHONE NO",
  "REFEREE NAME",
  "REFEREE ID NO",
  "REFEREE PHONE NO",
  "REFEREE BANK NAME",
  "REFEREE BANK A/C NO",
  "REFEREE A/C NAME",
  "INCENTIVE PAYMENT (YES/NO)"
];

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const DEFAULT_VISION_API_URL = "https://api.openai.com/v1/chat/completions";
const FORM_VISION_PROMPT = [
  "Extract information from the FRONT and BACK images of one realtor registration form.",
  "Treat the two images as sides of the same form and combine their visible information.",
  "Use the supplied field list as a format guide only. No existing person records are provided; do not compare with or invent information from other records.",
  "Return a JSON object with exactly two properties: values and uncertainFields.",
  "values must contain every requested field name with its value as a string; use an empty string when missing or unreadable.",
  "uncertainFields must be an array of exact field names whose reading is unclear or ambiguous.",
  "Do not guess, infer missing data, or silently correct spellings. Preserve leading zeroes in phone and bank account numbers.",
  "Write dates as YYYY-MM-DD only when unambiguous; otherwise preserve the visible date text.",
  "Use only information visible in the images. Do not include explanations or additional properties.",
  `Fields: ${REALTOR_FORM_FIELDS.join(" | ")}`
].join(" ");

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function decodeImage(imageData, side) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(imageData || ""));
  if (!match) {
    throw createHttpError(`Upload a JPEG, PNG, or WebP image for the ${side} of the form.`, 400);
  }

  const imageSize = Buffer.byteLength(match[2], "base64");
  if (!imageSize || imageSize > MAX_IMAGE_BYTES) {
    throw createHttpError(`The ${side} image must be smaller than 3 MB after image compression.`, 413);
  }

  return `data:image/${match[1].toLowerCase()};base64,${match[2]}`;
}

function getVisionApiUrl() {
  const apiUrl = process.env.FORM_VISION_API_URL || DEFAULT_VISION_API_URL;
  let parsedUrl;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw createHttpError("FORM_VISION_API_URL must be a valid vision API URL.", 503);
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
    throw createHttpError("The form vision API must use HTTPS unless it is hosted locally.", 503);
  }
  parsedUrl.pathname = parsedUrl.pathname.replace(/\/chat\/completions\/?$/, "") || "/";
  parsedUrl.search = "";
  parsedUrl.hash = "";
  return parsedUrl.toString().replace(/\/$/, "");
}

function normalizeVisionResult(content) {
  let result;
  try {
    result = JSON.parse(content || "");
  } catch {
    throw createHttpError("The form vision AI returned unreadable results. Try clearer photos.", 502);
  }

  if (!result || typeof result !== "object" || !result.values || typeof result.values !== "object" || Array.isArray(result.values)) {
    throw createHttpError("The form vision AI returned results in an unsupported format. Try again.", 502);
  }

  const values = Object.fromEntries(REALTOR_FORM_FIELDS.map((field) => {
    const value = result.values[field];
    return [field, value === null || value === undefined ? "" : String(value).trim()];
  }));
  const uncertain = new Set(Array.isArray(result.uncertainFields) ? result.uncertainFields : []);
  const uncertainFields = REALTOR_FORM_FIELDS.filter((field) => uncertain.has(field));

  return { values, uncertainFields };
}

async function extractRegistrationForm(frontImageData, backImageData) {
  const frontImage = decodeImage(frontImageData, "front");
  const backImage = decodeImage(backImageData, "back");
  const apiKey = process.env.FORM_VISION_API_KEY;
  if (!apiKey) {
    throw createHttpError("Form screening is not configured. Set FORM_VISION_API_KEY on the server.", 503);
  }

  let completion;
  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: getVisionApiUrl(),
      timeout: 120_000,
      maxRetries: 0,
      fetch: globalThis.fetch
    });
    completion = await openai.chat.completions.create({
      model: process.env.FORM_VISION_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: FORM_VISION_PROMPT },
          { type: "image_url", image_url: { url: frontImage, detail: "high" } },
          { type: "image_url", image_url: { url: backImage, detail: "high" } }
        ]
      }]
    });
  } catch (cause) {
    throw createHttpError(cause.name === "TimeoutError"
      ? "Form screening took too long. Try again with clearer or smaller photos."
      : "The configured form vision service is unavailable. Check its server URL and try again.", 503);
  }

  return normalizeVisionResult(completion.choices?.[0]?.message?.content);
}

module.exports = {
  REALTOR_FORM_FIELDS,
  extractRegistrationForm,
  normalizeVisionResult,
  MAX_IMAGE_BYTES
};
