import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Truck,
  AlertTriangle,
  DollarSign,
  Wrench,
  TrendingUp,
  Store,
  Bell,
  Calendar,
} from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: alertsList } = trpc.alerts.list.useQuery({ unreadOnly: true });
  const { data: upcomingMaintenance } = trpc.dashboard.upcomingMaintenance.useQuery();
  const { data: services } = trpc.maintenance.getServices.useQuery();
  const { data: vehicles } = trpc.vehicles.list.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Fleet overview and key metrics</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const kpis = [
    {
      title: "Fleet Size",
      value: stats?.fleetSize ?? 0,
      icon: Truck,
      description: `${stats?.activeVehicles ?? 0} active`,
      color: "text-blue-500",
    },
    {
      title: "Vehicles Down",
      value: stats?.vehiclesDown ?? 0,
      icon: AlertTriangle,
      description: "Currently out of service",
      color: stats?.vehiclesDown ? "text-red-500" : "text-green-500",
    },
    {
      title: "Due for Service",
      value: stats?.vehiclesDueForService ?? 0,
      icon: Calendar,
      description: "Vehicles due within 30 days",
      color: stats?.vehiclesDueForService ? "text-orange-500" : "text-green-500",
    },
    {
      title: "Active Alerts",
      value: stats?.unreadAlertCount ?? 0,
      icon: Bell,
      description: "Unread notifications",
      color: stats?.unreadAlertCount ? "text-yellow-500" : "text-green-500",
    },
    {
      title: "Avg Monthly Cost",
      value: `$${(stats?.avgMonthlyRepairCost ?? 0).toLocaleString()}`,
      icon: TrendingUp,
      description: "Average monthly repair spend",
      color: "text-purple-500",
    },
    {
      title: "Total Cost (Year)",
      value: `$${(stats?.totalRepairCostYear ?? 0).toLocaleString()}`,
      icon: DollarSign,
      description: "Total fleet repair cost",
      color: "text-emerald-500",
    },
    {
      title: "Most Reliable Shop",
      value: stats?.mostReliableShop ?? "N/A",
      icon: Store,
      description: "Highest success rate",
      color: "text-green-500",
      isText: true,
    },
    {
      title: "Least Reliable Shop",
      value: stats?.leastReliableShop ?? "N/A",
      icon: Store,
      description: "Lowest success rate",
      color: "text-red-500",
      isText: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Fleet overview and key metrics</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${kpi.isText ? "text-base" : ""}`}>
                {kpi.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upcoming Maintenance */}
      {upcomingMaintenance && upcomingMaintenance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Upcoming Maintenance (Next 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingMaintenance.slice(0, 8).map((m) => {
                const service = services?.find(s => s.id === m.serviceId);
                const vehicle = vehicles?.find(v => v.id === m.vehicleId);
                return (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Van {vehicle?.vanNumber || "?"}</Badge>
                      <span>{service?.name || `Service #${m.serviceId}`}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {m.nextDueDate ? new Date(m.nextDueDate).toLocaleDateString() : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Cost Vehicles & Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Highest Cost Vehicles (Year)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.topCostVehicles && stats.topCostVehicles.length > 0 ? (
              <div className="space-y-3">
                {stats.topCostVehicles.map((v, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Van {v.vanNumber}</span>
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      ${v.total.toLocaleString()}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No repair data yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertsList && alertsList.length > 0 ? (
              <div className="space-y-3">
                {alertsList.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="flex items-start gap-2">
                    <Badge
                      variant={
                        alert.severity === "critical"
                          ? "destructive"
                          : alert.severity === "warning"
                          ? "default"
                          : "secondary"
                      }
                      className="text-xs shrink-0 mt-0.5"
                    >
                      {alert.severity}
                    </Badge>
                    <span className="text-sm">{alert.title}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active alerts</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
