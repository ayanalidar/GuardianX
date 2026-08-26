// GuardianX Desktop — Preload script (v2)
// Injects CSS for smooth desktop experience + desktop mode detection.

window.addEventListener("DOMContentLoaded", () => {
  // Mark body as desktop mode
  document.body.classList.add("guardianx-desktop");

  // Inject smooth scrolling + disable text selection flicker
  const style = document.createElement("style");
  style.textContent = `
    html { scroll-behavior: smooth; }
    body { -webkit-font-smoothing: antialiased; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(16,185,129,0.3); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(16,185,129,0.5); }
  `;
  document.head.appendChild(style);

  // Prevent drag-and-drop file navigation (security)
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());

  // Prevent context menu on images (cleaner UX)
  document.addEventListener("contextmenu", (e) => {
    if (e.target.tagName === "IMG") e.preventDefault();
  });
});
