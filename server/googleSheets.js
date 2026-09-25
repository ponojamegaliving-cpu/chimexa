const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { records: fallbackRecords } = require("./data");

const LOCAL_CSV_PATH = path.join(__dirname, "realtors.csv");

const DEFAULT_HEADERS = [
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

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || "Realtors";
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function getAuthClient() {
  if (!SHEET_ID || !SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
    return null;
  }

  const privateKey = SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

async function getSheetsApi() {
  const auth = getAuthClient();

  if (!auth) {
    return null;
  }

  const sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

function toObject(row, headers) {
  return headers.reduce((obj, header, index) => {
    obj[header] = row[index] ?? "";
    return obj;
  }, {});
}

function rowsToRecords(rows) {
  if (!rows || rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((value) => String(value || "").trim());
  const records = rows.slice(1).filter((row) => row.some((cell) => String(cell || "").trim() !== ""));

  return records.map((row) => toObject(row, headers));
}

function generateNextRealtorId(rows) {
  const ids = (rows || [])
    .map((row) => row["REALTOR ID NO"])
    .filter((id) => typeof id === "string" && /^R-\d+$/.test(id.trim()))
    .map((id) => Number(id.trim().replace(/^R-/, "")))
    .filter((value) => Number.isFinite(value));

  const nextNumber = ids.length ? Math.max(...ids) + 1 : 1001;
  return `R-${nextNumber}`;
}

function parseDelimitedLine(line, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((value) => value.replace(/\r$/, "").trim());
}

function csvToRecords(csvText) {
  const content = String(csvText || "");
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";
  const headers = parseDelimitedLine(lines[0], delimiter);

  return lines.slice(1)
    .map((line) => parseDelimitedLine(line, delimiter))
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => {
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = row[index] ?? "";
      });
      return entry;
    });
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function recordsToCsv(records) {
  const data = records && records.length ? records : fallbackRecords;
  const headers = Object.keys(data[0] || {});
  const rows = [headers, ...data.map((record) => headers.map((header) => record[header] ?? ""))];
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
}

function readLocalCsvRecords() {
  try {
    if (!fs.existsSync(LOCAL_CSV_PATH)) {
      fs.writeFileSync(LOCAL_CSV_PATH, recordsToCsv(fallbackRecords), "utf8");
      return [...fallbackRecords];
    }

    const csvText = fs.readFileSync(LOCAL_CSV_PATH, "utf8");
    const rows = csvToRecords(csvText);
    return rows.length ? rows : [...fallbackRecords];
  } catch (error) {
    console.warn("Local CSV read failed. Falling back to sample data:", error.message || error);
    return [...fallbackRecords];
  }
}

function writeLocalCsvRecords(records) {
  try {
    fs.writeFileSync(LOCAL_CSV_PATH, recordsToCsv(records), "utf8");
    return true;
  } catch (error) {
    console.warn("Local CSV write failed:", error.message || error);
    return false;
  }
}

async function ensureSheetHeaders() {
  const sheets = await getSheetsApi();
  if (!sheets) {
    return false;
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:Z1`
  });

  const values = response.data.values || [];
  if (values.length === 0 || values[0].length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [DEFAULT_HEADERS]
      }
    });
  }

  return true;
}

async function readRecords() {
  try {
    const sheets = await getSheetsApi();
    if (!sheets) {
      return readLocalCsvRecords();
    }

    await ensureSheetHeaders();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:Z`
    });

    const values = response.data.values || [];
    if (values.length === 0) {
      return readLocalCsvRecords();
    }

    return rowsToRecords(values);
  } catch (error) {
    console.warn("Google Sheets read failed. Falling back to local CSV:", error.message || error);
    return readLocalCsvRecords();
  }
}

async function writeRecords(records) {
  try {
    const sheets = await getSheetsApi();
    if (!sheets) {
      return writeLocalCsvRecords(records);
    }

    await ensureSheetHeaders();

    const headers = Object.keys(records[0] || {}).length ? Object.keys(records[0]) : DEFAULT_HEADERS;
    const rows = [headers, ...records.map((record) => headers.map((header) => record[header] ?? ""))];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: rows
      }
    });

    return true;
  } catch (error) {
    console.warn("Google Sheets write failed. Writing to local CSV instead:", error.message || error);
    return writeLocalCsvRecords(records);
  }
}

async function importCsvRecords(csvText) {
  const rows = csvToRecords(csvText);
  if (!rows.length) {
    throw new Error("CSV file is empty or invalid");
  }

  const currentRows = await readRecords();
  const merged = [...currentRows];

  rows.forEach((record) => {
    if (!record["REALTORS NAME"] || !record["REALTOR PHONE NO"]) {
      return;
    }

    const duplicateIndex = merged.findIndex((entry) => {
      return normalize(entry["REALTOR PHONE NO"]) === normalize(record["REALTOR PHONE NO"]) ||
        normalize(entry["REALTOR EMAIL ADDRESS"] || "") === normalize(record["REALTOR EMAIL ADDRESS"] || "");
    });

    if (duplicateIndex >= 0) {
      merged[duplicateIndex] = { ...merged[duplicateIndex], ...record };
      return;
    }

    if (!record["REALTOR ID NO"] || !/^R-\d+$/.test(String(record["REALTOR ID NO"]).trim())) {
      record["REALTOR ID NO"] = generateNextRealtorId(merged);
    }

    merged.push(record);
  });

  const saved = writeLocalCsvRecords(merged);
  if (!saved) {
    throw new Error("CSV import failed while saving the file");
  }

  return merged;
}

module.exports = {
  DEFAULT_HEADERS,
  readRecords,
  writeRecords,
  importCsvRecords,
  isGoogleSheetEnabled: Boolean(SHEET_ID && SERVICE_ACCOUNT_EMAIL && SERVICE_ACCOUNT_PRIVATE_KEY),
  normalize
};
