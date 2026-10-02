import { json, requireAdmin, type PageFunction } from '../../_lib';
import { compareRangeNames } from '../../_range';

type TotalRow = { total: number };
type RangeRow = { range_name: string; count: number };

export const onRequestGet: PageFunction = async ({ env, request }) => {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: 'D1 is not configured' }, 503);

  try {
    const [total, ranges] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS total FROM words').all<TotalRow>(),
      env.DB.prepare('SELECT range_name, COUNT(*) AS count FROM words GROUP BY range_name ORDER BY range_name COLLATE NOCASE ASC').all<RangeRow>(),
    ]);
    return json({
      total: Number(total.results[0]?.total || 0),
      ranges: [...ranges.results]
        .sort((left, right) => compareRangeNames(left.range_name, right.range_name))
        .map((row) => ({ name: row.range_name, count: Number(row.count) })),
    });
  } catch (error) {
    console.error(error);
    return json({ error: 'Unable to read word summary' }, 500);
  }
};
