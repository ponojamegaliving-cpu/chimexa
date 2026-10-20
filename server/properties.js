const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const PROPERTY_TYPES = ["land"];
const LISTING_TYPES = ["sale"];
const LISTING_STATUSES = ["pending", "approved", "rejected"];
const MAX_IMAGES = 10;
const MAX_PROPERTIES = 10000;

const officialProperties = [
  {
    id: "crystal-garden-crown-city-ukwulu",
    title: "Crown City Ukwulu",
    description: "Featured land at Ukwulu, Anambra State. Estate highlights include road access, green spaces, smart security, backup power, perimeter fencing, and a 464 m² plot. The listed title documents are a survey plan and deed of conveyance. Nearby landmarks include Igbariam Campus, the National Food Reserve Agency, the Immigration Office, and Eke Igboariam Market.",
    propertyType: "land",
    listingType: "sale",
    price: 3250000,
    currency: "NGN",
    areaSqm: 464,
    address: "Behind Odumegwu Ojukwu University, Igbariam",
    city: "Ukwulu",
    state: "Anambra",
    imageUrls: ["https://crystalgardenestate.com/wp-content/uploads/2026/07/5938094214790974933.jpg"],
    agentName: "Crystal Garden Estate",
    agentPhone: "+2349165519821",
    agentEmail: "",
    status: "approved",
    isOfficial: true,
    sourceOrder: 0,
    sourceUrl: "https://crystalgardenestate.com/property/crown-city-ukwulu/"
  },
  {
    id: "crystal-garden-hez-haven-homes",
    title: "Hez Haven Homes",
    description: "A buy, build, and live estate in Agboga-Igwuruta, Port Harcourt. The official listing highlights its strategic location and good road network.",
    propertyType: "land",
    listingType: "sale",
    price: 15000000,
    currency: "NGN",
    areaSqm: 0,
    address: "Agboga-Igwuruta",
    city: "Port Harcourt",
    state: "Rivers",
    imageUrls: ["https://crystalgardenestate.com/wp-content/uploads/2026/06/5857024864538005380.jpg"],
    agentName: "Crystal Garden Estate",
    agentPhone: "+2347077990332",
    agentEmail: "",
    status: "approved",
    isOfficial: true,
    sourceOrder: 1,
    sourceUrl: "https://crystalgardenestate.com/property/hez-haven-homes/"
  },
  {
    id: "crystal-garden-airport-villa-phase-2-extension",
    title: "Airport Villa Phase 2 Extension",
    description: "Land at Nneyi Umueri, Anambra State. The listing highlights nearby UNIZIK Campus, Anambra International Cargo/Passenger Airport, Oriental Petroleum, and Main Market, Onitsha.",
    propertyType: "land",
    listingType: "sale",
    price: 3550000,
    currency: "NGN",
    areaSqm: 0,
    address: "Nneyi",
    city: "Umueri",
    state: "Anambra",
    imageUrls: ["https://crystalgardenestate.com/wp-content/uploads/2026/06/5857024864538005379.jpg"],
    agentName: "Crystal Garden Estate",
    agentPhone: "+2349069938837",
    agentEmail: "",
    status: "approved",
    isOfficial: true,
    sourceOrder: 2,
    sourceUrl: "https://crystalgardenestate.com/property/airport-villa-phase-2-extension/"
  },
  {
    id: "crystal-garden-ana-eri-aku-extension",
    title: "Ana-Eri Aku Extension",
    description: "Land at Achalla Agu, Nteje, Anambra State. The listing describes dry land, instant allocation, road access, smart security, perimeter fencing, and a survey plan and deed of conveyance. Nearby landmarks include Building Materials Quarters, Awkuzu Junction, and Igbariam Junction.",
    propertyType: "land",
    listingType: "sale",
    price: 6550000,
    currency: "NGN",
    areaSqm: 0,
    address: "Achalla Agu",
    city: "Nteje",
    state: "Anambra",
    imageUrls: ["https://crystalgardenestate.com/wp-content/uploads/2026/05/5794284811206725268.jpg"],
    agentName: "Crystal Garden Estate",
    agentPhone: "+2347077990332",
    agentEmail: "",
    status: "approved",
    isOfficial: true,
    sourceOrder: 3,
    sourceUrl: "https://crystalgardenestate.com/property/ana-eri-aku-extension/"
  },
  {
    id: "crystal-garden-odumba-luxury-city",
    title: "Odumba Luxury City",
    description: "Land behind Enugu State Housing Corporation 2 (Satellites Estate), Onuogba Nike, Enugu East L.G.A. The listing mentions smart security, green open spaces, a deed of conveyance, registered survey plan, and Global C of O.",
    propertyType: "land",
    listingType: "sale",
    price: 6250000,
    currency: "NGN",
    areaSqm: 0,
    address: "Behind Enugu State Housing Corporation 2 (Satellites Estate), Onuogba Nike",
    city: "Enugu",
    state: "Enugu",
    imageUrls: ["https://crystalgardenestate.com/wp-content/uploads/2025/10/ba8e1b74-c3ed-4d75-8be0-7ca574ef4d82.jpg"],
    agentName: "Crystal Garden Estate",
    agentPhone: "+2347077990332",
    agentEmail: "",
    status: "approved",
    isOfficial: true,
    sourceOrder: 4,
    sourceUrl: "https://crystalgardenestate.com/property/odumba-luxury-city/"
  },
  {
    id: "crystal-garden-smart-city",
    title: "Smart City",
    description: "Buy-and-build land at Ezi Agulu, Aguleri, Anambra State. The official listing specifies 50 × 100 ft, dry table land, a deed of conveyance and registered survey plan. Nearby landmarks include Aguleri Junction, the Anambra International Cargo/Passenger Airport, 54 Division Mopol Base, and Iwene Tansi Pilgrim Centre.",
    propertyType: "land",
    listingType: "sale",
    price: 13500000,
    currency: "NGN",
    areaSqm: 0,
    areaDisplay: "50 × 100 ft",
    address: "Ezi Agulu",
    city: "Aguleri",
    state: "Anambra",
    imageUrls: ["https://crystalgardenestate.com/wp-content/uploads/2025/10/5791980870490065837-1.jpg"],
    agentName: "Crystal Garden Estate",
    agentPhone: "+2347077990332",
    agentEmail: "",
    status: "approved",
    isOfficial: true,
    sourceOrder: 5,
    sourceUrl: "https://crystalgardenestate.com/property/smart-city/"
  },
  {
    id: "crystal-garden-fruitful-city-extension",
    title: "Fruitful City Extension",
    description: "Land at Akwukwu Igbo, Oshimili North L.G.A., Delta State. The listing notes a location about six minutes from Otulu Junction and three minutes from Otulu/Isele Azagba Junction, with instant allocation, road access, backup power, green spaces, smart security, and perimeter fencing.",
    propertyType: "land",
    listingType: "sale",
    price: 3050000,
    currency: "NGN",
    areaSqm: 0,
    address: "Oshimili North L.G.A.",
    city: "Akwukwu Igbo",
    state: "Delta",
    imageUrls: ["https://crystalgardenestate.com/wp-content/uploads/2025/10/b20bcd2a-ce2e-4a9d-aeec-93a317c652c7.jpg"],
    agentName: "Crystal Garden Estate",
    agentPhone: "+2347077990332",
    agentEmail: "",
    status: "approved",
    isOfficial: true,
    sourceOrder: 6,
    sourceUrl: "https://crystalgardenestate.com/property/fruitful-city-extension/"
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
    const officialIds = new Set(officialProperties.map((property) => property.id));
    const submittedProperties = properties.filter((property) =>
      property.isDemo !== true && !officialIds.has(property.id) && property.isOfficial !== true
    );
    return [...cloneProperties(officialProperties), ...submittedProperties];
  } catch (error) {
    if (error.code === "ENOENT") return cloneProperties(officialProperties);
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

function createValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function filterProperties(properties, query = {}) {
  const search = normalizeSearch(query.search);
  const city = normalizeSearch(query.city);
  const propertyType = normalizeSearch(query.propertyType);
  const listingType = normalizeSearch(query.listingType);
  const minimumPrice = parseOptionalFilterNumber(query.minPrice, "Minimum price");
  const maximumPrice = parseOptionalFilterNumber(query.maxPrice, "Maximum price");
  if (propertyType && !PROPERTY_TYPES.includes(propertyType)) {
    throw createValidationError("Only land listings are available.");
  }
  if (listingType && !LISTING_TYPES.includes(listingType)) {
    throw createValidationError("Only land for sale is available.");
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
    .sort((first, second) => {
      const firstOrder = Number.isFinite(first.sourceOrder) ? first.sourceOrder : MAX_PROPERTIES;
      const secondOrder = Number.isFinite(second.sourceOrder) ? second.sourceOrder : MAX_PROPERTIES;
      return firstOrder - secondOrder || String(second.createdAt).localeCompare(String(first.createdAt));
    });
}

function cleanText(value, label, maximumLength, required = false) {
  const text = String(value ?? "").trim();
  if (required && !text) throw createValidationError(`${label} is required.`);
  if (text.length > maximumLength) throw createValidationError(`${label} must be ${maximumLength} characters or fewer.`);
  return text;
}

function validateImageUrls(value) {
  const urls = Array.isArray(value) ? value : String(value || "").split(/\r?\n|,/);
  const cleaned = urls.map((item) => String(item || "").trim()).filter(Boolean);
  if (!cleaned.length) throw createValidationError("Add at least one property photo URL.");
  if (cleaned.length > MAX_IMAGES) throw createValidationError(`Add no more than ${MAX_IMAGES} photos.`);

  return cleaned.map((imageUrl) => {
    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch {
      throw createValidationError("Each photo must use a valid HTTPS image URL.");
    }
    if (parsed.protocol !== "https:") throw createValidationError("Each photo must use a valid HTTPS image URL.");
    return parsed.toString();
  });
}

function validatePropertyInput(input) {
  const propertyType = String(input?.propertyType || "").trim().toLowerCase();
  const listingType = String(input?.listingType || "").trim().toLowerCase();
  const price = Number(input?.price);
  const areaSqm = Number(input?.areaSqm ?? 0);

  if (!PROPERTY_TYPES.includes(propertyType)) throw createValidationError("Only land listings are accepted.");
  if (!LISTING_TYPES.includes(listingType)) throw createValidationError("Only land listings for sale are accepted.");
  if (!Number.isFinite(price) || price <= 0) throw createValidationError("Price must be greater than zero.");
  if (!Number.isFinite(areaSqm) || areaSqm <= 0) {
    throw createValidationError("Land area must be greater than zero square metres.");
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
  try {
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
  } catch (error) {
    if (!error.status) error.status = 400;
    throw error;
  }
}

function updatePropertyStatus(properties, id, status) {
  if (!LISTING_STATUSES.includes(status)) throw createValidationError("Choose a valid listing status.");
  const property = properties.find((entry) => entry.id === id);
  if (!property) return null;
  if (property.isDemo || property.isOfficial) throw new Error("Seeded listings cannot be changed.");
  if (status === "approved" && (property.propertyType !== "land" || property.listingType !== "sale")) {
    throw createValidationError("Only land listings for sale can be approved. Delete this older non-land listing.");
  }
  property.status = status;
  return property;
}

function deleteProperty(properties, id) {
  const index = properties.findIndex((entry) => entry.id === id);
  if (index === -1) return false;
  if (properties[index].isDemo || properties[index].isOfficial) throw new Error("Seeded listings cannot be deleted.");
  properties.splice(index, 1);
  return true;
}

module.exports = {
  PROPERTY_TYPES,
  LISTING_TYPES,
  officialProperties,
  readProperties,
  writeProperties,
  updateProperties,
  filterProperties,
  createProperty,
  updatePropertyStatus,
  deleteProperty
};
