const adminSearchInput = document.getElementById("adminSearch");
const adminSummary = document.getElementById("adminSummary");
const adminTableContainer = document.getElementById("adminTableContainer");
const offlineStatus = document.getElementById("offlineStatus");
const adminFormContainer = document.getElementById("adminFormContainer");
const adminForm = document.getElementById("adminForm");
const profilePhotoInput = document.getElementById("profilePhotoInput");
const profilePhotoValue = document.getElementById("profilePhotoValue");
const profilePhotoPreview = document.getElementById("profilePhotoPreview");
const profilePhotoPreviewWrap = document.getElementById("profilePhotoPreviewWrap");
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
const offlineSync = window.OfflineSync || {
  getLocalRows: () => [],
  saveLocalRows: (rows) => rows,
  getPendingQueue: () => [],
  enqueuePendingAction: (action) => action,
  removePendingAction: () => [],
  savePendingQueue: (queue) => queue
};

function updateOfflineStatus() {
  if (!offlineStatus) return;

  const online = navigator.onLine;
  offlineStatus.textContent = online ? "Online" : "Offline";
  offlineStatus.classList.toggle("online", online);
  offlineStatus.classList.toggle("offline", !online);
}

function parseCsvToRows(csvText) {
  const content = String(csvText || "");
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return [];
  }

  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";

  function parseLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === delimiter && !inQuotes) {
        values.push(current);
        current = "";
        continue;
      }

      current += char;
    }

    values.push(current);
    return values.map((value) => value.replace(/\r$/, "").trim());
  }

  const headers = parseLine(lines[0]);

  return lines.slice(1).map((line) => parseLine(line)).filter((row) => row.some((cell) => String(cell || "").trim() !== "")).map((row) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = row[index] ?? "";
    });
    return entry;
  });
}

function getQueueSyncMessage() {
  const queue = offlineSync.getPendingQueue();
  if (!queue.length) {
    return "Online";
  }

  return `Online • ${queue.length} pending`;
}

async function syncPendingActions() {
  if (!navigator.onLine) {
    updateOfflineStatus();
    return;
  }

  const queue = offlineSync.getPendingQueue();
  if (!queue.length) {
    updateOfflineStatus();
    return;
  }

  const remaining = [];

  for (const item of queue) {
    try {
      if (item.type === "create") {
        const response = await fetch("/api/realtors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.record)
        });

        if (!response.ok) {
          throw new Error("create failed");
        }
      }

      if (item.type === "update") {
        const response = await fetch(`/api/realtors/${item.index}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.record)
        });

        if (!response.ok) {
          throw new Error("update failed");
        }
      }

      if (item.type === "delete") {
        const response = await fetch(`/api/realtors/${item.index}`, { method: "DELETE" });
        if (!response.ok) {
          throw new Error("delete failed");
        }
      }

      if (item.type === "import") {
        const response = await fetch("/api/realtors/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv: item.csv })
        });

        if (!response.ok) {
          throw new Error("import failed");
        }
      }
    } catch (error) {
      remaining.push(item);
    }
  }

  offlineSync.savePendingQueue(remaining);
  if (remaining.length) {
    updateOfflineStatus();
    return;
  }

  await loadAdminRows();
  updateOfflineStatus();
}

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

  const nextNumber = ids.length ? Math.max(...ids, 1000) + 1 : 1001;
  return `R-${nextNumber}`;
}

function filterRows(rows, term) {
  const normalized = String(term ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return rows;

  const terms = normalized.split(" ").filter(Boolean);

  return rows.filter((row) => {
    return terms.every((part) => {
      return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(part));
    });
  });
}

function renderCellValue(value, columnName) {
  if (columnName === "PROFILE PHOTO" && value) {
    return `<img src="${value}" alt="Profile photo" class="table-photo" />`;
  }

  return value ?? "";
}

function renderAdminTable(rows, query = "") {
  const filteredRows = filterRows(rows || [], query);
  const defaultColumns = [
    "REALTORS NAME",
    "PROFILE PHOTO",
    "REALTOR ID NO",
    "REALTOR PHONE NO",
    "REALTOR EMAIL ADDRESS",
    "REFEREE PHONE NO"
  ];

  const columns = filteredRows && filteredRows.length
    ? Object.keys(filteredRows[0])
    : defaultColumns;

  adminSummary.innerHTML = filteredRows && filteredRows.length
    ? `<strong>${filteredRows.length}</strong> of <strong>${rows.length}</strong> record(s) shown`
    : "<strong>0</strong> record(s) shown";

  adminTableContainer.innerHTML = `
    <div class="table-paste-hint">Paste Excel rows directly into this table area.</div>
    <div class="table-wrap">
      <table class="pasteable-table" tabindex="0">
        <thead>
          <tr>
            ${columns.map((col) => `<th>${col}</th>`).join("")}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${filteredRows && filteredRows.length ? filteredRows
            .map((row) => {
              const rowIndex = rows.findIndex((r) => JSON.stringify(r) === JSON.stringify(row));
              return `
                <tr>
                  ${columns.map((col) => `<td>${renderCellValue(row[col], col)}</td>`).join("")}
                  <td>
                    <div class="row-actions">
                      <button type="button" class="small-btn edit-row-btn" data-index="${rowIndex}">Edit</button>
                      <button type="button" class="small-btn delete-row-btn" data-index="${rowIndex}">Delete</button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("") : ""}
          <tr class="new-registration-row">
            ${columns
              .map((col) => {
                const defaultValue = col === "REALTOR ID NO" ? generateNextRealtorId(adminRows) : "";
                return `
                  <td class="empty-fill-cell">
                    <input
                      class="inline-row-input"
                      type="text"
                      data-column="${col}"
                      placeholder="${col}"
                      value="${defaultValue}"
                    />
                  </td>
                `;
              })
              .join("")}
            <td>
              <button type="button" class="small-btn save-inline-row-btn">Save</button>
              <button type="button" class="small-btn add-new-row-btn secondary-btn">Form</button>
            </td>
          </tr>
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

      if (!navigator.onLine) {
        const rows = [...adminRows];
        rows.splice(index, 1);
        adminRows = rows;
        offlineSync.saveLocalRows(adminRows);
        offlineSync.enqueuePendingAction({ type: "delete", index });
        renderAdminTable(adminRows, adminSearchInput.value);
        updateOfflineStatus();
        alert("Deleted locally. It will sync automatically when the network is available.");
        return;
      }

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

  document.querySelectorAll(".add-new-row-btn").forEach((button) => {
    button.addEventListener("click", () => {
      toggleAddFormBtn.click();
    });
  });

  document.querySelectorAll(".save-inline-row-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const record = {};

      row.querySelectorAll(".inline-row-input").forEach((input) => {
        const key = input.dataset.column;
        const value = String(input.value || "").trim();
        if (key && value) {
          record[key] = value;
        }
      });

      if (!record["REALTORS NAME"] || !record["REALTOR PHONE NO"]) {
        alert("Please enter the realtor name and phone number in the table row.");
        return;
      }

      if (!record["REALTOR ID NO"]) {
        record["REALTOR ID NO"] = generateNextRealtorId(adminRows);
      }

      const response = await fetch("/api/realtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Unable to save realtor from table row.");
        return;
      }

      await loadAdminRows();
      alert("Added realtor successfully from table row.");
    });
  });

  document.querySelectorAll(".inline-row-input").forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.closest("tr").querySelector(".save-inline-row-btn").click();
        return;
      }

      if (event.key === "Tab" && input.dataset.column === "REALTOR ID NO") {
        const nextInput = input.closest("td").nextElementSibling?.querySelector(".inline-row-input");
        if (nextInput) {
          event.preventDefault();
          nextInput.focus();
        }
      }
    });

    if (input.dataset.column === "REALTOR ID NO" && !input.value.trim()) {
      input.value = generateNextRealtorId(adminRows);
    }
  });

  const table = adminTableContainer.querySelector(".pasteable-table");
  if (table) {
    table.addEventListener("paste", async (event) => {
      const clipboardText = event.clipboardData?.getData("text/plain") || "";
      if (!clipboardText.trim()) {
        return;
      }

      event.preventDefault();
      await importTableText(clipboardText);
    });
  }
}

function resetProfilePhotoField() {
  if (profilePhotoInput) {
    profilePhotoInput.value = "";
  }

  if (profilePhotoValue) {
    profilePhotoValue.value = "";
  }

  if (profilePhotoPreview) {
    profilePhotoPreview.src = "";
    profilePhotoPreview.alt = "Profile preview";
  }

  if (profilePhotoPreviewWrap) {
    profilePhotoPreviewWrap.classList.add("hidden");
  }
}

function setProfilePhotoPreview(dataUrl) {
  if (!profilePhotoPreview || !profilePhotoPreviewWrap || !profilePhotoValue) {
    return;
  }

  profilePhotoValue.value = dataUrl || "";
  profilePhotoPreview.src = dataUrl || "";
  if (dataUrl) {
    profilePhotoPreviewWrap.classList.remove("hidden");
    profilePhotoPreview.alt = "Profile preview";
  } else {
    profilePhotoPreviewWrap.classList.add("hidden");
  }
}

function resetAdminForm() {
  adminForm.reset();
  resetProfilePhotoField();
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

    if (adminRows[index]["PROFILE PHOTO"]) {
      setProfilePhotoPreview(adminRows[index]["PROFILE PHOTO"]);
    } else {
      resetProfilePhotoField();
    }
  } else {
    adminForm.reset();
    resetProfilePhotoField();
    editingIndex = null;
    const idField = adminForm.elements.namedItem("REALTOR ID NO");
    if (idField) {
      idField.value = generateNextRealtorId(adminRows);
    }
  }
}

async function loadAdminRows() {
  const cachedRows = offlineSync.getLocalRows();
  if (cachedRows.length) {
    adminRows = cachedRows;
    renderAdminTable(adminRows, adminSearchInput.value);
  }

  if (!navigator.onLine) {
    updateOfflineStatus();
    return;
  }

  try {
    const response = await fetch("/api/dashboard?role=admin");
    const data = await response.json();
    adminRows = data.rows || [];
    offlineSync.saveLocalRows(adminRows);
    renderAdminTable(adminRows, adminSearchInput.value);
    updateOfflineStatus();
  } catch (error) {
    adminRows = cachedRows;
    renderAdminTable(adminRows, adminSearchInput.value);
    updateOfflineStatus();
  }
}

async function saveAdminRecord(event) {
  event.preventDefault();

  const formData = new FormData(adminForm);
  const record = Object.fromEntries(formData.entries());

  if (!record["REALTORS NAME"] || !record["REALTOR PHONE NO"]) {
    alert("Please provide at least the realtor name and phone number.");
    return;
  }

  if (!record["REALTOR ID NO"] || !/^R-\d+$/.test(String(record["REALTOR ID NO"]).trim())) {
    record["REALTOR ID NO"] = generateNextRealtorId(adminRows);
  }

  if (!navigator.onLine) {
    const rows = [...adminRows];

    if (editingIndex !== null && rows[editingIndex]) {
      rows[editingIndex] = { ...rows[editingIndex], ...record };
      offlineSync.enqueuePendingAction({ type: "update", index: editingIndex, record: rows[editingIndex] });
    } else {
      rows.push(record);
      offlineSync.enqueuePendingAction({ type: "create", record });
    }

    adminRows = rows;
    offlineSync.saveLocalRows(adminRows);
    renderAdminTable(adminRows, adminSearchInput.value);
    resetAdminForm();
    updateOfflineStatus();
    alert("Saved locally. It will sync automatically when your connection is back.");
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

  if (!navigator.onLine) {
    const importedRows = parseCsvToRows(text);
    if (!importedRows.length) {
      alert("No valid rows were found in the pasted data.");
      return;
    }

    const rows = [...adminRows];
    importedRows.forEach((record) => {
      if (!record["REALTORS NAME"] || !record["REALTOR PHONE NO"]) {
        return;
      }

      const duplicateIndex = rows.findIndex((entry) => {
        return String(entry["REALTOR PHONE NO"] || "").trim() === String(record["REALTOR PHONE NO"] || "").trim() ||
          String(entry["REALTOR EMAIL ADDRESS"] || "").trim().toLowerCase() === String(record["REALTOR EMAIL ADDRESS"] || "").trim().toLowerCase();
      });

      if (duplicateIndex >= 0) {
        rows[duplicateIndex] = { ...rows[duplicateIndex], ...record };
        return;
      }

      rows.push(record);
    });

    adminRows = rows;
    offlineSync.saveLocalRows(adminRows);
    offlineSync.enqueuePendingAction({ type: "import", csv: text });
    renderAdminTable(adminRows, adminSearchInput.value);
    updateOfflineStatus();
    alert("Imported rows locally. They will sync automatically when the internet returns.");
    excelPasteBox.value = "";
    importCsvInput.value = "";
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

adminTableContainer.addEventListener("paste", async (event) => {
  const clipboardText = event.clipboardData?.getData("text/plain") || "";
  if (!clipboardText.trim()) {
    return;
  }

  const hasTableLikeData = /\t|,|\n/.test(clipboardText);
  if (!hasTableLikeData) {
    return;
  }

  event.preventDefault();
  await importTableText(clipboardText);
});

importPastedBtn.addEventListener("click", () => importTableText(excelPasteBox.value));
if (profilePhotoInput) {
  profilePhotoInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      resetProfilePhotoField();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfilePhotoPreview(String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  });
}

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

  updateOfflineStatus();
  window.addEventListener("online", () => {
    updateOfflineStatus();
    syncPendingActions();
  });

  window.addEventListener("offline", () => {
    updateOfflineStatus();
  });

  await loadAdminRows();
  await syncPendingActions();
})();
