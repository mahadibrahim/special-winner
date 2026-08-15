"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

interface TeamRegistrationDetailData {
  team: {
    id: string;
    teamName: string;
    status: string;
    captainName: string;
    captainEmail: string;
    backstopStatus: string;
    paymentDeadline: string | null;
    createdAt: string | null;
  };
  season: { id: string; name: string };
  program: { id: string; name: string };
  sport: { id: string; name: string };
  location: { id: string; name: string };
  money: {
    teamFeeCents: number | null;
    depositCents: number;
    discountCents: number | null;
    collectedCents: number;
  };
  payments: Array<{
    id: string;
    amountCents: number;
    paymentType: string;
    status: string;
    stripePaymentIntentId: string | null;
    createdAt: string;
    payer: { id: string; email: string; firstName: string | null; lastName: string | null };
  }>;
  invitees: Array<{
    id: string;
    email: string;
    assignedShareCents: number;
    status: string;
    invitedAt: string | null;
    paidAt: string | null;
  }>;
  members: Array<{
    registrationId: string;
    role: string;
    registrationStatus: string;
    paymentStatus: string;
    waiverSigned: boolean;
    firstName: string;
    lastName: string;
  }>;
}

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function inviteeBadge(status: string) {
  const variants: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    charged_to_captain: "bg-blue-100 text-blue-800",
  };
  const labels: Record<string, string> = {
    paid: "Paid",
    pending: "Pending",
    charged_to_captain: "Charged to captain",
  };
  return (
    <Badge className={`${variants[status] ?? ""} hover:${variants[status] ?? ""}`}>
      {labels[status] ?? status}
    </Badge>
  );
}

export function TeamRegistrationDetail({ id }: { id: string }) {
  const [data, setData] = useState<TeamRegistrationDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/team-registrations/${id}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Failed to load (${res.status})`);
        }
        setData(await res.json());
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

  if (isLoading) return <LoadingSkeleton />;
  if (loadError || !data) {
    return <ErrorBanner message={loadError ?? "Team registration not found"} />;
  }

  const { team, season, program, sport, location, money, payments, invitees, members } = data;
  const remainderCents =
    money.teamFeeCents != null
      ? Math.max(0, money.teamFeeCents - money.collectedCents)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <a
          href="/admin/registrations"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Registrations
        </a>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-3xl font-bold text-gray-900">{team.teamName}</h1>
          <Badge variant="outline">{team.status}</Badge>
        </div>
        <p className="text-gray-600 mt-1">
          {program.name} — {season.name} · {sport.name} · {location.name}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Team fee</CardDescription>
            <CardTitle className="text-2xl">
              {money.teamFeeCents != null ? formatCurrency(money.teamFeeCents) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deposit</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(money.depositCents)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Collected</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {formatCurrency(money.collectedCents)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Remaining</CardDescription>
            <CardTitle className="text-2xl">
              {remainderCents != null ? formatCurrency(remainderCents) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Captain</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Name</p>
            <p className="font-medium">{team.captainName}</p>
            <p className="text-muted-foreground">{team.captainEmail}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Reserved</p>
            <p className="font-medium">{formatDate(team.createdAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Payment deadline</p>
            <p className="font-medium">{formatDate(team.paymentDeadline)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Backstop</p>
            <p className="font-medium">{team.backstopStatus}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Team payments</CardTitle>
          <CardDescription>
            Deposit, backstop charges, and refunds at the team level
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team payments recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Payer</th>
                    <th className="py-2 pr-4">Stripe</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{formatDate(p.createdAt)}</td>
                      <td className="py-2 pr-4 font-medium">{formatCurrency(p.amountCents)}</td>
                      <td className="py-2 pr-4">{p.paymentType}</td>
                      <td className="py-2 pr-4">{p.status}</td>
                      <td className="py-2 pr-4">{p.payer.email}</td>
                      <td className="py-2 pr-4">
                        {p.stripePaymentIntentId ? (
                          <a
                            href={`https://dashboard.stripe.com/payments/${p.stripePaymentIntentId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Roster shares</CardTitle>
          <CardDescription>Invitees and their assigned share of the team fee</CardDescription>
        </CardHeader>
        <CardContent>
          {invitees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invitees yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Share</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {invitees.map((i) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{i.email}</td>
                      <td className="py-2 pr-4 font-medium">
                        {formatCurrency(i.assignedShareCents)}
                      </td>
                      <td className="py-2 pr-4">{inviteeBadge(i.status)}</td>
                      <td className="py-2 pr-4">{formatDate(i.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Member registrations</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members registered yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.registrationId}
                  className="flex items-center justify-between border rounded-lg p-3"
                >
                  <div>
                    <p className="font-medium">
                      {m.firstName} {m.lastName}
                      {m.role === "captain" && (
                        <Badge variant="outline" className="ml-2">
                          Captain
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {m.registrationStatus} · {m.paymentStatus} ·{" "}
                      {m.waiverSigned ? "waiver signed" : "waiver pending"}
                    </p>
                  </div>
                  <a
                    href={`/admin/registrations/${m.registrationId}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    Manage <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
