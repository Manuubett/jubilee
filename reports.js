// js/reports.js

import {
  collection,
  query,
  where,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";
import { requireRole } from "./layout.js";

const OFFICE_ID = "EMBU_KANGARU";

const STATUS_LABELS = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  WAITING: "Waiting",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
};

const SERVICE_LABELS = {
  MEMBERSHIP_REGISTRATION: "Membership Registration",
  CARD_REPLACEMENT: "Card Replacement",
  RECORD_UPDATE: "Record Update",
  COMPLAINT: "Complaint",
  OTHER: "Other"
};

const OPEN_STATUSES = ["NEW", "IN_PROGRESS", "WAITING"];
const CLOSED_STATUSES = ["RESOLVED", "CLOSED"];

function renderBreakdown(containerId, counts, labels, total) {
  const container = document.getElementById(containerId);

  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    container.innerHTML = `<p style="color: var(--muted); font-size: 13px;">No data yet.</p>`;
    return;
  }

  container.innerHTML = entries.map(([key, count]) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const label = labels[key] || key;

    return `
      <div style="margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
          <span>${label}</span>
          <span style="color: var(--muted);">${count} (${pct}%)</span>
        </div>
        <div style="background: var(--background); border-radius: 6px; overflow: hidden; height: 8px;">
          <div style="width: ${pct}%; height: 100%; background: var(--jubilee-red);"></div>
        </div>
      </div>
    `;
  }).join("");
}

async function loadReport() {
  const casesQuery = query(
    collection(db, "cases"),
    where("office", "==", OFFICE_ID),
    limit(1000)
  );

  try {
    const snapshot = await getDocs(casesQuery);

    const statusCounts = {};
    const serviceCounts = {};

    let resolvedOrClosed = 0;
    let open = 0;
    let urgentOpen = 0;

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();

      statusCounts[data.status] = (statusCounts[data.status] || 0) + 1;
      serviceCounts[data.service] = (serviceCounts[data.service] || 0) + 1;

      if (CLOSED_STATUSES.includes(data.status)) {
        resolvedOrClosed += 1;
      }

      if (OPEN_STATUSES.includes(data.status)) {
        open += 1;

        if (data.priority === "URGENT") {
          urgentOpen += 1;
        }
      }
    });

    const total = snapshot.size;

    document.getElementById("totalCasesCount").textContent = total;
    document.getElementById("resolvedCasesCount").textContent = resolvedOrClosed;
    document.getElementById("openCasesCount").textContent = open;
    document.getElementById("urgentCasesCount").textContent = urgentOpen;

    renderBreakdown("statusBreakdown", statusCounts, STATUS_LABELS, total);
    renderBreakdown("serviceBreakdown", serviceCounts, SERVICE_LABELS, total);

    document.getElementById("reportsLoading").classList.add("hidden");
    document.getElementById("reportsContent").classList.remove("hidden");

  } catch (error) {
    console.error("Failed to load report:", error);

    document.getElementById("reportsLoading").innerHTML = `
      <span style="color: var(--danger);">Could not load report data. Please refresh.</span>
    `;
  }
}

async function init() {
  await requireRole(["ADMIN", "SUPERVISOR", "OFFICER", "REPORT_VIEWER"]);
  loadReport();
}

init();
