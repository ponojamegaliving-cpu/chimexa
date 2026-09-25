const adminSearchInput = document.getElementById("adminSearch");
const adminSummary = document.getElementById("adminSummary");
const adminTableContainer = document.getElementById("adminTableContainer");
const adminFormContainer = document.getElementById("adminFormContainer");
const adminForm = document.getElementById("adminForm");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const toggleAddFormBtn = document.getElementById("toggleAddFormBtn");
const exportAdminBtn = document.getElementById("exportAdminBtn");
const importCsvBtn = document.getElementById("importCsvBtn");
const importCsvInput = document.getElementById("importCsvInput");
const excelPasteBox = document.getElementById("excelPasteBox");
const pasteExcelBtn = document.getElementById("pasteExcelBtn");
const importPastedBtn = document.getElementById("importPastedBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");
const refreshTableBtn = document.getElementById("refreshTableBtn");

let adminRows = [];
let editingIndex = null;

function parseSavedUser() {
  try {
    const value = localStorage.getItem("realtorCurrentUser");
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function redirectToLogin() {
  localStorage.removeItem("realtorCurrentUser");
  window.location.href = "/";
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

function filterRows(rows, term) {
  const query = (term || "").trim().toLowerCase();
  if (!query) return rows;

  return rows.filter((row) => {
    return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query));
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
      openAdminForm("edit", index);
    });
  });

  document.querySelectorAll(".delete-row-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.index);
      if (!Number.isInteger(index) || index < 0) return;

      const confirmed = window.confirm("Are you sure you want to delete this realtor?");
      if (!confirmed) return;

      const response = await fetch(`/api/realtors/${index}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Unable to delete realtor");
        return;
      }

      await loadAdminRows();
      alert("Deleted realtor successfully.");
    });
  });
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

async function loadAdminRows() {
  const response = await fetch("/api/dashboard?role=admin");
  const data = await response.json();
  adminRows = data.rows || [];
  renderAdminTable(adminRows, adminSearchInput.value);
}

async function saveAdminRecord(event) {
  event.preventDefault();

  const formData = new FormData(adminForm);
  const record = Object.fromEntries(formData.entries());

  if (!record["REALTORS NAME"] || !record["REALTOR PHONE NO"]) {
    alert("Please provide at least the realtor name and phone number.");
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
    alert(data.error || "Unable to save realtor");
    return;
  }

  await loadAdminRows();
  resetAdminForm();
  alert(`${editingIndex !== null ? "Updated" : "Added"} realtor successfully.`);
}

async function importTableText(tableText) {
  const text = String(tableText || "").trim();

  if (!text) {
    alert("Paste rows from Excel before importing.");
    return;
  }

  const response = await fetch("/api/realtors/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv: text })
  });

  const data = await response.json();
  if (!response.ok) {
    alert(data.error || "Unable to import Excel data");
    importCsvInput.value = "";
    return;
  }

  adminRows = data.rows || [];
  renderAdminTable(adminRows, adminSearchInput.value);
  alert(`Imported ${adminRows.length} realtor record(s) from the pasted Excel rows.`);
  excelPasteBox.value = "";
  importCsvInput.value = "";
}

async function exportAdminRows() {
  if (!adminRows || adminRows.length === 0) {
    alert("No records to export.");
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
  alert("Exported the admin list as a CSV file.");
}

adminSearchInput.addEventListener("input", () => {
  renderAdminTable(adminRows, adminSearchInput.value);
});

toggleAddFormBtn.addEventListener("click", () => {
  if (adminFormContainer.classList.contains("hidden")) {
    openAdminForm("add");
  } else {
    resetAdminForm();
  }
});

exportAdminBtn.addEventListener("click", exportAdminRows);
importCsvBtn.addEventListener("click", () => importCsvInput.click());

importCsvInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const csvText = await file.text();
  const response = await fetch("/api/realtors/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv: csvText })
  });

  const data = await response.json();
  if (!response.ok) {
    alert(data.error || "Unable to import CSV");
    importCsvInput.value = "";
    return;
  }

  adminRows = data.rows || [];
  renderAdminTable(adminRows, adminSearchInput.value);
  alert(`Imported ${adminRows.length} realtor record(s) from the CSV file.`);
  importCsvInput.value = "";
});

pasteExcelBtn.addEventListener("click", async () => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        excelPasteBox.value = text;
        alert("Clipboard data pasted into the Excel field.");
        return;
      }
    }
  } catch (error) {
    // no-op
  }

  excelPasteBox.focus();
  alert("Use Ctrl+V to paste Excel data into the box, then click Import pasted rows.");
});

importPastedBtn.addEventListener("click", () => importTableText(excelPasteBox.value));
cancelEditBtn.addEventListener("click", resetAdminForm);
adminForm.addEventListener("submit", saveAdminRecord);
backToLoginBtn.addEventListener("click", redirectToLogin);
refreshTableBtn.addEventListener("click", loadAdminRows);

(async function initialize() {
  const user = parseSavedUser();
  if (!user || user.role !== "admin") {
    redirectToLogin();
    return;
  }

  await loadAdminRows();
})();
