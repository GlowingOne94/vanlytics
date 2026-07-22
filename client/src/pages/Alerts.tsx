import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Check, X, AlertTriangle, Info, AlertCircle, RefreshCw } from "lucide-react";
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
  const { data: alerts, isLoading } = trpc.alerts.list.useQuery();
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

  // Check for new alerts once automatically when this page loads, so alerts
  // stay current without anyone having to remember to click "Check Now".
  useEffect(() => {
    if (!hasAutoChecked.current) {
      hasAutoChecked.current = true;
      checkAlertsMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <Button
          variant="outline"
          size="sm"
          onClick={() => checkAlertsMutation.mutate()}
          disabled={checkAlertsMutation.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checkAlertsMutation.isPending ? "animate-spin" : ""}`} />
          {checkAlertsMutation.isPending ? "Checking..." : "Check Now"}
        </Button>
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
          </TabsList>

          <TabsContent value="vehicles" className="mt-4">
            <AlertList
              alerts={vehicleAlerts}
              emptyText="No registration or insurance expirations to flag right now."
              onMarkRead={(id) => markReadMutation.mutate({ id })}
              onDismiss={(id) => dismissMutation.mutate({ id })}
            />
          </TabsContent>
          <TabsContent value="drivers" className="mt-4">
            <AlertList
              alerts={driverAlerts}
              emptyText="No medical, CDL, or abstract reviews coming due right now."
              onMarkRead={(id) => markReadMutation.mutate({ id })}
              onDismiss={(id) => dismissMutation.mutate({ id })}
            />
          </TabsContent>
          <TabsContent value="repairs" className="mt-4">
            <AlertList
              alerts={repairAlerts}
              emptyText="Nothing here right now."
              onMarkRead={(id) => markReadMutation.mutate({ id })}
              onDismiss={(id) => dismissMutation.mutate({ id })}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function AlertList({
  alerts, emptyText, onMarkRead, onDismiss,
}: {
  alerts: AlertItem[];
  emptyText: string;
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
                  {alert.isRead === "no" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkRead(alert.id)}>
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDismiss(alert.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
