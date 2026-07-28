import { db } from "@/db";
import { leads, clients, projects, tasks, meetings, proposals, invoices, activities } from "@/db/schema";
import { sql, eq, gte, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get counts
    const [
      totalLeadsResult,
      newLeadsTodayResult,
      hotLeadsResult,
      qualifiedLeadsResult,
      activeClientsResult,
      activeProjectsResult,
      pendingTasksResult,
      todaysMeetingsResult,
      pendingProposalsResult,
      recentLeads,
      recentActivities,
      upcomingMeetings,
      pipelineData,
    ] = await Promise.all([
      // Total leads
      db.select({ count: sql<number>`count(*)` }).from(leads),
      
      // New leads today
      db.select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(gte(leads.createdAt, today)),
      
      // Hot leads
      db.select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(eq(leads.leadCategory, "hot")),
      
      // Qualified leads
      db.select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(eq(leads.stage, "qualified")),
      
      // Active clients
      db.select({ count: sql<number>`count(*)` })
        .from(clients)
        .where(eq(clients.status, "active")),
      
      // Active projects
      db.select({ count: sql<number>`count(*)` })
        .from(projects)
        .where(eq(projects.status, "in_progress")),
      
      // Pending tasks
      db.select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(eq(tasks.status, "todo")),
      
      // Today's meetings
      db.select({ count: sql<number>`count(*)` })
        .from(meetings)
        .where(and(
          gte(meetings.scheduledAt, today),
          sql`${meetings.scheduledAt} < ${tomorrow}`
        )),
      
      // Pending proposals
      db.select({ count: sql<number>`count(*)` })
        .from(proposals)
        .where(eq(proposals.status, "sent")),
      
      // Recent leads
      db.select({
        id: leads.id,
        fullName: leads.fullName,
        email: leads.email,
        businessName: leads.businessName,
        leadScore: leads.leadScore,
        leadCategory: leads.leadCategory,
        stage: leads.stage,
        createdAt: leads.createdAt,
      })
        .from(leads)
        .orderBy(desc(leads.createdAt))
        .limit(5),
      
      // Recent activities
      db.select()
        .from(activities)
        .orderBy(desc(activities.createdAt))
        .limit(10),
      
      // Upcoming meetings
      db.select({
        id: meetings.id,
        title: meetings.title,
        scheduledAt: meetings.scheduledAt,
        type: meetings.type,
        leadId: meetings.leadId,
        clientId: meetings.clientId,
      })
        .from(meetings)
        .where(gte(meetings.scheduledAt, today))
        .orderBy(meetings.scheduledAt)
        .limit(5),
      
      // Pipeline data
      db.select({
        stage: leads.stage,
        count: sql<number>`count(*)`,
      })
        .from(leads)
        .where(eq(leads.status, "active"))
        .groupBy(leads.stage),
    ]);

    // Calculate stats
    const stats = {
      totalLeads: Number(totalLeadsResult[0]?.count || 0),
      newLeadsToday: Number(newLeadsTodayResult[0]?.count || 0),
      hotLeads: Number(hotLeadsResult[0]?.count || 0),
      qualifiedLeads: Number(qualifiedLeadsResult[0]?.count || 0),
      activeClients: Number(activeClientsResult[0]?.count || 0),
      activeProjects: Number(activeProjectsResult[0]?.count || 0),
      pendingTasks: Number(pendingTasksResult[0]?.count || 0),
      meetingsToday: Number(todaysMeetingsResult[0]?.count || 0),
      pendingProposals: Number(pendingProposalsResult[0]?.count || 0),
    };

    // Format pipeline data
    const pipeline = pipelineData.reduce((acc, item) => {
      acc[item.stage || "new"] = Number(item.count);
      return acc;
    }, {} as Record<string, number>);

    return Response.json({
      success: true,
      stats,
      pipeline,
      recentLeads,
      recentActivities,
      upcomingMeetings,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return Response.json(
      { success: false, error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
