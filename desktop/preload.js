// GuardianX Desktop — Preload script
// Runs in the renderer context with limited Node.js access.
// Currently a no-op (security: contextIsolation + sandbox enabled).

window.addEventListener("DOMContentLoaded", () => {
  // Add a class to the body so the web app can detect it's running in desktop mode
  document.body.classList.add("guardianx-desktop");
});
