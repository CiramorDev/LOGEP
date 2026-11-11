/** Query one element from the application document. */
export const $ = (selector) => document.querySelector(selector);

/** Set the connection/save indicator. */
export function setStatus(text, kind = "") {
  $("#save-status").textContent = text;
  $("#save-status").className = `status-dot ${kind}`;
}

/** Create an editable field with a consistent change callback. */
export function makeField(tag, value, placeholder, onChange) {
  const field = document.createElement(tag);
  field.value = value || "";
  field.placeholder = placeholder;
  field.onchange = () => onChange(field.value);
  return field;
}

/** Resize a notes field to show its content without an inner scrollbar. */
export function resizeNotes(field, collapsed = false) {
  field.style.height = "auto";
  field.style.height = `${collapsed ? 34 : Math.max(34, field.scrollHeight)}px`;
}
