const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const PROPERTY_TYPES = ["land"];
const LISTING_TYPES = ["sale"];
const LISTING_STATUSES = ["pending", "approved", "rejected"];
const MAX_IMAGES = 10;
const MAX_PROPERTIES = 10000;

const demoProperties = [
  {
    id: "demo-land-lekki",
    title: "Demo: Residential plot in Lekki",
    description: "Fictional sample land listing for exploring the marketplace. Verify land title, survey, boundaries, and availability before any real transaction.",
    propertyType: "land",
    listingType: "sale",
    price: 65000000,
    currency: "NGN",
    areaSqm: 600,
    address: "Sample address, Lekki",
    city: "Lekki",
    state: "Lagos",
    imageUrls: ["https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=85"],
    agentName: "Demo agent",
    agentPhone: "",
    agentEmail: "",
    status: "approved",
    isDemo: true,
    createdAt: "2026-01-10T10:00:00.000Z"
  },
  {
    id: "demo-land-ikoyi",
    title: "Demo: Residential plot in Ikoyi",
    description: "Fictional sample land listing for exploring the marketplace. Verify land title, survey, boundaries, and availability before any real transaction.",
    propertyType: "land",
    listingType: "sale",
    price: 140000000,
    currency: "NGN",
    areaSqm: 450,
    address: "Sample address, Ikoyi",
    city: "Ikoyi",
    state: "Lagos",
    imageUrls: ["https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=85"],
    agentName: "Demo agent",
    agentPhone: "",
    agentEmail: "",
    status: "approved",
    isDemo: true,
    createdAt: "2026-01-11T10:00:00.000Z"
  },
  {
    id: "demo-land-gwarinpa",
    title: "Demo: Residential plot in Gwarinpa",
    description: "Fictional sample land listing for exploring the marketplace. Verify land title, survey, boundaries, and availability before any real transaction.",
    propertyType: "land",
    listingType: "sale",
    price: 48000000,
    currency: "NGN",
    areaSqm: 500,
    address: "Sample address, Gwarinpa",
    city: "Gwarinpa",
    state: "Abuja",
    imageUrls: ["https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85"],
    agentName: "Demo agent",
    agentPhone: "",
    agentEmail: "",
    status: "approved",
    isDemo: true,
    createdAt: "2026-01-12T10:00:00.000Z"
  },
  {
    id: "demo-land-ajah",
    title: "Demo: Residential plot in Ajah",
    description: "Fictional sample land listing for exploring the marketplace. Verify land title, survey, boundaries, and availability before any real transaction.",
    propertyType: "land",
    listingType: "sale",
    price: 42000000,
    currency: "NGN",
    areaSqm: 500,
    address: "Sample address, Ajah",
    city: "Ajah",
    state: "Lagos",
    imageUrls: ["https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=85"],
    agentName: "Demo agent",
    agentPhone: "",
    agentEmail: "",
    status: "approved",
    isDemo: true,
    createdAt: "2026-01-13T10:00:00.000Z"
  }
];

let writeQueue = Promise.resolve();

function getPropertiesPath() {
  return process.env.PROPERTIES_FILE_PATH || path.join(__dirname, "properties.json");
}

function cloneProperties(properties) {
  return JSON.parse(JSON.stringify(properties));
}

async function readProperties() {
  try {
    const data = await fs.readFile(getPropertiesPath(), "utf8");
    const properties = JSON.parse(data);
    if (!Array.isArray(properties)) {
      throw new Error("Property data file must contain a JSON array.");
    }
    return properties;
  } catch (error) {
    if (error.code === "ENOENT") return cloneProperties(demoProperties);
    throw error;
  }
}

async function writeProperties(properties) {
  if (!Array.isArray(properties) || properties.length > MAX_PROPERTIES) {
    throw new Error(`Property records must be an array of at most ${MAX_PROPERTIES} items.`);
  }
  const filePath = getPropertiesPath();
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(properties, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await fs.rm(temporaryPath, { force: true });
    } catch (cleanupError) {
      console.error("Unable to remove a temporary property data file.", cleanupError);
    }
    throw error;
  }
}

function updateProperties(updater) {
  const operation = writeQueue.then(async () => {
    const properties = await readProperties();
    const result = await updater(properties);
    await writeProperties(properties);
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function parseOptionalFilterNumber(value, label) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const error = new Error(`${label} must be a valid non-negative amount.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function filterProperties(properties, query = {}) {
  const search = normalizeSearch(query.search);
  const city = normalizeSearch(query.city);
  const propertyType = normalizeSearch(query.propertyType);
  const listingType = normalizeSearch(query.listingType);
  const minimumPrice = parseOptionalFilterNumber(query.minPrice, "Minimum price");
  const maximumPrice = parseOptionalFilterNumber(query.maxPrice, "Maximum price");
  if (propertyType && !PROPERTY_TYPES.includes(propertyType)) {
    const error = new Error("Choose a valid property type filter.");
    error.status = 400;
    throw error;
  }
  if (listingType && !LISTING_TYPES.includes(listingType)) {
    const error = new Error("Choose a valid listing type filter.");
    error.status = 400;
    throw error;
  }

  return properties
    .filter((property) => property.propertyType === "land" && property.listingType === "sale")
    .filter((property) => property.status === "approved" || property.isDemo === true)
    .filter((property) => !search || [
      property.title,
      property.description,
      property.address,
      property.city,
      property.state,
      property.propertyType
    ].some((value) => normalizeSearch(value).includes(search)))
    .filter((property) => !city || normalizeSearch(property.city).includes(city) || normalizeSearch(property.state).includes(city))
    .filter((property) => !propertyType || property.propertyType === propertyType)
    .filter((property) => !listingType || property.listingType === listingType)
    .filter((property) => minimumPrice === null || property.price >= minimumPrice)
    .filter((property) => maximumPrice === null || property.price <= maximumPrice)
    .sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
}

function cleanText(value, label, maximumLength, required = false) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${label} is required.`);
  if (text.length > maximumLength) throw new Error(`${label} must be ${maximumLength} characters or fewer.`);
  return text;
}

function validateImageUrls(value) {
  const urls = Array.isArray(value) ? value : String(value || "").split(/\r?\n|,/);
  const cleaned = urls.map((item) => String(item || "").trim()).filter(Boolean);
  if (!cleaned.length) throw new Error("Add at least one property photo URL.");
  if (cleaned.length > MAX_IMAGES) throw new Error(`Add no more than ${MAX_IMAGES} photos.`);

  return cleaned.map((imageUrl) => {
    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch {
      throw new Error("Each photo must use a valid HTTPS image URL.");
    }
    if (parsed.protocol !== "https:") throw new Error("Each photo must use a valid HTTPS image URL.");
    return parsed.toString();
  });
}

function validatePropertyInput(input) {
  const propertyType = String(input?.propertyType || "").trim().toLowerCase();
  const listingType = String(input?.listingType || "").trim().toLowerCase();
  const price = Number(input?.price);
  const areaSqm = Number(input?.areaSqm ?? 0);

  if (!PROPERTY_TYPES.includes(propertyType)) throw new Error("Choose a valid property type.");
  if (!LISTING_TYPES.includes(listingType)) throw new Error("Only land listings for sale are accepted.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Price must be greater than zero.");
  if (!Number.isFinite(areaSqm) || areaSqm <= 0) {
    throw new Error("Land area must be greater than zero square metres.");
  }

  return {
    title: cleanText(input?.title, "Title", 120, true),
    description: cleanText(input?.description, "Description", 3000),
    propertyType,
    listingType,
    price,
    currency: "NGN",
    areaSqm,
    address: cleanText(input?.address, "Address", 200, true),
    city: cleanText(input?.city, "City", 80, true),
    state: cleanText(input?.state, "State", 80, true),
    imageUrls: validateImageUrls(input?.imageUrls)
  };
}

function createProperty(input, realtor, status) {
  const property = validatePropertyInput(input);
  return {
    id: randomUUID(),
    ...property,
    agentName: cleanText(realtor?.name, "Agent name", 120, true),
    agentPhone: cleanText(realtor?.phone, "Agent phone", 40, true),
    agentEmail: cleanText(realtor?.email, "Agent email", 160),
    status,
    isDemo: false,
    createdAt: new Date().toISOString()
  };
}

function updatePropertyStatus(properties, id, status) {
  if (!LISTING_STATUSES.includes(status)) throw new Error("Choose a valid listing status.");
  const property = properties.find((entry) => entry.id === id);
  if (!property) return null;
  if (property.isDemo) throw new Error("Demo listings cannot be changed.");
  if (status === "approved" && (property.propertyType !== "land" || property.listingType !== "sale")) {
    throw new Error("Only land listings for sale can be approved. Delete this older non-land listing.");
  }
  property.status = status;
  return property;
}

function deleteProperty(properties, id) {
  const index = properties.findIndex((entry) => entry.id === id);
  if (index === -1) return false;
  if (properties[index].isDemo) throw new Error("Demo listings cannot be deleted.");
  properties.splice(index, 1);
  return true;
}

module.exports = {
  PROPERTY_TYPES,
  LISTING_TYPES,
  demoProperties,
  readProperties,
  writeProperties,
  updateProperties,
  filterProperties,
  createProperty,
  updatePropertyStatus,
  deleteProperty
};
