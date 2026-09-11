// Canonical city labels for the city-wise CRM views.
//
// The engine's staging data carries messy variants (pune / PUNE / Pune,
// "Bandra, Mumbai", "Magarpatta City"). Ingest + the one-off backfill
// normalize on WRITE via this function; the dashboard chips group
// defensively with it too, so every surface agrees on one label per city.
//
// Rule: trim -> take text before the first comma (suburb/city pairs keep the
// suburb, e.g. "Bandra, Mumbai" -> "Bandra") -> alias lookup for known
// renames/metros -> Title Case fallback for unseen cities.
const ALIASES: Record<string, string> = {
  // Maharashtra (engine corpus)
  pune: "Pune",
  mumbai: "Mumbai",
  "navi mumbai": "Navi Mumbai",
  thane: "Thane",
  bandra: "Mumbai", // Mumbai suburb — rolls up to the city
  "magarpatta city": "Pune", // township in Pune, not its own city
  // Pune suburbs/townships roll up to Pune
  "pimpri chinchwad": "Pune",
  pcmc: "Pune",
  hadapsar: "Pune",
  wakad: "Pune",
  hinjawadi: "Pune",
  warje: "Pune",
  chakan: "Pune",
  ganeshkhind: "Pune",
  "kalyani nagar": "Pune",
  // Mumbai suburbs roll up to Mumbai (MMR)
  "kurla west": "Mumbai",
  kurla: "Mumbai",
  "borivali west": "Mumbai",
  borivali: "Mumbai",
  "mumbai suburban": "Mumbai",
  vasai: "Mumbai", // MMR (Mumbai Metropolitan Region)
  // Thane-district towns roll up to Thane
  "thane west": "Thane",
  dombivali: "Thane",
  dombivli: "Thane",
  // Navi Mumbai nodes roll up to Navi Mumbai
  "kopar khairane": "Navi Mumbai",
  nashik: "Nashik",
  nagpur: "Nagpur",
  aurangabad: "Aurangabad",
  "chhatrapati sambhajinagar": "Aurangabad", // official rename, same city
  kolhapur: "Kolhapur",
  // Other engine regions
  "delhi ncr": "Delhi NCR",
  "new delhi": "Delhi NCR",
  delhi: "Delhi NCR",
  bangalore: "Bangalore",
  bengaluru: "Bangalore", // official rename, same city
  hyderabad: "Hyderabad",
  chennai: "Chennai",
  kolkata: "Kolkata",
  ahmedabad: "Ahmedabad",
  jaipur: "Jaipur",
  lucknow: "Lucknow",
  indore: "Indore",
  surat: "Surat",
  bhopal: "Bhopal",
  kochi: "Kochi",
  cochin: "Kochi", // old name, same city
  coimbatore: "Coimbatore",
  visakhapatnam: "Visakhapatnam",
  vizag: "Visakhapatnam",
  patna: "Patna",
  guwahati: "Guwahati",
  // Foreign engine
  singapore: "Singapore",
};

export function normalizeCity(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const head = raw.split(",")[0].replace(/\s+/g, " ").trim();
  if (!head) return null;
  const alias = ALIASES[head.toLowerCase()];
  if (alias) return alias;
  const titled = head
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  return titled.slice(0, 80) || null;
}
