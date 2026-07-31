#!/bin/sh
# Switch to PostgreSQL schema for production builds (Vercel)
if [ -n "$DATABASE_URL" ]; then
  case "$DATABASE_URL" in
    postgresql://*|postgres://*)
      echo "[GuardianX] Using PostgreSQL schema for production"
      cp prisma/schema.production.prisma prisma/schema.prisma
      ;;
  esac
fi
