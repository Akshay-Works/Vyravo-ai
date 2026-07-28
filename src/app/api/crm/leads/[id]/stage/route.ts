import { db } from "@/db";
import { leads, activities } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// PATCH - Update lead stage (for pipeline drag & drop)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    const { stage } = await request.json();

    if (!stage) {
      return Response.json(
        { success: false, error: "Stage is required" },
        { status: 400 }
      );
    }

    // Get current lead for activity logging
    const [currentLead] = await db
      .select({ stage: leads.stage, fullName: leads.fullName })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!currentLead) {
      return Response.json(
        { success: false, error: "Lead not found" },
        { status: 404 }
      );
    }

    const previousStage = currentLead.stage;

    // Update lead stage
    const [updatedLead] = await db
      .update(leads)
      .set({
        stage,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId))
      .returning();

    // Log activity
    await db.insert(activities).values({
      type: "lead",
      action: "stage_changed",
      description: `Lead moved from "${previousStage}" to "${stage}"`,
      leadId: leadId,
      metadata: { previousStage, newStage: stage },
    });

    return Response.json({
      success: true,
      lead: updatedLead,
    });
  } catch (error) {
    console.error("Update lead stage error:", error);
    return Response.json(
      { success: false, error: "Failed to update lead stage" },
      { status: 500 }
    );
  }
}
