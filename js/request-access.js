// js/request-access.js
//
// Creates the person's sign-in account and a PENDING profile at
// users/{uid}. A pending profile has no access to any data (see
// firestore.rules) until an admin approves it on the Users page.

import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";

const auth = getAuth();

function showError(message) {
  const box = document.getElementById("formError");
  box.textContent = message;
  box.classList.remove("hidden");
}

function friendlyAuthError(error) {
  switch (error.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in, or ask an administrator.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/weak-password":
      return "Choose a stronger password (at least 8 characters).";
    case "auth/network-request-failed":
      return "Network problem. Check your connection and try again.";
    default:
      return "Could not send your request. Please try again.";
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  document.getElementById("formError").classList.add("hidden");

  const displayName = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const requestNote = document.getElementById("requestNote").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password.length < 8) {
    showError("Your password must be at least 8 characters.");
    return;
  }

  if (password !== confirmPassword) {
    showError("Passwords do not match.");
    return;
  }

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending request...";

  let credential;

  try {
    credential = await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("Sign-up failed:", error);
    showError(friendlyAuthError(error));
    submitBtn.disabled = false;
    submitBtn.textContent = "Send Request";
    return;
  }

  try {
    await updateProfile(credential.user, { displayName });

    // Must match the "create" rule for /users in firestore.rules:
    // role PENDING, active false, and only these fields.
    await setDoc(doc(db, "users", credential.user.uid), {
      displayName,
      email,
      phone,
      requestNote,
      role: "PENDING",
      active: false,
      requestedAt: serverTimestamp()
    });

    // They must not stay signed in until approved.
    await signOut(auth);

    document.getElementById("requestForm").classList.add("hidden");
    document.getElementById("successBox").classList.remove("hidden");

  } catch (error) {
    console.error("Could not save access request:", error);

    await signOut(auth).catch(() => {});

    showError(
      "Your account was created but the request could not be saved. " +
      "Please contact an administrator."
    );

    submitBtn.disabled = false;
    submitBtn.textContent = "Send Request";
  }
}

document
  .getElementById("requestForm")
  .addEventListener("submit", handleSubmit);
