import { NextRequest } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { kbQueries, kbDocuments, kbKnowledgeGaps, kbCategories } from "@/db/knowledge-schema";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getDashboardStats } from "@/lib/knowledge-base/engine";

export const dynamic = "force-dynamic";

// GET /api/knowledge-base/analytics
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(Number(searchParams.get("days") || "30"), 90);

    const stats = await getDashboardStats();

    const [totalQueries, askQueries, searchQueries, unanswered, mostSearched, recentQueries, topDocs, gaps] =
      await Promise.all([
        db.select({ n: sql`count(*)::int` }).from(kbQueries).then((r) => Number(r[0]?.n ?? 0)),
        db.select({ n: sql`count(*)::int` }).from(kbQueries).where(eq(kbQueries.queryType, "ask")).then((r) => Number(r[0]?.n ?? 0)),
        db.select({ n: sql`count(*)::int` }).from(kbQueries).where(eq(kbQueries.queryType, "search")).then((r) => Number(r[0]?.n ?? 0)),
        db.select({ n: sql`count(*)::int` }).from(kbQueries).where(eq(kbQueries.answered, false)).then((r) => Number(r[0]?.n ?? 0)),
        db
          .select({ query: kbQueries.query, n: sql`count(*)::int` })
          .from(kbQueries)
          .groupBy(kbQueries.query)
          .orderBy(sql`count(*) DESC`)
          .limit(10)
          .then((r) => r.map((row) => ({ query: row.query, count: Number(row.n) }))),
        db
          .select()
          .from(kbQueries)
          .orderBy(desc(kbQueries.createdAt))
          .limit(20),
        db
          .select({ title: kbDocuments.title, id: kbDocuments.id, n: sql`count(*)::int` })
          .from(kbDocuments)
          .innerJoin(kbQueries, sql`${kbQueries.sourceDocuments}::text ILIKE '%' || ${kbDocuments.id}::text || '%'`)
          .groupBy(kbDocuments.id)
          .orderBy(sql`count(*) DESC`)
          .limit(10)
          .then((r) => r.map((row) => ({ title: row.title, id: row.id, count: Number(row.n) }))),
        db
          .select()
          .from(kbKnowledgeGaps)
          .orderBy(desc(kbKnowledgeGaps.frequency))
          .limit(10),
      ]);

    // Queries per day (last N days)
    const dayRows = await db
      .select({
        day: sql`to_char(${kbQueries.createdAt}, 'YYYY-MM-DD')`,
        n: sql`count(*)::int`,
      })
      .from(kbQueries)
      .where(sql`${kbQueries.createdAt} > now() - interval '${sql.raw(String(days))} days'`)
      .groupBy(sql`to_char(${kbQueries.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${kbQueries.createdAt}, 'YYYY-MM-DD')`);

    const categoryCounts = await db
      .select({
        name: kbCategories.name,
        n: sql`count(${kbDocuments.id})::int`,
      })
      .from(kbCategories)
      .leftJoin(kbDocuments, eq(kbCategories.id, kbDocuments.categoryId))
      .groupBy(kbCategories.id)
      .orderBy(sql`count(${kbDocuments.id}) DESC`)
      .limit(10);

    return Response.json({
      stats,
      analytics: {
        totalQueries,
        askQueries,
        searchQueries,
        unanswered,
        mostSearched,
        recentQueries,
        topDocs,
        topGaps: gaps,
        queriesByDay: dayRows.map((r) => ({ date: r.day, count: Number(r.n) })),
        categoryUsage: categoryCounts.map((r) => ({ name: r.name, count: Number(r.n) })),
      },
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return Response.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
