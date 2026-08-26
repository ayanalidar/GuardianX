#!/bin/sh
# GuardianX recon-tools startup script.
# Uses /bin/sh (not bash) for maximum compatibility with slim Docker images.
#
# Responsibilities:
#   1. Ensure nuclei templates are downloaded (if missing — e.g. on a fresh
#      container restart with an ephemeral home dir).
#   2. Exec the Bun HTTP server.

set -e

echo "[startup] recon-tools starting"

# ── Nuclei templates ──────────────────────────────────────────────────────────
# We tried to pre-download templates during the Docker build, but the build
# network might have been unavailable. Re-check at startup: if the templates
# dir is empty, run -update-templates. This adds ~30s to the first boot if
# needed but guarantees the service works.
TEMPLATES_DIR="${HOME}/.config/nuclei/templates"
if [ ! -d "${TEMPLATES_DIR}" ] || [ -z "$(ls -A ${TEMPLATES_DIR} 2>/dev/null)" ]; then
  echo "[startup] nuclei templates missing — downloading"
  nuclei -update-templates 2>&1 | tail -5 || {
    echo "[startup] WARNING: nuclei template download failed — nuclei scans will return no findings"
  }
else
  echo "[startup] nuclei templates present (${TEMPLATES_DIR})"
fi

# ── Tool availability log ───────────────────────────────────────────────────
echo "[startup] tool versions:"
for tool in nmap ffuf sqlmap nuclei; do
  if command -v ${tool} >/dev/null 2>&1; then
    echo "  ${tool}: $(command -v ${tool})"
  else
    echo "  ${tool}: MISSING"
  fi
done

# ── Start the server ─────────────────────────────────────────────────────────
echo "[startup] launching bun index.ts on port ${PORT:-3004}"
exec bun index.ts
