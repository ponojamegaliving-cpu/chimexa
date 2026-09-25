const loginBtn = document.getElementById("loginBtn");
const loadDashboardBtn = document.getElementById("loadDashboardBtn");
const loginValueInput = document.getElementById("loginValue");
const adminNameInput = document.getElementById("adminName");
const adminPasswordInput = document.getElementById("adminPassword");
const roleSelect = document.getElementById("role");
const phoneEmailFields = document.getElementById("phoneEmailFields");
const adminCredentialFields = document.getElementById("adminCredentialFields");
const result = document.getElementById("result");
const adminOnlyBox = document.getElementById("adminOnlyBox");
const adminTableContainer = document.getElementById("adminTableContainer");
const adminSearchInput = document.getElementById("adminSearch");
const adminSummary = document.getElementById("adminSummary");
const toggleAddFormBtn = document.getElementById("toggleAddFormBtn");
const exportAdminBtn = document.getElementById("exportAdminBtn");
const importCsvBtn = document.getElementById("importCsvBtn");
const importCsvInput = document.getElementById("importCsvInput");
const excelPasteBox = document.getElementById("excelPasteBox");
const pasteExcelBtn = document.getElementById("pasteExcelBtn");
const importPastedBtn = document.getElementById("importPastedBtn");
const adminFormContainer = document.getElementById("adminFormContainer");
const adminForm = document.getElementById("adminForm");
const cancelEditBtn = document.getElementById("cancelEditBtn");

let currentUser = null;
let adminRows = [];
let editingIndex = null;

function updateLoginFields() {
  const isAdmin = roleSelect.value === "admin";
  phoneEmailFields.style.display = isAdmin ? "none" : "block";
  adminCredentialFields.style.display = isAdmin ? "block" : "none";
}

roleSelect.addEventListener("change", updateLoginFields);
updateLoginFields();

function renderRows(rows) {
  if (!rows || rows.length === 0) {
    result.innerHTML = "<p>No records found for this role.</p>";
    return;
  }

  const columns = Object.keys(rows[0]);

  result.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${columns.map((col) => `<th>${col}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  ${columns
                    .map((col) => `<td>${row[col] ?? ""}</td>`)
                    .join("")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function filterRows(rows, term) {
  const query = (term || "").trim().toLowerCase();
  if (!query) return rows;

  return rows.filter((row) => {
    return Object.values(row).some((value) => {
      return String(value ?? "").toLowerCase().includes(query);
    });
  });
}

function renderAdminTable(rows, query = "") {
  const filteredRows = filterRows(rows || [], query);

  if (!filteredRows || filteredRows.length === 0) {
    adminTableContainer.innerHTML = "<p>No registered realtors match your search.</p>";
    adminSummary.innerHTML = "<strong>0</strong> record(s) shown";
    return;
  }

  const columns = Object.keys(filteredRows[0]);
  adminSummary.innerHTML = `<strong>${filteredRows.length}</strong> of <strong>${rows.length}</strong> record(s) shown`;

  adminTableContainer.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${columns.map((col) => `<th>${col}</th>`).join("")}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${filteredRows
            .map((row, index) => {
              const rowIndex = rows.findIndex((r) => JSON.stringify(r) === JSON.stringify(row));
              return `
                <tr>
                  ${columns.map((col) => `<td>${row[col] ?? ""}</td>`).join("")}
                  <td>
                    <div class="row-actions">
                      <button type="button" class="small-btn edit-row-btn" data-index="${rowIndex}">Edit</button>
                      <button type="button" class="small-btn delete-row-btn" data-index="${rowIndex}">Delete</button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  document.querySelectorAll(".edit-row-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      editAdminRecord(index);
    });
  });

  document.querySelectorAll(".delete-row-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.index);
      if (!Number.isInteger(index) || index < 0) return;

      const confirmed = window.confirm("Are you sure you want to delete this realtor?");
      if (!confirmed) return;

      const response = await fetch(`/api/realtors/${index}`, {
        method: "DELETE"
      });

      const data = await response.json();
      if (!response.ok) {
        result.innerHTML = `<p>${data.error || "Unable to delete realtor"}</p>`;
        return;
      }

      const refreshed = await fetch("/api/dashboard?role=admin");
      const refreshedData = await refreshed.json();
      adminRows = refreshedData.rows || [];
      renderAdminTable(adminRows, adminSearchInput.value);
      result.innerHTML = "<p><strong>Deleted</strong> realtor successfully.</p>";
    });
  });
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

function resetAdminForm() {
  adminForm.reset();
  editingIndex = null;
  adminFormContainer.classList.add("hidden");
}

function openAdminForm(mode = "add", index = null) {
  adminFormContainer.classList.remove("hidden");

  if (mode === "edit" && index !== null && adminRows[index]) {
    editingIndex = index;
    Object.entries(adminRows[index]).forEach(([key, value]) => {
      const field = adminForm.elements.namedItem(key);
      if (field) {
        field.value = value ?? "";
      }
    });
  } else {
    adminForm.reset();
    editingIndex = null;
    const idField = adminForm.elements.namedItem("REALTOR ID NO");
    if (idField) {
      idField.value = generateNextRealtorId(adminRows);
    }
  }
}

async function saveAdminRecord(event) {
  event.preventDefault();

  const formData = new FormData(adminForm);
  const record = Object.fromEntries(formData.entries());

  if (!record["REALTORS NAME"] || !record["REALTOR PHONE NO"]) {
    result.innerHTML = "<p>Please provide at least the realtor name and phone number.</p>";
    return;
  }

  const endpoint = editingIndex !== null ? `/api/realtors/${editingIndex}` : "/api/realtors";
  const method = editingIndex !== null ? "PUT" : "POST";

  const response = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record)
  });

  const data = await response.json();

  if (!response.ok) {
    result.innerHTML = `<p>${data.error || "Unable to save realtor"}</p>`;
    return;
  }

  const updated = await fetch("/api/dashboard?role=admin");
  const updatedData = await updated.json();
  adminRows = updatedData.rows || [];
  renderAdminTable(adminRows, adminSearchInput.value);
  resetAdminForm();
  result.innerHTML = `<p><strong>${editingIndex !== null ? "Updated" : "Added"}</strong> realtor successfully.</p>`;
}

function editAdminRecord(index) {
  openAdminForm("edit", index);
}

adminSearchInput.addEventListener("input", () => {
  if (currentUser && currentUser.role === "admin") {
    renderAdminTable(adminRows, adminSearchInput.value);
  }
});

function exportAdminRows() {
  if (!adminRows || adminRows.length === 0) {
    result.innerHTML = "<p>No records to export.</p>";
    return;
  }

  const columns = Object.keys(adminRows[0]);
  const rows = adminRows.map((row) => columns.map((col) => `"${String(row[col] ?? "").replace(/"/g, '""')}"`).join(","));
  const csv = [columns.join(","), ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "registered_realtors.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  result.innerHTML = "<p><strong>Exported</strong> the admin list as a CSV file.</p>";
}

toggleAddFormBtn.addEventListener("click", () => {
  if (adminFormContainer.classList.contains("hidden")) {
    openAdminForm("add");
  } else {
    resetAdminForm();
  }
});

exportAdminBtn.addEventListener("click", exportAdminRows);
importCsvBtn.addEventListener("click", () => importCsvInput.click());

async function importTableText(tableText) {
  const text = String(tableText || "").trim();

  if (!text) {
    result.innerHTML = "<p>Paste rows from Excel before importing.</p>";
    return;
  }

  const response = await fetch("/api/realtors/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv: text })
  });

  const data = await response.json();
  if (!response.ok) {
    result.innerHTML = `<p>${data.error || "Unable to import Excel data"}</p>`;
    importCsvInput.value = "";
    return;
  }

  adminRows = data.rows || [];
  renderAdminTable(adminRows, adminSearchInput.value);
  result.innerHTML = `<p><strong>Imported</strong> ${adminRows.length} realtor record(s) from the pasted Excel rows.</p>`;
  excelPasteBox.value = "";
  importCsvInput.value = "";
}

async function pasteFromClipboard() {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        excelPasteBox.value = text;
        result.innerHTML = "<p>Clipboard data pasted into the Excel field.</p>";
        return;
      }
    }
  } catch (error) {
    // Clipboard access may be blocked. The user can paste manually instead.
  }

  excelPasteBox.focus();
  result.innerHTML = "<p>Use Ctrl+V to paste Excel data into the box, then click Import pasted rows.</p>";
}

pasteExcelBtn.addEventListener("click", pasteFromClipboard);
importPastedBtn.addEventListener("click", () => importTableText(excelPasteBox.value));

importCsvInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  const csvText = await file.text();
  const response = await fetch("/api/realtors/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv: csvText })
  });

  const data = await response.json();
  if (!response.ok) {
    result.innerHTML = `<p>${data.error || "Unable to import CSV"}</p>`;
    importCsvInput.value = "";
    return;
  }

  adminRows = data.rows || [];
  renderAdminTable(adminRows, adminSearchInput.value);
  result.innerHTML = `<p><strong>Imported</strong> ${adminRows.length} realtor record(s) from the CSV file.</p>`;
  importCsvInput.value = "";
});
cancelEditBtn.addEventListener("click", resetAdminForm);
adminForm.addEventListener("submit", saveAdminRecord);

loginBtn.addEventListener("click", async () => {
  const role = roleSelect.value;

  if (role === "admin") {
    const adminName = adminNameInput.value.trim();
    const adminPassword = adminPasswordInput.value.trim();

    if (!adminName || !adminPassword) {
      result.innerHTML = "<p>Please enter the admin name and password.</p>";
      adminOnlyBox.style.display = "none";
      return;
    }

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, adminName, adminPassword })
    });

    const data = await response.json();

    if (!response.ok) {
      result.innerHTML = `<p>${data.error}</p>`;
      adminOnlyBox.style.display = "none";
      return;
    }

    currentUser = data.user;
    result.innerHTML = `
      <p><strong>Logged in as:</strong> ${currentUser.name}</p>
      <p><strong>Role:</strong> <span class="badge">${currentUser.role}</span></p>
    `;

    adminOnlyBox.style.display = "block";
    const adminResponse = await fetch("/api/dashboard?role=admin");
    const adminData = await adminResponse.json();
    adminRows = adminData.rows || [];
    renderAdminTable(adminRows, adminSearchInput.value);
    return;
  }

  const loginValue = loginValueInput.value.trim();

  if (!loginValue) {
    result.innerHTML = "<p>Please enter a phone number or email.</p>";
    return;
  }

  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginValue, role })
  });

  const data = await response.json();

  if (!response.ok) {
    result.innerHTML = `<p>${data.error}</p>`;
    adminOnlyBox.style.display = "none";
    return;
  }

  currentUser = data.user;
  result.innerHTML = `
    <p><strong>Logged in as:</strong> ${currentUser.name}</p>
    <p><strong>Role:</strong> <span class="badge">${currentUser.role}</span></p>
    <p><strong>Phone:</strong> ${currentUser.phone}</p>
    <p><strong>Email:</strong> ${currentUser.email}</p>
  `;

  if (currentUser.role === "admin") {
    adminOnlyBox.style.display = "block";
    const adminResponse = await fetch("/api/dashboard?role=admin");
    const adminData = await adminResponse.json();
    renderAdminTable(adminData.rows || []);
  } else {
    adminOnlyBox.style.display = "none";
  }
});

loadDashboardBtn.addEventListener("click", async () => {
  if (!currentUser) {
    result.innerHTML = "<p>Please log in first.</p>";
    return;
  }

  const response = await fetch(
    `/api/dashboard?role=${currentUser.role}&phone=${encodeURIComponent(currentUser.phone)}`
  );

  const data = await response.json();

  if (!response.ok) {
    result.innerHTML = `<p>${data.error}</p>`;
    return;
  }

  result.innerHTML = `
    <h3>${currentUser.role.toUpperCase()} DASHBOARD</h3>
  `;
  renderRows(data.rows);

  if (currentUser.role === "admin") {
    adminOnlyBox.style.display = "block";
    adminRows = data.rows || [];
    renderAdminTable(adminRows, adminSearchInput.value);
  }
});
