import {
  json,
  readCompetitionCache,
  rowToCompetition,
  writeCompetitionCache,
  type CompetitionRow,
  type PageFunction,
} from "../_lib";

type PublicCompetition = ReturnType<typeof rowToCompetition>;

const publicResponse = (
  items: PublicCompetition[],
  limit: number,
  cacheStatus: "HIT" | "MISS",
) =>
  json(items.slice(0, limit), 200, {
    "cache-control": "public, max-age=10, s-maxage=30",
    "x-pjmi-cache": cacheStatus,
  });

export const onRequestGet: PageFunction = async ({
  env,
  request,
  waitUntil,
}) => {
  if (!env.DB) return json({ error: "D1 is not configured" }, 503);

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(
    url.searchParams.get("limit") || "50",
    10,
  );
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;

  try {
    const cached = await readCompetitionCache(request);
    if (cached) {
      const items = (await cached.json()) as PublicCompetition[];
      return publicResponse(items, limit, "HIT");
    }

    const result = await env.DB.prepare(
      `SELECT id, title, category, event_date, location, status, link, featured, created_at, updated_at
       FROM competitions
       ORDER BY featured DESC, CASE WHEN status = 'upcoming' THEN 0 ELSE 1 END, event_date ASC, created_at DESC
       LIMIT 100`,
    ).all<CompetitionRow>();
    const items = result.results.map(rowToCompetition);
    const cacheResponse = json(items, 200, {
      "cache-control": "public, max-age=30",
    });
    const cacheWrite = writeCompetitionCache(request, cacheResponse);
    if (waitUntil)
      waitUntil(
        cacheWrite.catch((error) =>
          console.error("Unable to cache competitions", error),
        ),
      );
    else await cacheWrite;
    return publicResponse(items, limit, "MISS");
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to read competitions" }, 500);
  }
};
