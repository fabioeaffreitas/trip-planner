import type { ItineraryEvent, Trip, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { whatsappService } from "./whatsapp";

const DEFAULT_REMINDER_WINDOW_MINUTES = 60;
const POLL_INTERVAL_MS = 60_000;

function reminderWindowMinutes(): number {
  const raw = process.env.WHATSAPP_REMINDER_MINUTES_BEFORE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REMINDER_WINDOW_MINUTES;
}

/**
 * Pure due-check, no I/O — an event is due for a reminder once its start
 * time falls inside [now, now + windowMinutes] and it hasn't already been
 * sent. Kept separate from the DB query so it's directly unit-testable.
 */
export function isReminderDue(
  event: Pick<ItineraryEvent, "notifyWhatsapp" | "whatsappNotifiedAt" | "startTime">,
  now: Date,
  windowMinutes: number
): boolean {
  if (!event.notifyWhatsapp || event.whatsappNotifiedAt || !event.startTime) return false;
  const windowEnd = new Date(now.getTime() + windowMinutes * 60_000);
  return event.startTime >= now && event.startTime <= windowEnd;
}

function buildReminderMessage(event: ItineraryEvent): string {
  const time = event.startTime
    ? event.startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
    : "";
  const locationSuffix = event.locationName ? ` at ${event.locationName}` : "";
  return `Reminder: ${event.title}${locationSuffix}${time ? ` — ${time}` : ""}`;
}

/**
 * Polls for events due a WhatsApp reminder and sends them. A simple
 * in-process poller rather than a real job queue (Redis/BullMQ) — deliberate
 * for this pilot: it proves the Twilio integration end-to-end without adding
 * infrastructure, at the cost of not surviving a restart mid-window and not
 * working across more than one backend instance. Revisit if this needs to
 * scale beyond a single Railway service.
 */
export async function checkAndSendReminders(): Promise<void> {
  const now = new Date();
  const windowMinutes = reminderWindowMinutes();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60_000);

  const candidates = await prisma.itineraryEvent.findMany({
    where: {
      notifyWhatsapp: true,
      whatsappNotifiedAt: null,
      startTime: { gte: now, lte: windowEnd },
    },
    include: { trip: { include: { user: true } } },
  });

  for (const event of candidates) {
    const { trip, ...eventFields } = event as ItineraryEvent & { trip: Trip & { user: User } };
    if (!trip.user.phoneNumber) {
      console.warn(`Skipping WhatsApp reminder for event ${eventFields.id}: user ${trip.user.id} has no phone number set`);
      continue;
    }
    try {
      await whatsappService.sendMessage({ to: trip.user.phoneNumber, body: buildReminderMessage(eventFields) });
      await prisma.itineraryEvent.update({ where: { id: eventFields.id }, data: { whatsappNotifiedAt: new Date() } });
    } catch (err) {
      console.error(`Failed to send WhatsApp reminder for event ${eventFields.id}:`, err);
    }
  }
}

export function startNotificationScheduler(): void {
  setInterval(() => {
    checkAndSendReminders().catch((err) => console.error("Unhandled error in notification scheduler:", err));
  }, POLL_INTERVAL_MS);
}
