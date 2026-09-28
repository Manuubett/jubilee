// js/followups.js

import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";
import { requireRole } from "./layout.js";

// Fetched once and re-filtered locally when the dropdown
// changes, rather than re-querying Firestore every time --
// office-wide follow-up volume is expected to be modest.
let allFollowups = [];

function formatDate(date) {
  if (!date) {
    return "—";
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function classify(data) {
  const dueDate = data.dueDate?.toDate ? data.dueDate.toDate() : null;
  const isDone = data.status === "DONE";
  const isOverdue = !isDone && dueDate && dueDate < new Date();

  return { dueDate, isDone, isOverdue };
}

function renderRow(docSnap) {
  const data = docSnap.data();
  const { dueDate, isDone, isOverdue } = classify(data);

  const statusClass = isDone
    ? "badge-resolved"
    : (isOverdue ? "badge-danger" : "badge-info");

  const statusLabel = isDone
    ? "Done"
    : (isOverdue ? "Overdue" : "Pending");

  return `
    <tr>
      <td>
        <a href="./case-details.html?id=${data.caseId}" class="table-link">
          ${data.caseReference || data.caseId}
        </a>
      </td>
      <td>${data.note || "—"}</td>
      <td>${formatDate(dueDate)}</td>
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

function applyFilter() {
  const filterValue = document.getElementById("filterStatus").value;
  const tbody = document.getElementById("followupsTableBody");
  const emptyState = document.getElementById("followupsEmptyState");

  const filtered = allFollowups.filter(docSnap => {
    if (!filterValue) {
      return true;
    }

    const { isDone, isOverdue } = classify(docSnap.data());

    if (filterValue === "DONE") {
      return isDone;
    }

    if (filterValue === "OVERDUE") {
      return isOverdue;
    }

    // PENDING = not done and not overdue
    return !isDone && !isOverdue;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  tbody.innerHTML = filtered.map(renderRow).join("");

  tbody.querySelectorAll("[data-followup-id]").forEach(link => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      await markDone(event.target.dataset.followupId);
      await loadFollowups();
    });
  });
}

async function markDone(followupId) {
  try {
    await updateDoc(doc(db, "followUps", followupId), {
      status: "DONE",
      completedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to mark follow-up done:", error);
  }
}

async function loadFollowups() {
  const followupsQuery = query(
    collection(db, "followUps"),
    orderBy("dueDate", "asc"),
    limit(100)
  );

  try {
    const snapshot = await getDocs(followupsQuery);
    allFollowups = snapshot.docs;
    applyFilter();

  } catch (error) {
    console.error("Failed to load follow-ups:", error);

    document.getElementById("followupsTableBody").innerHTML = `
      <tr><td colspan="5" class="table-empty">Could not load follow-ups.</td></tr>
    `;
  }
}

async function init() {
  await requireRole(["ADMIN", "SUPERVISOR", "OFFICER"]);

  document
    .getElementById("filterStatus")
    .addEventListener("change", applyFilter);

  loadFollowups();
}

init();
