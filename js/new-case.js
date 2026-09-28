// js/new-case.js

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";
import { requireRole } from "./layout.js";
import { logAudit } from "./audit-log.js";

const OFFICE_ID = "EMBU_KANGARU";

/**
 * Build a human-readable case reference, e.g. "EK-240931".
 * This is a client-side convenience label, not a strict
 * sequence -- if you need guaranteed-unique sequential
 * references, generate them in a Cloud Function instead.
 */
function generateReference() {
  const now = Date.now().toString().slice(-6);
  return `EK-${now}`;
}

function showError(message) {
  const errorBox = document.getElementById("formError");
  const successBox = document.getElementById("formSuccess");

  successBox.classList.add("hidden");

  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function showSuccess(message) {
  const errorBox = document.getElementById("formError");
  const successBox = document.getElementById("formSuccess");

  errorBox.classList.add("hidden");

  successBox.textContent = message;
  successBox.classList.remove("hidden");
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

  if (!applicantName || !applicantPhone || !service || !description) {
    showError("Please fill in all required fields before submitting.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating case...";

  try {
    const reference = generateReference();

    const docRef = await addDoc(collection(db, "cases"), {
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
      createdBy: currentUser?.uid || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showSuccess("Case created. Redirecting...");

    logAudit(currentUser, "CASE_CREATED", {
      targetType: "case",
      targetId: docRef.id,
      targetLabel: reference
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

  document
    .getElementById("newCaseForm")
    .addEventListener("submit", (event) => handleSubmit(event, user));
}

init();
