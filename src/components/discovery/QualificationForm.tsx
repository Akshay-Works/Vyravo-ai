"use client";

import { useState, useEffect } from "react";
import { INDUSTRIES, COMPANY_SIZES, BUDGET_RANGES, TIMELINES, MONTHLY_LEADS } from "@/lib/discovery/types";
import type { LeadFormData, ServiceRecommendation } from "@/lib/discovery/types";

interface QualificationFormProps {
  onComplete: (data: LeadFormData, qualification: QualificationResult) => void;
}

interface QualificationResult {
  score: number;
  category: string;
  type: string;
  recommendedServices: ServiceRecommendation[];
  summary: string;
}

const TOTAL_STEPS = 4;

export function QualificationForm({ onComplete }: QualificationFormProps) {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [qualification, setQualification] = useState<QualificationResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState<Partial<LeadFormData>>({
    fullName: "",
    email: "",
    phone: "",
    businessName: "",
    businessWebsite: "",
    industry: "",
    companySize: "",
    country: "",
    currentSoftware: "",
    biggestChallenge: "",
    automationGoals: "",
    monthlyLeads: "",
    desiredOutcome: "",
    budgetRange: "",
    timeline: "",
    additionalInfo: "",
  });

  // Fetch qualification preview when enough data is available
  useEffect(() => {
    if (step >= 3 && formData.industry && formData.companySize && formData.budgetRange) {
      fetchQualification();
    }
  }, [step, formData.industry, formData.companySize, formData.budgetRange, formData.timeline]);

  const fetchQualification = async () => {
    try {
      const res = await fetch("/api/discovery/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setQualification(data.qualification);
      }
    } catch (error) {
      console.error("Failed to fetch qualification:", error);
    }
  };

  const updateField = (field: keyof LeadFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (currentStep === 1) {
      if (!formData.fullName?.trim()) newErrors.fullName = "Name is required";
      if (!formData.email?.trim()) newErrors.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = "Please enter a valid email";
      }
    }

    if (currentStep === 2) {
      if (!formData.industry) newErrors.industry = "Please select an industry";
      if (!formData.companySize) newErrors.companySize = "Please select company size";
      if (!formData.country?.trim()) newErrors.country = "Country is required";
    }

    if (currentStep === 3) {
      if (!formData.biggestChallenge?.trim()) newErrors.biggestChallenge = "Please describe your challenge";
      if (!formData.automationGoals?.trim()) newErrors.automationGoals = "Please describe your goals";
    }

    if (currentStep === 4) {
      if (!formData.budgetRange) newErrors.budgetRange = "Please select a budget range";
      if (!formData.timeline) newErrors.timeline = "Please select a timeline";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    }
  };

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (data.success) {
        onComplete(formData as LeadFormData, data.qualification);
      } else {
        setErrors({ submit: data.error || "Something went wrong" });
      }
    } catch (error) {
      console.error("Submit error:", error);
      setErrors({ submit: "Network error. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-grey">Step {step} of {TOTAL_STEPS}</span>
          <span className="text-sm text-primary">{Math.round((step / TOTAL_STEPS) * 100)}% Complete</span>
        </div>
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="rounded-2xl border border-border bg-surface p-6 md:p-8">
        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-xl font-semibold font-[var(--font-heading)]">Let&apos;s Start With You</h2>
              <p className="mt-1 text-sm text-grey">Tell us a bit about yourself so we can personalize your experience.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Full Name *</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => updateField("fullName", e.target.value)}
                  className={`w-full rounded-lg border ${errors.fullName ? "border-red-500" : "border-border"} bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors`}
                  placeholder="John Smith"
                />
                {errors.fullName && <p className="text-red-400 text-xs mt-1">{errors.fullName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email Address *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  className={`w-full rounded-lg border ${errors.email ? "border-red-500" : "border-border"} bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors`}
                  placeholder="john@company.com"
                />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Business Info */}
        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-xl font-semibold font-[var(--font-heading)]">About Your Business</h2>
              <p className="mt-1 text-sm text-grey">Help us understand your business so we can recommend the right solutions.</p>
            </div>

            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Business Name</label>
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => updateField("businessName", e.target.value)}
                    className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                    placeholder="Acme Inc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Website</label>
                  <input
                    type="url"
                    value={formData.businessWebsite}
                    onChange={(e) => updateField("businessWebsite", e.target.value)}
                    className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                    placeholder="https://acme.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Industry *</label>
                <select
                  value={formData.industry}
                  onChange={(e) => updateField("industry", e.target.value)}
                  className={`w-full rounded-lg border ${errors.industry ? "border-red-500" : "border-border"} bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors`}
                >
                  <option value="">Select your industry</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i.value} value={i.value}>{i.label}</option>
                  ))}
                </select>
                {errors.industry && <p className="text-red-400 text-xs mt-1">{errors.industry}</p>}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Company Size *</label>
                  <select
                    value={formData.companySize}
                    onChange={(e) => updateField("companySize", e.target.value)}
                    className={`w-full rounded-lg border ${errors.companySize ? "border-red-500" : "border-border"} bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors`}
                  >
                    <option value="">Select size</option>
                    {COMPANY_SIZES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {errors.companySize && <p className="text-red-400 text-xs mt-1">{errors.companySize}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Country *</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => updateField("country", e.target.value)}
                    className={`w-full rounded-lg border ${errors.country ? "border-red-500" : "border-border"} bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors`}
                    placeholder="United States"
                  />
                  {errors.country && <p className="text-red-400 text-xs mt-1">{errors.country}</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Challenges */}
        {step === 3 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-xl font-semibold font-[var(--font-heading)]">Your Challenges & Goals</h2>
              <p className="mt-1 text-sm text-grey">Tell us about the problems you&apos;re trying to solve.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">What software/tools do you currently use?</label>
                <input
                  type="text"
                  value={formData.currentSoftware}
                  onChange={(e) => updateField("currentSoftware", e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                  placeholder="e.g., HubSpot, Salesforce, Slack..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">What&apos;s your biggest challenge right now? *</label>
                <textarea
                  value={formData.biggestChallenge}
                  onChange={(e) => updateField("biggestChallenge", e.target.value)}
                  rows={3}
                  className={`w-full rounded-lg border ${errors.biggestChallenge ? "border-red-500" : "border-border"} bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors resize-none`}
                  placeholder="e.g., We spend too much time answering repetitive customer questions..."
                />
                {errors.biggestChallenge && <p className="text-red-400 text-xs mt-1">{errors.biggestChallenge}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">What would you like to automate? *</label>
                <textarea
                  value={formData.automationGoals}
                  onChange={(e) => updateField("automationGoals", e.target.value)}
                  rows={3}
                  className={`w-full rounded-lg border ${errors.automationGoals ? "border-red-500" : "border-border"} bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors resize-none`}
                  placeholder="e.g., Customer support, lead qualification, appointment scheduling..."
                />
                {errors.automationGoals && <p className="text-red-400 text-xs mt-1">{errors.automationGoals}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Monthly leads/customers (approx)</label>
                <select
                  value={formData.monthlyLeads}
                  onChange={(e) => updateField("monthlyLeads", e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                >
                  <option value="">Select range</option>
                  {MONTHLY_LEADS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Budget & Timeline */}
        {step === 4 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-xl font-semibold font-[var(--font-heading)]">Budget & Timeline</h2>
              <p className="mt-1 text-sm text-grey">Help us prepare a proposal that fits your needs.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">What outcome are you hoping to achieve?</label>
                <textarea
                  value={formData.desiredOutcome}
                  onChange={(e) => updateField("desiredOutcome", e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors resize-none"
                  placeholder="e.g., Save 20 hours per week, increase conversions by 30%..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Budget Range *</label>
                <select
                  value={formData.budgetRange}
                  onChange={(e) => updateField("budgetRange", e.target.value)}
                  className={`w-full rounded-lg border ${errors.budgetRange ? "border-red-500" : "border-border"} bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors`}
                >
                  <option value="">Select budget range</option>
                  {BUDGET_RANGES.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
                {errors.budgetRange && <p className="text-red-400 text-xs mt-1">{errors.budgetRange}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Timeline *</label>
                <select
                  value={formData.timeline}
                  onChange={(e) => updateField("timeline", e.target.value)}
                  className={`w-full rounded-lg border ${errors.timeline ? "border-red-500" : "border-border"} bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors`}
                >
                  <option value="">When do you want to start?</option>
                  {TIMELINES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {errors.timeline && <p className="text-red-400 text-xs mt-1">{errors.timeline}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Anything else we should know?</label>
                <textarea
                  value={formData.additionalInfo}
                  onChange={(e) => updateField("additionalInfo", e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm outline-none focus:border-primary transition-colors resize-none"
                  placeholder="Any additional context..."
                />
              </div>
            </div>

            {/* Qualification Preview */}
            {qualification && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    qualification.category === "hot" ? "bg-green-500/20 text-green-400" :
                    qualification.category === "warm" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-grey/20 text-grey"
                  }`}>
                    {qualification.score}/100 Score
                  </div>
                  <span className="text-sm text-grey">Based on your answers</span>
                </div>
                <h4 className="text-sm font-semibold mb-2">Recommended Solutions</h4>
                <div className="space-y-2">
                  {qualification.recommendedServices.slice(0, 2).map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <div>
                        <span className="text-sm font-medium">{s.service}</span>
                        <p className="text-xs text-grey">{s.reason.slice(0, 100)}...</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {errors.submit && (
          <p className="text-red-400 text-sm mt-4">{errors.submit}</p>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t border-border">
          {step > 1 ? (
            <button
              onClick={prevStep}
              className="btn-secondary text-sm"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <button
              onClick={nextStep}
              className="btn-primary text-sm"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="btn-primary text-sm"
            >
              {isLoading ? "Submitting..." : "Submit & Choose Time →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
