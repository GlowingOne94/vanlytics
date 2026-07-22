import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Check, X, AlertTriangle, Info, AlertCircle, Truck, UserCircle } from "lucide-react";
import { toast } from "sonner";

const severityConfig = {
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-500/10" },
  warning: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  critical: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10" },
};

const DRIVER_ALERT_TYPES = new Set(["medical_cert_expiring", "cdl_expiring", "abstract_due"]);

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

  const markReadMutation = trpc.alerts.markRead.useMutation({
    onSuccess: () => utils.alerts.list.invalidate(),
  });

  const dismissMutation = trpc.alerts.dismiss.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate();
      toast.success("Alert dismissed");
    },
  });

  const vehicleAlerts = (alerts ?? []).filter(a => !DRIVER_ALERT_TYPES.has(a.type));
  const driverAlerts = (alerts ?? []).filter(a => DRIVER_ALERT_TYPES.has(a.type));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {alerts?.filter(a => a.isRead === "no").length ?? 0} unread alerts
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : alerts && alerts.length > 0 ? (
        <div className="space-y-8">
          <AlertSection
            title="Vehicle Alerts"
            icon={Truck}
            alerts={vehicleAlerts}
            onMarkRead={(id) => markReadMutation.mutate({ id })}
            onDismiss={(id) => dismissMutation.mutate({ id })}
          />
          <AlertSection
            title="Driver Alerts"
            icon={UserCircle}
            alerts={driverAlerts}
            onMarkRead={(id) => markReadMutation.mutate({ id })}
            onDismiss={(id) => dismissMutation.mutate({ id })}
          />
        </div>
      ) : (
        <div className="text-center py-12">
          <Bell className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">All clear</h3>
          <p className="text-sm text-muted-foreground mt-1">No active alerts at this time</p>
        </div>
      )}
    </div>
  );
}

function AlertSection({
  title, icon: SectionIcon, alerts, onMarkRead, onDismiss,
}: {
  title: string;
  icon: typeof Truck;
  alerts: AlertItem[];
  onMarkRead: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <SectionIcon className="h-4 w-4 text-primary" /> {title}
        <span className="text-sm font-normal text-muted-foreground">
          ({alerts.filter(a => a.isRead === "no").length} unread)
        </span>
      </h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Nothing here right now.</p>
      ) : (
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
      )}
    </div>
  );
}
