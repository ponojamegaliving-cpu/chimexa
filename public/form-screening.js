const MAX_COMPRESSED_IMAGE_BYTES = 2.8 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_SERVER_IMAGE_BYTES = 3 * 1024 * 1024;
const FIELD_NAMES = [
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

const frontInput = document.getElementById("frontImage");
const backInput = document.getElementById("backImage");
const analyzeButton = document.getElementById("analyzeFormBtn");
const clearButton = document.getElementById("clearFormBtn");
const saveButton = document.getElementById("saveReviewedBtn");
const statusMessage = document.getElementById("screeningStatus");
const reviewSection = document.getElementById("screeningReview");
const reviewRows = document.getElementById("screeningReviewRows");
const adminPasswordInput = document.getElementById("adminPassword");

let frontImageData = "";
let backImageData = "";
let uncertainFields = new Set();

function currentAdmin() {
  try {
    const user = JSON.parse(localStorage.getItem("realtorCurrentUser") || "null");
    return user && user.role === "admin" ? user : null;
  } catch {
    return null;
  }
}

if (!currentAdmin()) {
  window.location.replace("/");
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function imageToCompressedDataUrl(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return Promise.reject(new Error("Choose a JPEG, PNG, or WebP photo."));
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    return Promise.reject(new Error("Each original photo must be smaller than 20 MB."));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("This browser could not prepare the photo. Try another browser."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      let quality = 0.9;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length * 0.75 > MAX_COMPRESSED_IMAGE_BYTES && quality > 0.5) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      if (dataUrl.length * 0.75 > MAX_SERVER_IMAGE_BYTES) {
        reject(new Error("This photo is too large to process. Choose a smaller or clearer cropped image."));
        return;
      }
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This photo could not be opened. Choose a JPEG, PNG, or WebP image."));
    };
    image.src = objectUrl;
  });
}

async function handleImageChange(input, imageKey, previewId, wrapperId, side) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (imageKey === "front") frontImageData = "";
  else backImageData = "";
  document.getElementById(previewId).removeAttribute("src");
  document.getElementById(wrapperId).classList.add("hidden");
  reviewSection.classList.add("hidden");
  setStatus(`Preparing the ${side} image…`);

  try {
    const dataUrl = await imageToCompressedDataUrl(file);
    if (imageKey === "front") frontImageData = dataUrl;
    else backImageData = dataUrl;
    document.getElementById(previewId).src = dataUrl;
    document.getElementById(wrapperId).classList.remove("hidden");
    reviewSection.classList.add("hidden");
    setStatus(`${side[0].toUpperCase()}${side.slice(1)} image ready. Choose both sides, then analyze.`);
  } catch (error) {
    input.value = "";
    setStatus(error.message, true);
  }
}

function renderReview(values) {
  reviewRows.replaceChildren();
  FIELD_NAMES.forEach((field, index) => {
    const row = document.createElement("tr");
    const fieldCell = document.createElement("th");
    const valueCell = document.createElement("td");
    const stateCell = document.createElement("td");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const needsReview = uncertainFields.has(field) || !String(values[field] || "").trim();

    fieldCell.scope = "row";
    fieldCell.textContent = field;
    input.type = "text";
    input.value = values[field] || "";
    input.setAttribute("aria-label", `Review ${field}`);
    input.dataset.field = field;
    input.id = `review-field-${index}`;
    label.htmlFor = input.id;
    label.className = "screening-visually-hidden";
    label.textContent = field;
    valueCell.append(label, input);
    stateCell.textContent = needsReview ? "Check" : "Review";
    stateCell.className = needsReview ? "screening-needs-review" : "screening-suggested";
    row.classList.toggle("screening-row-needs-review", needsReview);
    row.append(fieldCell, valueCell, stateCell);
    reviewRows.append(row);
  });
  reviewSection.classList.remove("hidden");
  reviewSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function readResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(response.status === 413
      ? "The photos are too large to send. Clear them and try smaller images."
      : "The server returned an invalid response. Try again.");
  }
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

async function analyzeForm() {
  const admin = currentAdmin();
  if (!admin) {
    window.location.replace("/");
    return;
  }
  if (!adminPasswordInput.value) {
    setStatus("Enter your admin password to authorize form screening.", true);
    adminPasswordInput.focus();
    return;
  }
  if (!frontImageData || !backImageData) {
    setStatus("Choose a photo of both the front and back of the form.", true);
    return;
  }
  if (frontImageData.length * 0.75 > MAX_SERVER_IMAGE_BYTES ||
      backImageData.length * 0.75 > MAX_SERVER_IMAGE_BYTES) {
    setStatus("One photo is too large. Clear it and choose a smaller image.", true);
    return;
  }

  analyzeButton.disabled = true;
  setStatus("Analyzing both images with the separate vision service. This may take a minute…");
  reviewSection.classList.add("hidden");
  try {
    const response = await fetch("/api/realtors/screen-registration-form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frontImageData,
        backImageData,
        adminName: admin.name,
        adminPassword: adminPasswordInput.value
      })
    });
    const data = await readResponse(response);
    uncertainFields = new Set(Array.isArray(data.uncertainFields) ? data.uncertainFields : []);
    renderReview(data.values || {});
    setStatus("Suggestions are ready. Review and edit every field before saving.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    analyzeButton.disabled = false;
    adminPasswordInput.value = "";
  }
}

async function saveReviewedRecord() {
  const admin = currentAdmin();
  if (!admin) {
    window.location.replace("/");
    return;
  }
  if (!adminPasswordInput.value) {
    setStatus("Enter your admin password to authorize saving this record.", true);
    adminPasswordInput.focus();
    return;
  }

  const record = Object.fromEntries(
    Array.from(reviewRows.querySelectorAll("input[data-field]"), (input) => [input.dataset.field, input.value.trim()])
  );
  if (!record["REALTORS NAME"] || !record["REALTOR PHONE NO"]) {
    setStatus("Enter the Realtor’s name and phone number before saving.", true);
    return;
  }

  saveButton.disabled = true;
  setStatus("Saving the reviewed Realtor record…");
  try {
    const response = await fetch("/api/realtors/screen-registration-form/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminName: admin.name,
        adminPassword: adminPasswordInput.value,
        record
      })
    });
    const data = await readResponse(response);
    setStatus(`Saved ${data.record["REALTORS NAME"]} (${data.record["REALTOR ID NO"]}). The uploaded images were not saved.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    saveButton.disabled = false;
    adminPasswordInput.value = "";
  }
}

function clearForm() {
  frontImageData = "";
  backImageData = "";
  uncertainFields = new Set();
  frontInput.value = "";
  backInput.value = "";
  adminPasswordInput.value = "";
  document.getElementById("frontPreview").removeAttribute("src");
  document.getElementById("backPreview").removeAttribute("src");
  document.getElementById("frontPreviewWrap").classList.add("hidden");
  document.getElementById("backPreviewWrap").classList.add("hidden");
  reviewRows.replaceChildren();
  reviewSection.classList.add("hidden");
  setStatus("Choose a front and back image to begin.");
}

frontInput.addEventListener("change", () => handleImageChange(frontInput, "front", "frontPreview", "frontPreviewWrap", "front"));
backInput.addEventListener("change", () => handleImageChange(backInput, "back", "backPreview", "backPreviewWrap", "back"));
analyzeButton.addEventListener("click", analyzeForm);
clearButton.addEventListener("click", clearForm);
saveButton.addEventListener("click", saveReviewedRecord);
