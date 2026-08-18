import { describe, expect, it } from "vitest";
import { haversineKm } from "../src/utils/geo";

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm({ lat: 48.8566, lng: 2.3522 }, { lat: 48.8566, lng: 2.3522 })).toBeCloseTo(0, 3);
  });

  it("computes a known real-world distance within a small tolerance", () => {
    // Araras, SP vs the actual EcoCentro IPEC location (Pirenopolis, GO) — ~739km apart.
    const araras = { lat: -22.3595617, lng: -47.3914338 };
    const ipec = { lat: -15.8807096, lng: -48.9424923 };
    const distance = haversineKm(araras, ipec);
    expect(distance).toBeGreaterThan(700);
    expect(distance).toBeLessThan(780);
  });

  it("correctly identifies (0,0) as very far from a real destination", () => {
    const araras = { lat: -22.3595617, lng: -47.3914338 };
    const distance = haversineKm(araras, { lat: 0, lng: 0 });
    expect(distance).toBeGreaterThan(5000);
  });
});
