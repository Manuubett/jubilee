// js/cases.js

import {
  collection,
  query,
  where,
  getDocs,
  limit
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

const PAGE_SIZE = 10;

/*
 * Maximum number of records loaded into the browser
 * for this V1 case register.
 *
 * This prevents accidentally downloading the entire
 * collection.
 */
const WORKING_SET_SIZE = 100;

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
  NEW:
    "New",

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
  LOW:
    "Low",

  NORMAL:
    "Normal",

  HIGH:
    "High",

  URGENT:
    "Urgent"
};

/* -------------------------------------------------------
   STATE
------------------------------------------------------- */

const state = {
  allCases: [],
  filteredCases: [],
  currentPage: 1,
  pageSize: PAGE_SIZE,
  loading: false
};

/* -------------------------------------------------------
   DOM
------------------------------------------------------- */

function el(id) {
  return document.getElementById(id);
}

/* -------------------------------------------------------
   FORMATTING
------------------------------------------------------- */

function formatService(value) {
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

function getStatusClass(status) {
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

function getPriorityClass(priority) {
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

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

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

/* -------------------------------------------------------
   TEXT NORMALISATION
------------------------------------------------------- */

function normalise(value) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}

/* -------------------------------------------------------
   LOAD CASES
------------------------------------------------------- */

async function loadCases() {

  state.loading = true;

  showLoading();
  hideError();

  try {

    const casesRef =
      collection(db, "cases");

    /*
     * We apply no search filter here because Firestore
     * does not provide ordinary "contains" text search
     * through where().
     *
     * We do apply one server-side filter when possible,
     * then perform the combined search/filtering locally.
     */
    const status =
      el("statusFilter")?.value || "";

    let casesQuery;

    if (status) {

      casesQuery = query(
        casesRef,
        where(
          "status",
          "==",
          status
        ),
        limit(WORKING_SET_SIZE)
      );

    } else {

      casesQuery = query(
        casesRef,
        limit(WORKING_SET_SIZE)
      );
    }

    const snapshot =
      await getDocs(
        casesQuery
      );

    state.allCases =
      snapshot.docs.map(
        document => ({
          id: document.id,
          ...document.data()
        })
      );

    /*
     * Always sort the loaded working set by createdAt.
     */
    state.allCases.sort(
      (a, b) => {

        const dateA =
          toDate(a.createdAt)?.getTime() ||
          0;

        const dateB =
          toDate(b.createdAt)?.getTime() ||
          0;

        return dateB - dateA;
      }
    );

    state.currentPage = 1;

    applyFilters();

  } catch (error) {

    console.error(
      "Unable to load cases:",
      error
    );

    showError(
      error
    );

  } finally {

    state.loading = false;

    hideLoading();
  }
}

/* -------------------------------------------------------
   FILTERING
------------------------------------------------------- */

function applyFilters() {

  const search =
    normalise(
      el("caseSearch")?.value
    );

  const status =
    el("statusFilter")?.value || "";

  const service =
    el("serviceFilter")?.value || "";

  const priority =
    el("priorityFilter")?.value || "";

  state.filteredCases =
    state.allCases.filter(
      caseItem => {

        /*
         * Status
         */
        if (
          status &&
          caseItem.status !== status
        ) {
          return false;
        }

        /*
         * Service
         */
        if (
          service &&
          caseItem.serviceType !== service
        ) {
          return false;
        }

        /*
         * Priority
         */
        if (
          priority &&
          caseItem.priority !== priority
        ) {
          return false;
        }

        /*
         * Search across useful fields.
         */
        if (search) {

          const searchableText = [
            caseItem.caseReference,

            caseItem.applicant?.fullName,

            caseItem.applicant?.phone,

            caseItem.applicant?.identifierReference,

            caseItem.serviceType,

            formatService(
              caseItem.serviceType
            ),

            caseItem.status,

            formatStatus(
              caseItem.status
            )
          ]
            .map(normalise)
            .join(" ");

          if (
            !searchableText.includes(
              search
            )
          ) {
            return false;
          }
        }

        return true;
      }
    );

  state.currentPage = 1;

  renderCases();
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */

function renderCases() {

  const tableContainer =
    el("casesTableContainer");

  const empty =
    el("casesEmpty");

  const pagination =
    el("casesPagination");

  const tbody =
    el("casesTableBody");

  const results =
    state.filteredCases;

  /*
   * No records.
   */
  if (!results.length) {

    tableContainer?.classList.add(
      "hidden"
    );

    pagination?.classList.add(
      "hidden"
    );

    empty?.classList.remove(
      "hidden"
    );

    updateSummary(0);

    return;
  }

  /*
   * Records exist.
   */
  empty?.classList.add(
    "hidden"
  );

  tableContainer?.classList.remove(
    "hidden"
  );

  /*
   * Pagination.
   */
  const total =
    results.length;

  const totalPages =
    Math.ceil(
      total / state.pageSize
    );

  if (
    state.currentPage >
    totalPages
  ) {
    state.currentPage =
      totalPages;
  }

  const startIndex =
    (
      state.currentPage - 1
    ) *
    state.pageSize;

  const endIndex =
    Math.min(
      startIndex +
        state.pageSize,
      total
    );

  const visibleCases =
    results.slice(
      startIndex,
      endIndex
    );

  renderTable(
    visibleCases
  );

  renderPagination(
    startIndex,
    endIndex,
    total,
    totalPages
  );

  updateSummary(
    total
  );
}

/* -------------------------------------------------------
   TABLE
------------------------------------------------------- */

function renderTable(cases) {

  const tbody =
    el("casesTableBody");

  if (!tbody) {
    return;
  }

  tbody.innerHTML = "";

  cases.forEach(
    caseItem => {

      const row =
        document.createElement("tr");

      /*
       * Case reference
       */
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

      /*
       * Applicant
       */
      const applicantCell =
        document.createElement("td");

      applicantCell.textContent =
        caseItem.applicant?.fullName ||
        "—";

      /*
       * Phone
       */
      const phoneCell =
        document.createElement("td");

      phoneCell.textContent =
        caseItem.applicant?.phone ||
        "—";

      /*
       * Service
       */
      const serviceCell =
        document.createElement("td");

      serviceCell.textContent =
        formatService(
          caseItem.serviceType
        );

      /*
       * Status
       */
      const statusCell =
        document.createElement("td");

      const statusBadge =
        document.createElement("span");

      statusBadge.className =
        getStatusClass(
          caseItem.status
        );

      statusBadge.textContent =
        formatStatus(
          caseItem.status
        );

      statusCell.appendChild(
        statusBadge
      );

      /*
       * Priority
       */
      const priorityCell =
        document.createElement("td");

      const priorityBadge =
        document.createElement("span");

      priorityBadge.className =
        getPriorityClass(
          caseItem.priority
        );

      priorityBadge.textContent =
        formatPriority(
          caseItem.priority
        );

      priorityCell.appendChild(
        priorityBadge
      );

      /*
       * Created
       */
      const createdCell =
        document.createElement("td");

      createdCell.textContent =
        formatDate(
          caseItem.createdAt
        );

      /*
       * Action
       */
      const actionCell =
        document.createElement("td");

      const viewLink =
        document.createElement("a");

      viewLink.href =
        `./case-details.html?id=${encodeURIComponent(caseItem.id)}`;

      viewLink.className =
        "table-action-link";

      viewLink.textContent =
        "View";

      actionCell.appendChild(
        viewLink
      );

      row.appendChild(
        referenceCell
      );

      row.appendChild(
        applicantCell
      );

      row.appendChild(
        phoneCell
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

      row.appendChild(
        actionCell
      );

      tbody.appendChild(
        row
      );
    }
  );
}

/* -------------------------------------------------------
   PAGINATION
------------------------------------------------------- */

function renderPagination(
  startIndex,
  endIndex,
  total,
  totalPages
) {

  const pagination =
    el("casesPagination");

  const previousButton =
    el("previousPageBtn");

  const nextButton =
    el("nextPageBtn");

  const pageNumber =
    el("pageNumber");

  const paginationInfo =
    el("paginationInfo");

  if (!pagination) {
    return;
  }

  pagination.classList.remove(
    "hidden"
  );

  if (paginationInfo) {

    paginationInfo.textContent =
      `Showing ${startIndex + 1}–${endIndex} of ${total}`;
  }

  if (pageNumber) {

    pageNumber.textContent =
      `Page ${state.currentPage} of ${totalPages}`;
  }

  if (previousButton) {

    previousButton.disabled =
      state.currentPage <= 1;
  }

  if (nextButton) {

    nextButton.disabled =
      state.currentPage >= totalPages;
  }
}

/* -------------------------------------------------------
   SUMMARY
------------------------------------------------------- */

function updateSummary(total) {

  const summary =
    el("caseResultSummary");

  if (!summary) {
    return;
  }

  if (!total) {

    summary.textContent =
      "No cases found.";

    return;
  }

  summary.textContent =
    total === 1
      ? "1 case found."
      : `${total} cases found.`;
}

/* -------------------------------------------------------
   PAGE CONTROLS
------------------------------------------------------- */

function previousPage() {

  if (
    state.currentPage <= 1
  ) {
    return;
  }

  state.currentPage -= 1;

  renderCases();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function nextPage() {

  const totalPages =
    Math.ceil(
      state.filteredCases.length /
      state.pageSize
    );

  if (
    state.currentPage >=
    totalPages
  ) {
    return;
  }

  state.currentPage += 1;

  renderCases();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* -------------------------------------------------------
   FILTER CONTROLS
------------------------------------------------------- */

function clearFilters() {

  const caseSearch =
    el("caseSearch");

  const statusFilter =
    el("statusFilter");

  const serviceFilter =
    el("serviceFilter");

  const priorityFilter =
    el("priorityFilter");

  if (caseSearch) {
    caseSearch.value = "";
  }

  if (statusFilter) {
    statusFilter.value = "";
  }

  if (serviceFilter) {
    serviceFilter.value = "";
  }

  if (priorityFilter) {
    priorityFilter.value = "";
  }

  /*
   * Reload because status is also used as
   * an optional server-side Firestore filter.
   */
  loadCases();
}

/* -------------------------------------------------------
   GLOBAL SEARCH
------------------------------------------------------- */

function initialiseGlobalSearch() {

  const input =
    el("globalSearch");

  if (!input) {
    return;
  }

  input.addEventListener(
    "keydown",
    event => {

      if (
        event.key !== "Enter"
      ) {
        return;
      }

      const value =
        input.value.trim();

      if (!value) {
        return;
      }

      const caseSearch =
        el("caseSearch");

      if (caseSearch) {
        caseSearch.value =
          value;
      }

      applyFilters();
    }
  );
}

/* -------------------------------------------------------
   FILTER EVENTS
------------------------------------------------------- */

function initialiseFilters() {

  const caseSearch =
    el("caseSearch");

  const serviceFilter =
    el("serviceFilter");

  const priorityFilter =
    el("priorityFilter");

  const statusFilter =
    el("statusFilter");

  /*
   * Text search does not require a
   * new Firestore request.
   */
  caseSearch?.addEventListener(
    "input",
    () => {
      applyFilters();
    }
  );

  /*
   * These filters are handled locally
   * except status, which also affects
   * the Firestore query.
   */
  serviceFilter?.addEventListener(
    "change",
    () => {
      applyFilters();
    }
  );

  priorityFilter?.addEventListener(
    "change",
    () => {
      applyFilters();
    }
  );

  statusFilter?.addEventListener(
    "change",
    () => {
      loadCases();
    }
  );
}

/* -------------------------------------------------------
   BUTTON EVENTS
------------------------------------------------------- */

function initialiseButtons() {

  el("previousPageBtn")
    ?.addEventListener(
      "click",
      previousPage
    );

  el("nextPageBtn")
    ?.addEventListener(
      "click",
      nextPage
    );

  el("refreshCasesBtn")
    ?.addEventListener(
      "click",
      loadCases
    );

  el("clearFiltersBtn")
    ?.addEventListener(
      "click",
      clearFilters
    );

  el("emptyClearFiltersBtn")
    ?.addEventListener(
      "click",
      clearFilters
    );
}

/* -------------------------------------------------------
   LOADING
------------------------------------------------------- */

function showLoading() {

  el("casesLoading")
    ?.classList.remove(
      "hidden"
    );

  el("casesTableContainer")
    ?.classList.add(
      "hidden"
    );

  el("casesEmpty")
    ?.classList.add(
      "hidden"
    );
}

function hideLoading() {

  el("casesLoading")
    ?.classList.add(
      "hidden"
    );
}

/* -------------------------------------------------------
   ERROR
------------------------------------------------------- */

function hideError() {

  const errorBox =
    el("casesError");

  errorBox?.classList.add(
    "hidden"
  );
}

function showError(error) {

  const errorBox =
    el("casesError");

  if (!errorBox) {
    return;
  }

  let message =
    "Unable to load service cases.";

  if (
    error?.code ===
    "permission-denied"
  ) {

    message =
      "You do not have permission to view service cases.";
  }

  if (
    error?.code ===
    "failed-precondition"
  ) {

    message =
      "Firestore reported a query/index requirement. Check the Firebase Console for the required index.";
  }

  if (
    error?.code ===
    "unavailable"
  ) {

    message =
      "The service is temporarily unavailable. Check your internet connection and try again.";
  }

  errorBox.textContent =
    message;

  errorBox.classList.remove(
    "hidden"
  );
}

/* -------------------------------------------------------
   INITIALISE
------------------------------------------------------- */

async function initialiseCases() {

  try {

    /*
     * Authenticate user and render
     * shared application layout.
     */
    await initLayout();

    initialiseGlobalSearch();

    initialiseFilters();

    initialiseButtons();

    /*
     * Support dashboard/global search
     * links such as:
     *
     * cases.html?search=EMBU-2026
     */
    const params =
      new URLSearchParams(
        window.location.search
      );

    const initialSearch =
      params.get("search");

    if (
      initialSearch
    ) {

      const searchInput =
        el("caseSearch");

      if (searchInput) {
        searchInput.value =
          initialSearch;
      }
    }

    await loadCases();

  } catch (error) {

    console.error(
      "Cases initialisation failed:",
      error
    );

    showError(
      error
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initialiseCases
);
