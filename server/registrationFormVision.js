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
const MAX_OCR_TEXT_LENGTH = 50_000;
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
const FORM_OCR_PROMPT = [
  "Extract information from the OCR text for the FRONT and BACK of one Realtor registration form.",
  "Treat the two text sections as sides of the same form and combine their visible information.",
  "OCR may contain recognition mistakes. Use only information supported by the supplied text; do not guess or infer missing data.",
  "Return a JSON object with exactly two properties: values and uncertainFields.",
  "values must contain every requested field name with its value as a string; use an empty string when missing or unreadable.",
  "uncertainFields must be an array of exact field names whose reading is unclear or ambiguous.",
  "Preserve leading zeroes in phone and bank account numbers. Do not silently correct spellings.",
  "Write dates as YYYY-MM-DD only when unambiguous; otherwise preserve the visible date text.",
  "Use only the supplied OCR text. Do not include explanations or additional properties.",
  `Fields: ${REALTOR_FORM_FIELDS.join(" | ")}`
].join(" ");

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getVisionServiceError(cause) {
  if (cause.name === "TimeoutError" || cause.name === "APIConnectionTimeoutError") {
    return createHttpError("Form screening took too long. Try again with clearer or smaller photos.", 503);
  }

  if (cause.status === 401 || cause.status === 403) {
    return createHttpError("The form vision API key was rejected. Check FORM_VISION_API_KEY on the server.", 503);
  }

  if (cause.status === 404) {
    return createHttpError("The form vision model or API endpoint was not found. Check FORM_VISION_MODEL and FORM_VISION_API_URL.", 503);
  }

  if (cause.status === 429 && ["insufficient_quota", "credit_balance_exhausted"].includes(cause.code)) {
    return createHttpError("The form vision API account has no credits remaining. Add API credits or configure a funded vision API key.", 503);
  }

  if (cause.status === 429) {
    return createHttpError("The form vision service rate limit was reached. Wait a moment and try again.", 503);
  }

  if (cause.status === 400) {
    return createHttpError("The form vision service rejected the request. Check that the configured model supports image inputs and JSON responses.", 503);
  }

  return createHttpError("The form vision service could not be reached. Check FORM_VISION_API_URL and try again.", 503);
}

function getOllamaHost() {
  return (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");
}

function getVisionModel() {
  return process.env.FORM_VISION_MODEL || process.env.OLLAMA_VISION_MODEL || "qwen2.5vl:3b";
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

async function extractWithOllama(frontImage, backImage) {
  const model = getVisionModel();
  let response;
  try {
    response = await fetch(`${getOllamaHost()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(300_000),
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: "10m",
        format: "json",
        options: { temperature: 0 },
        messages: [{
          role: "user",
          content: FORM_VISION_PROMPT,
          images: [frontImage.split(",")[1], backImage.split(",")[1]]
        }]
      })
    });
  } catch (cause) {
    throw createHttpError(cause.name === "TimeoutError"
      ? "Local form screening took too long. Try again with clearer or smaller photos."
      : "Local Ollama is unavailable. Start Ollama on the app server and try again.", 503);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createHttpError(response.status === 404
      ? `The local Ollama model "${model}" is not installed. Pull it with: ollama pull ${model}`
      : "Local Ollama could not process the registration form.", 503);
  }

  return payload.message?.content;
}

async function extractWithOllamaText(frontText, backText) {
  if (!frontText.trim() || !backText.trim()) {
    throw createHttpError("Local OCR could not read both form sides. Try clearer photos.", 400);
  }
  if (frontText.length > MAX_OCR_TEXT_LENGTH || backText.length > MAX_OCR_TEXT_LENGTH) {
    throw createHttpError("The recognized form text is too long. Try clearer, more tightly cropped photos.", 413);
  }

  const model = process.env.OLLAMA_CHAT_MODEL || getVisionModel();
  let response;
  try {
    response = await fetch(`${getOllamaHost()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: "10m",
        format: "json",
        options: { temperature: 0, num_predict: 1200 },
        messages: [{
          role: "user",
          content: `${FORM_OCR_PROMPT}\n\nFRONT OCR TEXT:\n${frontText}\n\nBACK OCR TEXT:\n${backText}`
        }]
      })
    });
  } catch (cause) {
    throw createHttpError(cause.name === "TimeoutError"
      ? "Local Ollama took too long to organize the recognized text. Try again."
      : "Local Ollama is unavailable. Start Ollama on the app server and try again.", 503);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createHttpError(response.status === 404
      ? `The local Ollama model "${model}" is not installed. Pull it with: ollama pull ${model}`
      : "Local Ollama could not organize the recognized form text.", 503);
  }

  return payload.message?.content;
}

async function extractWithExternalVision(frontImage, backImage) {
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
    throw getVisionServiceError(cause);
  }

  return completion.choices?.[0]?.message?.content;
}

async function extractRegistrationForm(frontImageData, backImageData, frontText, backText) {
  const frontImage = decodeImage(frontImageData, "front");
  const backImage = decodeImage(backImageData, "back");
  const provider = (process.env.FORM_VISION_PROVIDER || "ollama").toLowerCase();
  let content;

  if (provider === "ollama") {
    if (frontText !== undefined || backText !== undefined) {
      if (typeof frontText !== "string" || typeof backText !== "string") {
        throw createHttpError("OCR text is required for both sides of the form.", 400);
      }
      content = await extractWithOllamaText(frontText.trim(), backText.trim());
    } else {
      content = await extractWithOllama(frontImage, backImage);
    }
  } else if (provider === "openai") {
    content = await extractWithExternalVision(frontImage, backImage);
  } else {
    throw createHttpError("FORM_VISION_PROVIDER must be set to ollama or openai.", 503);
  }

  return normalizeVisionResult(content);
}

module.exports = {
  REALTOR_FORM_FIELDS,
  extractRegistrationForm,
  normalizeVisionResult,
  MAX_IMAGE_BYTES
};
