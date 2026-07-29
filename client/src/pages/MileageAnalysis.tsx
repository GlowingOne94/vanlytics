import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gauge, Clock } from "lucide-react";

export default function MileageAnalysis() {
  const { data, isLoading } = trpc.mileageAnalysis.get.useQuery({});

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mileage Analysis</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Miles driven per van and hours worked per driver, from mobile app clock-ins
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" /> Miles per Van
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!data || data.byVehicle.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No completed shifts recorded yet.</p>
            ) : (
              data.byVehicle.map(v => (
                <div key={v.vehicleId} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <span>Van {v.vanNumber}</span>
                  <span className="text-muted-foreground">{v.totalMiles.toLocaleString()} mi · {v.shiftCount} shift{v.shiftCount === 1 ? "" : "s"}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Hours per Driver
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!data || data.byDriver.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No completed shifts recorded yet.</p>
            ) : (
              data.byDriver.map(d => (
                <div key={d.driverId} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <span>{d.driverName}</span>
                  <span className="text-muted-foreground">{d.totalHours.toLocaleString()} hrs · {d.shiftCount} shift{d.shiftCount === 1 ? "" : "s"}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shift Detail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data || data.detail.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No shifts logged yet.</p>
          ) : (
            data.detail.map(s => (
              <div key={s.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0 flex-wrap gap-2">
                <div>
                  <p className="font-medium">{s.driverName} — Van {s.vanNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.clockInAt).toLocaleString()}
                    {s.clockOutAt ? ` → ${new Date(s.clockOutAt).toLocaleString()}` : " (still clocked in)"}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {s.milesDriven != null && <p>{s.milesDriven.toLocaleString()} mi</p>}
                  {s.hoursWorked != null && <p>{s.hoursWorked} hrs</p>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
