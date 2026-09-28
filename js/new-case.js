// js/new-case.js

import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";
import { requireRole } from "./layout.js";
import { logAudit } from "./audit-log.js";

const OFFICE_ID = "EMBU_KANGARU";

// The party must notify the Registrar of a resignation within
// seven days of receiving it.
const RESIGNATION_NOTIFY_DAYS = 7;

/**
 * Build a human-readable case reference, e.g. "EK-240931".
 * This is a convenience label, not a strict sequence.
 */
function generateReference() {
  const now = Date.now().toString().slice(-6);
  return `EK-${now}`;
}

function showError(message) {
  const errorBox = document.getElementById("formError");
  document.getElementById("formSuccess").classList.add("hidden");

  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showSuccess(message) {
  const successBox = document.getElementById("formSuccess");
  document.getElementById("formError").classList.add("hidden");

  successBox.textContent = message;
  successBox.classList.remove("hidden");
}

function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Parse a yyyy-mm-dd input as local midnight (avoids timezone shifts). */
function parseLocalDate(value) {
  return new Date(`${value}T00:00:00`);
}

function updateServiceSections() {
  const service = document.getElementById("serviceType").value;

  const isRegistration = service === "MEMBERSHIP_REGISTRATION";
  const isResignation = service === "RESIGNATION";

  document
    .getElementById("eligibilitySection")
    .classList.toggle("hidden", !isRegistration);

  document
    .getElementById("resignationSection")
    .classList.toggle("hidden", !isResignation);

  // Registration and resignation both need the ID to find the member.
  document.getElementById("idRequiredMark").textContent =
    (isRegistration || isResignation) ? "*" : "";
}

async function handleSubmit(event, currentUser) {
  event.preventDefault();

  const submitBtn = document.getElementById("submitBtn");

  const applicantName = document.getElementById("applicantName").value.trim();
  const applicantPhone = document.getElementById("applicantPhone").value.trim();
  const applicantIdNumber = document.getElementById("applicantIdNumber").value.trim();
  const applicantWard = document.getElementById("applicantWard").value.trim();
  const service = document.getElementById("serviceType").value;
  const priority = document.getElementById("priority").value;
  const description = document.getElementById("description").value.trim();
  const consentGiven = document.getElementById("consentGiven").checked;

  if (!applicantName || !applicantPhone || !service || !description) {
    showError("Please fill in all required fields before submitting.");
    return;
  }

  const isRegistration = service === "MEMBERSHIP_REGISTRATION";
  const isResignation = service === "RESIGNATION";

  if ((isRegistration || isResignation) && !applicantIdNumber) {
    showError("The National ID or Passport number is required for this service.");
    return;
  }

  // ---- Membership registration: eligibility ----
  let eligibility = null;

  if (isRegistration) {
    const citizen = document.getElementById("eligCitizen").value;
    const voter = document.getElementById("eligVoter").value;
    const otherParty = document.getElementById("eligOtherParty").value;

    if (!citizen || !voter || !otherParty) {
      showError("Please answer all three eligibility questions.");
      return;
    }

    if (citizen !== "YES" || voter !== "YES" || otherParty !== "NO") {
      showError(
        "This person cannot be registered: a member must be a Kenyan citizen and " +
        "a registered voter, and must not belong to another political party."
      );
      return;
    }

    eligibility = {
      kenyanCitizen: true,
      registeredVoter: true,
      memberOfOtherParty: false
    };
  }

  // ---- Membership resignation: written notice ----
  let noticeDate = null;

  if (isResignation) {
    const noticeValue = document.getElementById("noticeDate").value;
    const stamped = document.getElementById("noticeStamped").checked;

    if (!noticeValue) {
      showError("Please enter the date the written notice was received.");
      return;
    }

    if (!stamped) {
      showError("A resignation must be in writing. Confirm the letter was received and stamped.");
      return;
    }

    noticeDate = parseLocalDate(noticeValue);
  }

  // ---- Consent ----
  if (!consentGiven) {
    showError("Please confirm you have explained the privacy notice and the applicant consents.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating case...";

  try {
    const reference = generateReference();

    const caseData = {
      reference,
      applicantName,
      applicantPhone,
      applicantIdNumber: applicantIdNumber || null,
      applicantWard: applicantWard || null,
      service,
      priority,
      description,
      status: "NEW",
      office: OFFICE_ID,

      // Consent recorded by the officer at intake
      consentGiven: true,
      consentRecordedBy: currentUser?.uid || null,
      consentRecordedAt: serverTimestamp(),

      createdBy: currentUser?.uid || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (isRegistration) {
      caseData.eligibility = eligibility;
      caseData.ippmsStatus = "NOT_SUBMITTED";
      caseData.ippmsReference = null;
      caseData.cardIssued = false;
    }

    if (isResignation) {
      caseData.resignationNoticeDate = Timestamp.fromDate(noticeDate);
      caseData.registrarNotified = false;
    }

    const docRef = await addDoc(collection(db, "cases"), caseData);

    // A resignation starts a seven-day clock: create the follow-up now.
    if (isResignation) {
      const dueDate = new Date(noticeDate);
      dueDate.setDate(dueDate.getDate() + RESIGNATION_NOTIFY_DAYS);

      await addDoc(collection(db, "followUps"), {
        caseId: docRef.id,
        caseReference: reference,
        note: "Notify the Registrar of this resignation (due within 7 days of the notice)",
        dueDate: Timestamp.fromDate(dueDate),
        status: "PENDING",
        createdAt: serverTimestamp()
      });
    }

    showSuccess("Case created. Redirecting...");

    logAudit(currentUser, "CASE_CREATED", {
      targetType: "case",
      targetId: docRef.id,
      targetLabel: reference,
      details: `service: ${service}; consent recorded`
    });

    window.setTimeout(() => {
      window.location.href = `./case-details.html?id=${docRef.id}`;
    }, 800);

  } catch (error) {
    console.error("Failed to create case:", error);
    showError("Something went wrong creating this case. Please try again.");

    submitBtn.disabled = false;
    submitBtn.textContent = "Create Case";
  }
}

async function init() {
  const { user } = await requireRole(["ADMIN", "SUPERVISOR", "OFFICER"]);

  document.getElementById("noticeDate").value = todayInputValue();

  document
    .getElementById("serviceType")
    .addEventListener("change", updateServiceSections);

  document
    .getElementById("newCaseForm")
    .addEventListener("submit", (event) => handleSubmit(event, user));

  updateServiceSections();
}

init();
