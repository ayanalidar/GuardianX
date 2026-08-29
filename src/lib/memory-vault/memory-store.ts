// AI Memory Vault — Supabase-backed structured memory for the Guardian AI.
//
// The vault stores concise (≤500 char) "memories" tied to a user id: scan
// results, findings, patches, user preferences, conversations, client
// context, and threat intel. The chat route pulls `buildContextForChat`
// (see memory-context.ts) into its system prompt so the assistant can
// say things like "Last time you scanned CyberShield we found 3 SQL
// injections — 2 are still unpatched."
//
// Storage: Supabase table "MemoryEntry" (see supabase/migrations/
// 0009_memory_vault.sql). The db client proxy in src/lib/db.ts exposes
// it as `db.memoryEntry.*`.

import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";

export type MemoryCategory =
  | "scan_result"
  | "finding"
  | "patch"
  | "user_preference"
  | "conversation"
  | "client_context"
  | "threat_intel";

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  "scan_result",
  "finding",
  "patch",
  "user_preference",
  "conversation",
  "client_context",
  "threat_intel",
];

export interface MemoryEntry {
  id: string;
  userId: string;
  category: MemoryCategory;
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Maximum length for the `content` field — keeps the chat prompt tight. */
export const MAX_MEMORY_CONTENT = 500;

interface MemoryRow {
  id: string;
  userId: string;
  category: string;
  title: string;
  content: string;
  tags: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToMemory(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    userId: row.userId,
    category: row.category as MemoryCategory,
    title: row.title,
    content: row.content,
    tags: row.tags ? row.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface StoreMemoryInput {
  category: MemoryCategory;
  title: string;
  content: string;
  tags?: string[];
}

/**
 * Store a new memory for a user. The `content` is truncated to
 * MAX_MEMORY_CONTENT chars to keep the chat context compact.
 */
export async function storeMemory(
  userId: string,
  entry: StoreMemoryInput,
): Promise<MemoryEntry | null> {
  if (!userId) return null;
  const content = (entry.content || "").slice(0, MAX_MEMORY_CONTENT);
  if (!content.trim()) return null;

  const tags = (entry.tags || []).slice(0, 12).join(",");
  const created = (await db.memoryEntry.create({
    data: {
      id: randomUUID(),
      userId,
      category: entry.category,
      title: entry.title.slice(0, 200),
      content,
      tags: tags || null,
    },
  })) as unknown as MemoryRow | null;

  return created ? rowToMemory(created) : null;
}

/**
 * Fetch memories for a user, optionally filtered by category, ordered
 * newest-first. `limit` defaults to 25 and is capped at 100.
 */
export async function getMemories(
  userId: string,
  category?: MemoryCategory,
  limit = 25,
): Promise<MemoryEntry[]> {
  if (!userId) return [];
  const take = Math.max(1, Math.min(100, limit));
  const where: Record<string, unknown> = { userId };
  if (category) where.category = category;
  const rows = (await db.memoryEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
  })) as unknown as MemoryRow[];
  return rows.map(rowToMemory);
}

/**
 * Case-insensitive substring search across a user's memory title/content.
 * Uses PostgREST `or=ilike,...` so the engine can do the work in one
 * round-trip. Returns newest-first, capped at `limit` (default 25).
 */
export async function searchMemories(
  userId: string,
  query: string,
  limit = 25,
): Promise<MemoryEntry[]> {
  if (!userId || !query.trim()) return [];
  const take = Math.max(1, Math.min(100, limit));
  // Use the db handler's where-clause builder: title.contains + content.contains
  // combined via OR. The proxy in db.ts maps `contains` → `ilike %...%` and
  // joins OR branches with PostgREST `or=`.
  const rows = (await db.memoryEntry.findMany({
    where: {
      userId,
      OR: [
        { title: { contains: query } },
        { content: { contains: query } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take,
  })) as unknown as MemoryRow[];
  return rows.map(rowToMemory);
}

/**
 * Returns a compact "recent context" slice — the latest `limit` memories
 * across every category. This is the raw input `buildContextForChat`
 * (memory-context.ts) shapes into a system-prompt block.
 */
export async function getRecentContext(
  userId: string,
  limit = 10,
): Promise<MemoryEntry[]> {
  return getMemories(userId, undefined, limit);
}
