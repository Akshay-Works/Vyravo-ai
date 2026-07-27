"use client";

import type { ServiceRecommendation } from "@/lib/discovery/types";

interface ServiceRecommendationsProps {
  recommendations: ServiceRecommendation[];
  score: number;
  category: string;
}

export function ServiceRecommendations({ recommendations, score, category }: ServiceRecommendationsProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 md:p-8">
      {/* Score Badge */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold font-[var(--font-heading)]">Your Personalized Recommendations</h3>
          <p className="text-sm text-grey mt-1">Based on your business profile and goals</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
          category === "hot" ? "bg-green-500/10 border border-green-500/30" :
          category === "warm" ? "bg-yellow-500/10 border border-yellow-500/30" :
          "bg-grey/10 border border-grey/30"
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            category === "hot" ? "bg-green-500" :
            category === "warm" ? "bg-yellow-500" :
            "bg-grey"
          }`} />
          <span className={`text-sm font-medium ${
            category === "hot" ? "text-green-400" :
            category === "warm" ? "text-yellow-400" :
            "text-grey"
          }`}>
            {score}/100 Match
          </span>
        </div>
      </div>

      {/* Recommendations */}
      <div className="space-y-4">
        {recommendations.map((rec, index) => (
          <div
            key={index}
            className={`rounded-xl border p-5 transition-all ${
              rec.priority === "high"
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-bg"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold">{rec.service}</h4>
                  {rec.priority === "high" && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/20 text-primary">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-sm text-grey leading-relaxed">{rec.reason}</p>
              </div>
              <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                rec.priority === "high" ? "bg-primary/10 text-primary" : "bg-surface-2 text-grey"
              }`}>
                {rec.priority === "high" ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* What's Next */}
      <div className="mt-6 pt-6 border-t border-border">
        <h4 className="font-semibold mb-3">What Happens Next?</h4>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: "📅", title: "Book Your Call", desc: "Choose a time that works for you" },
            { icon: "💡", title: "Get Your Strategy", desc: "We'll prepare a custom plan" },
            { icon: "🚀", title: "Start Automating", desc: "Launch within 2-8 weeks" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-xl">{item.icon}</span>
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-grey">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
