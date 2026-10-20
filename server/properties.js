const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const PROPERTY_TYPES = ["house", "apartment", "land", "commercial"];
const LISTING_TYPES = ["sale", "rent", "shortlet"];
const LISTING_STATUSES = ["pending", "approved", "rejected"];
const MAX_IMAGES = 10;
const MAX_PROPERTIES = 10000;

const demoProperties = [
  {
    id: "demo-lekki-family-home",
    title: "Demo: Contemporary family home in Lekki",
    description: "Sample listing for exploring the marketplace. Property details and availability are fictional.",
    propertyType: "house",
    listingType: "sale",
    price: 185000000,
    currency: "NGN",
    bedrooms: 4,
    bathrooms: 4,
    areaSqm: 320,
    address: "Sample address, Lekki",
    city: "Lekki",
    state: "Lagos",
    imageUrls: ["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85"],
    agentName: "Demo agent",
    agentPhone: "",
    agentEmail: "",
    status: "approved",
    isDemo: true,
    createdAt: "2026-01-10T10:00:00.000Z"
  },
  {
    id: "demo-ikoyi-apartment",
    title: "Demo: Bright two-bedroom apartment in Ikoyi",
    description: "Sample listing for exploring the marketplace. Property details and availability are fictional.",
    propertyType: "apartment",
    listingType: "rent",
    price: 12500000,
    currency: "NGN",
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 140,
    address: "Sample address, Ikoyi",
    city: "Ikoyi",
    state: "Lagos",
    imageUrls: ["https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85"],
    agentName: "Demo agent",
    agentPhone: "",
    agentEmail: "",
    status: "approved",
    isDemo: true,
    createdAt: "2026-01-11T10:00:00.000Z"
  },
  {
    id: "demo-abuja-terrace",
    title: "Demo: Modern terrace home in Abuja",
    description: "Sample listing for exploring the marketplace. Property details and availability are fictional.",
    propertyType: "house",
    listingType: "sale",
    price: 145000000,
    currency: "NGN",
    bedrooms: 3,
    bathrooms: 3,
    areaSqm: 235,
    address: "Sample address, Gwarinpa",
    city: "Gwarinpa",
    state: "Abuja",
    imageUrls: ["https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85"],
    agentName: "Demo agent",
    agentPhone: "",
    agentEmail: "",
    status: "approved",
    isDemo: true,
    createdAt: "2026-01-12T10:00:00.000Z"
  },
  {
    id: "demo-ajah-land",
    title: "Demo: Residential plot in Ajah",
    description: "Sample listing for exploring the marketplace. Property details and availability are fictional.",
    propertyType: "land",
    listingType: "sale",
    price: 42000000,
    currency: "NGN",
    bedrooms: 0,
    bathrooms: 0,
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

function parseOptionalFilterNumber(value, label, integer = false) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isSafeInteger(parsed))) {
    const error = new Error(`${label} must be a valid non-negative ${integer ? "whole number" : "amount"}.`);
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
  const minimumBedrooms = parseOptionalFilterNumber(query.bedrooms, "Bedrooms", true);
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
    .filter((property) => minimumBedrooms === null || property.bedrooms >= minimumBedrooms)
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
  const bedrooms = Number(input?.bedrooms ?? 0);
  const bathrooms = Number(input?.bathrooms ?? 0);
  const areaSqm = Number(input?.areaSqm ?? 0);

  if (!PROPERTY_TYPES.includes(propertyType)) throw new Error("Choose a valid property type.");
  if (!LISTING_TYPES.includes(listingType)) throw new Error("Choose sale, rent, or shortlet.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Price must be greater than zero.");
  if (![bedrooms, bathrooms, areaSqm].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("Bedrooms, bathrooms, and floor area must be whole non-negative numbers.");
  }

  return {
    title: cleanText(input?.title, "Title", 120, true),
    description: cleanText(input?.description, "Description", 3000),
    propertyType,
    listingType,
    price,
    currency: "NGN",
    bedrooms,
    bathrooms,
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
