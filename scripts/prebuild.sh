#!/bin/bash
# Switch to PostgreSQL schema for production builds (Vercel)
if [ "$DATABASE_URL" != "" ] && [[ "$DATABASE_URL" == postgresql://* ]]; then
  echo "[GuardianX] Using PostgreSQL schema for production"
  cp prisma/schema.production.prisma prisma/schema.prisma
fi
