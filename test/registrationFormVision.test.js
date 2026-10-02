const test = require("node:test");
const assert = require("node:assert/strict");
const {
  REALTOR_FORM_FIELDS,
  extractRegistrationForm,
  normalizeVisionResult,
  MAX_IMAGE_BYTES
} = require("../server/registrationFormVision");

const frontImage = "data:image/jpeg;base64,YWJj";
const backImage = "data:image/png;base64,ZGVm";

test("sends both form sides only to the separately configured vision service", async () => {
  const previousFetch = global.fetch;
  const previousEnvironment = {
    FORM_VISION_API_KEY: process.env.FORM_VISION_API_KEY,
    FORM_VISION_API_URL: process.env.FORM_VISION_API_URL,
    FORM_VISION_MODEL: process.env.FORM_VISION_MODEL
  };
  let requestUrl;
  let requestOptions;
  process.env.FORM_VISION_API_KEY = "test-vision-key";
  process.env.FORM_VISION_API_URL = "https://vision.example.test/v1/chat/completions";
  process.env.FORM_VISION_MODEL = "separate-vision-model";
  global.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    const values = Object.fromEntries(REALTOR_FORM_FIELDS.map((field) => [field, ""]));
    values["REALTORS NAME"] = "Ada Okafor";
    values["REALTOR PHONE NO"] = "08012345678";
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ values, uncertainFields: ["BANK A/C NO"], ignored: "discard" }) } }]
      })
    };
  };

  try {
    const result = await extractRegistrationForm(frontImage, backImage);
    const requestBody = JSON.parse(requestOptions.body);
    assert.equal(requestUrl, "https://vision.example.test/v1/chat/completions");
    assert.equal(requestOptions.headers.Authorization, "Bearer test-vision-key");
    assert.equal(requestBody.model, "separate-vision-model");
    assert.equal(requestBody.messages[0].content[1].image_url.url, frontImage);
    assert.equal(requestBody.messages[0].content[2].image_url.url, backImage);
    assert.match(requestBody.messages[0].content[0].text, /do not compare with or invent information from other records/i);
    assert.doesNotMatch(JSON.stringify(requestBody), /ollama|realtor records/i);
    assert.equal(result.values["REALTOR PHONE NO"], "08012345678");
    assert.equal(result.values.EXTRA, undefined);
    assert.deepEqual(result.uncertainFields, ["BANK A/C NO"]);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("rejects missing screening API key without using OCR or Ollama as a fallback", async () => {
  const previousKey = process.env.FORM_VISION_API_KEY;
  const previousFetch = global.fetch;
  delete process.env.FORM_VISION_API_KEY;
  global.fetch = async () => {
    throw new Error("The configured vision service should not be called");
  };

  try {
    await assert.rejects(
      extractRegistrationForm(frontImage, backImage),
      (error) => error.status === 503 && /FORM_VISION_API_KEY/.test(error.message)
    );
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.FORM_VISION_API_KEY;
    else process.env.FORM_VISION_API_KEY = previousKey;
  }
});

test("rejects invalid and oversized images before sending them", async () => {
  await assert.rejects(
    extractRegistrationForm("data:image/gif;base64,YWJj", backImage),
    (error) => error.status === 400
  );

  const oversizedImage = `data:image/jpeg;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")}`;
  await assert.rejects(
    extractRegistrationForm(oversizedImage, backImage),
    (error) => error.status === 413
  );
});

test("normalizes output to the existing Realtor fields and flags only valid uncertain fields", () => {
  const result = normalizeVisionResult(JSON.stringify({
    values: {
      "REALTORS NAME": " Ada Okafor ",
      "REALTOR PHONE NO": "08012345678",
      "UNEXPECTED FIELD": "ignore"
    },
    uncertainFields: ["REALTORS NAME", "NOT AN EXISTING FIELD"]
  }));

  assert.equal(Object.keys(result.values).length, REALTOR_FORM_FIELDS.length);
  assert.equal(result.values["REALTORS NAME"], "Ada Okafor");
  assert.equal(result.values["REALTOR PHONE NO"], "08012345678");
  assert.equal(result.values["UNEXPECTED FIELD"], undefined);
  assert.deepEqual(result.uncertainFields, ["REALTORS NAME"]);
});
