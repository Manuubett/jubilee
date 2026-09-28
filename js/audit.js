// js/audit.js

import {
  collection,
  query,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";
import { requireRole } from "./layout.js";

const ACTION_LABELS = {
  CASE_CREATED: "Case Created",
  CASE_UPDATED: "Case Updated",
  FOLLOWUP_ADDED: "Follow-up Added",
  FOLLOWUP_COMPLETED: "Follow-up Completed",
  USER_ROLE_CHANGED: "User Role Changed",
  USER_STATUS_CHANGED: "User Status Changed",
  USER_APPROVED: "User Approved",
  USER_DECLINED: "User Declined",
  DATA_PURGED: "Test Data Deleted"
};

// Fetched once, then re-filtered locally as the person types
// or picks a different action -- audit volume for a single
// branch office is expected to be small enough for this.
let allEntries = [];

function formatTimestamp(timestamp) {
  if (!timestamp?.toDate) {
    return "—";
  }

  return timestamp.toDate().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderRow(docSnap) {
  const data = docSnap.data();

  const actionLabel = ACTION_LABELS[data.action] || data.action || "—";
  const actor = data.actorEmail || data.actorUid || "Unknown";

  return `
    <tr>
      <td>${formatTimestamp(data.timestamp)}</td>
      <td>${actor}</td>
      <td>${actionLabel}</td>
      <td>${data.targetLabel || data.targetId || "—"}</td>
      <td>${data.details || "—"}</td>
    </tr>
  `;
}

function applyFilter() {
  const actorTerm = document.getElementById("filterActor").value.trim().toLowerCase();
  const actionFilter = document.getElementById("filterAction").value;

  const tbody = document.getElementById("auditTableBody");
  const emptyState = document.getElementById("auditEmptyState");

  const filtered = allEntries.filter(docSnap => {
    const data = docSnap.data();

    if (actionFilter && data.action !== actionFilter) {
      return false;
    }

    if (actorTerm) {
      const actor = (data.actorEmail || "").toLowerCase();
      if (!actor.includes(actorTerm)) {
        return false;
      }
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  tbody.innerHTML = filtered.map(renderRow).join("");
}

async function loadAuditLog() {
  const auditQuery = query(
    collection(db, "auditLogs"),
    orderBy("timestamp", "desc"),
    limit(200)
  );

  try {
    const snapshot = await getDocs(auditQuery);
    allEntries = snapshot.docs;
    applyFilter();

  } catch (error) {
    console.error("Failed to load audit log:", error);

    document.getElementById("auditTableBody").innerHTML = `
      <tr><td colspan="5" class="table-empty">Could not load the audit log.</td></tr>
    `;
  }
}

async function init() {
  await requireRole(["ADMIN", "SUPERVISOR"]);

  document.getElementById("filterActor").addEventListener("input", applyFilter);
  document.getElementById("filterAction").addEventListener("change", applyFilter);

  loadAuditLog();
}

init();
