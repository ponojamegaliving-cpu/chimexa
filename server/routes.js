const express = require("express");
const { readRecords, writeRecords, normalize, importCsvRecords } = require("./googleSheets");

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
const REALTOR_IMAGE_FIELDS = [
  "REALTORS NAME", "DATE OF REG", "REALTOR ID NO", "GENDER", "DATE OF BIRTH",
  "ADDRESS OF REALTOR", "REALTOR PHONE NO", "REALTOR EMAIL ADDRESS", "COUNTRY OF LOCATION",
  "PLACE OF REG", "STATE CODE", "STATIONED CITY/LGA", "REG PAYMENT", "BANK A/C NO",
  "BANK A/C NAME", "BANK", "REALTOR NEXT OF KIN NAME", "NEXT OF KIN ADDRESS",
  "NEXT OF KIN PHONE NO", "REFEREE NAME", "REFEREE ID NO", "REFEREE PHONE NO",
  "REFEREE BANK NAME", "REFEREE BANK A/C NO", "REFEREE A/C NAME", "INCENTIVE PAYMENT (YES/NO)"
];
const imageExtractionRequests = new Map();

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

  const openAiApiKey = getOpenAiApiKey();
  if (openAiApiKey) {
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

  const ollamaResponse = await fetch(`${getOllamaHost()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: process.env.OLLAMA_CHAT_MODEL || "llama3.1",
      stream: false,
      messages: [
        {
          role: "user",
          content: `Use these realtor records as context, then answer the question.\n\nRecords:\n${recordContext}\n\nQuestion: ${cleanedPrompt}`
        }
      ]
    })
  });

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
    `Fields: ${REALTOR_IMAGE_FIELDS.join(" | ")}`
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
  REALTOR_IMAGE_FIELDS.forEach((field) => {
    const value = parsed[field];
    values[field] = value === null || value === undefined ? "" : String(value).trim();
  });
  return values;
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

router.post("/login", async (req, res) => {
  const { loginValue, role, adminName, adminPassword } = req.body || {};

  if (role === "admin") {
    if (normalize(adminName) !== normalize(ADMIN_NAME) || String(adminPassword || "") !== ADMIN_PASSWORD) {
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
  const record = { ...(req.body || {}) };
  const records = await readRecords();

  if (!record["REALTORS NAME"] || !record["REALTOR PHONE NO"]) {
    return res.status(400).json({ error: "REALTORS NAME and REALTOR PHONE NO are required" });
  }

  if (!record["REALTOR ID NO"] || !/^R-\d+$/.test(String(record["REALTOR ID NO"]).trim())) {
    record["REALTOR ID NO"] = generateNextRealtorId(records);
  }

  const duplicate = records.find((entry) => {
    return normalize(entry["REALTOR PHONE NO"]) === normalize(record["REALTOR PHONE NO"]) ||
      normalize(entry["REALTOR EMAIL ADDRESS"]) === normalize(record["REALTOR EMAIL ADDRESS"] || "");
  });

  if (duplicate) {
    return res.status(409).json({ error: "A realtor with this phone number or email already exists" });
  }

  records.push(record);
  await writeRecords(records);
  return res.status(201).json({ record });
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
