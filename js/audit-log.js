// js/audit-log.js

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";

/**
 * Write one audit log entry. Never throws -- a failed audit
 * write should not block the action it's describing, it
 * should just be logged to the console for follow-up.
 */
export async function logAudit(actorUser, action, { targetType, targetId, targetLabel, details } = {}) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      actorUid: actorUser?.uid || null,
      actorEmail: actorUser?.email || null,
      action,
      targetType: targetType || null,
      targetId: targetId || null,
      targetLabel: targetLabel || null,
      details: details || null,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to write audit log entry:", error);
  }
}
