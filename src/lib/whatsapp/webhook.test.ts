import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyMetaSignature, verifyMetaVerificationToken } from "./meta";
import { parseWhatsAppWebhookPayload } from "./webhook";
import { createMemoryWhatsAppStore } from "./storage";
import type { WhatsAppMessageEvent } from "./types";

test("verifies Meta webhook tokens and raw-body signatures", () => {
  const previousToken = process.env.META_WHATSAPP_VERIFY_TOKEN;
  const previousSecret = process.env.META_WHATSAPP_APP_SECRET;
  process.env.META_WHATSAPP_VERIFY_TOKEN = "test-verify-token";
  process.env.META_WHATSAPP_APP_SECRET = "test-app-secret";

  try {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    const signature = `sha256=${createHmac("sha256", "test-app-secret").update(body).digest("hex")}`;
    assert.equal(verifyMetaVerificationToken("test-verify-token"), true);
    assert.equal(verifyMetaVerificationToken("wrong-token"), false);
    assert.equal(verifyMetaSignature(body, signature), true);
    assert.equal(verifyMetaSignature(`${body} `, signature), false);
    assert.equal(verifyMetaSignature(body, null), false);
  } finally {
    if (previousToken === undefined) delete process.env.META_WHATSAPP_VERIFY_TOKEN;
    else process.env.META_WHATSAPP_VERIFY_TOKEN = previousToken;
    if (previousSecret === undefined) delete process.env.META_WHATSAPP_APP_SECRET;
    else process.env.META_WHATSAPP_APP_SECRET = previousSecret;
  }
});

test("parses text, unsupported media, profile, and status events safely", () => {
  const events = parseWhatsAppWebhookPayload({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-id",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "phone-number-id" },
              contacts: [{ wa_id: "919999999999", profile: { name: "Test User" } }],
              messages: [
                {
                  from: "919999999999",
                  id: "wamid.text",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "Hi" },
                },
                {
                  from: "919999999999",
                  id: "wamid.image",
                  timestamp: "1700000001",
                  type: "image",
                  image: { id: "media-id" },
                },
              ],
              statuses: [
                {
                  id: "wamid.outbound",
                  status: "delivered",
                  timestamp: "1700000002",
                  recipient_id: "919999999999",
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(events.length, 3);
  assert.equal(events[0].kind, "message");
  if (events[0].kind === "message") {
    assert.equal(events[0].from, "919999999999");
    assert.equal(events[0].text, "Hi");
    assert.equal(events[0].profileName, "Test User");
  }
  assert.equal(events[1].kind, "message");
  if (events[1].kind === "message") assert.equal(events[1].text, null);
  assert.equal(events[2].kind, "status");
  if (events[2].kind === "status") assert.equal(events[2].status, "delivered");
  assert.deepEqual(parseWhatsAppWebhookPayload({ object: "other", entry: [] }), []);
});

test("memory store deduplicates inbound provider IDs and permits failed retries", async () => {
  const store = createMemoryWhatsAppStore();
  const event: WhatsAppMessageEvent = {
    kind: "message",
    messageId: "wamid.retry",
    from: "919999999999",
    messageType: "text",
    text: "Hi",
    timestamp: new Date(),
    profileName: null,
    metadataPhoneNumberId: null,
    businessAccountId: null,
    replyToMessageId: null,
  };
  const conversation = await store.getOrCreateConversation(event.from);
  assert.deepEqual(await store.recordInboundMessage(conversation.id, event), { duplicate: false });
  assert.deepEqual(await store.recordInboundMessage(conversation.id, event), { duplicate: true });
  await store.markInboundMessage(event.messageId, false);
  assert.deepEqual(await store.recordInboundMessage(conversation.id, event), { duplicate: false });
  await store.markInboundMessage(event.messageId, true);
  assert.deepEqual(await store.recordInboundMessage(conversation.id, event), { duplicate: true });
});
