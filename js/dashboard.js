import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  collection,
  query,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


const userName = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");
const recentCases = document.getElementById("recentCases");


onAuthStateChanged(auth, async (user) => {

  if (!user) {

    window.location.href = "index.html";

    return;
  }


  userName.textContent = user.email;


  await loadRecentCases();

});


async function loadRecentCases() {

  try {

    const casesQuery = query(
      collection(db, "cases"),
      orderBy("createdAt", "desc"),
      limit(10)
    );

    const snapshot = await getDocs(casesQuery);


    if (snapshot.empty) {

      recentCases.innerHTML = `
        <tr>
          <td colspan="4">
            No cases have been created yet.
          </td>
        </tr>
      `;

      return;
    }


    recentCases.innerHTML = "";


    snapshot.forEach((doc) => {

      const data = doc.data();

      const row = document.createElement("tr");

      row.innerHTML = `
        <td>
          <strong>
            ${escapeHtml(data.caseReference || "-")}
          </strong>
        </td>

        <td>
          ${escapeHtml(data.serviceType || "-")}
        </td>

        <td>
          <span class="status ${getStatusClass(data.status)}">
            ${escapeHtml(data.status || "-")}
          </span>
        </td>

        <td>
          ${formatDate(data.createdAt)}
        </td>
      `;

      recentCases.appendChild(row);

    });


  } catch (error) {

    console.error("Could not load cases:", error);

  }

}


logoutBtn.addEventListener("click", async () => {

  try {

    await signOut(auth);

    window.location.href = "index.html";

  } catch (error) {

    console.error("Logout failed:", error);

  }

});


function getStatusClass(status) {

  if (!status) return "";

  return status
    .toLowerCase()
    .replaceAll("_", "-");

}


function formatDate(timestamp) {

  if (!timestamp) return "-";

  try {

    return timestamp
      .toDate()
      .toLocaleDateString();

  } catch {

    return "-";

  }

}


function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}
