// js/case-details.js

import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";
import { requireRole } from "./layout.js";
import { logAudit } from "./audit-log.js";

const SERVICE_LABELS = {
  MEMBERSHIP_REGISTRATION: "Membership Registration",
  CARD_REPLACEMENT: "Card Replacement",
  RECORD_UPDATE: "Record Update",
  COMPLAINT: "Complaint",
  OTHER: "Other"
};

function getCaseId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

// Status as last loaded/saved, used to detect a change to RESOLVED.
let loadedStatus = null;

function formatDate(timestamp) {
  if (!timestamp?.toDate) {
    return "—";
  }

  return timestamp.toDate().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function showPageError(message) {
  const box = document.getElementById("pageError");
  box.textContent = message;
  box.classList.remove("hidden");
}

function renderCaseInfo(data) {
  const grid = document.getElementById("caseInfoGrid");

  const rows = [
    ["Applicant Name", data.applicantName || "—"],
    ["Phone Number", data.applicantPhone || "—"],
    ["National ID / Membership No.", data.applicantIdNumber || "—"],
    ["Ward / Location", data.applicantWard || "—"],
    ["Service Type", SERVICE_LABELS[data.service] || data.service || "—"],
    ["Description", data.description || "—"]
  ];

  grid.innerHTML = rows.map(([label, value]) => `
    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">
        ${label}
      </div>
      <div style="font-size: 14px; color: var(--text);">
        ${value}
      </div>
    </div>
  `).join("");
}

async function loadCase(caseId) {
  const caseRef = doc(db, "cases", caseId);
  const snapshot = await getDoc(caseRef);

  if (!snapshot.exists()) {
    showPageError("This case could not be found. It may have been deleted.");
    return null;
  }

  const data = snapshot.data();

  document.getElementById("caseSubtitle").textContent =
    `${data.reference || caseId} — ${data.applicantName || "Unknown applicant"}`;

  document.getElementById("caseReferenceHeading").textContent =
    data.reference || caseId;

  document.getElementById("caseCreatedText").textContent =
    `Created ${formatDate(data.createdAt)}`;

  document.getElementById("statusSelect").value = data.status || "NEW";
  document.getElementById("prioritySelect").value = data.priority || "MEDIUM";
  loadedStatus = data.status || "NEW";

  renderCaseInfo(data);

  document.getElementById("caseLoading").classList.add("hidden");
  document.getElementById("caseContent").classList.remove("hidden");

  return data;
}

async function saveStatus(caseId, currentUser, reference) {
  const saveBtn = document.getElementById("saveStatusBtn");
  const savedMessage = document.getElementById("statusSavedMessage");

  const status = document.getElementById("statusSelect").value;
  const priority = document.getElementById("prioritySelect").value;

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const updates = {
      status,
      priority,
      updatedAt: serverTimestamp()
    };

    // The dashboard's "Resolved Today" count uses resolvedAt.
    if (status === "RESOLVED" && loadedStatus !== "RESOLVED") {
      updates.resolvedAt = serverTimestamp();
    } else if (status !== "RESOLVED" && status !== "CLOSED") {
      updates.resolvedAt = null;
    }

    await updateDoc(doc(db, "cases", caseId), updates);

    loadedStatus = status;

    logAudit(currentUser, "CASE_UPDATED", {
      targetType: "case",
      targetId: caseId,
      targetLabel: reference,
      details: `status: ${status}, priority: ${priority}`
    });

    savedMessage.classList.remove("hidden");
    window.setTimeout(() => savedMessage.classList.add("hidden"), 2500);

  } catch (error) {
    console.error("Failed to update case:", error);
    showPageError("Could not save your changes. Please try again.");

  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Changes";
  }
}

function renderFollowupRow(docSnap) {
  const data = docSnap.data();

  const isDone = data.status === "DONE";
  const dueDate = data.dueDate?.toDate ? data.dueDate.toDate() : null;
  const isOverdue = !isDone && dueDate && dueDate < new Date();

  const statusClass = isDone
    ? "badge-resolved"
    : (isOverdue ? "badge-danger" : "badge-info");

  const statusLabel = isDone
    ? "Done"
    : (isOverdue ? "Overdue" : "Pending");

  return `
    <tr>
      <td>${data.note || "—"}</td>
      <td>${dueDate ? dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td class="table-actions">
        ${isDone
          ? "—"
          : `<a href="#" class="table-action-link" data-followup-id="${docSnap.id}">Mark Done</a>`
        }
      </td>
    </tr>
  `;
}

async function loadFollowups(caseId, currentUser, reference) {
  const tbody = document.getElementById("followupsTableBody");

  const followupsQuery = query(
    collection(db, "followUps"),
    where("caseId", "==", caseId),
    orderBy("dueDate", "asc")
  );

  try {
    const snapshot = await getDocs(followupsQuery);

    if (snapshot.empty) {
      tbody.innerHTML = `<tr><td colspan="4" class="table-empty">No follow-ups yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = snapshot.docs.map(renderFollowupRow).join("");

    tbody.querySelectorAll("[data-followup-id]").forEach(link => {
      link.addEventListener("click", async (event) => {
        event.preventDefault();
        await markFollowupDone(event.target.dataset.followupId, currentUser, caseId, reference);
        loadFollowups(caseId, currentUser, reference);
      });
    });

  } catch (error) {
    console.error("Failed to load follow-ups:", error);
    tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Could not load follow-ups.</td></tr>`;
  }
}

async function markFollowupDone(followupId, currentUser, caseId, reference) {
  try {
    await updateDoc(doc(db, "followUps", followupId), {
      status: "DONE",
      completedAt: serverTimestamp()
    });

    logAudit(currentUser, "FOLLOWUP_COMPLETED", {
      targetType: "followup",
      targetId: followupId,
      targetLabel: reference || caseId
    });
  } catch (error) {
    console.error("Failed to mark follow-up done:", error);
    showPageError("Could not update that follow-up. Please try again.");
  }
}

async function addFollowup(caseId, caseReference, currentUser) {
  const noteInput = document.getElementById("followupNote");
  const dueDateInput = document.getElementById("followupDueDate");
  const addBtn = document.getElementById("addFollowupBtn");

  const note = noteInput.value.trim();
  const dueDateValue = dueDateInput.value;

  if (!note || !dueDateValue) {
    showPageError("Please provide both a note and a due date for the follow-up.");
    return;
  }

  addBtn.disabled = true;
  addBtn.textContent = "Adding...";

  try {
    const followupRef = await addDoc(collection(db, "followUps"), {
      caseId,
      caseReference: caseReference || caseId,
      note,
      dueDate: Timestamp.fromDate(new Date(dueDateValue)),
      status: "PENDING",
      createdAt: serverTimestamp()
    });

    logAudit(currentUser, "FOLLOWUP_ADDED", {
      targetType: "followup",
      targetId: followupRef.id,
      targetLabel: caseReference || caseId,
      details: note
    });

    noteInput.value = "";
    dueDateInput.value = "";

    loadFollowups(caseId, currentUser, caseReference);

  } catch (error) {
    console.error("Failed to add follow-up:", error);
    showPageError("Could not add that follow-up. Please try again.");

  } finally {
    addBtn.disabled = false;
    addBtn.textContent = "＋ Add Follow-up";
  }
}

async function init() {
  const { user } = await requireRole(["ADMIN", "SUPERVISOR", "OFFICER"]);

  const caseId = getCaseId();

  if (!caseId) {
    showPageError("No case was specified.");
    document.getElementById("caseLoading").classList.add("hidden");
    return;
  }

  const data = await loadCase(caseId);

  if (!data) {
    document.getElementById("caseLoading").classList.add("hidden");
    return;
  }

  loadFollowups(caseId, user, data.reference);

  document
    .getElementById("saveStatusBtn")
    .addEventListener("click", () => saveStatus(caseId, user, data.reference));

  document
    .getElementById("addFollowupBtn")
    .addEventListener("click", () => addFollowup(caseId, data.reference, user));
}

init();
