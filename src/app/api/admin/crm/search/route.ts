import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { businessLabel } from "@/lib/brandnest/schema";

export const dynamic = "force-dynamic";

// GET /api/admin/crm/search?q= — global CRM search across contacts, companies,
// BrandNest projects. Every hit shows its business relationship(s).
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ ok: true, results: [] });
  const like = `%${q}%`;

  const contacts = await pool.query(
    `SELECT l.id, l.full_name, l.business_name, l.email, l.phone, l.city,
            COALESCE(l.business_source,'vyravo_ai') AS business_source,
            CASE WHEN b.lead_id IS NOT NULL THEN b.relationship_status ELSE NULL END AS brandnest_status,
            l.stage AS vyravo_stage
     FROM leads l LEFT JOIN brandnest_clients b ON b.lead_id = l.id
     WHERE l.full_name ILIKE $1 OR l.business_name ILIKE $1 OR l.email ILIKE $1
        OR l.phone ILIKE $1 OR l.city ILIKE $1
     ORDER BY l.id DESC LIMIT 25`, [like]).catch(() => ({ rows: [] as any[] }));

  const projects = await pool.query(
    `SELECT p.id, p.service, p.amount, p.currency, p.status, p.lead_id,
            l.business_name, l.full_name
     FROM brandnest_projects p LEFT JOIN leads l ON l.id = p.lead_id
     WHERE p.service ILIKE $1 OR p.notes ILIKE $1
     ORDER BY p.id DESC LIMIT 10`, [like]).catch(() => ({ rows: [] as any[] }));

  const results = [
    ...contacts.rows.map((r: any) => ({
      type: "contact",
      id: r.id,
      title: r.business_name || r.full_name,
      subtitle: [r.full_name !== r.business_name ? r.full_name : null, r.email, r.phone].filter(Boolean).join(" · "),
      business: businessLabel(r.business_source),
      business_source: r.business_source,
      relationships: [
        r.brandnest_status ? `BrandNest Studio — ${r.brandnest_status.replace(/_/g, " ")}` : null,
        r.business_source !== "brandnest" ? `Vyravo AI — ${r.vyravo_stage || "new"}` : null,
      ].filter(Boolean),
      href: r.brandnest_status ? `/admin/brandnest/clients/${r.id}` : `/admin/crm/leads/${r.id}`,
    })),
    ...projects.rows.map((r: any) => ({
      type: "project",
      id: r.id,
      title: `${r.service} — ${r.currency} ${r.amount}`,
      subtitle: `${r.business_name || r.full_name || "client"} · ${r.status}`,
      business: "BrandNest Studio",
      business_source: "brandnest",
      relationships: ["BrandNest Studio — project"],
      href: `/admin/brandnest/clients/${r.lead_id}`,
    })),
  ];
  return Response.json({ ok: true, results });
}
