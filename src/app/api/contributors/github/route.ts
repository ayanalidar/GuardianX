import { NextResponse } from "next/server";
import { fetchGitHubContributors } from "@/lib/github-contributors";

export const dynamic = "force-dynamic";

// GET /api/contributors/github — fetches code contributors from GitHub API
// Returns an array of { username, avatarUrl, profileUrl, contributions }
// Falls back to empty array on error (rate limit, network, etc.)
export async function GET() {
  const contributors = await fetchGitHubContributors();
  return NextResponse.json(contributors);
}
