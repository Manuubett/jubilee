// js/cases.js

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";
import { requireRole } from "./layout.js";
import { esc } from "./utils.js";

// This system serves a single branch office. Every case is
// tagged with this office id so cases from other branches
// (once the party rolls this out elsewhere) never show up
// here.
const OFFICE_ID = "EMBU_KANGARU";

const PAGE_SIZE = 10;

const STATUS_LABELS = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  WAITING: "Waiting",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
};

const STATUS_BADGE_CLASSES = {
  NEW: "badge-new",
  IN_PROGRESS: "badge-progress",
  WAITING: "badge-waiting",
  RESOLVED: "badge-resolved",
  CLOSED: "badge-closed"
};

const PRIORITY_LABELS = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent"
};

const PRIORITY_BADGE_CLASSES = {
  LOW: "badge-neutral",
  MEDIUM: "badge-info",
  HIGH: "badge-warning",
  URGENT: "badge-danger"
};

const SERVICE_LABELS = {
  MEMBERSHIP_REGISTRATION: "Membership Registration",
  CARD_REPLACEMENT: "Card Replacement",
  RECORD_UPDATE: "Record Update",
  RESIGNATION: "Membership Resignation",
  COMPLAINT: "Complaint",
  OTHER: "Other"
};

// Cursor stack: cursorHistory[i] is the last doc of page i.
// Going to page N+1 uses cursorHistory[N-1] as startAfter.
let cursorHistory = [];
let currentPageIndex = 0;
let currentPageDocs = [];

let debounceTimer = null;

function els() {
  return {
    tbody: document.getElementById("casesTableBody"),
    emptyState: document.getElementById("casesEmptyState"),
    paginationInfo: document.getElementById("paginationInfo"),
    pageNumber: document.getElementById("pageNumber"),
    prevBtn: document.getElementById("prevPageBtn"),
    nextBtn: document.getElementById("nextPageBtn"),
    filterSearch: document.getElementById("filterSearch"),
    filterStatus: document.getElementById("filterStatus"),
    filterPriority: document.getElementById("filterPriority"),
    filterService: document.getElementById("filterService")
  };
}

function currentFilters() {
  const { filterStatus, filterPriority, filterService } = els();

  return {
    status: filterStatus.value || null,
    priority: filterPriority.value || null,
    service: filterService.value || null
  };
}

function currentSearchTerm() {
  const { filterSearch } = els();
  return (filterSearch.value || "").trim().toLowerCase();
}

/**
 * Build the Firestore query for the requested page.
 *
 * Status/priority/service are applied server-side. Free-text
 * search on reference/applicant name is applied client-side
 * after fetching, since Firestore has no native substring
 * search -- see filterFetchedDocs().
 */
function buildQuery(afterDoc) {
  const casesRef = collection(db, "cases");

  const constraints = [
    where("office", "==", OFFICE_ID)
  ];

  const filters = currentFilters();

  if (filters.status) {
    constraints.push(where("status", "==", filters.status));
  }

  if (filters.priority) {
    constraints.push(where("priority", "==", filters.priority));
  }

  if (filters.service) {
    constraints.push(where("service", "==", filters.service));
  }

  constraints.push(orderBy("createdAt", "desc"));

  // Fetch a bit more than one page when a free-text search is
  // active, since some fetched rows may get filtered out
  // client-side and we still want a full page where possible.
  const searchActive = currentSearchTerm().length > 0;
  const fetchLimit = searchActive ? PAGE_SIZE * 3 : PAGE_SIZE;

  constraints.push(limit(fetchLimit));

  if (afterDoc) {
    constraints.push(startAfter(afterDoc));
  }

  return query(casesRef, ...constraints);
}

function filterFetchedDocs(docs) {
  const term = currentSearchTerm();

  if (!term) {
    return docs;
  }

  return docs.filter(docSnap => {
    const data = docSnap.data();

    const reference = (data.reference || "").toLowerCase();
    const applicant = (data.applicantName || "").toLowerCase();

    return (
      reference.includes(term) ||
      applicant.includes(term)
    );
  });
}

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

function renderRow(docSnap) {
  const data = docSnap.data();

  const statusClass = STATUS_BADGE_CLASSES[data.status] || "badge-neutral";
  const statusLabel = STATUS_LABELS[data.status] || data.status || "—";

  const priorityClass = PRIORITY_BADGE_CLASSES[data.priority] || "badge-neutral";
  const priorityLabel = PRIORITY_LABELS[data.priority] || data.priority || "—";

  const serviceLabel = SERVICE_LABELS[data.service] || data.service || "—";

  return `
    <tr>
      <td>
        <a
          href="./case-details.html?id=${esc(docSnap.id)}"
          class="table-link"
        >
          ${esc(data.reference || docSnap.id)}
        </a>
      </td>
      <td>${esc(data.applicantName || "—")}</td>
      <td>${esc(serviceLabel)}</td>
      <td>
        <span class="badge ${statusClass}">${esc(statusLabel)}</span>
      </td>
      <td>
        <span class="badge ${priorityClass}">${esc(priorityLabel)}</span>
      </td>
      <td>${formatDate(data.createdAt)}</td>
      <td class="table-actions">
        <a
          href="./case-details.html?id=${esc(docSnap.id)}"
          class="table-action-link"
        >
          View
        </a>
      </td>
    </tr>
  `;
}

function setLoading() {
  const { tbody, emptyState } = els();

  emptyState.classList.add("hidden");

  tbody.innerHTML = `
    <tr>
      <td colspan="7">
        <div class="table-loading">
          <div class="loading-spinner"></div>
          <span>Loading cases...</span>
        </div>
      </td>
    </tr>
  `;
}

function renderResults(docs) {
  const { tbody, emptyState, paginationInfo, pageNumber, prevBtn, nextBtn } = els();

  if (docs.length === 0) {
    tbody.innerHTML = "";
    emptyState.classList.remove("hidden");
  } else {
    emptyState.classList.add("hidden");
    tbody.innerHTML = docs.map(renderRow).join("");
  }

  paginationInfo.textContent = `Showing ${docs.length} case${docs.length === 1 ? "" : "s"}`;
  pageNumber.textContent = `Page ${currentPageIndex + 1}`;

  prevBtn.disabled = currentPageIndex === 0;

  // We don't know there's a next page until we've fetched a
  // full page's worth of results (post-filter). If fewer came
  // back than PAGE_SIZE, treat this as the last page.
  nextBtn.disabled = docs.length < PAGE_SIZE;
}

async function loadPage(pageIndex, afterDoc) {
  setLoading();

  try {
    const snapshot = await getDocs(buildQuery(afterDoc));

    let docs = snapshot.docs;
    docs = filterFetchedDocs(docs);
    docs = docs.slice(0, PAGE_SIZE);

    currentPageDocs = docs;
    currentPageIndex = pageIndex;

    if (docs.length > 0) {
      cursorHistory[pageIndex] = docs[docs.length - 1];
    }

    renderResults(docs);

  } catch (error) {
    console.error("Failed to load cases:", error);

    const { tbody, emptyState } = els();
    emptyState.classList.add("hidden");

    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="table-empty">
          Something went wrong loading cases. Please refresh the page.
        </td>
      </tr>
    `;
  }
}

function resetAndReload() {
  cursorHistory = [];
  currentPageIndex = 0;
  loadPage(0, null);
}

function bindEvents() {
  const {
    filterSearch,
    filterStatus,
    filterPriority,
    filterService,
    prevBtn,
    nextBtn
  } = els();

  filterSearch.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(resetAndReload, 300);
  });

  [filterStatus, filterPriority, filterService].forEach(select => {
    select.addEventListener("change", resetAndReload);
  });

  prevBtn.addEventListener("click", () => {
    if (currentPageIndex === 0) {
      return;
    }

    const targetIndex = currentPageIndex - 1;
    const afterDoc = targetIndex === 0 ? null : cursorHistory[targetIndex - 1];

    loadPage(targetIndex, afterDoc);
  });

  nextBtn.addEventListener("click", () => {
    if (currentPageDocs.length === 0) {
      return;
    }

    const afterDoc = cursorHistory[currentPageIndex];
    loadPage(currentPageIndex + 1, afterDoc);
  });
}

async function init() {
  await requireRole(["ADMIN", "SUPERVISOR", "OFFICER"]);

  bindEvents();
  loadPage(0, null);
}

init();
