import Twilio from "twilio";

export interface SendWhatsAppMessageParams {
  to: string;
  body: string;
}

export interface WhatsAppService {
  sendMessage(params: SendWhatsAppMessageParams): Promise<void>;
}

/**
 * Deterministic stand-in for the real Twilio API — logs instead of sending,
 * so local dev/tests never hit Twilio or need credentials. Same interface as
 * the real implementation so swapping it in later is a one-line change
 * (USE_MOCKS=false).
 */
export const mockWhatsAppService: WhatsAppService = {
  async sendMessage({ to, body }): Promise<void> {
    console.log(`[mock WhatsApp] to=${to}: ${body}`);
  },
};

let twilioClient: Twilio.Twilio | null = null;
function getTwilioClient(): Twilio.Twilio {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    // Auth via an API Key (SID starts with "SK", paired with its Secret) plus
    // the Account SID it acts on behalf of — Twilio's recommended alternative
    // to the primary Account SID + Auth Token pair.
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    if (!accountSid || !apiKeySid || !apiKeySecret) {
      throw new Error("TWILIO_ACCOUNT_SID/TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET are not set");
    }
    twilioClient = Twilio(apiKeySid, apiKeySecret, { accountSid });
  }
  return twilioClient;
}

/**
 * Real implementation via the Twilio WhatsApp API. Requires
 * TWILIO_ACCOUNT_SID/TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET/TWILIO_WHATSAPP_FROM;
 * selected when USE_MOCKS=false. Against the Sandbox (the default until a
 * WhatsApp Business Account is approved), the recipient must have already
 * joined the Sandbox by sending its join code from their own WhatsApp —
 * otherwise Twilio accepts the request but the message never arrives.
 */
export const twilioWhatsAppService: WhatsAppService = {
  async sendMessage({ to, body }): Promise<void> {
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (!from) {
      throw new Error("TWILIO_WHATSAPP_FROM is not set");
    }
    const client = getTwilioClient();
    await client.messages.create({
      from: `whatsapp:${from}`,
      to: `whatsapp:${to}`,
      body,
    });
  },
};

export const whatsappService: WhatsAppService =
  process.env.USE_MOCKS === "false" ? twilioWhatsAppService : mockWhatsAppService;
