const express = require("express");
const { readRecords, writeRecords, normalize, importCsvRecords } = require("./googleSheets");
const { REALTOR_FORM_FIELDS, extractRegistrationForm } = require("./registrationFormVision");
const {
  readProperties,
  updateProperties,
  filterProperties,
  createProperty,
  updatePropertyStatus,
  deleteProperty
} = require("./properties");

const router = express.Router();
const ADMIN_NAME = process.env.ADMIN_NAME || "ONOJA PAUL";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "12345";
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "qwen2.5vl:3b";

function getOllamaHost() {
  return (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");
}

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY || "";
}

function getOpenAiModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}
const imageExtractionRequests = new Map();
const formScreeningRequests = new Map();
const propertySubmissionRequests = new Map();

function isImageExtractionRateLimited(req) {
  const now = Date.now();
  const address = req.ip || req.socket?.remoteAddress || "unknown";
  const current = imageExtractionRequests.get(address);

  if (!current || current.expiresAt <= now) {
    imageExtractionRequests.set(address, { count: 1, expiresAt: now + 60_000 });
    return false;
  }
  if (current.count >= 10) return true;

  current.count += 1;
  return false;
}

async function askAiAssistant(records, prompt) {
  const cleanedPrompt = String(prompt || "").trim();
  if (!cleanedPrompt) {
    const error = new Error("A message is required.");
    error.status = 400;
    throw error;
  }

  const recordsForContext = Array.isArray(records) ? records.slice(0, 50) : [];
  const recordContext = recordsForContext.length
    ? JSON.stringify(recordsForContext, null, 2)
    : "No realtor records are available yet.";

  const aiChatProvider = process.env.AI_CHAT_PROVIDER || "ollama";
  if (aiChatProvider === "openai") {
    const openAiApiKey = getOpenAiApiKey();
    if (!openAiApiKey) {
      const error = new Error("OPENAI_API_KEY is required when AI_CHAT_PROVIDER is set to openai.");
      error.status = 503;
      throw error;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "You are an AI assistant for a realtor referral app. Use the supplied records as context, answer concisely, and do not invent facts. If the data is missing, say so clearly."
          },
          {
            role: "user",
            content: `Current realtor records:\n${recordContext}\n\nUser request: ${cleanedPrompt}`
          }
        ]
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || "ChatGPT is unavailable right now.");
      error.status = response.status || 500;
      throw error;
    }

    const answer = payload?.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("ChatGPT returned an empty answer.");
    }

    return answer;
  }

  if (aiChatProvider !== "ollama") {
    const error = new Error("AI_CHAT_PROVIDER must be set to ollama or openai.");
    error.status = 503;
    throw error;
  }

  let ollamaResponse;
  try {
    ollamaResponse = await fetch(`${getOllamaHost()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model: process.env.OLLAMA_CHAT_MODEL || "qwen2.5vl:3b",
        stream: false,
        messages: [
          {
            role: "user",
            content: `Use these realtor records as context, then answer the question.\n\nRecords:\n${recordContext}\n\nQuestion: ${cleanedPrompt}`
          }
        ]
      })
    });
  } catch (cause) {
    const error = new Error(cause.name === "TimeoutError"
      ? "Local AI took too long to respond. The model may still be loading; try again."
      : "Local Ollama is unavailable. Start Ollama and try again.");
    error.status = 503;
    throw error;
  }

  const ollamaPayload = await ollamaResponse.json().catch(() => ({}));
  if (!ollamaResponse.ok) {
    const error = new Error(ollamaPayload?.error || "AI assistant is unavailable. Add an OpenAI API key or start Ollama.");
    error.status = 503;
    throw error;
  }

  const answer = ollamaPayload?.message?.content?.trim();
  if (!answer) {
    throw new Error("No answer returned by the local AI model.");
  }

  return answer;
}

async function extractRealtorImage(imageData) {
  const imageMatch = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(imageData || ""));
  if (!imageMatch) {
    const error = new Error("Upload a JPEG, PNG, or WebP image.");
    error.status = 400;
    throw error;
  }

  const imageBuffer = Buffer.from(imageMatch[2], "base64");
  if (!imageBuffer.length || imageBuffer.length > 5 * 1024 * 1024) {
    const error = new Error("The image must be smaller than 5 MB.");
    error.status = 413;
    throw error;
  }

  const prompt = [
    "Read this realtor registration form image and extract only information visibly written or printed.",
    "Return one JSON object using exactly the requested field names and string values.",
    "Use an empty string when a value is absent or unclear. Do not guess. Preserve leading zeroes in phone and account numbers.",
    "Write dates as YYYY-MM-DD only when unambiguous; otherwise use the visible date text.",
    `Fields: ${REALTOR_FORM_FIELDS.join(" | ")}`
  ].join(" ");

  let response;
  try {
    response = await fetch(`${getOllamaHost()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: OLLAMA_VISION_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        messages: [{ role: "user", content: prompt, images: [imageMatch[2]] }]
      })
    });
  } catch (cause) {
    const error = new Error(cause.name === "TimeoutError"
      ? "Local AI took too long to read this image. Try again or use local OCR."
      : "Local AI is unavailable. Start Ollama and try again.");
    error.status = 503;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(response.status === 404
      ? `The ${OLLAMA_VISION_MODEL} model is not available in Ollama.`
      : "Local AI could not process this image.");
    error.status = 503;
    throw error;
  }

  const result = await response.json();
  let parsed;
  try {
    parsed = JSON.parse(result.message?.content || "{}");
  } catch {
    const error = new Error("Local AI returned unreadable results. Try another photo.");
    error.status = 502;
    throw error;
  }

  const values = {};
  REALTOR_FORM_FIELDS.forEach((field) => {
    const value = parsed[field];
    values[field] = value === null || value === undefined ? "" : String(value).trim();
  });
  return values;
}

function isFormScreeningRateLimited(req) {
  const now = Date.now();
  const address = req.ip || req.socket?.remoteAddress || "unknown";
  for (const [key, request] of formScreeningRequests) {
    if (request.expiresAt <= now) formScreeningRequests.delete(key);
  }

  const current = formScreeningRequests.get(address);
  if (!current || current.expiresAt <= now) {
    formScreeningRequests.set(address, { count: 1, expiresAt: now + 60_000 });
    return false;
  }
  if (current.count >= 5) return true;

  current.count += 1;
  return false;
}

function generateNextRealtorId(rows) {
  const ids = (rows || [])
    .map((row) => row["REALTOR ID NO"])
    .filter((id) => typeof id === "string" && /^R-\d+$/.test(id.trim()))
    .map((id) => Number(id.trim().replace(/^R-/, "")))
    .filter((value) => Number.isFinite(value));

  const nextNumber = ids.length ? Math.max(...ids, 1000) + 1 : 1001;
  return `R-${nextNumber}`;
}

function isValidAdminCredentials(adminName, adminPassword) {
  return normalize(adminName) === normalize(ADMIN_NAME) && String(adminPassword || "") === ADMIN_PASSWORD;
}

async function createRealtorRecord(input) {
  const record = { ...(input || {}) };
  const records = await readRecords();

  if (!record["REALTORS NAME"] || !record["REALTOR PHONE NO"]) {
    return { status: 400, body: { error: "REALTORS NAME and REALTOR PHONE NO are required" } };
  }

  if (!record["REALTOR ID NO"] || !/^R-\d+$/.test(String(record["REALTOR ID NO"]).trim())) {
    record["REALTOR ID NO"] = generateNextRealtorId(records);
  }

  const duplicate = records.find((entry) => {
    return normalize(entry["REALTOR PHONE NO"]) === normalize(record["REALTOR PHONE NO"]) ||
      normalize(entry["REALTOR EMAIL ADDRESS"]) === normalize(record["REALTOR EMAIL ADDRESS"] || "");
  });

  if (duplicate) {
    return { status: 409, body: { error: "A realtor with this phone number or email already exists" } };
  }

  records.push(record);
  await writeRecords(records);
  return { status: 201, body: { record } };
}

function resolveLoginUser(records, loginValue, role) {
  const matcher = normalize(loginValue || "");

  if (!matcher) {
    return null;
  }

  if (role === "referrer") {
    const referrerMatch = records.find((record) => normalize(record["REFEREE PHONE NO"]) === matcher);
    if (!referrerMatch) {
      return null;
    }

    return {
      role: "referrer",
      name: referrerMatch["REFEREE NAME"] || "Referrer",
      phone: referrerMatch["REFEREE PHONE NO"],
      email: referrerMatch["REFEREE EMAIL ADDRESS"] || "",
      refereePhone: referrerMatch["REFEREE PHONE NO"]
    };
  }

  const realtorMatch = records.find((record) => {
    return normalize(record["REALTOR PHONE NO"]) === matcher || normalize(record["REALTOR EMAIL ADDRESS"]) === matcher;
  });

  if (!realtorMatch) {
    return null;
  }

  return {
    role: role || "realtor",
    name: realtorMatch["REALTORS NAME"],
    phone: realtorMatch["REALTOR PHONE NO"],
    email: realtorMatch["REALTOR EMAIL ADDRESS"],
    refereePhone: realtorMatch["REFEREE PHONE NO"]
  };
}

function getReferrerRows(records, phone) {
  const referrerPhone = normalize(phone || "");

  return (records || [])
    .filter((record) => normalize(record["REFEREE PHONE NO"]) === referrerPhone)
    .map((record) => ({
      "REALTORS NAME": record["REALTORS NAME"],
      "REALTOR PHONE NO": record["REALTOR PHONE NO"]
    }));
}

function isPropertySubmissionRateLimited(req) {
  const now = Date.now();
  const address = req.ip || req.socket?.remoteAddress || "unknown";
  for (const [key, request] of propertySubmissionRequests) {
    if (request.expiresAt <= now) propertySubmissionRequests.delete(key);
  }

  const current = propertySubmissionRequests.get(address);
  if (!current || current.expiresAt <= now) {
    propertySubmissionRequests.set(address, { count: 1, expiresAt: now + 60_000 });
    return false;
  }
  if (current.count >= 5) return true;
  current.count += 1;
  return false;
}

function sendPropertyError(res, error, fallback) {
  const status = error.status || 500;
  if (status >= 500) console.error(fallback, error);
  return res.status(status).json({ error: error.message || fallback });
}

router.get("/properties", async (req, res) => {
  try {
    const properties = await readProperties();
    return res.json({ properties: filterProperties(properties, req.query) });
  } catch (error) {
    return sendPropertyError(res, error, "Unable to load property listings.");
  }
});

router.post("/properties/submissions", async (req, res) => {
  if (isPropertySubmissionRateLimited(req)) {
    return res.status(429).json({ error: "Too many property submissions. Try again in a minute." });
  }

  try {
    const realtorPhone = normalize(req.body?.realtorPhone);
    const records = await readRecords();
    const realtor = records.find((record) => normalize(record["REALTOR PHONE NO"]) === realtorPhone);
    if (!realtor) {
      return res.status(403).json({ error: "Only registered realtors can submit property listings." });
    }

    const property = createProperty(req.body?.property, {
      name: realtor["REALTORS NAME"],
      phone: realtor["REALTOR PHONE NO"],
      email: realtor["REALTOR EMAIL ADDRESS"]
    }, "pending");
    await updateProperties((properties) => {
      properties.push(property);
      return property;
    });
    return res.status(201).json({
      property,
      message: "Your listing was submitted for review and is not yet public."
    });
  } catch (error) {
    return sendPropertyError(res, error, "Unable to submit this property listing.");
  }
});

router.post("/properties/admin/list", async (req, res) => {
  const { adminName, adminPassword } = req.body || {};
  if (!isValidAdminCredentials(adminName, adminPassword)) {
    return res.status(401).json({ error: "Admin credentials are required to manage property listings." });
  }

  try {
    return res.json({ properties: await readProperties() });
  } catch (error) {
    return sendPropertyError(res, error, "Unable to load property listings.");
  }
});

router.post("/properties/admin", async (req, res) => {
  const { adminName, adminPassword } = req.body || {};
  if (!isValidAdminCredentials(adminName, adminPassword)) {
    return res.status(401).json({ error: "Admin credentials are required to publish a property listing." });
  }

  try {
    const property = createProperty(req.body?.property, {
      name: req.body?.agentName,
      phone: req.body?.agentPhone,
      email: req.body?.agentEmail
    }, "approved");
    await updateProperties((properties) => {
      properties.push(property);
      return property;
    });
    return res.status(201).json({ property });
  } catch (error) {
    return sendPropertyError(res, error, "Unable to publish this property listing.");
  }
});

router.post("/properties/admin/:id/review", async (req, res) => {
  const { adminName, adminPassword, status } = req.body || {};
  if (!isValidAdminCredentials(adminName, adminPassword)) {
    return res.status(401).json({ error: "Admin credentials are required to review property listings." });
  }

  try {
    const property = await updateProperties((properties) => updatePropertyStatus(properties, req.params.id, status));
    if (!property) return res.status(404).json({ error: "Property listing not found." });
    return res.json({ property });
  } catch (error) {
    return sendPropertyError(res, error, "Unable to review this property listing.");
  }
});

router.post("/properties/admin/:id/delete", async (req, res) => {
  const { adminName, adminPassword } = req.body || {};
  if (!isValidAdminCredentials(adminName, adminPassword)) {
    return res.status(401).json({ error: "Admin credentials are required to delete property listings." });
  }

  try {
    const deleted = await updateProperties((properties) => deleteProperty(properties, req.params.id));
    if (!deleted) return res.status(404).json({ error: "Property listing not found." });
    return res.json({ success: true });
  } catch (error) {
    return sendPropertyError(res, error, "Unable to delete this property listing.");
  }
});

router.post("/login", async (req, res) => {
  const { loginValue, role, adminName, adminPassword } = req.body || {};

  if (role === "admin") {
    if (!isValidAdminCredentials(adminName, adminPassword)) {
      return res.status(401).json({ error: "Invalid admin name or password" });
    }

    return res.json({
      user: {
        role: "admin",
        name: ADMIN_NAME,
        phone: "ADMIN",
        email: "admin@local",
        refereePhone: ""
      }
    });
  }

  const records = await readRecords();

  if (!loginValue) {
    return res.status(400).json({ error: "loginValue is required" });
  }

  const resolvedUser = resolveLoginUser(records, loginValue, role);

  if (!resolvedUser) {
    return res.status(401).json({ error: "Invalid login details" });
  }

  return res.json({ user: resolvedUser });
});

router.post("/realtors", async (req, res) => {
  const result = await createRealtorRecord(req.body);
  return res.status(result.status).json(result.body);
});

router.post("/realtors/import", async (req, res) => {
  const csvText = String(req.body?.csv || "");

  if (!csvText.trim()) {
    return res.status(400).json({ error: "CSV content is required" });
  }

  try {
    const rows = await importCsvRecords(csvText);
    return res.json({ rows });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Unable to import CSV" });
  }
});

router.post("/realtors/extract-image", async (req, res) => {
  if (isImageExtractionRateLimited(req)) {
    return res.status(429).json({ error: "Too many image requests. Try again in a minute." });
  }

  try {
    const values = await extractRealtorImage(req.body?.imageData);
    return res.json({ values });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Unable to extract this image" });
  }
});

router.post("/realtors/screen-registration-form", async (req, res) => {
  if (isFormScreeningRateLimited(req)) {
    return res.status(429).json({ error: "Too many form screening requests. Try again in a minute." });
  }

  const { adminName, adminPassword } = req.body || {};
  if (!isValidAdminCredentials(adminName, adminPassword)) {
    return res.status(401).json({ error: "Admin credentials are required to screen a registration form." });
  }

  try {
    const { values, uncertainFields } = await extractRegistrationForm(
      req.body?.frontImageData,
      req.body?.backImageData,
      req.body?.frontText,
      req.body?.backText
    );
    return res.json({ values, uncertainFields });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Unable to screen this registration form." });
  }
});

router.post("/realtors/screen-registration-form/save", async (req, res) => {
  const { adminName, adminPassword, record } = req.body || {};
  if (!isValidAdminCredentials(adminName, adminPassword)) {
    return res.status(401).json({ error: "Admin credentials are required to save a screened Realtor record." });
  }

  const result = await createRealtorRecord(record);
  return res.status(result.status).json(result.body);
});

router.post("/ai/chat", async (req, res) => {
  const { prompt, rows } = req.body || {};

  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: "A prompt is required." });
  }

  try {
    const records = Array.isArray(rows) && rows.length ? rows : await readRecords();
    const answer = await askAiAssistant(records, String(prompt).trim());
    return res.json({ answer });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Unable to generate an AI response." });
  }
});

router.put("/realtors/:id", async (req, res) => {
  const index = Number(req.params.id);
  const record = req.body || {};
  const records = await readRecords();

  if (!Number.isInteger(index) || index < 0 || index >= records.length) {
    return res.status(404).json({ error: "Realtor not found" });
  }

  records[index] = { ...records[index], ...record };
  await writeRecords(records);
  return res.json({ record: records[index] });
});

router.delete("/realtors/:id", async (req, res) => {
  const index = Number(req.params.id);
  const records = await readRecords();

  if (!Number.isInteger(index) || index < 0 || index >= records.length) {
    return res.status(404).json({ error: "Realtor not found" });
  }

  records.splice(index, 1);
  await writeRecords(records);
  return res.json({ success: true });
});

router.get("/dashboard", async (req, res) => {
  const { role, phone } = req.query;
  const records = await readRecords();

  if (!role) {
    return res.status(400).json({ error: "role is required" });
  }

  if (role === "admin") {
    return res.json({ rows: records });
  }

  if (role === "referrer") {
    return res.json({ rows: getReferrerRows(records, phone) });
  }

  if (role === "realtor") {
    const filtered = records.filter((record) => {
      return normalize(record["REALTOR PHONE NO"]) === normalize(phone) || normalize(record["REALTOR EMAIL ADDRESS"]) === normalize(phone);
    });
    return res.json({ rows: filtered });
  }

  return res.status(400).json({ error: "Unknown role" });
});

module.exports = {
  router,
  resolveLoginUser,
  getReferrerRows,
  generateNextRealtorId,
  extractRealtorImage,
  askAiAssistant
};
