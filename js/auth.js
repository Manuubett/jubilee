import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


const form =
  document.getElementById("loginForm");

const errorBox =
  document.getElementById("loginError");


form.addEventListener("submit", async (event) => {

  event.preventDefault();

  errorBox.textContent = "";

  const email =
    document
      .getElementById("email")
      .value
      .trim();

  const password =
    document
      .getElementById("password")
      .value;


  try {

    const credential =
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );


    const uid =
      credential.user.uid;


    const userSnapshot =
      await getDoc(
        doc(db, "users", uid)
      );


    if (!userSnapshot.exists()) {

      await auth.signOut();

      throw new Error(
        "Your staff profile has not been configured."
      );
    }


    const profile =
      userSnapshot.data();


    if (profile.active !== true) {

      await auth.signOut();

      throw new Error(
        "This staff account is inactive."
      );
    }


    window.location.href =
      "dashboard.html";


  } catch (error) {

    console.error(error);

    errorBox.textContent =
      error.message ||
      "Unable to sign in.";
  }

});
