// js/users.js

import {
  collection,
  doc,
  getDocs,
  updateDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";
import { requireRole } from "./layout.js";
import { logAudit } from "./audit-log.js";

const ROLE_LABELS = {
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  OFFICER: "Officer",
  REPORT_VIEWER: "Report Viewer"
};

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

function roleOptionsHtml(selectedRole) {
  return Object.entries(ROLE_LABELS)
    .map(([value, label]) => `
      <option value="${value}" ${value === selectedRole ? "selected" : ""}>
        ${label}
      </option>
    `)
    .join("");
}

// User-supplied text (name, note...) is rendered with innerHTML, and
// people can now register themselves, so always escape it.
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderRow(docSnap) {
  const data = docSnap.data();
  const uid = docSnap.id;

  const isPending = data.role === "PENDING";
  const isDeclined = data.role === "DECLINED";
  const needsDecision = isPending || isDeclined;

  const isActive = data.active !== false && !needsDecision;

  // Never default an unapproved person to a powerful role.
  const selectedRole = needsDecision ? "OFFICER" : (data.role || "OFFICER");

  let badge = `<span class="badge ${isActive ? "badge-resolved" : "badge-neutral"}">${isActive ? "Active" : "Deactivated"}</span>`;

  if (isPending) {
    badge = `<span class="badge badge-warning">Pending approval</span>`;
  } else if (isDeclined) {
    badge = `<span class="badge badge-danger">Declined</span>`;
  }

  const requestDetails = needsDecision
    ? `<div style="font-size: 12px; color: var(--muted); margin-top: 4px;">
         ${esc(data.phone || "")}${data.requestNote ? " · " + esc(data.requestNote) : ""}
       </div>`
    : "";

  const actions = needsDecision
    ? `
        <a href="#" class="table-action-link" data-approve="${uid}">Approve</a>
        ${isPending ? `<a href="#" class="table-action-link" data-decline="${uid}">Decline</a>` : ""}
      `
    : `
        <a href="#" class="table-action-link" data-save-role="${uid}">Save Role</a>
        <a href="#" class="table-action-link" data-toggle-active="${uid}" data-active="${isActive}">
          ${isActive ? "Deactivate" : "Activate"}
        </a>
      `;

  return `
    <tr>
      <td>${esc(data.displayName || data.name || "—")}</td>
      <td>${esc(data.email || "—")}${requestDetails}</td>
      <td>
        <select class="form-control" data-role-select="${uid}" style="min-height: 36px; padding: 6px 10px;">
          ${roleOptionsHtml(selectedRole)}
        </select>
      </td>
      <td>${badge}</td>
      <td class="table-actions">${actions}</td>
    </tr>
  `;
}

async function loadUsers(currentUser) {
  const tbody = document.getElementById("usersTableBody");

  try {
    const snapshot = await getDocs(collection(db, "users"));

    if (snapshot.empty) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No users found.</td></tr>`;
      return;
    }

    // People waiting for a decision go to the top.
    const sorted = [...snapshot.docs].sort((a, b) => {
      const rank = (d) => (d.data().role === "PENDING" ? 0 : 1);
      return rank(a) - rank(b);
    });

    tbody.innerHTML = sorted.map(renderRow).join("");
    bindRowEvents(currentUser);

  } catch (error) {
    console.error("Failed to load users:", error);
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Could not load users.</td></tr>`;
  }
}

function bindRowEvents(currentUser) {
  document.querySelectorAll("[data-approve]").forEach(link => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();

      const uid = event.target.dataset.approve;
      const select = document.querySelector(`[data-role-select="${uid}"]`);
      const targetLabel = event.target.closest("tr")?.children[0]?.textContent?.trim();

      try {
        await updateDoc(doc(db, "users", uid), {
          role: select.value,
          active: true,
          approvedBy: currentUser?.uid || null,
          approvedAt: serverTimestamp()
        });

        logAudit(currentUser, "USER_APPROVED", {
          targetType: "user",
          targetId: uid,
          targetLabel,
          details: `approved as ${select.value}`
        });

        showSuccess(`${targetLabel} approved as ${ROLE_LABELS[select.value]}.`);
        loadUsers(currentUser);
      } catch (error) {
        console.error("Failed to approve user:", error);
        showError("Could not approve that user. Only an Admin can approve requests.");
      }
    });
  });

  document.querySelectorAll("[data-decline]").forEach(link => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();

      const uid = event.target.dataset.decline;
      const targetLabel = event.target.closest("tr")?.children[0]?.textContent?.trim();

      if (!window.confirm(`Decline the access request from ${targetLabel}?`)) {
        return;
      }

      try {
        await updateDoc(doc(db, "users", uid), {
          role: "DECLINED",
          active: false
        });

        logAudit(currentUser, "USER_DECLINED", {
          targetType: "user",
          targetId: uid,
          targetLabel
        });

        showSuccess("Request declined.");
        loadUsers(currentUser);
      } catch (error) {
        console.error("Failed to decline user:", error);
        showError("Could not decline that request. Only an Admin can do this.");
      }
    });
  });

  document.querySelectorAll("[data-save-role]").forEach(link => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();

      const uid = event.target.dataset.saveRole;
      const select = document.querySelector(`[data-role-select="${uid}"]`);
      const targetLabel = event.target.closest("tr")?.children[0]?.textContent?.trim();

      try {
        await updateDoc(doc(db, "users", uid), { role: select.value });

        logAudit(currentUser, "USER_ROLE_CHANGED", {
          targetType: "user",
          targetId: uid,
          targetLabel,
          details: `new role: ${select.value}`
        });

        showSuccess("Role updated.");
      } catch (error) {
        console.error("Failed to update role:", error);
        showError("Could not update that user's role.");
      }
    });
  });

  document.querySelectorAll("[data-toggle-active]").forEach(link => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();

      const uid = event.target.dataset.toggleActive;
      const currentlyActive = event.target.dataset.active === "true";
      const targetLabel = event.target.closest("tr")?.children[0]?.textContent?.trim();

      try {
        await updateDoc(doc(db, "users", uid), { active: !currentlyActive });

        logAudit(currentUser, "USER_STATUS_CHANGED", {
          targetType: "user",
          targetId: uid,
          targetLabel,
          details: currentlyActive ? "deactivated" : "activated"
        });

        showSuccess(currentlyActive ? "User deactivated." : "User activated.");
        loadUsers(currentUser);
      } catch (error) {
        console.error("Failed to toggle user status:", error);
        showError("Could not update that user's status.");
      }
    });
  });
}

/**
 * Records the person's intended role ahead of time under
 * "invitedUsers" (keyed by email, since we don't have their
 * auth uid yet). This does NOT create their sign-in
 * credentials -- that still requires an admin backend step
 * (Firebase Admin SDK or a Cloud Function that, on first
 * sign-in, looks up invitedUsers by email and creates the
 * matching users/{uid} document).
 */
async function saveInvite() {
  const name = document.getElementById("inviteName").value.trim();
  const email = document.getElementById("inviteEmail").value.trim().toLowerCase();
  const role = document.getElementById("inviteRole").value;

  const saveBtn = document.getElementById("saveInviteBtn");

  if (!name || !email) {
    showError("Please provide both a name and an email address.");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    await setDoc(doc(db, "invitedUsers", email), {
      displayName: name,
      email,
      role,
      invitedAt: serverTimestamp()
    });

    showSuccess(
      `Saved. Once ${name} signs in with ${email}, an admin will need to link their account to this role.`
    );

    document.getElementById("invitePanel").classList.add("hidden");
    document.getElementById("inviteName").value = "";
    document.getElementById("inviteEmail").value = "";

  } catch (error) {
    console.error("Failed to save invite:", error);
    showError("Could not save this invite. Please try again.");

  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save User";
  }
}

async function init() {
  const { user } = await requireRole(["ADMIN", "SUPERVISOR"]);

  loadUsers(user);

  document.getElementById("openInviteBtn").addEventListener("click", () => {
    document.getElementById("invitePanel").classList.remove("hidden");
  });

  document.getElementById("cancelInviteBtn").addEventListener("click", () => {
    document.getElementById("invitePanel").classList.add("hidden");
  });

  document.getElementById("saveInviteBtn").addEventListener("click", saveInvite);
}

init();
