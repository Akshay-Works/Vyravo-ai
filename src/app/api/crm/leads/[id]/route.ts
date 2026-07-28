import { db } from "@/db";
import { leads, activities } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET - Get single lead
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);

    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      return Response.json(
        { success: false, error: "Lead not found" },
        { status: 404 }
      );
    }

    // Get activities for this lead
    const leadActivities = await db
      .select()
      .from(activities)
      .where(eq(activities.leadId, leadId))
      .orderBy(activities.createdAt);

    return Response.json({
      success: true,
      lead,
      activities: leadActivities,
    });
  } catch (error) {
    console.error("Get lead error:", error);
    return Response.json(
      { success: false, error: "Failed to fetch lead" },
      { status: 500 }
    );
  }
}

// PATCH - Update lead
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    const body = await request.json();

    const [updatedLead] = await db
      .update(leads)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId))
      .returning();

    if (!updatedLead) {
      return Response.json(
        { success: false, error: "Lead not found" },
        { status: 404 }
      );
    }

    // Log activity
    await db.insert(activities).values({
      type: "lead",
      action: "updated",
      description: `Lead updated: ${updatedLead.fullName}`,
      leadId: leadId,
      metadata: { changes: Object.keys(body) },
    });

    return Response.json({
      success: true,
      lead: updatedLead,
    });
  } catch (error) {
    console.error("Update lead error:", error);
    return Response.json(
      { success: false, error: "Failed to update lead" },
      { status: 500 }
    );
  }
}

// DELETE - Delete lead
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);

    const [deletedLead] = await db
      .delete(leads)
      .where(eq(leads.id, leadId))
      .returning();

    if (!deletedLead) {
      return Response.json(
        { success: false, error: "Lead not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      message: "Lead deleted successfully",
    });
  } catch (error) {
    console.error("Delete lead error:", error);
    return Response.json(
      { success: false, error: "Failed to delete lead" },
      { status: 500 }
    );
  }
}
