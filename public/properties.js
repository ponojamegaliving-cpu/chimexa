const propertyGrid = document.getElementById("propertyGrid");
const propertySearch = document.getElementById("propertySearch");
const resultsCount = document.getElementById("resultsCount");
const marketStatus = document.getElementById("marketStatus");
const propertyDialog = document.getElementById("propertyDialog");
const propertyDetails = document.getElementById("propertyDetails");
const savedToggle = document.getElementById("savedToggle");
const savedCount = document.getElementById("savedCount");
const propertySubmissionForm = document.getElementById("propertySubmissionForm");
const submissionStatus = document.getElementById("submissionStatus");
const FAVORITES_KEY = "crystalGardenSavedLandListings";
let properties = [];
let showFavoritesOnly = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
  } catch (error) {
    console.error("Saved property preferences could not be read.", error);
    return [];
  }
}

function writeFavorites(favorites) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    return true;
  } catch (error) {
    console.error("Saved property preferences could not be stored.", error);
    marketStatus.textContent = "Your browser could not save favorites. Check your device storage settings.";
    marketStatus.className = "market-status market-status-error";
    return false;
  }
}

function formatPrice(price) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(Number(price) || 0);
}

function propertyLocation(property) {
  return [property.city, property.state].filter(Boolean).join(", ");
}

function formatLandArea(value) {
  const area = Number(value);
  return Number.isFinite(area) && area > 0 ? `${area.toLocaleString()} m²` : "Land size not provided";
}

function toWhatsAppPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}

function getVisibleProperties() {
  const favorites = new Set(readFavorites());
  return properties.filter((property) => !showFavoritesOnly || favorites.has(property.id));
}

function renderProperties() {
  const visibleProperties = getVisibleProperties();
  resultsCount.textContent = `${visibleProperties.length} ${visibleProperties.length === 1 ? "property" : "properties"} found`;
  savedCount.textContent = String(readFavorites().length);
  savedToggle.setAttribute("aria-pressed", String(showFavoritesOnly));
  savedToggle.firstChild.textContent = showFavoritesOnly ? "♥ " : "♡ ";

  if (!visibleProperties.length) {
    propertyGrid.innerHTML = "";
    marketStatus.textContent = showFavoritesOnly
      ? "You have no saved properties yet. Tap the heart on a property to save it."
      : "No properties match those filters. Try a different location or price.";
    marketStatus.className = "market-status";
    return;
  }

  marketStatus.textContent = "";
  marketStatus.className = "market-status";
  const favorites = new Set(readFavorites());
  propertyGrid.innerHTML = visibleProperties.map((property) => {
    const imageUrl = property.imageUrls?.[0] || "";
    const location = propertyLocation(property);
    const saved = favorites.has(property.id);
    return `<article class="property-card">
      <div class="card-image-wrap">
        <img class="card-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(property.title)}" loading="lazy" />
        <span class="listing-badge">Land for sale</span>
        ${property.isDemo ? '<span class="demo-badge">Demo listing</span>' : ""}
        <button class="save-property" type="button" data-action="save" data-id="${escapeHtml(property.id)}" aria-pressed="${saved}" aria-label="${saved ? "Remove saved property" : "Save property"}">${saved ? "♥" : "♡"}</button>
      </div>
      <div class="card-body">
        <p class="card-price">${formatPrice(property.price)}</p>
        <h3 class="card-title" title="${escapeHtml(property.title)}">${escapeHtml(property.title)}</h3>
        <p class="card-location"><span aria-hidden="true">⌖</span> ${escapeHtml(location || property.address)}</p>
        <div class="card-specs"><span>Land for sale</span><span>${formatLandArea(property.areaSqm)}</span></div>
        <div class="card-footer"><span class="card-agent">${property.isDemo ? "Sample property" : `Listed by ${escapeHtml(property.agentName)}`}</span><button class="card-details-button" type="button" data-action="details" data-id="${escapeHtml(property.id)}">View details →</button></div>
      </div>
    </article>`;
  }).join("");
}

function showMarketError(message) {
  propertyGrid.innerHTML = "";
  resultsCount.textContent = "";
  marketStatus.textContent = message;
  marketStatus.className = "market-status market-status-error";
}

async function loadProperties() {
  marketStatus.textContent = "Loading properties…";
  marketStatus.className = "market-status";
  const query = new URLSearchParams(new FormData(propertySearch));
  const response = await fetch(`/api/properties?${query}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load property listings.");
  if (!Array.isArray(data.properties)) throw new Error("The server returned an invalid property list.");
  properties = data.properties;
  renderProperties();
}

function getProperty(id) {
  return properties.find((property) => property.id === id);
}

function showPropertyDetails(property) {
  const location = [property.address, property.city, property.state].filter(Boolean).join(", ");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  const phone = String(property.agentPhone || "").replace(/[^\d+]/g, "");
  const whatsappPhone = toWhatsAppPhone(phone);
  const gallery = (property.imageUrls || []).slice(0, 5).map((imageUrl) =>
    `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(property.title)}" loading="lazy" />`
  ).join("");
  const specs = `<span>Land for sale</span><span>${formatLandArea(property.areaSqm)}</span>`;
  const contactLinks = property.isDemo
    ? '<p class="dialog-demo-note">This is fictional sample land. The location, title, boundaries, price, and availability are examples only; verify these details independently for any real property.</p>'
    : `<a class="dialog-action" href="tel:${escapeHtml(phone)}">Call ${escapeHtml(property.agentName || "agent")}</a>
       ${whatsappPhone ? `<a class="dialog-action dialog-action-secondary" href="https://wa.me/${escapeHtml(whatsappPhone)}" target="_blank" rel="noopener noreferrer">WhatsApp agent</a>` : ""}`;

  propertyDetails.innerHTML = `<div class="dialog-gallery">${gallery}</div>
    <div class="dialog-content">
      <span class="market-eyebrow">Land for sale</span>
      <h2>${escapeHtml(property.title)}</h2>
      <p class="card-location">⌖ ${escapeHtml(location)}</p>
      <p class="dialog-price">${formatPrice(property.price)}</p>
      <div class="dialog-specs">${specs}</div>
      <p class="dialog-description">${escapeHtml(property.description || "Contact the realtor for more information.")}</p>
      <div class="dialog-actions">
        ${contactLinks}
        <a class="dialog-action dialog-action-secondary" href="${mapUrl}" target="_blank" rel="noopener noreferrer">Open map</a>
      </div>
    </div>`;
  if (typeof propertyDialog.showModal === "function") propertyDialog.showModal();
  else propertyDialog.setAttribute("open", "");
}

function toggleFavorite(id) {
  const favorites = new Set(readFavorites());
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  if (writeFavorites(Array.from(favorites))) renderProperties();
}

propertySearch.addEventListener("submit", (event) => {
  event.preventDefault();
  loadProperties().catch((error) => showMarketError(error.message || "Unable to load property listings."));
});

savedToggle.addEventListener("click", () => {
  showFavoritesOnly = !showFavoritesOnly;
  renderProperties();
});

propertyGrid.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const property = getProperty(action.dataset.id);
  if (!property) return;
  if (action.dataset.action === "save") {
    event.stopPropagation();
    toggleFavorite(property.id);
  } else if (action.dataset.action === "details") {
    showPropertyDetails(property);
  }
});

document.getElementById("closeDialog").addEventListener("click", () => {
  if (typeof propertyDialog.close === "function") propertyDialog.close();
  else propertyDialog.removeAttribute("open");
});

propertyDialog.addEventListener("click", (event) => {
  if (event.target === propertyDialog && typeof propertyDialog.close === "function") propertyDialog.close();
});

propertySubmissionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submissionStatus.textContent = "";
  submissionStatus.className = "form-status";
  const submitButton = propertySubmissionForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Submitting…";
  const form = Object.fromEntries(new FormData(propertySubmissionForm).entries());
  const property = {
    title: form.title,
    description: form.description,
    propertyType: form.propertyType,
    listingType: form.listingType,
    price: form.price,
    areaSqm: form.areaSqm,
    address: form.address,
    city: form.city,
    state: form.state,
    imageUrls: String(form.imageUrls || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  };

  try {
    const response = await fetch("/api/properties/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ realtorPhone: form.realtorPhone, property })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to submit this property.");
    propertySubmissionForm.reset();
    submissionStatus.textContent = result.message || "Your listing was submitted for review.";
    submissionStatus.classList.add("form-status-success");
  } catch (error) {
    submissionStatus.textContent = error.message || "Unable to reach the server. Please try again.";
    submissionStatus.classList.add("form-status-error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit for review";
  }
});

loadProperties().catch((error) => showMarketError(error.message || "Unable to load property listings."));
