const express = require("express");
const { readRecords, writeRecords, normalize, importCsvRecords } = require("./googleSheets");

const router = express.Router();
const ADMIN_NAME = process.env.ADMIN_NAME || "ONOJA PAUL";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "12345";

function generateNextRealtorId(rows) {
  const ids = (rows || [])
    .map((row) => row["REALTOR ID NO"])
    .filter((id) => typeof id === "string" && /^R-\d+$/.test(id.trim()))
    .map((id) => Number(id.trim().replace(/^R-/, "")))
    .filter((value) => Number.isFinite(value));

  const nextNumber = ids.length ? Math.max(...ids) + 1 : 1001;
  return `R-${nextNumber}`;
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

  const matcher = normalize(loginValue);
  const match = records.find((record) => {
    return normalize(record["REALTOR PHONE NO"]) === matcher || normalize(record["REALTOR EMAIL ADDRESS"]) === matcher;
  });

  if (!match) {
    return res.status(401).json({ error: "Invalid login details" });
  }

  const currentRole = role || "realtor";

  return res.json({
    user: {
      role: currentRole,
      name: match["REALTORS NAME"],
      phone: match["REALTOR PHONE NO"],
      email: match["REALTOR EMAIL ADDRESS"],
      refereePhone: match["REFEREE PHONE NO"]
    }
  });
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
    const filtered = records.filter((record) => normalize(record["REFEREE PHONE NO"]) === normalize(phone));
    return res.json({ rows: filtered });
  }

  if (role === "realtor") {
    const filtered = records.filter((record) => {
      return normalize(record["REALTOR PHONE NO"]) === normalize(phone) || normalize(record["REALTOR EMAIL ADDRESS"]) === normalize(phone);
    });
    return res.json({ rows: filtered });
  }

  return res.status(400).json({ error: "Unknown role" });
});

module.exports = router;
