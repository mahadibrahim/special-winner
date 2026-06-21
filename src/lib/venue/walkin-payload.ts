/**
 * Pure mapper: walk-in form state → kiosk walkin/start body
 *
 * The kiosk endpoint (`/api/kiosk/[locationSlug]/walkin/start`) accepts:
 *   { sessionId, contact: { firstName, lastName, email, phone, dob }, parent?: { ... } }
 *
 * The command center extends this with `paymentMethod` and `linkChannel` so the
 * caller knows how to deliver payment after the booking is created. These extra
 * fields are stripped/ignored by the kiosk endpoint (it only reads what it
 * validates) but are returned by this mapper so the component can act on them.
 */

export interface WalkInForm {
  mode: "adult" | "child";
  firstName: string;
  lastName: string;
  /** Email for adult (required); empty string when child (parent email used). */
  email: string;
  phone: string;
  /** Date of birth YYYY-MM-DD — required by the kiosk endpoint. */
  dob: string;
  sessionId: string;
  // Child-mode: parent contact (required for minors per the kiosk endpoint)
  parentFirstName?: string;
  parentLastName?: string;
  parentEmail?: string;
  parentPhone?: string;
}

export type WalkInPayment =
  | { method: "link"; linkChannel: "email" | "sms" }
  | { method: "kiosk" };

export interface WalkInPayload {
  sessionId: string;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dob: string;
  };
  parent?: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  /** UI-only: how to take payment after booking is created. */
  paymentMethod: "link" | "kiosk";
  /** Present only when paymentMethod === "link". */
  linkChannel?: "email" | "sms";
}

export function walkInToPayload(form: WalkInForm, pay: WalkInPayment): WalkInPayload {
  const base: WalkInPayload = {
    sessionId: form.sessionId,
    contact: {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      dob: form.dob,
    },
    paymentMethod: pay.method,
    ...(pay.method === "link" ? { linkChannel: pay.linkChannel } : {}),
  };

  if (form.mode === "child") {
    base.parent = {
      firstName: form.parentFirstName ?? "",
      lastName: form.parentLastName ?? "",
      email: form.parentEmail ?? "",
      phone: form.parentPhone ?? "",
    };
  }

  return base;
}
