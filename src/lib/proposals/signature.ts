// E-Signature abstraction.
//
// Clean provider interface so DocuSign / Dropbox Sign / PandaDoc / Adobe Sign
// can be plugged in later. Until a provider token is configured, acceptance
// uses the built-in manual path (name + timestamp recorded as the signature),
// which is suitable for proposal acceptance records.

export interface SignatureProvider {
  id: "docusign" | "dropboxsign" | "pandadoc" | "adobesign" | "manual";
  name: string;
  configured: boolean;
}

export interface SignatureEnvelopeRequest {
  proposalId: number;
  proposalTitle: string;
  clientName: string;
  clientEmail: string;
  documentName: string;
  documentBuffer?: Buffer;
  redirectUrl?: string;
}

export interface SignatureEnvelopeResult {
  ok: boolean;
  envelopeId?: string;
  signingUrl?: string;
  provider: SignatureProvider["id"];
  error?: string;
}

const PROVIDERS: SignatureProvider[] = [
  { id: "docusign", name: "DocuSign", configured: Boolean(process.env.DOCUSIGN_ACCESS_TOKEN) },
  { id: "dropboxsign", name: "Dropbox Sign", configured: Boolean(process.env.DROPBOX_SIGN_API_KEY) },
  { id: "pandadoc", name: "PandaDoc", configured: Boolean(process.env.PANDADOC_API_KEY) },
  { id: "adobesign", name: "Adobe Acrobat Sign", configured: Boolean(process.env.ADOBE_SIGN_CLIENT_ID) },
  { id: "manual", name: "Vyravo AI (built-in)", configured: true },
];

export function getActiveSignatureProvider(): SignatureProvider {
  const configured = PROVIDERS.find((p) => p.configured && p.id !== "manual");
  return configured || PROVIDERS[PROVIDERS.length - 1];
}

export async function createSignatureEnvelope(
  req: SignatureEnvelopeRequest
): Promise<SignatureEnvelopeResult> {
  const provider = getActiveSignatureProvider();

  switch (provider.id) {
    case "docusign":
      return createDocuSignEnvelope(req);
    case "dropboxsign":
      return createDropboxSignEnvelope(req);
    case "pandadoc":
      return createPandaDocEnvelope(req);
    case "manual":
    default:
      // Manual path: the client acceptance form records name + timestamp as
      // the signature. Return ok with a note that no external signing was used.
      return {
        ok: true,
        provider: "manual",
        signingUrl: req.redirectUrl,
        error: undefined,
      };
  }
}

// --- Provider stubs (throw/notify when not configured) ----------------------

async function createDocuSignEnvelope(req: SignatureEnvelopeRequest): Promise<SignatureEnvelopeResult> {
  const token = process.env.DOCUSIGN_ACCESS_TOKEN;
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  if (!token || !accountId) {
    return { ok: false, provider: "docusign", error: "DocuSign not configured" };
  }
  // TODO: implement DocuSign eSignature REST API envelope creation.
  // Reference: POST /restapi/v2.1/accounts/{accountId}/envelopes
  return { ok: false, provider: "docusign", error: "DocuSign integration not yet wired — configure credentials." };
}

async function createDropboxSignEnvelope(req: SignatureEnvelopeRequest): Promise<SignatureEnvelopeResult> {
  const key = process.env.DROPBOX_SIGN_API_KEY;
  if (!key) {
    return { ok: false, provider: "dropboxsign", error: "Dropbox Sign not configured" };
  }
  // TODO: Dropbox Sign (formerly HelloSign) API — POST /v3/signature_requests
  return { ok: false, provider: "dropboxsign", error: "Dropbox Sign integration not yet wired — configure credentials." };
}

async function createPandaDocEnvelope(req: SignatureEnvelopeRequest): Promise<SignatureEnvelopeResult> {
  const key = process.env.PANDADOC_API_KEY;
  if (!key) {
    return { ok: false, provider: "pandadoc", error: "PandaDoc not configured" };
  }
  // TODO: PandaDoc API — POST /public/v1/documents with recipients
  return { ok: false, provider: "pandadoc", error: "PandaDoc integration not yet wired — configure credentials." };
}
