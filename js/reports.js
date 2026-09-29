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
import { logAudit } from "./audit-log.js";
import { esc, csvCell } from "./utils.js";

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
  RESIGNATION: "Membership Resignation",
  COMPLAINT: "Complaint",
  OTHER: "Other"
};

const OPEN_STATUSES = ["NEW", "IN_PROGRESS", "WAITING"];
const CLOSED_STATUSES = ["RESOLVED", "CLOSED"];

// Loaded once; the date filter works on this list in memory.
let allCases = [];
let filteredCases = [];
let currentUser = null;

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(timestamp) {
  return timestamp?.toDate ? timestamp.toDate() : null;
}

function formatDate(timestamp) {
  const date = toDate(timestamp);
  return date ? date.toISOString().slice(0, 10) : "";
}

/**
 * Date + time in the office's local time, for the CSV export --
 * shows when a case was actually created/resolved, not just the
 * day, so cases from the same day can be told apart and ordered.
 */
function formatDateTime(timestamp) {
  const date = toDate(timestamp);

  if (!date) {
    return "";
  }

  const pad = (n) => String(n).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function applyDateFilter() {
  const fromValue = document.getElementById("fromDate").value;
  const toValue = document.getElementById("toDate").value;

  const from = fromValue ? new Date(`${fromValue}T00:00:00`) : null;
  const to = toValue ? new Date(`${toValue}T23:59:59`) : null;

  filteredCases = allCases.filter(docSnap => {
    const created = toDate(docSnap.data().createdAt);

    if (!created) {
      // Keep cases with no date only when no period is chosen.
      return !from && !to;
    }

    if (from && created < from) return false;
    if (to && created > to) return false;

    return true;
  });

  let periodText = "All time, this office";

  if (from || to) {
    periodText = `${fromValue || "start"} to ${toValue || "today"}`;
  }

  document.getElementById("periodText").textContent = periodText;

  renderReport();
}

function renderBreakdown(containerId, counts, labels, total) {
  const container = document.getElementById(containerId);

  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    container.innerHTML = `<p style="color: var(--muted); font-size: 13px;">No data for this period.</p>`;
    return;
  }

  container.innerHTML = entries.map(([key, count]) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const label = labels[key] || key;

    return `
      <div style="margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
          <span>${esc(label)}</span>
          <span style="color: var(--muted);">${count} (${pct}%)</span>
        </div>
        <div style="background: var(--background); border-radius: 6px; overflow: hidden; height: 8px;">
          <div style="width: ${pct}%; height: 100%; background: var(--jubilee-red);"></div>
        </div>
      </div>
    `;
  }).join("");
}

function statCard(label, value, footer, iconClass = "stat-icon-red", icon = "▣") {
  return `
    <article class="stat-card" style="padding: 16px;">
      <div class="stat-card-top">
        <div>
          <span class="stat-label">${esc(label)}</span>
          <strong class="stat-value">${value}</strong>
        </div>
        <div class="stat-icon ${iconClass}">${icon}</div>
      </div>
      <div class="stat-footer">${esc(footer)}</div>
    </article>
  `;
}

function renderCompliance() {
  const registrations = filteredCases.filter(d => d.data().service === "MEMBERSHIP_REGISTRATION");
  const resignations = filteredCases.filter(d => d.data().service === "RESIGNATION");

  const countStatus = (status) =>
    registrations.filter(d => (d.data().ippmsStatus || "NOT_SUBMITTED") === status).length;

  const cardsIssued = registrations.filter(d => d.data().cardIssued === true).length;

  const notNotified = resignations.filter(d => d.data().registrarNotified !== true);

  const now = Date.now();

  const overdue = notNotified.filter(d => {
    const notice = toDate(d.data().resignationNoticeDate);
    return notice && (notice.getTime() + 7 * DAY_MS) < now;
  });

  document.getElementById("complianceGrid").innerHTML = [
    statCard("Registrations handled", registrations.length, "Membership registration cases", "stat-icon-red", "＋"),
    statCard("Not yet in IPPMS", countStatus("NOT_SUBMITTED"), "Waiting to be submitted", "stat-icon-warning", "◷"),
    statCard("Submitted / verified", countStatus("SUBMITTED") + countStatus("VERIFIED"), "With the Registrar", "stat-icon-info", "↗"),
    statCard("Registration complete", countStatus("CONSENT_RECEIVED"), "Member consent received", "stat-icon-success", "✓"),
    statCard("Rejected / to correct", countStatus("REJECTED"), "Need fixing and resubmitting", "stat-icon-red", "!"),
    statCard("Cards issued", cardsIssued, "Membership cards handed out", "stat-icon-success", "▤"),
    statCard("Resignations received", resignations.length, "Membership resignation cases", "stat-icon-red", "↩"),
    statCard("Registrar not yet notified", notNotified.length, `${overdue.length} past the 7-day limit`, overdue.length ? "stat-icon-red" : "stat-icon-warning", "!")
  ].join("");
}

function renderReport() {
  const statusCounts = {};
  const serviceCounts = {};

  let resolvedOrClosed = 0;
  let open = 0;
  let urgentOpen = 0;

  filteredCases.forEach(docSnap => {
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

  const total = filteredCases.length;

  document.getElementById("totalCasesCount").textContent = total;
  document.getElementById("resolvedCasesCount").textContent = resolvedOrClosed;
  document.getElementById("openCasesCount").textContent = open;
  document.getElementById("urgentCasesCount").textContent = urgentOpen;

  renderBreakdown("statusBreakdown", statusCounts, STATUS_LABELS, total);
  renderBreakdown("serviceBreakdown", serviceCounts, SERVICE_LABELS, total);
  renderCompliance();
}

/**
 * Export the filtered cases as CSV. Deliberately leaves out names,
 * phone numbers and ID numbers so the file can be shared for
 * reporting without exposing anyone's personal details.
 */
function exportCsv() {
  if (filteredCases.length === 0) {
    window.alert("There are no cases in this period to export.");
    return;
  }

  const headers = [
    "Reference", "Service", "Status", "Priority", "Ward",
    "Created At", "Resolved At",
    "IPPMS status", "IPPMS reference", "Card issued",
    "Resignation notice date", "Registrar notified"
  ];

  const rows = filteredCases.map(docSnap => {
    const d = docSnap.data();

    return [
      d.reference || docSnap.id,
      SERVICE_LABELS[d.service] || d.service || "",
      STATUS_LABELS[d.status] || d.status || "",
      d.priority || "",
      d.applicantWard || "",
      formatDateTime(d.createdAt),
      formatDateTime(d.resolvedAt),
      d.service === "MEMBERSHIP_REGISTRATION" ? (d.ippmsStatus || "NOT_SUBMITTED") : "",
      d.ippmsReference || "",
      d.service === "MEMBERSHIP_REGISTRATION" ? (d.cardIssued ? "Yes" : "No") : "",
      formatDate(d.resignationNoticeDate),
      d.service === "RESIGNATION" ? (d.registrarNotified ? "Yes" : "No") : ""
    ];
  });

  const csv = [headers, ...rows]
    .map(row => row.map(csvCell).join(","))
    .join("\r\n");

  // BOM so Excel opens it with the right encoding.
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `embu-kangaru-cases-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  const from = document.getElementById("fromDate").value || "start";
  const to = document.getElementById("toDate").value || "today";

  logAudit(currentUser, "REPORT_EXPORTED", {
    targetType: "report",
    targetLabel: "Cases CSV",
    details: `${filteredCases.length} rows, ${from} to ${to}`
  });
}

async function loadReport() {
  const casesQuery = query(
    collection(db, "cases"),
    where("office", "==", OFFICE_ID),
    limit(1000)
  );

  try {
    const snapshot = await getDocs(casesQuery);
    allCases = snapshot.docs;

    document.getElementById("reportsLoading").classList.add("hidden");
    document.getElementById("reportsContent").classList.remove("hidden");

    applyDateFilter();

  } catch (error) {
    console.error("Failed to load report:", error);

    document.getElementById("reportsLoading").innerHTML = `
      <span style="color: var(--danger);">Could not load report data. Please refresh.</span>
    `;
  }
}

async function init() {
  const result = await requireRole(["ADMIN", "SUPERVISOR", "OFFICER", "REPORT_VIEWER"]);

  if (!result) {
    return;
  }

  currentUser = result.user;

  document.getElementById("fromDate").addEventListener("change", applyDateFilter);
  document.getElementById("toDate").addEventListener("change", applyDateFilter);

  document.getElementById("clearDatesBtn").addEventListener("click", () => {
    document.getElementById("fromDate").value = "";
    document.getElementById("toDate").value = "";
    applyDateFilter();
  });

  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);

  loadReport();
}

init();
