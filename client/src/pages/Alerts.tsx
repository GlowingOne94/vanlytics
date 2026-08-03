import { trpc } from "@/lib/trpc";
import { useIsAdmin } from "@/_core/hooks/useIsAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Check, X, AlertTriangle, Info, AlertCircle, RefreshCw, Lock, Calendar, Truck, ClipboardCheck, IdCard, HeartPulse, FileSearch } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const severityConfig = {
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-500/10" },
  warning: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  critical: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10" },
};

// Vehicle: registration & insurance for now. Driver: medical/CDL/abstract.
// Repairs: everything else already tracked (maintenance, warranty, cost, DOT).
const VEHICLE_TYPES = new Set(["insurance_expiring", "registration_expiring"]);
const DRIVER_TYPES = new Set(["medical_cert_expiring", "cdl_expiring", "abstract_due"]);

type AlertItem = {
  id: number;
  type: string;
  title: string;
  message: string | null;
  severity: keyof typeof severityConfig;
  isRead: string;
  createdAt: string | Date;
};

export default function Alerts() {
  const { isAdmin } = useIsAdmin();
  const { data: alerts, isLoading } = trpc.alerts.list.useQuery();
  const { data: billingStatus } = trpc.billing.getStatus.useQuery();
  const canSeeExpirationDashboard = Boolean(
    billingStatus?.isGrandfathered || (billingStatus && ["fleet", "fleet_pro", "enterprise"].includes(billingStatus.planTier))
  );
  const utils = trpc.useUtils();
  const hasAutoChecked = useRef(false);

  const markReadMutation = trpc.alerts.markRead.useMutation({
    onSuccess: () => utils.alerts.list.invalidate(),
  });

  const dismissMutation = trpc.alerts.dismiss.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      toast.success("Alert dismissed");
    },
  });

  const checkAlertsMutation = trpc.alertGeneration.run.useMutation({
    onSuccess: (result) => {
      utils.alerts.list.invalidate();
      if (result.generated > 0) {
        toast.success(`${result.generated} new alert${result.generated === 1 ? "" : "s"} found`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const dismissAllMutation = trpc.alerts.dismissAll.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      toast.success("All alerts dismissed");
    },
    onError: (err) => toast.error(err.message),
  });

  // Check for new alerts once automatically when this page loads, so alerts
  // stay current without anyone having to remember to click "Check Now".
  // Members can't run this (it's a mutation, admin-only), so skip it for them.
  useEffect(() => {
    if (isAdmin && !hasAutoChecked.current) {
      hasAutoChecked.current = true;
      checkAlertsMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const vehicleAlerts = (alerts ?? []).filter(a => VEHICLE_TYPES.has(a.type));
  const driverAlerts = (alerts ?? []).filter(a => DRIVER_TYPES.has(a.type));
  const repairAlerts = (alerts ?? []).filter(a => !VEHICLE_TYPES.has(a.type) && !DRIVER_TYPES.has(a.type));

  const unreadCount = (list: AlertItem[]) => list.filter(a => a.isRead === "no").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {alerts?.filter(a => a.isRead === "no").length ?? 0} unread alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
          <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!window.confirm("Dismiss all alerts? This can't be undone.")) return;
              dismissAllMutation.mutate();
            }}
            disabled={dismissAllMutation.isPending || !alerts || alerts.length === 0}
          >
            {dismissAllMutation.isPending ? "Dismissing..." : "Dismiss All"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkAlertsMutation.mutate()}
            disabled={checkAlertsMutation.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checkAlertsMutation.isPending ? "animate-spin" : ""}`} />
            {checkAlertsMutation.isPending ? "Checking..." : "Check Now"}
          </Button>
          </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (
        <Tabs defaultValue="vehicles" className="w-full">
          <TabsList>
            <TabsTrigger value="vehicles">
              Vehicles {vehicleAlerts.length > 0 && <Badge variant="secondary" className="ml-1.5">{unreadCount(vehicleAlerts)}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="drivers">
              Drivers {driverAlerts.length > 0 && <Badge variant="secondary" className="ml-1.5">{unreadCount(driverAlerts)}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="repairs">
              Repairs {repairAlerts.length > 0 && <Badge variant="secondary" className="ml-1.5">{unreadCount(repairAlerts)}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="expiration">
              Expiration Dashboard {!canSeeExpirationDashboard && <Lock className="h-3 w-3 ml-1.5" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles" className="mt-4">
            <AlertList
              alerts={vehicleAlerts}
              emptyText="No registration or insurance expirations to flag right now."
              isAdmin={isAdmin}
              onMarkRead={(id) => markReadMutation.mutate({ id })}
              onDismiss={(id) => dismissMutation.mutate({ id })}
            />
          </TabsContent>
          <TabsContent value="drivers" className="mt-4">
            <AlertList
              alerts={driverAlerts}
              emptyText="No medical, CDL, or abstract reviews coming due right now."
              isAdmin={isAdmin}
              onMarkRead={(id) => markReadMutation.mutate({ id })}
              onDismiss={(id) => dismissMutation.mutate({ id })}
            />
          </TabsContent>
          <TabsContent value="repairs" className="mt-4">
            <AlertList
              alerts={repairAlerts}
              emptyText="Nothing here right now."
              isAdmin={isAdmin}
              onMarkRead={(id) => markReadMutation.mutate({ id })}
              onDismiss={(id) => dismissMutation.mutate({ id })}
            />
          </TabsContent>
          <TabsContent value="expiration" className="mt-4">
            <ExpirationDashboard canAccess={canSeeExpirationDashboard} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function AlertList({
  alerts, emptyText, isAdmin, onMarkRead, onDismiss,
}: {
  alerts: AlertItem[];
  emptyText: string;
  isAdmin: boolean;
  onMarkRead: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-12">
        <Bell className="h-10 w-10 mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground mt-3">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const config = severityConfig[alert.severity];
        const Icon = config.icon;
        return (
          <Card key={alert.id} className={alert.isRead === "no" ? "border-l-4 border-l-primary" : "opacity-75"}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`h-8 w-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{alert.title}</p>
                      <Badge variant="outline" className="text-xs capitalize">{alert.type.replace(/_/g, " ")}</Badge>
                    </div>
                    {alert.message && <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(alert.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {isAdmin && alert.isRead === "no" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkRead(alert.id)}>
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                  {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDismiss(alert.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ExpirationDashboard({ canAccess }: { canAccess: boolean }) {
  const { data, isLoading } = trpc.alerts.expirationDashboard.useQuery(undefined, { enabled: canAccess });

  if (!canAccess) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Expiration Dashboard requires Fleet or higher</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            See every vehicle registration, DOT inspection, and driver CDL/medical/abstract expiring within the
            next 2 weeks, all in one focused view. Upgrade your plan from the Team page to unlock it.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>;
  }

  const sections = [
    { key: "vehicleRegistrations", title: "Vehicle Registration", icon: Truck, items: data.vehicleRegistrations, label: (i: any) => `Van ${i.vanNumber}` },
    { key: "dotInspections", title: "DOT Inspections", icon: ClipboardCheck, items: data.dotInspections, label: (i: any) => `Van ${i.vanNumber}` },
    { key: "driverCdl", title: "Driver CDL", icon: IdCard, items: data.driverCdl, label: (i: any) => i.driverName },
    { key: "driverMedical", title: "Driver Medical Certs", icon: HeartPulse, items: data.driverMedical, label: (i: any) => i.driverName },
    { key: "driverAbstracts", title: "Driver Abstracts", icon: FileSearch, items: data.driverAbstracts, label: (i: any) => i.driverName },
  ];

  const totalCount = sections.reduce((sum, s) => sum + s.items.length, 0);

  if (totalCount === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-10 w-10 mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground mt-3">Nothing expiring in the next 2 weeks. You're all caught up.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {sections.filter(s => s.items.length > 0).map(section => (
        <div key={section.key}>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <section.icon className="h-4 w-4 text-primary" /> {section.title}
            <span className="text-xs font-normal text-muted-foreground">({section.items.length})</span>
          </h3>
          <div className="space-y-1.5">
            {section.items.map((item: any, i: number) => (
              <Card key={i}>
                <CardContent className="p-3 flex items-center justify-between">
                  <p className="text-sm font-medium">{section.label(item)}</p>
                  <Badge
                    variant="outline"
                    className={item.daysLeft <= 0 ? "bg-red-500/15 text-red-500 border-red-500/30" : "bg-yellow-500/15 text-yellow-500 border-yellow-500/30"}
                  >
                    {item.daysLeft <= 0 ? "Expired" : `${item.daysLeft}d left`} · {new Date(item.expiryDate).toLocaleDateString()}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
