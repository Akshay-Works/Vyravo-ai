// Proposal PDF generation — @react-pdf/renderer (serverless-safe, no browser).
import React from "react";
import {
  Document, Page, Text, View, StyleSheet, Font,
} from "@react-pdf/renderer";
import type { Proposal } from "@/db/proposal-schema";
import type { ProposalContent, ProposalSection } from "./types";
import { formatMoney } from "./format";

// Use built-in Helvetica for reliability (no external font fetch in serverless).
Font.registerHyphenationCallback((word) => [word]);

const C = {
  bg: "#FFFFFF",
  ink: "#111111",
  grey: "#6B7280",
  primary: "#3B82F6",
  accent: "#06B6D4",
  border: "#E5E7EB",
  light: "#F9FAFB",
};

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: C.ink, padding: 40, lineHeight: 1.5 },
  cover: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  coverTitle: { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "center", marginBottom: 8 },
  coverTagline: { fontSize: 11, color: C.grey, textAlign: "center", marginBottom: 4 },
  coverClient: { fontSize: 13, color: C.primary, textAlign: "center", marginTop: 32 },
  coverMeta: { fontSize: 10, color: C.grey, textAlign: "center", marginTop: 6 },
  divider: { height: 2, backgroundColor: C.primary, marginVertical: 6, width: "100%" },
  h1: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 8, marginTop: 4 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.primary, marginBottom: 6, marginTop: 10 },
  p: { fontSize: 10, color: "#374151", marginBottom: 6 },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 8, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10, color: "#374151" },
  section: { marginBottom: 18 },
  table: { marginTop: 8, marginBottom: 8 },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 5 },
  tHeader: { fontFamily: "Helvetica-Bold", backgroundColor: C.light },
  tCell: { flex: 1, fontSize: 9, paddingRight: 6 },
  tCellRight: { flex: 1, fontSize: 9, textAlign: "right" },
  totalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 6, marginTop: 4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: C.grey },
});

function renderSection(section: ProposalSection, content: ProposalContent) {
  const children: React.ReactNode[] = [];

  if (section.type === "prose" && section.content) {
    // Split markdown-ish content into paragraphs and bullets
    const lines = section.content.split("\n");
    const paras: string[] = [];
    let buf = "";
    for (const line of lines) {
      if (line.trim() === "") { if (buf) { paras.push(buf); buf = ""; } }
      else buf += (buf ? " " : "") + line.trim();
    }
    if (buf) paras.push(buf);

    for (const para of paras) {
      if (para.startsWith("- ") || para.startsWith("• ")) {
        for (const bullet of para.split(/(?=- )|(?=• )/).filter(Boolean)) {
          const t = bullet.replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
          children.push(
            <View key={`b-${children.length}`} style={styles.bullet} wrap={false}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{t}</Text>
            </View>
          );
        }
      } else {
        children.push(<Text key={`p-${children.length}`} style={styles.p}>{para.replace(/\*\*/g, "")}</Text>);
      }
    }
  }

  if (section.type === "list" && section.items?.length) {
    for (const item of section.items) {
      children.push(
        <View key={`l-${children.length}`} style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{item.replace(/\*\*/g, "")}</Text>
        </View>
      );
    }
  }

  return (
    <View style={styles.section} key={section.id}>
      <Text style={styles.h2}>{section.title}</Text>
      {children}
    </View>
  );
}

function PricingBlock({ content }: { content: ProposalContent }) {
  const pricing = content.pricing;
  const rows: React.ReactNode[] = [];
  for (const svc of content.services || []) {
    if (svc.implementationFee) {
      rows.push(
        <View style={styles.tRow} key={`svc-${svc.id}`}>
          <Text style={styles.tCell}>{svc.name} — Implementation</Text>
          <Text style={styles.tCellRight}>{formatMoney(svc.implementationFee, pricing.currency)}</Text>
        </View>
      );
    }
  }
  for (const a of pricing.addons || []) {
    rows.push(
      <View style={styles.tRow} key={`add-${a.name}`}>
        <Text style={styles.tCell}>Add-on: {a.name}</Text>
        <Text style={styles.tCellRight}>{formatMoney(a.price, pricing.currency)}</Text>
      </View>
    );
  }
  const subtotal = (pricing.implementation || 0) + (pricing.addons || []).reduce((s, a) => s + a.price, 0);
  return (
    <View style={styles.table}>
      {rows}
      {pricing.discount > 0 && (
        <View style={styles.tRow}>
          <Text style={styles.tCell}>Discount</Text>
          <Text style={styles.tCellRight}>−{formatMoney(pricing.discount, pricing.currency)}</Text>
        </View>
      )}
      {pricing.taxRate > 0 && (
        <View style={styles.tRow}>
          <Text style={styles.tCell}>Tax ({pricing.taxRate}%)</Text>
          <Text style={styles.tCellRight}>{formatMoney((Math.max(0, subtotal - pricing.discount)) * pricing.taxRate / 100, pricing.currency)}</Text>
        </View>
      )}
      <View style={styles.totalRow}>
        <Text style={[styles.tCell, { fontFamily: "Helvetica-Bold" }]}>Total Investment</Text>
        <Text style={[styles.tCellRight, { fontFamily: "Helvetica-Bold" }]}>{formatMoney(pricing.total, pricing.currency)}</Text>
      </View>
      {pricing.monthlyTotal > 0 && (
        <View style={styles.tRow}>
          <Text style={styles.tCell}>Ongoing Support</Text>
          <Text style={styles.tCellRight}>{formatMoney(pricing.monthlyTotal, pricing.currency)}/month</Text>
        </View>
      )}
      {content.milestones?.length > 0 && (
        <>
          <Text style={[styles.h2, { marginTop: 12 }]}>Payment Milestones</Text>
          {content.milestones.map((m) => (
            <View style={styles.tRow} key={m.id}>
              <Text style={styles.tCell}>{m.label}</Text>
              <Text style={styles.tCellRight}>{m.percent}% — {formatMoney(m.amount, pricing.currency)}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

interface ProposalDocProps {
  proposal: Proposal;
  content: ProposalContent;
}

export function ProposalPdfDoc({ proposal, content }: ProposalDocProps) {
  const ordered = [...content.sections].sort((a, b) => {
    const order = ["cover", "executive_summary", "understanding", "challenges", "goals", "solution", "recommended_systems", "scope", "deliverables", "implementation", "timeline", "investment", "addons", "support", "why_vyravo", "case_studies", "terms", "acceptance", "contact"];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });

  return (
    <Document title={proposal.title} author="Vyravo AI">
      <Page size="A4" style={styles.page}>
        {/* Cover */}
        <View style={styles.cover}>
          <Text style={{ fontSize: 14, color: C.primary, marginBottom: 12 }}>VYRAVO AI</Text>
          <Text style={styles.coverTitle}>{proposal.title}</Text>
          <Text style={styles.coverTagline}>Intelligent Automation for Modern Businesses</Text>
          <View style={{ width: 60, height: 2, backgroundColor: C.primary, marginVertical: 16 }} />
          <Text style={styles.coverClient}>Prepared for {proposal.clientName || "[Client Name]"}{proposal.companyName ? ` · ${proposal.companyName}` : ""}</Text>
          <Text style={styles.coverMeta}>Proposal {proposal.number || ""} · {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</Text>
        </View>

        {/* Sections */}
        {ordered
          .filter((s) => s.id !== "cover" && s.id !== "contact")
          .map((section) => {
            if (section.id === "investment" || section.type === "pricing") {
              return (
                <View style={styles.section} key={section.id} wrap={false}>
                  <Text style={styles.h1}>Investment</Text>
                  <PricingBlock content={content} />
                </View>
              );
            }
            if (section.id === "acceptance" || section.type === "acceptance") {
              return (
                <View style={styles.section} key={section.id} wrap={false}>
                  <Text style={styles.h1}>Acceptance</Text>
                  <Text style={styles.p}>To accept this proposal, please sign below or use the secure online link provided in the email. Acceptance confirms the scope, investment, and terms described in this document.</Text>
                  <View style={{ height: 40, borderBottomWidth: 1, borderBottomColor: C.ink, marginTop: 24, width: 240 }} />
                  <Text style={[styles.p, { fontSize: 9, color: C.grey, marginTop: 4 }]}>Signature — {proposal.clientName || "[Client Name]"}</Text>
                  <Text style={[styles.p, { fontSize: 9, color: C.grey }]}>Date: ______________</Text>
                </View>
              );
            }
            return renderSection(section, content);
          })}

        {/* Contact / footer */}
        <View style={styles.section}>
          <Text style={styles.h1}>Contact</Text>
          <Text style={styles.p}>Vyravo AI — Intelligent Automation for Modern Businesses</Text>
          <Text style={styles.p}>Phone: +91 9075707650 · Email: akshay.navale.work@gmail.com</Text>
          <Text style={styles.p}>LinkedIn: linkedin.com/in/akshay-n-2692851b7</Text>
        </View>

        <Text fixed style={styles.footer}>
          <Text>Vyravo AI · Proposal {proposal.number || ""}</Text>
          <Text>  Confidential — prepared exclusively for {proposal.clientName || "the client"}</Text>
        </Text>
      </Page>
    </Document>
  );
}

/** Render a proposal to a PDF Buffer. */
export async function renderProposalPdf(
  proposal: Proposal,
  content: ProposalContent
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(
    React.createElement(ProposalPdfDoc, { proposal, content }) as any
  );
}
