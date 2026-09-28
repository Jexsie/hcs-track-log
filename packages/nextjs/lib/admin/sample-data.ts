import type { HederaNetwork } from "@/lib/wallet/hip820";
import { toLocalInputValue } from "./datetime";
import type { EventForm, ParcelForm } from "./validation";

/** Random but realistic form data for trying the console quickly. Never offered on mainnet. */

const CARGO = [
  {
    description: "Arabica coffee beans, green, jute bags",
    packageType: "Bag",
    kgPerPackage: [55, 65],
  },
  {
    description: "Robusta coffee beans, green, jute bags",
    packageType: "Bag",
    kgPerPackage: [58, 62],
  },
  { description: "Dried vanilla pods, vacuum packed", packageType: "Box", kgPerPackage: [8, 15] },
  { description: "Cut roses, refrigerated", packageType: "Box", kgPerPackage: [10, 14] },
  { description: "Cocoa beans, fermented", packageType: "Bag", kgPerPackage: [60, 70] },
  { description: "Solar panel modules", packageType: "Pallet", kgPerPackage: [350, 520] },
  { description: "Mobile phone accessories", packageType: "Crate", kgPerPackage: [20, 45] },
  { description: "Shea butter, unrefined", packageType: "Drum", kgPerPackage: [180, 200] },
] as const;

const SHIPPERS = [
  "Bugisu Coffee Co-op, Mbale",
  "Kyagalanyi Coffee Ltd, Kampala",
  "Rwenzori Growers, Kasese",
  "Madagascar Spice House, Antalaha",
];
const CONSIGNEES = [
  "Hamburg Roasters GmbH",
  "Rotterdam Fresh Imports BV",
  "Antwerp Commodities NV",
  "Dubai Trade Hub LLC",
];
const CARRIERS = [
  { name: "MTN Logistics", scacCode: "MTNL" },
  { name: "Maersk Line", scacCode: "MAEU" },
  { name: "Mediterranean Shipping Co", scacCode: "MSCU" },
  { name: "DHL Global Forwarding", scacCode: "DHLG" },
];
const STATUSES = [
  "Booked",
  "Picked Up",
  "In Transit",
  "At Hub",
  "Customs Hold",
  "Out for Delivery",
  "Delivered",
];
const LOCATIONS = [
  "Mbale, Uganda",
  "Kampala Hub, Uganda",
  "Malaba Border Post, Kenya",
  "Nairobi Inland Container Depot, Kenya",
  "Mombasa Port, Kenya",
  "Port of Rotterdam, Netherlands",
  "Hamburg Container Terminal, Germany",
];

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;
const between = (min: number, max: number) => min + Math.random() * (max - min);

/** A fixed-scale decimal string; never goes through float formatting. */
const toScale2 = (value: number) => (Math.round(value * 100) / 100).toFixed(2);

let counter = 0;

export function sampleParcelForm(): ParcelForm {
  const cargo = pick(CARGO);
  const count = Math.floor(between(1, 40));
  const mass = count * between(cargo.kgPerPackage[0], cargo.kgPerPackage[1]);
  counter = (counter + 1) % 1000;
  const unique = `${Date.now().toString(36).toUpperCase()}${counter.toString().padStart(3, "0")}`;
  return {
    description: cargo.description,
    packageCount: String(count),
    packageType: cargo.packageType,
    grossMassKg: toScale2(Math.min(mass, 99_999_999)),
    volumeCubicMeters: toScale2(Math.max(0.01, mass / between(250, 600))),
    shipper: pick(SHIPPERS),
    consignee: pick(CONSIGNEES),
    bookingRef: `BK-DEMO-${unique}`,
  };
}

/** An event at a random time within the last week (whole seconds, in the admin's local time). */
export function sampleEventForm(now: Date = new Date()): EventForm {
  const carrier = pick(CARRIERS);
  const at = new Date(Math.floor((now.getTime() - between(0, 7 * 86_400_000)) / 1000) * 1000);
  return {
    status: pick(STATUSES),
    location: pick(LOCATIONS),
    carrierName: carrier.name,
    scacCode: carrier.scacCode,
    timestamp: toLocalInputValue(at),
  };
}

export function sampleDataAllowed(network: HederaNetwork): boolean {
  return network !== "mainnet";
}
