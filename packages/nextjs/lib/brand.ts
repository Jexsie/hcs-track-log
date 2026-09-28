/**
 * The demo shipper this template is dressed as. Kivu Cargo is fictional; change these values to
 * brand the portal for your own company.
 */
export const BRAND = {
  name: "Kivu Cargo",
  portal: "Staff portal",
  /** Prefix for sample booking references, e.g. "KC-…". */
  bookingPrefix: "KC",
  /** The company's own carrier details, offered first in forms and sample data. */
  carrier: { name: "Kivu Cargo", scacCode: "KIVU" },
} as const;
