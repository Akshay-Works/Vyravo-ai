import { qualifyLead, generateMeetingBrief } from "@/lib/discovery/scoring";
import type { LeadFormData } from "@/lib/discovery/types";

// Real-time lead qualification endpoint (for preview before booking)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const formData = body as Partial<LeadFormData>;

    // Require minimum fields for qualification
    if (!formData.industry || !formData.companySize || !formData.budgetRange) {
      return Response.json({
        success: false,
        message: "Please complete the qualification form to see recommendations.",
      });
    }

    // Create complete form data with defaults
    const completeData: LeadFormData = {
      fullName: formData.fullName || "",
      email: formData.email || "",
      phone: formData.phone,
      businessName: formData.businessName,
      businessWebsite: formData.businessWebsite,
      industry: formData.industry,
      companySize: formData.companySize,
      country: formData.country || "",
      currentSoftware: formData.currentSoftware,
      biggestChallenge: formData.biggestChallenge || "",
      automationGoals: formData.automationGoals || "",
      monthlyLeads: formData.monthlyLeads,
      desiredOutcome: formData.desiredOutcome || "",
      budgetRange: formData.budgetRange,
      timeline: formData.timeline || "exploring",
      additionalInfo: formData.additionalInfo,
    };

    // Qualify the lead
    const qualification = qualifyLead(completeData);
    
    // Generate meeting brief preview
    const meetingBrief = generateMeetingBrief(completeData, qualification);

    return Response.json({
      success: true,
      qualification: {
        score: qualification.score,
        category: qualification.category,
        type: qualification.type,
        recommendedServices: qualification.recommendedServices,
        summary: qualification.summary,
      },
      meetingBrief: {
        automationOpportunities: meetingBrief.automationOpportunities.slice(0, 3),
        recommendedSolutions: meetingBrief.recommendedSolutions,
      },
    });
  } catch (error) {
    console.error("Qualification API error:", error);
    return Response.json(
      { success: false, error: "Failed to qualify lead." },
      { status: 500 }
    );
  }
}
