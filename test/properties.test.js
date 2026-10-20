const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const testDirectory = path.join(__dirname, ".tmp-properties-tests");
const propertiesPath = path.join(testDirectory, "properties.json");
const realtorsPath = path.join(testDirectory, "realtors.csv");
process.env.PROPERTIES_FILE_PATH = propertiesPath;
process.env.REALTORS_CSV_PATH = realtorsPath;
process.env.ADMIN_NAME = "Marketplace Test Admin";
process.env.ADMIN_PASSWORD = "marketplace-test-password";

const { records } = require("../server/data");
const { writeRecords } = require("../server/googleSheets");
const {
  officialProperties,
  readProperties,
  updateProperties,
  filterProperties,
  createProperty,
  updatePropertyStatus,
  deleteProperty
} = require("../server/properties");
const { router } = require("../server/routes");

const credentials = {
  adminName: process.env.ADMIN_NAME,
  adminPassword: process.env.ADMIN_PASSWORD
};

function sampleProperty(overrides = {}) {
  return {
    title: "Sunny Lekki residential land",
    description: "A residential plot for sale.",
    propertyType: "land",
    listingType: "sale",
    price: 2500000,
    areaSqm: 110,
    address: "12 Example Road",
    city: "Lekki",
    state: "Lagos",
    imageUrls: ["https://images.example.com/home.jpg"],
    ...overrides
  };
}

test.before(async () => {
  await fs.mkdir(testDirectory, { recursive: true });
  await fs.rm(propertiesPath, { force: true });
  await writeRecords(records);
});

test.after(async () => {
  if (global.marketplaceTestServer) {
    await new Promise((resolve, reject) => {
      global.marketplaceTestServer.close((error) => error ? reject(error) : resolve());
    });
  }
  await fs.rm(testDirectory, { recursive: true, force: true });
  delete process.env.PROPERTIES_FILE_PATH;
  delete process.env.REALTORS_CSV_PATH;
  delete process.env.ADMIN_NAME;
  delete process.env.ADMIN_PASSWORD;
});

test("starts with verified official estate listings and returns only approved land for sale", async () => {
  const properties = await readProperties();
  assert.equal(properties.length, officialProperties.length);
  assert.ok(properties.every((property) => property.isOfficial && !property.isDemo));
  assert.ok(properties.every((property) => property.propertyType === "land" && property.listingType === "sale"));
  assert.deepEqual(properties.map((property) => property.title), officialProperties.map((property) => property.title));
  assert.deepEqual(properties.map((property) => property.price), [3250000, 15000000, 3550000, 6550000, 6250000, 13500000, 3050000]);
  assert.ok(properties.every((property) => property.sourceUrl.startsWith("https://crystalgardenestate.com/property/")));
  assert.equal(properties.find((property) => property.title === "Smart City").areaDisplay, "50 × 100 ft");
  assert.equal(filterProperties([
    ...properties,
    { ...sampleProperty({ propertyType: "house" }), id: "old-home", status: "approved", isDemo: false },
    { ...sampleProperty({ listingType: "rent" }), id: "old-rental", status: "approved", isDemo: false },
    { ...sampleProperty(), id: "pending", status: "pending", isDemo: false }
  ]).length, officialProperties.length);
  assert.equal(filterProperties(properties, { city: "Anambra", propertyType: "land", listingType: "sale" }).length, 4);
  assert.throws(() => filterProperties(properties, { maxPrice: "not-a-price" }), /valid non-negative amount/);
  assert.throws(() => filterProperties(properties, { propertyType: "house" }), /Only land listings are available/);
  assert.throws(() => filterProperties(properties, { listingType: "rent" }), /Only land for sale is available/);
});

test("replaces fictional seed data while preserving submitted realtor listings", async () => {
  const realtorListing = { ...sampleProperty(), id: "saved-realtor-listing", status: "pending", isDemo: false };
  await fs.writeFile(propertiesPath, JSON.stringify([
    { id: "demo-land-lekki", isDemo: true },
    realtorListing
  ]));
  const properties = await readProperties();
  assert.equal(properties.length, officialProperties.length + 1);
  assert.ok(!properties.some((property) => property.id === "demo-land-lekki"));
  assert.ok(properties.some((property) => property.id === realtorListing.id));
  await fs.rm(propertiesPath, { force: true });
});

test("validates property fields and accepts only HTTPS photo URLs", () => {
  assert.throws(() => createProperty(sampleProperty({ price: -1 }), { name: "Agent" }, "pending"), /Price must be greater/);
  assert.throws(() => createProperty(sampleProperty({ imageUrls: ["http://images.example.com/home.jpg"] }), { name: "Agent" }, "pending"), /HTTPS/);
  assert.throws(() => createProperty(sampleProperty({ propertyType: "house" }), { name: "Agent" }, "pending"), /Only land listings/);
  assert.throws(() => createProperty(sampleProperty({ listingType: "rent" }), { name: "Agent" }, "pending"), /Only land listings for sale/);
  assert.throws(() => createProperty(sampleProperty({ areaSqm: 0 }), { name: "Agent", phone: "08000000000" }, "pending"), /Land area/);
  assert.throws(() => createProperty(sampleProperty(), { name: "Agent" }, "pending"), /Agent phone is required/);
});

test("serializes updates and persists listings to disk", async () => {
  const results = await Promise.all([
    updateProperties((properties) => {
      properties.push({ ...sampleProperty(), id: "first", status: "pending" });
      return properties.length;
    }),
    updateProperties((properties) => {
      properties.push({ ...sampleProperty(), id: "second", status: "pending" });
      return properties.length;
    })
  ]);
  assert.deepEqual(results, [officialProperties.length + 1, officialProperties.length + 2]);
  const saved = await readProperties();
  assert.ok(saved.some((property) => property.id === "first"));
  assert.ok(saved.some((property) => property.id === "second"));
});

test("registered agents submit pending listings and admins approve or delete them", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  global.marketplaceTestServer = server;
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const denied = await fetch(`${baseUrl}/properties/admin/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminName: "wrong", adminPassword: "wrong" })
  });
  assert.equal(denied.status, 401);

  const unregistered = await fetch(`${baseUrl}/properties/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ realtorPhone: "00000000000", property: sampleProperty() })
  });
  assert.equal(unregistered.status, 403);

  const houseSubmission = await fetch(`${baseUrl}/properties/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      realtorPhone: records[0]["REALTOR PHONE NO"],
      property: sampleProperty({ propertyType: "house" })
    })
  });
  assert.equal(houseSubmission.status, 400);
  assert.match((await houseSubmission.json()).error, /Only land listings/);

  const rentalSubmission = await fetch(`${baseUrl}/properties/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      realtorPhone: records[0]["REALTOR PHONE NO"],
      property: sampleProperty({ listingType: "rent" })
    })
  });
  assert.equal(rentalSubmission.status, 400);
  assert.match((await rentalSubmission.json()).error, /Only land listings for sale/);

  const submittedResponse = await fetch(`${baseUrl}/properties/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      realtorPhone: records[0]["REALTOR PHONE NO"],
      property: sampleProperty({ agentName: "Cannot impersonate an agent" })
    })
  });
  assert.equal(submittedResponse.status, 201);
  const submitted = await submittedResponse.json();
  assert.equal(submitted.property.agentName, records[0]["REALTORS NAME"]);
  assert.equal(submitted.property.status, "pending");

  const publicResponse = await fetch(`${baseUrl}/properties`);
  const publicProperties = (await publicResponse.json()).properties;
  assert.ok(!publicProperties.some((property) => property.id === submitted.property.id));

  const reviewResponse = await fetch(`${baseUrl}/properties/admin/${submitted.property.id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...credentials, status: "approved" })
  });
  assert.equal(reviewResponse.status, 200);
  const approvedResponse = await fetch(`${baseUrl}/properties?search=Sunny+Lekki`);
  const approvedProperties = (await approvedResponse.json()).properties;
  assert.equal(approvedProperties.length, 1);
  assert.equal(approvedProperties[0].id, submitted.property.id);

  const removed = await fetch(`${baseUrl}/properties/admin/${submitted.property.id}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials)
  });
  assert.equal(removed.status, 200);

  const directResponse = await fetch(`${baseUrl}/properties/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...credentials,
      property: sampleProperty({ title: "Admin published land" }),
      agentName: "Jane Agent",
      agentPhone: "08000000000",
      agentEmail: "agent@example.com"
    })
  });
  assert.equal(directResponse.status, 201);
  const direct = await directResponse.json();
  assert.equal(direct.property.status, "approved");
  assert.equal(direct.property.isDemo, false);
});

test("official listings cannot be changed or deleted from the realtor admin page", () => {
  const properties = structuredClone(officialProperties);
  assert.throws(() => updatePropertyStatus(properties, properties[0].id, "rejected"), /Seeded listings/);
  assert.throws(() => deleteProperty(properties, properties[0].id), /Seeded listings/);
});

test("older home and rental listings stay hidden and cannot be approved", () => {
  const olderHouse = {
    ...sampleProperty({ propertyType: "house" }),
    id: "older-house",
    status: "pending",
    isDemo: false
  };
  const olderRental = {
    ...sampleProperty({ listingType: "rent" }),
    id: "older-rental",
    status: "approved",
    isDemo: false
  };
  assert.deepEqual(filterProperties([olderHouse, olderRental]), []);
  assert.throws(() => updatePropertyStatus([olderHouse], olderHouse.id, "approved"), /Only land listings for sale/);
});
