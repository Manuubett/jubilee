// js/utils.js
// Small shared helpers.

/**
 * Escape text before putting it into innerHTML. Names, notes and
 * descriptions are typed by people, so never insert them raw.
 */
export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * One CSV cell. Cells starting with = + - @ are prefixed with an
 * apostrophe so spreadsheet programs don't run them as formulas.
 */
export function csvCell(value) {
  let text = String(value ?? "");

  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }

  if (/[",\n\r]/.test(text)) {
    text = '"' + text.replaceAll('"', '""') + '"';
  }

  return text;
}
