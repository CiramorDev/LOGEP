/** Map semantic icon names to the bundled SVG files. */
export const ICONS = {
  chevronRight: "chevron-right-solid-full.svg",
  chevronDown: "chevron-down-solid-full.svg",
  arrowUp: "arrow-up-solid-full.svg",
  arrowDown: "arrow-down-solid-full.svg",
  folder: "folder-solid-full.svg",
  folderTree: "folder-tree-solid-full.svg",
  task: "list-check-solid-full.svg",
};

/** Create a masked icon with an accessible label. */
export function iconElement(name, fallback) {
  const image = document.createElement("span");
  image.className = "ui-icon";
  image.style.maskImage = `url("/assets/icons/${ICONS[name] || name}")`;
  image.style.webkitMaskImage = image.style.maskImage;
  image.setAttribute("aria-label", fallback);
  return image;
}
