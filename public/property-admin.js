const adminCredentialForm = document.getElementById("adminCredentialForm");
const adminPropertyForm = document.getElementById("adminPropertyForm");
const adminStatus = document.getElementById("adminStatus");
const adminTools = document.getElementById("adminTools");
const adminListingGrid = document.getElementById("adminListingGrid");
const adminListingCount = document.getElementById("adminListingCount");
let adminCredentials = null;
let managedProperties = [];

function escapeAdminHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function adminPrice(price) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(Number(price) || 0);
}

function setAdminStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.style.color = isError ? "#a92b20" : "";
}

async function adminRequest(path, payload = {}) {
  const response = await fetch(`/api/properties/admin${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...adminCredentials, ...payload })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to manage property listings.");
  return result;
}

function renderManagedProperties() {
  adminListingCount.textContent = `${managedProperties.length} listing${managedProperties.length === 1 ? "" : "s"} (including official website listings)`;
  if (!managedProperties.length) {
    adminListingGrid.innerHTML = '<p class="admin-status">There are no property listings yet.</p>';
    return;
  }

  adminListingGrid.innerHTML = managedProperties.map((property) => {
    const demo = property.isDemo === true;
    const official = property.isOfficial === true;
    const legacy = property.propertyType !== "land" || property.listingType !== "sale";
    const statusLabel = official ? "Official website listing" : demo ? "Demo" : escapeAdminHtml(property.status);
    const actions = demo || official
      ? `<span class="admin-status">${official ? "Managed from the official website" : "Example data — cannot be edited"}</span>`
      : `${legacy ? '<span class="admin-status">Older non-land listing — not shown publicly</span>' : `<button type="button" data-action="review" data-status="approved" data-id="${escapeAdminHtml(property.id)}">Approve land listing</button>`}
         <button type="button" data-action="review" data-status="rejected" data-id="${escapeAdminHtml(property.id)}">Reject</button>
         <button type="button" data-action="delete" data-id="${escapeAdminHtml(property.id)}">Delete</button>`;
    const area = Number(property.areaSqm);
    const areaLabel = property.areaDisplay || (Number.isFinite(area) && area > 0 ? `${area.toLocaleString()} m²` : "Land size not provided");
    return `<article class="admin-listing">
      <img src="${escapeAdminHtml(property.imageUrls?.[0] || "")}" alt="" loading="lazy" />
      <div>
        <h3>${escapeAdminHtml(property.title)}</h3>
        <p>${adminPrice(property.price)} · ${areaLabel} · ${escapeAdminHtml(property.city)}, ${escapeAdminHtml(property.state)}</p>
        <p>Status: <strong>${statusLabel}</strong> · Agent: ${escapeAdminHtml(property.agentName)}</p>
      </div>
      <div class="admin-listing-actions">${actions}</div>
    </article>`;
  }).join("");
}

async function loadManagedProperties() {
  const result = await adminRequest("/list");
  if (!Array.isArray(result.properties)) throw new Error("The server returned an invalid listing list.");
  managedProperties = result.properties;
  renderManagedProperties();
  adminTools.hidden = false;
}

function propertyPayload(form) {
  return {
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
}

adminCredentialForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAdminStatus("Checking administrator access…");
  adminCredentials = Object.fromEntries(new FormData(adminCredentialForm).entries());
  try {
    await loadManagedProperties();
    setAdminStatus("Administrator access verified. Credentials remain in memory for this page only.");
  } catch (error) {
    adminCredentials = null;
    setAdminStatus(error.message || "Unable to load property listings.", true);
  }
});

adminPropertyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAdminStatus("Publishing listing…");
  const form = Object.fromEntries(new FormData(adminPropertyForm).entries());
  try {
    const result = await adminRequest("", {
      property: propertyPayload(form),
      agentName: form.agentName,
      agentPhone: form.agentPhone,
      agentEmail: form.agentEmail
    });
    adminPropertyForm.reset();
    await loadManagedProperties();
    setAdminStatus(`Published “${result.property.title}”.`);
  } catch (error) {
    setAdminStatus(error.message || "Unable to publish this listing.", true);
  }
});

adminListingGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  const property = managedProperties.find((item) => item.id === id);
  if (!property) return;
  if (action === "delete" && !window.confirm(`Delete “${property.title}”? This cannot be undone.`)) return;

  button.disabled = true;
  setAdminStatus(action === "delete" ? "Deleting listing…" : "Updating listing review…");
  try {
    if (action === "delete") {
      await adminRequest(`/${encodeURIComponent(id)}/delete`);
      setAdminStatus(`Deleted “${property.title}”.`);
    } else if (action === "review") {
      await adminRequest(`/${encodeURIComponent(id)}/review`, { status: button.dataset.status });
      setAdminStatus(`Updated “${property.title}” to ${button.dataset.status}.`);
    }
    await loadManagedProperties();
  } catch (error) {
    setAdminStatus(error.message || "Unable to update this listing.", true);
    button.disabled = false;
  }
});
