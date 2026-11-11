/**
 * The available workflow statuses.
 * Add a status here with its icon and colors to make it available everywhere.
 */
export const STATUSES = [
  {
    name: "To Do",
    icon: "circle-regular-full.svg",
    className: "to-do",
    colors: {
      dark: ["#451a03", "#fbbf24", "#92400e"],
      light: ["#fef3c7", "#92400e", "#f59e0b"],
    },
  },
  {
    name: "Waiting for Approval",
    icon: "clock-rotate-left-solid-full.svg",
    className: "waiting-for-approval",
    colors: {
      dark: ["#3b0764", "#d8b4fe", "#7e22ce"],
      light: ["#f3e8ff", "#7e22ce", "#c084fc"],
    },
  },
  {
    name: "Waiting for Reply",
    icon: "hourglass-half-solid-full.svg",
    className: "waiting-for-reply",
    colors: {
      dark: ["#082f49", "#7dd3fc", "#0369a1"],
      light: ["#e0f2fe", "#0369a1", "#38bdf8"],
    },
  },
  {
    name: "Frozen",
    icon: "snowflake-regular-full.svg",
    className: "frozen",
    colors: {
      dark: ["#083344", "#67e8f9", "#0e7490"],
      light: ["#cffafe", "#0e7490", "#22d3ee"],
    },
  },
  {
    name: "Done",
    icon: "circle-check-solid-full.svg",
    className: "done",
    colors: {
      dark: ["#052e16", "#86efac", "#15803d"],
      light: ["#dcfce7", "#166534", "#4ade80"],
    },
  },
  {
    name: "Canceled",
    icon: "circle-exclamation-solid-full.svg",
    className: "canceled",
    colors: {
      dark: ["#450a0a", "#fca5a5", "#b91c1c"],
      light: ["#fee2e2", "#b91c1c", "#f87171"],
    },
  },
];

/** The names used to populate status controls. */
export const STATUS_OPTIONS = STATUSES.map((status) => status.name);

/** Return the configured status, falling back to the default workflow state. */
export function getStatus(statusName) {
  return STATUSES.find((status) => status.name === statusName) || STATUSES[0];
}
