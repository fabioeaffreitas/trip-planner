import { describe, expect, it } from "vitest";
import { isReminderDue } from "../src/services/notificationScheduler";

const NOW = new Date("2026-09-01T12:00:00Z");

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

describe("isReminderDue", () => {
  it("is due when the start time falls inside the window and notifications are on", () => {
    const event = { notifyWhatsapp: true, whatsappNotifiedAt: null, startTime: minutesFromNow(30) };
    expect(isReminderDue(event, NOW, 60)).toBe(true);
  });

  it("is not due when the start time is beyond the window", () => {
    const event = { notifyWhatsapp: true, whatsappNotifiedAt: null, startTime: minutesFromNow(90) };
    expect(isReminderDue(event, NOW, 60)).toBe(false);
  });

  it("is not due when the start time has already passed", () => {
    const event = { notifyWhatsapp: true, whatsappNotifiedAt: null, startTime: minutesFromNow(-5) };
    expect(isReminderDue(event, NOW, 60)).toBe(false);
  });

  it("is not due when a reminder was already sent", () => {
    const event = { notifyWhatsapp: true, whatsappNotifiedAt: minutesFromNow(-10), startTime: minutesFromNow(30) };
    expect(isReminderDue(event, NOW, 60)).toBe(false);
  });

  it("is not due when notifyWhatsapp is off", () => {
    const event = { notifyWhatsapp: false, whatsappNotifiedAt: null, startTime: minutesFromNow(30) };
    expect(isReminderDue(event, NOW, 60)).toBe(false);
  });

  it("is not due when the event has no start time", () => {
    const event = { notifyWhatsapp: true, whatsappNotifiedAt: null, startTime: null };
    expect(isReminderDue(event, NOW, 60)).toBe(false);
  });
});
