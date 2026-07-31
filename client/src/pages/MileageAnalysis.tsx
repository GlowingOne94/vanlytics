import { trpc } from "@/lib/trpc";
import { useIsAdmin } from "@/_core/hooks/useIsAdmin";
import { toDateInputValue, fromDateInputValue } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Gauge, Clock, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function groupByDate<T extends { clockInAt: string | number | Date }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const dateKey = new Date(item.clockInAt).toLocaleDateString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(item);
  }
  return Array.from(groups.entries());
}

export default function MileageAnalysis() {
  const { isAdmin } = useIsAdmin();
  const [startDate, setStartDate] = useState<number | null>(null);
  const [endDate, setEndDate] = useState<number | null>(null);

  const { data, isLoading } = trpc.mileageAnalysis.get.useQuery({
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
  });
  const utils = trpc.useUtils();

  const deleteShiftMutation = trpc.mileageAnalysis.deleteShift.useMutation({
    onSuccess: () => {
      utils.mileageAnalysis.get.invalidate();
      toast.success("Entry removed");
    },
    onError: (err) => toast.error(err.message),
  });

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
        <div className="flex items-end gap-3 flex-wrap mt-4">
          <div>
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              className="w-auto"
              value={toDateInputValue(startDate)}
              onChange={(e) => setStartDate(e.target.value ? fromDateInputValue(e.target.value) : null)}
            />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              className="w-auto"
              value={toDateInputValue(endDate)}
              onChange={(e) => {
                if (!e.target.value) { setEndDate(null); return; }
                // Make the end date inclusive through the end of that day,
                // not just its midnight starting instant.
                const endOfDay = fromDateInputValue(e.target.value) + (24 * 60 * 60 * 1000 - 1);
                setEndDate(endOfDay);
              }}
            />
          </div>
          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setStartDate(null); setEndDate(null); }}>
              Clear (show all time)
            </Button>
          )}
        </div>
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
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!data || data.detail.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No shifts logged yet.</p>
          ) : (
            groupByDate(data.detail).map(([dateLabel, shifts]) => (
              <div key={dateLabel}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{dateLabel}</p>
                <div className="space-y-1">
                  {shifts.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0 flex-wrap gap-2">
                      <div>
                        <p className="font-medium">{s.driverName} — Van {s.vanNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.clockInAt).toLocaleTimeString()}
                          {s.clockOutAt ? ` → ${new Date(s.clockOutAt).toLocaleTimeString()}` : " (still clocked in)"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs text-muted-foreground">
                          {s.milesDriven != null && <p>{s.milesDriven.toLocaleString()} mi</p>}
                          {s.hoursWorked != null && <p>{s.hoursWorked} hrs</p>}
                        </div>
                        {isAdmin && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (!window.confirm(`Remove this entry for ${s.driverName} — Van ${s.vanNumber}?`)) return;
                            deleteShiftMutation.mutate({ id: s.id });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
