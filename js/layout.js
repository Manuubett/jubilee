// js/layout.js

import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  db
} from "./firebase.js";

const auth = getAuth();

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "./dashboard.html",
    icon: "▦",
    roles: ["ADMIN", "SUPERVISOR", "OFFICER", "REPORT_VIEWER"]
  },
  {
    label: "New Service Case",
    href: "./new-case.html",
    icon: "＋",
    roles: ["ADMIN", "SUPERVISOR", "OFFICER"]
  },
  {
    label: "Cases",
    href: "./cases.html",
    icon: "▣",
    roles: ["ADMIN", "SUPERVISOR", "OFFICER"]
  },
  {
    label: "Follow-ups",
    href: "./followups.html",
    icon: "◷",
    roles: ["ADMIN", "SUPERVISOR", "OFFICER"]
  },
  {
    label: "Reports",
    href: "./reports.html",
    icon: "▤",
    roles: ["ADMIN", "SUPERVISOR", "OFFICER", "REPORT_VIEWER"]
  },
  {
    label: "Users",
    href: "./users.html",
    icon: "♙",
    roles: ["ADMIN", "SUPERVISOR"]
  },
  {
    label: "Audit Log",
    href: "./audit.html",
    icon: "◉",
    roles: ["ADMIN", "SUPERVISOR"]
  },
  {
    label: "Settings",
    href: "./settings.html",
    icon: "⚙",
    roles: ["ADMIN"]
  }
];

/**
 * Convert a role into a readable label.
 */
function formatRole(role) {
  if (!role) {
    return "USER";
  }

  return role
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, character => character.toUpperCase());
}

/**
 * Get the current HTML filename.
 */
function getCurrentPage() {
  const path = window.location.pathname;

  const filename = path
    .split("/")
    .pop();

  return filename || "dashboard.html";
}

/**
 * Determine whether a navigation item is active.
 */
function isActivePage(href) {
  const currentPage = getCurrentPage();

  return href.endsWith(currentPage);
}

/**
 * Build the sidebar.
 */
function renderSidebar(profile) {
  const role = profile?.role || "OFFICER";

  const navigation = NAV_ITEMS
    .filter(item => item.roles.includes(role))
    .map(item => {
      const activeClass = isActivePage(item.href)
        ? "active"
        : "";

      return `
        <a
          href="${item.href}"
          class="sidebar-link ${activeClass}"
          data-nav-item="${item.label}"
        >
          <span class="sidebar-link-icon">
            ${item.icon}
          </span>

          <span class="sidebar-link-label">
            ${item.label}
          </span>
        </a>
      `;
    })
    .join("");

  return `
    <aside
      class="sidebar"
      id="sidebar"
    >
      <div class="sidebar-brand">

        <div class="brand-mark">
          J
        </div>

        <div class="brand-text">
          <strong>JUBILEE</strong>
          <span>EMBU OFFICE</span>
        </div>

        <button
          type="button"
          class="sidebar-close"
          id="sidebarClose"
          aria-label="Close navigation"
        >
          ×
        </button>

      </div>

      <div class="sidebar-section-label">
        OFFICE SYSTEM
      </div>

      <nav class="sidebar-nav">
        ${navigation}
      </nav>

      <div class="sidebar-bottom">

        <div class="sidebar-user">

          <div
            class="user-avatar sidebar-avatar"
            id="sidebarUserAvatar"
          >
            U
          </div>

          <div class="sidebar-user-info">
            <strong id="sidebarUserName">
              User
            </strong>

            <span id="sidebarUserRole">
              ${formatRole(role)}
            </span>
          </div>

        </div>

        <button
          type="button"
          class="logout-btn"
          id="logoutBtn"
        >
          <span>↪</span>
          <span>Sign out</span>
        </button>

      </div>
    </aside>

    <div
      class="sidebar-overlay"
      id="sidebarOverlay"
    ></div>
  `;
}

/**
 * Create the application shell.
 */
function renderShell(profile) {
  const shell = document.getElementById("app-shell");

  if (!shell) {
    return;
  }

  shell.innerHTML = renderSidebar(profile);

  updateUserDetails(profile);
  bindSidebarEvents();
}

/**
 * Update user information displayed by the shell.
 */
function updateUserDetails(profile) {
  const displayName =
    profile?.displayName ||
    profile?.name ||
    "User";

  const role =
    profile?.role ||
    "OFFICER";

  const initials = getInitials(displayName);

  const topbarUserName =
    document.getElementById("topbarUserName");

  const topbarUserRole =
    document.getElementById("topbarUserRole");

  const topbarAvatar =
    document.getElementById("userAvatar");

  const sidebarUserName =
    document.getElementById("sidebarUserName");

  const sidebarUserRole =
    document.getElementById("sidebarUserRole");

  const sidebarAvatar =
    document.getElementById("sidebarUserAvatar");

  const welcomeText =
    document.getElementById("welcomeText");

  if (topbarUserName) {
    topbarUserName.textContent = displayName;
  }

  if (topbarUserRole) {
    topbarUserRole.textContent = formatRole(role);
  }

  if (topbarAvatar) {
    topbarAvatar.textContent = initials;
  }

  if (sidebarUserName) {
    sidebarUserName.textContent = displayName;
  }

  if (sidebarUserRole) {
    sidebarUserRole.textContent = formatRole(role);
  }

  if (sidebarAvatar) {
    sidebarAvatar.textContent = initials;
  }

  if (welcomeText) {
    welcomeText.textContent =
      `Here is the current service activity for the Embu office.`;
  }
}

/**
 * Generate initials for the user avatar.
 */
function getInitials(name) {
  if (!name) {
    return "U";
  }

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0]
      .substring(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}

/**
 * Bind sidebar/mobile/logout events.
 */
function bindSidebarEvents() {
  const sidebar =
    document.getElementById("sidebar");

  const overlay =
    document.getElementById("sidebarOverlay");

  const closeButton =
    document.getElementById("sidebarClose");

  const mobileMenuButton =
    document.getElementById("mobileMenuBtn");

  const logoutButton =
    document.getElementById("logoutBtn");

  function openSidebar() {
    sidebar?.classList.add("open");
    overlay?.classList.add("show");
    document.body.classList.add("sidebar-open");
  }

  function closeSidebar() {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("show");
    document.body.classList.remove("sidebar-open");
  }

  mobileMenuButton?.addEventListener(
    "click",
    openSidebar
  );

  closeButton?.addEventListener(
    "click",
    closeSidebar
  );

  overlay?.addEventListener(
    "click",
    closeSidebar
  );

  document
    .querySelectorAll(".sidebar-link")
    .forEach(link => {
      link.addEventListener(
        "click",
        closeSidebar
      );
    });

  logoutButton?.addEventListener(
    "click",
    async () => {
      const shouldLogout =
        window.confirm(
          "Are you sure you want to sign out?"
        );

      if (!shouldLogout) {
        return;
      }

      try {
        await signOut(auth);

        window.location.href =
          "./index.html";

      } catch (error) {
        console.error(
          "Sign out failed:",
          error
        );

        window.alert(
          "Unable to sign out. Please try again."
        );
      }
    }
  );
}

/**
 * Load the user's Firestore profile.
 */
async function getUserProfile(user) {
  if (!user) {
    return null;
  }

  try {
    const userRef =
      doc(db, "users", user.uid);

    const snapshot =
      await getDoc(userRef);

    if (!snapshot.exists()) {
      return {
        uid: user.uid,
        displayName:
          user.displayName ||
          user.email ||
          "User",
        email: user.email || "",
        role: "OFFICER",
        active: true
      };
    }

    return {
      uid: user.uid,
      ...snapshot.data()
    };

  } catch (error) {
    console.error(
      "Unable to load user profile:",
      error
    );

    return {
      uid: user.uid,
      displayName:
        user.displayName ||
        user.email ||
        "User",
      email: user.email || "",
      role: "OFFICER",
      active: true
    };
  }
}

/**
 * Initialise the shared application layout.
 *
 * Returns the Firebase user and Firestore profile.
 */
export function initLayout() {
  return new Promise((resolve) => {

    onAuthStateChanged(
      auth,
      async (user) => {

        if (!user) {
          window.location.href =
            "./index.html";

          return;
        }

        const profile =
          await getUserProfile(user);

        if (
          profile &&
          profile.active === false
        ) {
          await signOut(auth);

          window.alert(
            "Your account has been deactivated. Please contact an administrator."
          );

          window.location.href =
            "./index.html";

          return;
        }

        renderShell(profile);

        resolve({
          user,
          profile
        });
      }
    );

  });
}

/**
 * Require a specific role for a page.
 */
export async function requireRole(
  allowedRoles = []
) {
  const result =
    await initLayout();

  const role =
    result.profile?.role;

  if (
    allowedRoles.length > 0 &&
    !allowedRoles.includes(role)
  ) {
    window.alert(
      "You do not have permission to access this page."
    );

    window.location.href =
      "./dashboard.html";

    return null;
  }

  return result;
}
