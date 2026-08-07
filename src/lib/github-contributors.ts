// GitHub contributor fetcher — pulls code contributors from the GitHub API.
// Falls back gracefully if the API is unreachable or rate-limited.

const GITHUB_REPO = "ayanalidar/GuardianX";

export interface GitHubContributor {
  username: string;
  avatarUrl: string;
  profileUrl: string;
  contributions: number;
}

/**
 * Fetch code contributors from the GitHub API.
 * Returns an empty array on any error (rate limit, network, etc.).
 * The GitHub API allows 60 unauthenticated requests/hour per IP.
 */
export async function fetchGitHubContributors(): Promise<GitHubContributor[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contributors?per_page=30`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!res.ok) {
      console.error(`[github] contributors fetch failed: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as Array<{
      login: string;
      avatar_url: string;
      html_url: string;
      contributions: number;
    }>;

    return data.map((c) => ({
      username: c.login,
      avatarUrl: c.avatar_url,
      profileUrl: c.html_url,
      contributions: c.contributions,
    }));
  } catch (err) {
    console.error("[github] contributors fetch error:", err instanceof Error ? err.message : "unknown");
    return [];
  }
}
