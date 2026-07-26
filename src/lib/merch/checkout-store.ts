import type { RepricedLine } from "./reprice";

/** Lines that must ship via Printful (or a self-shipped manual product) need a
 * carrier rate and address; pickup/digital lines do not. */
export function lineNeedsShipping(line: Pick<RepricedLine, "fulfillmentType">): boolean {
  return line.fulfillmentType === "printful_pod" || line.fulfillmentType === "self_shipped";
}

/** Address required iff any line in the cart needs shipping — a pure-digital or
 * pure-pickup cart (or a mix of the two) never requires an address. */
export function cartNeedsAddress(lines: Pick<RepricedLine, "fulfillmentType">[]): boolean {
  return lines.some(lineNeedsShipping);
}

/** Split repriced cart lines by fulfillment branch for checkout. */
export function partitionByFulfillment(lines: RepricedLine[]): {
  printful: RepricedLine[];
  selfShipped: RepricedLine[];
  pickup: RepricedLine[];
} {
  return {
    printful: lines.filter((l) => l.fulfillmentType === "printful_pod"),
    selfShipped: lines.filter((l) => l.fulfillmentType === "self_shipped"),
    pickup: lines.filter((l) => l.fulfillmentType === "pickup"),
  };
}
