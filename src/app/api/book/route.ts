import { db } from "@/db";
import { leads } from "@/db/schema";
import { qualifyLead, generateMeetingBrief } from "@/lib/discovery/scoring";
import type { LeadFormData } from "@/lib/discovery/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const formData = body as LeadFormData & { 
      meetingDate?: string;
      meetingTimezone?: string;
      meetingLink?: string;
    };

    // Validate required fields
    if (!formData.fullName || !formData.email) {
      return Response.json(
        { error: "Name and email are required." },
        { status: 400 }
      );
    }

    // Qualify the lead
    const qualification = qualifyLead(formData);
    
    // Generate meeting brief
    const meetingBrief = generateMeetingBrief(formData, qualification);

    // Insert lead into database
    const [newLead] = await db.insert(leads).values({
      // Basic Info
      fullName: formData.fullName,
      email: formData.email,
      phone: formData.phone || null,
      
      // Business Info
      businessName: formData.businessName || null,
      businessWebsite: formData.businessWebsite || null,
      industry: formData.industry || null,
      companySize: formData.companySize || null,
      country: formData.country || null,
      
      // Qualification Info
      currentSoftware: formData.currentSoftware || null,
      biggestChallenge: formData.biggestChallenge || null,
      automationGoals: formData.automationGoals || null,
      monthlyLeads: formData.monthlyLeads || null,
      desiredOutcome: formData.desiredOutcome || null,
      budgetRange: formData.budgetRange || null,
      timeline: formData.timeline || null,
      additionalInfo: formData.additionalInfo || null,
      
      // AI Analysis
      leadScore: qualification.score,
      leadCategory: qualification.category,
      leadType: qualification.type,
      recommendedServices: qualification.recommendedServices.map(s => s.service),
      qualificationSummary: qualification.summary,
      
      // Meeting Info (if provided)
      meetingStatus: formData.meetingDate ? "scheduled" : "pending",
      meetingDate: formData.meetingDate ? new Date(formData.meetingDate) : null,
      meetingTimezone: formData.meetingTimezone || null,
      meetingLink: formData.meetingLink || null,
      
      // Meeting Brief
      meetingBrief: meetingBrief,
      
      // Tracking
      source: "website",
    }).returning({ id: leads.id });

    return Response.json({
      success: true,
      message: "Thank you! We'll schedule your discovery call shortly.",
      leadId: newLead.id,
      qualification: {
        score: qualification.score,
        category: qualification.category,
        type: qualification.type,
        recommendedServices: qualification.recommendedServices,
        summary: qualification.summary,
      },
      meetingBrief,
    });
  } catch (error) {
    console.error("Booking API error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
