// js/settings.js

import {
  getAuth,
  updatePassword
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";
import { requireRole } from "./layout.js";
import { logAudit } from "./audit-log.js";

const OFFICE_ID = "EMBU_KANGARU";
const auth = getAuth();

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

async function loadOfficeDetails() {
  try {
    const snapshot = await getDoc(doc(db, "officeSettings", OFFICE_ID));

    if (!snapshot.exists()) {
      return;
    }

    const data = snapshot.data();

    if (data.name) {
      document.getElementById("officeName").value = data.name;
    }

    if (data.phone) {
      document.getElementById("officePhone").value = data.phone;
    }

    if (data.address) {
      document.getElementById("officeAddress").value = data.address;
    }

  } catch (error) {
    console.error("Failed to load office details:", error);
  }
}

async function saveOfficeDetails(currentUser) {
  const saveBtn = document.getElementById("saveOfficeBtn");

  const name = document.getElementById("officeName").value.trim();
  const phone = document.getElementById("officePhone").value.trim();
  const address = document.getElementById("officeAddress").value.trim();

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    await setDoc(doc(db, "officeSettings", OFFICE_ID), {
      name,
      phone,
      address,
      updatedAt: serverTimestamp()
    }, { merge: true });

    logAudit(currentUser, "CASE_UPDATED", {
      targetType: "officeSettings",
      targetId: OFFICE_ID,
      targetLabel: "Office Details",
      details: "Office details updated"
    });

    showSuccess("Office details saved.");

  } catch (error) {
    console.error("Failed to save office details:", error);
    showError("Could not save office details. Please try again.");

  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Office Details";
  }
}

async function savePassword() {
  const saveBtn = document.getElementById("savePasswordBtn");

  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!newPassword || newPassword.length < 8) {
    showError("Your new password must be at least 8 characters.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showError("Passwords do not match.");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Updating...";

  try {
    await updatePassword(auth.currentUser, newPassword);

    showSuccess("Password updated.");

    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";

  } catch (error) {
    console.error("Failed to update password:", error);

    if (error.code === "auth/requires-recent-login") {
      showError("For security, please sign out and sign in again before changing your password.");
    } else {
      showError("Could not update your password. Please try again.");
    }

  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Update Password";
  }
}

async function init() {
  const { user } = await requireRole(["ADMIN"]);

  loadOfficeDetails();

  document
    .getElementById("saveOfficeBtn")
    .addEventListener("click", () => saveOfficeDetails(user));

  document
    .getElementById("savePasswordBtn")
    .addEventListener("click", savePassword);
}

init();
