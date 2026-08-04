import { Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Truck, Wrench, Calendar, ClipboardCheck, UserCircle, DollarSign, Check,
} from "lucide-react";

const FEATURES = [
  { icon: Truck, title: "Vehicle Profiles", desc: "Full history for every vehicle in your fleet — mileage, documents, insurance, and registration in one place." },
  { icon: Wrench, title: "Maintenance & Repairs", desc: "Log repairs, track costs by category, and never lose an invoice again." },
  { icon: Calendar, title: "Preventive Maintenance", desc: "Automatic reminders for oil changes, tires, brakes, and more — before they become breakdowns." },
  { icon: ClipboardCheck, title: "DOT Inspections", desc: "Track inspection dates and expirations across your whole fleet, with alerts before anything lapses." },
  { icon: UserCircle, title: "Driver Records", desc: "License, medical certification, and MVR/abstract tracking — configurable to your industry." },
  { icon: DollarSign, title: "Cost Reporting", desc: "See cost per vehicle, cost per mile, and spending trends without digging through spreadsheets." },
];

type Plan = {
  key: "starter" | "fleet" | "fleet_pro" | "enterprise";
  name: string;
  price: string;
  period: string;
  priceQuarterly?: string;
  periodQuarterly?: string;
  quarterlyNote?: string;
  priceAnnual?: string;
  periodAnnual?: string;
  annualNote?: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
  comingSoon?: boolean;
};

const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    price: "$49",
    period: "/month",
    priceAnnual: "$529",
    periodAnnual: "/year",
    annualNote: "~$44/mo billed annually — save 10%",
    blurb: "For fleets with up to 7 vehicles",
    features: [
      "Vehicle profiles & document storage",
      "Maintenance and repair history",
      "Preventive-maintenance reminders",
      "Expense tracking",
      "Shop and vendor records",
      "Basic driver profiles",
      "License & certification reminders",
      "Basic spending reports",
      "2 administrative users",
    ],
  },
  {
    key: "fleet",
    name: "Fleet",
    price: "$99",
    period: "/month",
    priceQuarterly: "$267",
    periodQuarterly: "/quarter",
    quarterlyNote: "~$89/mo billed quarterly — save 10%",
    priceAnnual: "$999",
    periodAnnual: "/year",
    annualNote: "~$83/mo billed annually — save 15%",
    blurb: "For fleets up to 20 vehicles",
    highlight: true,
    features: [
      "Everything in Starter, plus:",
      "Unlimited driver profiles",
      "DOT inspection records",
      "Advanced expense reports",
      "Cost per vehicle & per mile",
      "Expiration dashboard",
      "Multiple user roles",
      "Data exports",
      "5 administrative users",
      "Priority support",
    ],
  },
  {
    key: "fleet_pro",
    name: "Fleet Pro",
    price: "$149",
    period: "/month",
    priceQuarterly: "$399",
    periodQuarterly: "/quarter",
    quarterlyNote: "~$133/mo billed quarterly — save 10%",
    priceAnnual: "$1,499",
    periodAnnual: "/year",
    annualNote: "~$125/mo billed annually — save 15%",
    blurb: "For fleets up to 40 vehicles",
    features: [
      "Everything in Fleet, plus:",
      "Multiple companies/entities",
      "Advanced permissions",
      "Bulk data imports (tolls; gas bills coming soon)",
      "Unlimited administrative users",
      "Faster support",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Coming Soon",
    period: "",
    blurb: "For fleets over 40 vehicles",
    features: [],
    comingSoon: true,
  },
];

export default function Marketing() {
  const [pricingInterval, setPricingInterval] = useState<"month" | "quarter" | "year">("month");
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Vanlytics" className="h-8 w-auto" />
            <span className="text-lg font-bold tracking-tight">Vanlytics</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline">Pricing</a>
            <Link href="/login"><Button variant="ghost" size="sm">Log In</Button></Link>
            <Link href="/login"><Button size="sm">Get Started</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <Badge variant="outline" className="mb-4">Fleet management, simplified</Badge>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5">
          Optimize Fleet. Simplify Paperwork.
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Track vehicles, maintenance, driver records, and compliance in one place — built for commercial
          fleets, NEMT and medical transportation providers, and any operation that answers to DOT.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/login"><Button size="lg">Get Started</Button></Link>
          <a href="#pricing"><Button size="lg" variant="outline">View Pricing</Button></a>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">Everything your fleet operation needs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(f => (
            <Card key={f.title}>
              <CardContent className="p-6">
                <f.icon className="h-8 w-8 text-primary mb-3" />
                <h3 className="font-semibold mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-2">Simple, transparent pricing</h2>
        <p className="text-center text-muted-foreground mb-6">No per-driver fees. Cancel anytime.</p>
        <div className="flex justify-center mb-10">
          <div className="flex rounded-md border overflow-hidden">
            <button
              type="button"
              className={`px-4 py-1.5 text-sm ${pricingInterval === "month" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
              onClick={() => setPricingInterval("month")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`px-4 py-1.5 text-sm ${pricingInterval === "quarter" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
              onClick={() => setPricingInterval("quarter")}
            >
              Quarterly — save 10%
            </button>
            <button
              type="button"
              className={`px-4 py-1.5 text-sm ${pricingInterval === "year" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
              onClick={() => setPricingInterval("year")}
            >
              Annual — save 15%
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map(plan => (
            <Card key={plan.key} className={plan.highlight ? "border-primary shadow-lg relative" : plan.comingSoon ? "opacity-80" : ""}>
              {plan.highlight && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>
              )}
              <CardContent className="p-6 flex flex-col h-full">
                <h3 className="font-semibold text-lg">{plan.name}</h3>
                <p className="text-xs text-muted-foreground mb-3">{plan.blurb}</p>
                <div className="mb-1">
                  {pricingInterval === "year" && plan.priceAnnual ? (
                    <>
                      <span className="text-3xl font-bold">{plan.priceAnnual}</span>
                      <span className="text-sm text-muted-foreground">{plan.periodAnnual}</span>
                    </>
                  ) : pricingInterval === "quarter" && plan.priceQuarterly ? (
                    <>
                      <span className="text-3xl font-bold">{plan.priceQuarterly}</span>
                      <span className="text-sm text-muted-foreground">{plan.periodQuarterly}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-bold">{plan.price}</span>
                      <span className="text-sm text-muted-foreground">{plan.period}</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-4 h-4">
                  {pricingInterval === "year" && plan.annualNote
                    ? plan.annualNote
                    : pricingInterval === "quarter" && plan.quarterlyNote
                      ? plan.quarterlyNote
                      : pricingInterval !== "month" && !plan.comingSoon
                        ? "Billed monthly — this option isn't available for this plan"
                        : ""}
                </p>
                {plan.comingSoon ? (
                  <p className="text-sm text-muted-foreground mb-6 flex-1">
                    Enterprise-scale fleet management is on the way — built for operations running more than 40 vehicles.
                    Reach out to be the first to know when it's available.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm mb-6 flex-1">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2">
                        {f.startsWith("Everything") ? (
                          <span className="text-muted-foreground italic">{f}</span>
                        ) : (
                          <>
                            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {plan.comingSoon ? (
                  <Button className="w-full" variant="outline" disabled>
                    Coming Soon
                  </Button>
                ) : (
                  <Link href="/login">
                    <Button className="w-full" variant={plan.highlight ? "default" : "outline"}>
                      Get Started
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t mt-8">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Vanlytics" className="h-4 w-auto" /> Vanlytics
          </div>
          <p>&copy; {new Date().getFullYear()} Vanlytics. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
