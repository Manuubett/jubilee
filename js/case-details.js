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
import { esc } from "./utils.js";

const SERVICE_LABELS = {
  MEMBERSHIP_REGISTRATION: "Membership Registration",
  CARD_REPLACEMENT: "Card Replacement",
  RECORD_UPDATE: "Record Update",
  RESIGNATION: "Membership Resignation",
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
    ["National ID / Passport No.", data.applicantIdNumber || "—"],
    ["Ward / Location", data.applicantWard || "—"],
    ["Service Type", SERVICE_LABELS[data.service] || data.service || "—"],
    ["Description", data.description || "—"],
    ["Consent recorded", data.consentGiven ? "Yes — recorded at intake" : "Not recorded (older case)"]
  ];

  if (data.eligibility) {
    rows.push(["Eligibility confirmed", "Kenyan citizen, registered voter, no other party"]);
  }

  grid.innerHTML = rows.map(([label, value]) => `
    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">
        ${label}
      </div>
      <div style="font-size: 14px; color: var(--text); white-space: pre-wrap;">
        ${esc(value)}
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
      <td>${esc(data.note || "—")}</td>
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

// ---------------------------------------------------------------
// ORPP tracking panel
// ---------------------------------------------------------------

const IPPMS_STATUS_LABELS = {
  NOT_SUBMITTED: "Not yet submitted to IPPMS",
  SUBMITTED: "Submitted to IPPMS",
  VERIFIED: "Verified by the Registrar",
  CONSENT_RECEIVED: "Member consent received (registration complete)",
  REJECTED: "Rejected / needs correction"
};

function renderTracking(caseId, data, currentUser) {
  const isRegistration = data.service === "MEMBERSHIP_REGISTRATION";
  const isResignation = data.service === "RESIGNATION";

  if (!isRegistration && !isResignation) {
    return;
  }

  const panel = document.getElementById("trackingPanel");
  const fields = document.getElementById("trackingFields");

  panel.classList.remove("hidden");

  if (isRegistration) {
    document.getElementById("trackingTitle").textContent = "Membership registration tracking";
    document.getElementById("trackingSubtitle").textContent =
      "Record where this member is in the Registrar's IPPMS process. The register itself is kept in IPPMS.";

    const options = Object.entries(IPPMS_STATUS_LABELS)
      .map(([value, label]) =>
        `<option value="${value}" ${value === (data.ippmsStatus || "NOT_SUBMITTED") ? "selected" : ""}>${label}</option>`)
      .join("");

    fields.innerHTML = `
      <div class="form-group">
        <label for="ippmsStatus">IPPMS status</label>
        <select id="ippmsStatus" class="form-control">${options}</select>
      </div>

      <div class="form-group">
        <label for="ippmsReference">IPPMS reference (optional)</label>
        <input type="text" id="ippmsReference" class="form-control" value="${esc(data.ippmsReference || "")}" />
      </div>

      <div class="form-group form-grid-full">
        <label style="font-weight: 400; display: flex; gap: 8px; align-items: center;">
          <input type="checkbox" id="cardIssued" ${data.cardIssued ? "checked" : ""} />
          Membership card issued to the member
        </label>
      </div>
    `;
  }

  if (isResignation) {
    document.getElementById("trackingTitle").textContent = "Resignation tracking";

    const noticeDate = data.resignationNoticeDate?.toDate
      ? data.resignationNoticeDate.toDate()
      : null;

    let dueText = "";

    if (noticeDate) {
      const due = new Date(noticeDate);
      due.setDate(due.getDate() + 7);
      dueText = `Notice received ${noticeDate.toLocaleDateString("en-GB")}. ` +
        `The Registrar must be notified by ${due.toLocaleDateString("en-GB")}.`;
    }

    document.getElementById("trackingSubtitle").textContent = dueText;

    fields.innerHTML = `
      <div class="form-group form-grid-full">
        <label style="font-weight: 400; display: flex; gap: 8px; align-items: center;">
          <input type="checkbox" id="registrarNotified" ${data.registrarNotified ? "checked" : ""} />
          The Registrar has been notified of this resignation
        </label>
      </div>
    `;
  }

  document
    .getElementById("saveTrackingBtn")
    .addEventListener("click", () => saveTracking(caseId, data, currentUser));
}

async function saveTracking(caseId, data, currentUser) {
  const saveBtn = document.getElementById("saveTrackingBtn");
  const savedMessage = document.getElementById("trackingSavedMessage");

  const updates = { updatedAt: serverTimestamp() };
  let details = "";

  if (data.service === "MEMBERSHIP_REGISTRATION") {
    const ippmsStatus = document.getElementById("ippmsStatus").value;
    const cardIssued = document.getElementById("cardIssued").checked;

    updates.ippmsStatus = ippmsStatus;
    updates.ippmsReference = document.getElementById("ippmsReference").value.trim() || null;
    updates.cardIssued = cardIssued;

    if (cardIssued && !data.cardIssued) {
      updates.cardIssuedAt = serverTimestamp();
    }

    details = `IPPMS: ${ippmsStatus}; card issued: ${cardIssued ? "yes" : "no"}`;
  }

  if (data.service === "RESIGNATION") {
    const notified = document.getElementById("registrarNotified").checked;

    updates.registrarNotified = notified;

    if (notified && !data.registrarNotified) {
      updates.registrarNotifiedAt = serverTimestamp();
    }

    details = `Registrar notified: ${notified ? "yes" : "no"}`;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    await updateDoc(doc(db, "cases", caseId), updates);

    // Keep our local copy current so "newly ticked" checks stay right.
    if ("cardIssued" in updates) data.cardIssued = updates.cardIssued;
    if ("registrarNotified" in updates) data.registrarNotified = updates.registrarNotified;

    logAudit(currentUser, "CASE_UPDATED", {
      targetType: "case",
      targetId: caseId,
      targetLabel: data.reference,
      details
    });

    savedMessage.classList.remove("hidden");
    window.setTimeout(() => savedMessage.classList.add("hidden"), 2500);

  } catch (error) {
    console.error("Failed to save tracking:", error);
    showPageError("Could not save tracking details. Please try again.");

  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Tracking";
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

  renderTracking(caseId, data, user);

  loadFollowups(caseId, user, data.reference);

  document
    .getElementById("saveStatusBtn")
    .addEventListener("click", () => saveStatus(caseId, user, data.reference));

  document
    .getElementById("addFollowupBtn")
    .addEventListener("click", () => addFollowup(caseId, data.reference, user));
}

init();
