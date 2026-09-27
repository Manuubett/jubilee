import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

loginForm.addEventListener("submit", async (event) => {

  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  loginMessage.textContent = "Signing in...";

  try {

    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    const user = credential.user;

    const userRef = doc(db, "users", user.uid);

    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {

      loginMessage.textContent =
        "Your account exists, but your office profile has not been configured.";

      return;
    }

    const userData = userSnap.data();

    if (userData.active !== true) {

      loginMessage.textContent =
        "This account has been deactivated.";

      return;
    }

    window.location.href = "dashboard.html";

  } catch (error) {

    console.error(error);

    switch (error.code) {

      case "auth/invalid-credential":
        loginMessage.textContent =
          "Incorrect email or password.";
        break;

      case "auth/too-many-requests":
        loginMessage.textContent =
          "Too many attempts. Please try again later.";
        break;

      default:
        loginMessage.textContent =
          "Unable to sign in. Please try again.";
    }
  }
});


onAuthStateChanged(auth, (user) => {

  if (user && window.location.pathname.endsWith("index.html")) {
    // Optional: redirect already authenticated users
  }

});
