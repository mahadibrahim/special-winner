import type { RepricedLine } from "./reprice";

/** Lines that must ship via Printful (or a self-shipped manual product) need a
 * carrier rate and address; pickup/digital lines do not. */
export function lineNeedsShipping(line: Pick<RepricedLine, "fulfillmentType">): boolean {
  return line.fulfillmentType === "printful_pod" || line.fulfillmentType === "self_shipped";
}

/** Split repriced cart lines by fulfillment branch for checkout. */
export function partitionByFulfillment(lines: RepricedLine[]): {
  printful: RepricedLine[];
  pickup: RepricedLine[];
} {
  return {
    printful: lines.filter((l) => l.fulfillmentType === "printful_pod"),
    pickup: lines.filter((l) => l.fulfillmentType === "pickup"),
  };
}
