// js/delete-test-data.js
//
// Admin-only cleanup tool. Deletes documents from the selected
// collections in batches of 400 (Firestore's limit is 500 writes
// per batch). "users" is deliberately NOT in the list, so nobody
// can lock themselves out by purging accounts.

import {
  collection,
  query,
  where,
  limit,
  getDocs,
  getCountFromServer,
  writeBatch,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";
import { requireRole } from "./layout.js";
import { logAudit } from "./audit-log.js";

const BATCH_SIZE = 400;

// dateField is the timestamp field used for the optional cutoff.
const TARGETS = [
  { key: "cases",        label: "Service cases",       dateField: "createdAt" },
  { key: "followups",    label: "Follow-ups",          dateField: "createdAt" },
  { key: "auditLogs",    label: "Audit log entries",   dateField: "timestamp" },
  { key: "invitedUsers", label: "Pending user invites", dateField: "invitedAt" }
];

let currentUser = null;

function showError(message) {
  const box = document.getElementById("pageError");
  document.getElementById("pageSuccess").classList.add("hidden");
  box.textContent = message;
  box.classList.remove("hidden");
}

function showSuccess(message) {
  const box = document.getElementById("pageSuccess");
  document.getElementById("pageError").classList.add("hidden");
  box.textContent = message;
  box.classList.remove("hidden");
}

function getCutoff() {
  const value = document.getElementById("cutoff").value;
  return value ? new Date(value) : null;
}

function buildQuery(target, cutoff, withLimit) {
  const constraints = [];

  if (cutoff) {
    constraints.push(where(target.dateField, "<", Timestamp.fromDate(cutoff)));
  }

  if (withLimit) {
    constraints.push(limit(BATCH_SIZE));
  }

  return query(collection(db, target.key), ...constraints);
}

async function countTarget(target, cutoff) {
  const snapshot = await getCountFromServer(buildQuery(target, cutoff, false));
  return snapshot.data().count;
}

function selectedTargets() {
  return TARGETS.filter(target => {
    const box = document.querySelector(`[data-target="${target.key}"]`);
    return box && box.checked;
  });
}

function updatePurgeButton() {
  const confirmed = document.getElementById("confirmText").value.trim() === "DELETE";
  const hasSelection = selectedTargets().length > 0;

  document.getElementById("purgeBtn").disabled = !(confirmed && hasSelection);
}

async function renderTargets() {
  const body = document.getElementById("targetsBody");
  const cutoff = getCutoff();

  body.innerHTML = `<tr><td colspan="3" class="table-empty">Counting records...</td></tr>`;

  try {
    const counts = await Promise.all(TARGETS.map(target => countTarget(target, cutoff)));

    body.innerHTML = TARGETS.map((target, index) => `
      <tr>
        <td>
          <input type="checkbox" data-target="${target.key}" ${counts[index] === 0 ? "disabled" : ""} />
        </td>
        <td>${target.label} <span style="color: var(--muted); font-size: 12px;">(${target.key})</span></td>
        <td>${counts[index]}</td>
      </tr>
    `).join("");

    body.querySelectorAll("[data-target]").forEach(box => {
      box.addEventListener("change", updatePurgeButton);
    });

    updatePurgeButton();

  } catch (error) {
    console.error("Failed to count records:", error);

    body.innerHTML = `
      <tr><td colspan="3" class="table-empty">
        Could not count records. Check your Firestore rules allow admins to read these collections.
      </td></tr>
    `;
  }
}

async function purgeTarget(target, cutoff, onProgress) {
  let deleted = 0;

  // Re-query after every batch until nothing is left.
  while (true) {
    const snapshot = await getDocs(buildQuery(target, cutoff, true));

    if (snapshot.empty) {
      break;
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();

    deleted += snapshot.size;
    onProgress(deleted);
  }

  return deleted;
}

async function handlePurge() {
  const targets = selectedTargets();

  if (targets.length === 0) {
    return;
  }

  const cutoff = getCutoff();
  const names = targets.map(target => target.label).join(", ");

  const proceed = window.confirm(
    `This will permanently delete: ${names}` +
    (cutoff ? `\n\nOnly records created before ${cutoff.toLocaleString()}.` : "\n\nALL records in these collections.") +
    "\n\nContinue?"
  );

  if (!proceed) {
    return;
  }

  const purgeBtn = document.getElementById("purgeBtn");
  const progress = document.getElementById("progressText");

  purgeBtn.disabled = true;
  document.getElementById("pageError").classList.add("hidden");
  document.getElementById("pageSuccess").classList.add("hidden");

  const summary = [];

  try {
    for (const target of targets) {
      const deleted = await purgeTarget(target, cutoff, (count) => {
        progress.textContent = `Deleting ${target.label}... ${count} removed so far`;
      });

      summary.push(`${target.label}: ${deleted}`);
    }

    // Leave a trace of the purge, unless the audit log itself
    // was just wiped (in which case this becomes its first entry).
    await logAudit(currentUser, "DATA_PURGED", {
      targetType: "system",
      targetLabel: "Test data cleanup",
      details: summary.join("; ")
    });

    progress.textContent = "";
    showSuccess(`Done. ${summary.join(" · ")}`);

    document.getElementById("confirmText").value = "";
    await renderTargets();

  } catch (error) {
    console.error("Purge failed:", error);
    progress.textContent = "";

    showError(
      "The delete stopped part-way. Check the browser console and your Firestore rules " +
      "(admins need delete permission on these collections), then refresh the counts and try again."
    );

    await renderTargets();
  }
}

async function init() {
  const result = await requireRole(["ADMIN"]);

  if (!result) {
    return;
  }

  currentUser = result.user;

  document.getElementById("confirmText").addEventListener("input", updatePurgeButton);
  document.getElementById("cutoff").addEventListener("change", renderTargets);
  document.getElementById("purgeBtn").addEventListener("click", handlePurge);

  document.getElementById("refreshCountsLink").addEventListener("click", (event) => {
    event.preventDefault();
    renderTargets();
  });

  renderTargets();
}

init();
