// js/dashboard.js

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  db
} from "./firebase.js";

import {
  initLayout
} from "./layout.js";

/* -------------------------------------------------------
   CONSTANTS
------------------------------------------------------- */

const OPEN_CASE_STATUSES = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_INFORMATION"
];

const SERVICE_LABELS = {
  REGISTRATION_ASSISTANCE:
    "Registration Assistance",

  MEMBERSHIP_STATUS_ASSISTANCE:
    "Membership Status Assistance",

  INFORMATION_UPDATE:
    "Information Update",

  MEMBERSHIP_ENQUIRY:
    "Membership Enquiry",

  REFERRAL:
    "Referral",

  OTHER:
    "Other"
};

const STATUS_LABELS = {
  NEW: "New",

  ASSIGNED:
    "Assigned",

  IN_PROGRESS:
    "In Progress",

  WAITING_FOR_INFORMATION:
    "Waiting for Information",

  RESOLVED:
    "Resolved",

  CLOSED:
    "Closed"
};

const PRIORITY_LABELS = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent"
};

/* -------------------------------------------------------
   DOM HELPERS
------------------------------------------------------- */

function element(id) {
  return document.getElementById(id);
}

function showElement(id) {
  element(id)?.classList.remove("hidden");
}

function hideElement(id) {
  element(id)?.classList.add("hidden");
}

function setText(id, value) {
  const target = element(id);

  if (target) {
    target.textContent = value;
  }
}

/* -------------------------------------------------------
   DATE HELPERS
------------------------------------------------------- */

/**
 * Return the beginning of today.
 */
function startOfToday() {
  const date = new Date();

  date.setHours(
    0,
    0,
    0,
    0
  );

  return date;
}

/**
 * Return the beginning of tomorrow.
 */
function startOfTomorrow() {
  const date = startOfToday();

  date.setDate(
    date.getDate() + 1
  );

  return date;
}

/**
 * Convert Firestore Timestamp/date/string
 * into a JavaScript Date.
 */
function toDate(value) {
  if (!value) {
    return null;
  }

  if (
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    const date =
      new Date(value);

    return Number.isNaN(
      date.getTime()
    )
      ? null
      : date;
  }

  return null;
}

/**
 * Format a date for the dashboard.
 */
function formatDate(value) {
  const date =
    toDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  ).format(date);
}

/**
 * Format date + time.
 */
function formatDateTime(value) {
  const date =
    toDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }
  ).format(date);
}

/* -------------------------------------------------------
   LABEL HELPERS
------------------------------------------------------- */

function formatServiceType(value) {
  if (!value) {
    return "—";
  }

  return (
    SERVICE_LABELS[value] ||
    value
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, char =>
        char.toUpperCase()
      )
  );
}

function formatStatus(value) {
  return (
    STATUS_LABELS[value] ||
    value ||
    "Unknown"
  );
}

function formatPriority(value) {
  return (
    PRIORITY_LABELS[value] ||
    value ||
    "Normal"
  );
}

function statusClass(status) {
  switch (status) {
    case "NEW":
      return "badge badge-info";

    case "ASSIGNED":
      return "badge badge-neutral";

    case "IN_PROGRESS":
      return "badge badge-warning";

    case "WAITING_FOR_INFORMATION":
      return "badge badge-warning";

    case "RESOLVED":
      return "badge badge-success";

    case "CLOSED":
      return "badge badge-neutral";

    default:
      return "badge badge-neutral";
  }
}

function priorityClass(priority) {
  switch (priority) {
    case "URGENT":
      return "badge badge-danger";

    case "HIGH":
      return "badge badge-warning";

    case "NORMAL":
      return "badge badge-neutral";

    case "LOW":
      return "badge badge-info";

    default:
      return "badge badge-neutral";
  }
}

/* -------------------------------------------------------
   FIRESTORE DASHBOARD COUNTS
------------------------------------------------------- */

/**
 * Count currently open cases.
 */
async function loadOpenCasesCount() {
  const casesRef =
    collection(db, "cases");

  const q = query(
    casesRef,
    where(
      "status",
      "in",
      OPEN_CASE_STATUSES
    )
  );

  const snapshot =
    await getCountFromServer(q);

  return snapshot.data().count;
}

/**
 * Count pending follow-ups.
 */
async function loadPendingFollowupsCount() {
  const followupsRef =
    collection(db, "followUps");

  const q = query(
    followupsRef,
    where(
      "status",
      "==",
      "PENDING"
    )
  );

  const snapshot =
    await getCountFromServer(q);

  return snapshot.data().count;
}

/**
 * Count cases created today.
 */
async function loadCreatedTodayCount() {
  const casesRef =
    collection(db, "cases");

  const q = query(
    casesRef,

    where(
      "createdAt",
      ">=",
      startOfToday()
    ),

    where(
      "createdAt",
      "<",
      startOfTomorrow()
    )
  );

  const snapshot =
    await getCountFromServer(q);

  return snapshot.data().count;
}

/**
 * Count cases resolved today.
 *
 * This expects resolved cases to have a
 * `resolvedAt` field.
 */
async function loadResolvedTodayCount() {
  const casesRef =
    collection(db, "cases");

  const q = query(
    casesRef,

    where(
      "status",
      "==",
      "RESOLVED"
    ),

    where(
      "resolvedAt",
      ">=",
      startOfToday()
    ),

    where(
      "resolvedAt",
      "<",
      startOfTomorrow()
    )
  );

  const snapshot =
    await getCountFromServer(q);

  return snapshot.data().count;
}

/* -------------------------------------------------------
   RECENT CASES
------------------------------------------------------- */

async function loadRecentCases() {
  const casesRef =
    collection(db, "cases");

  const q = query(
    casesRef,
    orderBy(
      "createdAt",
      "desc"
    ),
    limit(8)
  );

  const snapshot =
    await getDocs(q);

  return snapshot.docs.map(
    document => ({
      id: document.id,
      ...document.data()
    })
  );
}

/* -------------------------------------------------------
   FOLLOW-UPS
------------------------------------------------------- */

async function loadUpcomingFollowups() {
  const followupsRef =
    collection(db, "followUps");

  const q = query(
    followupsRef,

    where(
      "status",
      "==",
      "PENDING"
    ),

    orderBy(
      "dueDate",
      "asc"
    ),

    limit(6)
  );

  const snapshot =
    await getDocs(q);

  return snapshot.docs.map(
    document => ({
      id: document.id,
      ...document.data()
    })
  );
}

/* -------------------------------------------------------
   RENDER STATISTICS
------------------------------------------------------- */

function renderStatistics({
  openCases,
  pendingFollowups,
  createdToday,
  resolvedToday
}) {
  setText(
    "openCasesCount",
    openCases
  );

  setText(
    "pendingFollowupsCount",
    pendingFollowups
  );

  setText(
    "createdTodayCount",
    createdToday
  );

  setText(
    "resolvedTodayCount",
    resolvedToday
  );

  setText(
    "openCasesText",
    openCases === 1
      ? "1 case currently requiring attention"
      : `${openCases} cases currently requiring attention`
  );

  setText(
    "followupsText",
    pendingFollowups === 1
      ? "1 follow-up requiring action"
      : `${pendingFollowups} follow-ups requiring action`
  );
}

/* -------------------------------------------------------
   RENDER RECENT CASES
------------------------------------------------------- */

function renderRecentCases(cases) {
  const table =
    element("recentCasesTable");

  if (!table) {
    return;
  }

  table.innerHTML = "";

  if (!cases.length) {
    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 6;
    cell.className =
      "table-empty";

    cell.textContent =
      "No service cases have been recorded yet.";

    row.appendChild(cell);
    table.appendChild(row);

    return;
  }

  cases.forEach(caseItem => {
    const row =
      document.createElement("tr");

    /* Case reference */
    const referenceCell =
      document.createElement("td");

    const referenceLink =
      document.createElement("a");

    referenceLink.href =
      `./case-details.html?id=${encodeURIComponent(caseItem.id)}`;

    referenceLink.className =
      "table-link";

    referenceLink.textContent =
      caseItem.caseReference ||
      caseItem.id;

    referenceCell.appendChild(
      referenceLink
    );

    /* Applicant */
    const applicantCell =
      document.createElement("td");

    applicantCell.textContent =
      caseItem.applicant?.fullName ||
      "—";

    /* Service */
    const serviceCell =
      document.createElement("td");

    serviceCell.textContent =
      formatServiceType(
        caseItem.serviceType
      );

    /* Status */
    const statusCell =
      document.createElement("td");

    const statusBadge =
      document.createElement("span");

    statusBadge.className =
      statusClass(
        caseItem.status
      );

    statusBadge.textContent =
      formatStatus(
        caseItem.status
      );

    statusCell.appendChild(
      statusBadge
    );

    /* Priority */
    const priorityCell =
      document.createElement("td");

    const priorityBadge =
      document.createElement("span");

    priorityBadge.className =
      priorityClass(
        caseItem.priority
      );

    priorityBadge.textContent =
      formatPriority(
        caseItem.priority
      );

    priorityCell.appendChild(
      priorityBadge
    );

    /* Created */
    const createdCell =
      document.createElement("td");

    createdCell.textContent =
      formatDate(
        caseItem.createdAt
      );

    row.appendChild(
      referenceCell
    );

    row.appendChild(
      applicantCell
    );

    row.appendChild(
      serviceCell
    );

    row.appendChild(
      statusCell
    );

    row.appendChild(
      priorityCell
    );

    row.appendChild(
      createdCell
    );

    table.appendChild(row);
  });
}

/* -------------------------------------------------------
   RENDER FOLLOW-UPS
------------------------------------------------------- */

function renderFollowups(followups) {
  const container =
    element("followupsList");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!followups.length) {
    const empty =
      document.createElement("div");

    empty.className =
      "list-empty";

    empty.innerHTML = `
      <div class="empty-icon">✓</div>
      <strong>No pending follow-ups</strong>
      <span>There are no pending follow-up actions.</span>
    `;

    container.appendChild(empty);

    return;
  }

  followups.forEach(
    followup => {
      const item =
        document.createElement("a");

      item.className =
        "followup-item";

      item.href =
        followup.caseId
          ? `./case-details.html?id=${encodeURIComponent(followup.caseId)}`
          : "./followups.html";

      const dueDate =
        toDate(
          followup.dueDate
        );

      const isOverdue =
        dueDate &&
        dueDate.getTime() <
          Date.now();

      if (isOverdue) {
        item.classList.add(
          "followup-overdue"
        );
      }

      const title =
        document.createElement("div");

      title.className =
        "followup-item-title";

      title.textContent =
        followup.reason ||
        "Follow-up required";

      const reference =
        document.createElement("div");

      reference.className =
        "followup-item-reference";

      reference.textContent =
        followup.caseReference ||
        followup.caseId ||
        "Service case";

      const date =
        document.createElement("div");

      date.className =
        "followup-item-date";

      date.textContent =
        isOverdue
          ? `Overdue · ${formatDate(followup.dueDate)}`
          : `Due ${formatDate(followup.dueDate)}`;

      item.appendChild(title);
      item.appendChild(reference);
      item.appendChild(date);

      container.appendChild(item);
    }
  );
}

/* -------------------------------------------------------
   SEARCH
------------------------------------------------------- */

function initialiseSearch() {
  const searchInput =
    element("globalSearch");

  if (!searchInput) {
    return;
  }

  searchInput.addEventListener(
    "keydown",
    event => {
      if (
        event.key !== "Enter"
      ) {
        return;
      }

      const value =
        searchInput.value.trim();

      if (!value) {
        return;
      }

      window.location.href =
        `./cases.html?search=${encodeURIComponent(value)}`;
    }
  );
}

/* -------------------------------------------------------
   ERROR HANDLING
------------------------------------------------------- */

function showDashboardError(error) {
  console.error(
    "Dashboard error:",
    error
  );

  const errorBox =
    element("dashboardError");

  if (!errorBox) {
    return;
  }

  let message =
    "Unable to load the dashboard. Please try again.";

  if (
    error?.code ===
    "failed-precondition"
  ) {
    message =
      "Firestore requires an index for one of the dashboard queries. Open the Firebase Console and create the index requested in the error details.";
  }

  if (
    error?.code ===
    "permission-denied"
  ) {
    message =
      "You do not currently have permission to read one or more dashboard records.";
  }

  errorBox.textContent =
    message;

  errorBox.classList.remove(
    "hidden"
  );
}

/* -------------------------------------------------------
   LOAD DASHBOARD
------------------------------------------------------- */

async function loadDashboard() {
  hideElement(
    "dashboardContent"
  );

  hideElement(
    "dashboardError"
  );

  showElement(
    "dashboardLoading"
  );

  try {

    /*
     * Run independent Firestore requests
     * together for faster loading.
     */
    const [
      openCases,
      pendingFollowups,
      createdToday,
      resolvedToday,
      recentCases,
      followups
    ] = await Promise.all([
      loadOpenCasesCount(),
      loadPendingFollowupsCount(),
      loadCreatedTodayCount(),
      loadResolvedTodayCount(),
      loadRecentCases(),
      loadUpcomingFollowups()
    ]);

    renderStatistics({
      openCases,
      pendingFollowups,
      createdToday,
      resolvedToday
    });

    renderRecentCases(
      recentCases
    );

    renderFollowups(
      followups
    );

    hideElement(
      "dashboardLoading"
    );

    showElement(
      "dashboardContent"
    );

  } catch (error) {

    hideElement(
      "dashboardLoading"
    );

    showDashboardError(
      error
    );
  }
}

/* -------------------------------------------------------
   INITIALISE
------------------------------------------------------- */

async function initialiseDashboard() {
  try {

    /*
     * initLayout() checks Firebase Authentication,
     * loads the user's Firestore profile, and
     * creates the sidebar.
     */
    await initLayout();

    initialiseSearch();

    await loadDashboard();

  } catch (error) {

    console.error(
      "Dashboard initialisation failed:",
      error
    );

    showDashboardError(
      error
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initialiseDashboard
);
