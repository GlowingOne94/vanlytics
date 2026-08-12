import { trpc } from "@/lib/trpc";
import { useIsAdmin } from "@/_core/hooks/useIsAdmin";
import { toDateInputValue, fromDateInputValue } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Gauge, Clock, Trash2, Pencil, MapPin, ListChecks } from "lucide-react";
import { useMemo, useState } from "react";
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

function GpsLink({ latitude, longitude }: { latitude: number | null; longitude: number | null }) {
  if (latitude == null || longitude == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <a
      href={`https://www.google.com/maps?q=${latitude},${longitude}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline inline-flex items-center gap-1"
    >
      <MapPin className="h-3 w-3" /> View
    </a>
  );
}

export default function MileageAnalysis() {
  const { isAdmin } = useIsAdmin();
  const [startDate, setStartDate] = useState<number | null>(null);
  const [endDate, setEndDate] = useState<number | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [editingShift, setEditingShift] = useState<any>(null);

  const { data, isLoading } = trpc.mileageAnalysis.get.useQuery({
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
  });
  const { data: vehicles } = trpc.vehicles.list.useQuery();
  const { data: drivers } = trpc.drivers.list.useQuery();
  const utils = trpc.useUtils();

  const deleteShiftMutation = trpc.mileageAnalysis.deleteShift.useMutation({
    onSuccess: () => {
      utils.mileageAnalysis.get.invalidate();
      toast.success("Entry removed");
    },
    onError: (err) => toast.error(err.message),
  });

  // Filter the raw shift detail by whichever dropdowns are active.
  const filteredDetail = useMemo(() => {
    if (!data) return [];
    return data.detail.filter(s =>
      (vehicleFilter === "all" || String(s.vehicleId) === vehicleFilter) &&
      (driverFilter === "all" || String(s.driverId) === driverFilter)
    );
  }, [data, vehicleFilter, driverFilter]);

  // The summary cards use the backend's pre-aggregated totals when nothing
  // is filtered (fastest, no recompute needed), but recompute from the
  // filtered detail when a dropdown is active, so "Miles per Van" reflects
  // just the selected driver's vans, and vice versa.
  const isFiltered = vehicleFilter !== "all" || driverFilter !== "all";

  const displayByVehicle = useMemo(() => {
    if (!data) return [];
    if (!isFiltered) return data.byVehicle;
    const map = new Map<number, { vehicleId: number; vanNumber: string; totalMiles: number; shiftCount: number }>();
    for (const s of filteredDetail) {
      if (s.milesDriven == null) continue;
      const entry = map.get(s.vehicleId) ?? { vehicleId: s.vehicleId, vanNumber: s.vanNumber, totalMiles: 0, shiftCount: 0 };
      entry.totalMiles += s.milesDriven;
      entry.shiftCount += 1;
      map.set(s.vehicleId, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.totalMiles - a.totalMiles);
  }, [data, filteredDetail, isFiltered]);

  const displayByDriver = useMemo(() => {
    if (!data) return [];
    if (!isFiltered) return data.byDriver;
    const map = new Map<number, { driverId: number; driverName: string; totalHours: number; shiftCount: number }>();
    for (const s of filteredDetail) {
      if (s.hoursWorked == null) continue;
      const entry = map.get(s.driverId) ?? { driverId: s.driverId, driverName: s.driverName, totalHours: 0, shiftCount: 0 };
      entry.totalHours += s.hoursWorked;
      entry.shiftCount += 1;
      map.set(s.driverId, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
  }, [data, filteredDetail, isFiltered]);

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
          <div>
            <Label className="text-xs">Vehicle</Label>
            <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                {vehicles?.map(v => <SelectItem key={v.id} value={String(v.id)}>Van {v.vanNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Driver</Label>
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(startDate || endDate || isFiltered) && (
            <Button
              variant="ghost" size="sm"
              onClick={() => { setStartDate(null); setEndDate(null); setVehicleFilter("all"); setDriverFilter("all"); }}
            >
              Clear All Filters
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <Gauge className="h-3.5 w-3.5 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="timesheet">
            <ListChecks className="h-3.5 w-3.5 mr-1.5" /> Timesheet
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" /> Miles per Van
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {displayByVehicle.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No completed shifts recorded yet.</p>
                ) : (
                  displayByVehicle.map(v => (
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
                {displayByDriver.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No completed shifts recorded yet.</p>
                ) : (
                  displayByDriver.map(d => (
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
              {filteredDetail.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {isFiltered ? "No shifts match the selected filters." : "No shifts logged yet."}
                </p>
              ) : (
                groupByDate(filteredDetail).map(([dateLabel, shifts]) => (
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
                            <p className="text-xs text-muted-foreground">
                              {s.clockInMileage.toLocaleString()} mi
                              {s.clockOutMileage != null ? ` → ${s.clockOutMileage.toLocaleString()} mi` : " (odometer not yet logged)"}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right text-xs text-muted-foreground">
                              {s.milesDriven != null && <p>{s.milesDriven.toLocaleString()} mi</p>}
                              {s.hoursWorked != null && <p>{s.hoursWorked} hrs</p>}
                            </div>
                            {isAdmin && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                              onClick={() => setEditingShift(s)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            )}
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
        </TabsContent>

        <TabsContent value="timesheet" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timesheet</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                GPS coordinates are only recorded going forward from when this feature shipped — older shifts will show a dash.
              </p>
            </CardHeader>
            <CardContent>
              {filteredDetail.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {isFiltered ? "No shifts match the selected filters." : "No shifts logged yet."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3 font-medium">Driver</th>
                        <th className="py-2 pr-3 font-medium">Van</th>
                        <th className="py-2 pr-3 font-medium">Clock In</th>
                        <th className="py-2 pr-3 font-medium">In Mileage</th>
                        <th className="py-2 pr-3 font-medium">In GPS</th>
                        <th className="py-2 pr-3 font-medium">Clock Out</th>
                        <th className="py-2 pr-3 font-medium">Out Mileage</th>
                        <th className="py-2 pr-3 font-medium">Out GPS</th>
                        <th className="py-2 pr-3 font-medium text-right">Miles</th>
                        <th className="py-2 pr-3 font-medium text-right">Hours</th>
                        <th className="py-2 pr-3 font-medium">Mileage Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDetail.map(s => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">{s.driverName}</td>
                          <td className="py-2 pr-3">Van {s.vanNumber}</td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {new Date(s.clockInAt).toLocaleDateString()} {new Date(s.clockInAt).toLocaleTimeString()}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{s.clockInMileage.toLocaleString()} mi</td>
                          <td className="py-2 pr-3"><GpsLink latitude={s.clockInLatitude} longitude={s.clockInLongitude} /></td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {s.clockOutAt ? `${new Date(s.clockOutAt).toLocaleDateString()} ${new Date(s.clockOutAt).toLocaleTimeString()}` : "Still clocked in"}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{s.clockOutMileage != null ? `${s.clockOutMileage.toLocaleString()} mi` : "—"}</td>
                          <td className="py-2 pr-3"><GpsLink latitude={s.clockOutLatitude} longitude={s.clockOutLongitude} /></td>
                          <td className="py-2 pr-3 text-right">{s.milesDriven != null ? s.milesDriven.toLocaleString() : "—"}</td>
                          <td className="py-2 pr-3 text-right">{s.hoursWorked != null ? s.hoursWorked : "—"}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className={s.mileageVerified ? "bg-green-500/15 text-green-600 border-green-500/30" : "bg-blue-500/15 text-blue-500 border-blue-500/30"}>
                              {s.mileageVerified ? "Verified" : "Estimated"}
                            </Badge>
                            {s.mileageCorrectionMiles != null && (
                              <p className="text-xs text-yellow-500 mt-1">
                                {s.mileageCorrectionMiles > 0 ? "+" : ""}{s.mileageCorrectionMiles} mi correction from prior estimate
                              </p>
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
        </TabsContent>
      </Tabs>

      <EditShiftDialog shift={editingShift} onOpenChange={(open) => { if (!open) setEditingShift(null); }} />
    </div>
  );
}

// Converts an epoch-ms timestamp to the value a <input type="datetime-local">
// expects (local time, "YYYY-MM-DDTHH:mm") and back.
function toDatetimeLocal(ms: number | null | undefined): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDatetimeLocal(value: string): number {
  return new Date(value).getTime();
}

function EditShiftDialog({ shift, onOpenChange }: { shift: any; onOpenChange: (open: boolean) => void }) {
  const [clockInAt, setClockInAt] = useState("");
  const [clockInMileage, setClockInMileage] = useState("");
  const [clockOutAt, setClockOutAt] = useState("");
  const [clockOutMileage, setClockOutMileage] = useState("");
  const utils = trpc.useUtils();

  // Sync the form whenever a new shift is opened for editing.
  if (shift && clockInAt === "" && shift.clockInAt) {
    setClockInAt(toDatetimeLocal(new Date(shift.clockInAt).getTime()));
    setClockInMileage(String(shift.clockInMileage));
    setClockOutAt(shift.clockOutAt ? toDatetimeLocal(new Date(shift.clockOutAt).getTime()) : "");
    setClockOutMileage(shift.clockOutMileage != null ? String(shift.clockOutMileage) : "");
  }

  const updateMutation = trpc.mileageAnalysis.updateShift.useMutation({
    onSuccess: () => {
      utils.mileageAnalysis.get.invalidate();
      toast.success("Shift updated");
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) { setClockInAt(""); setClockInMileage(""); setClockOutAt(""); setClockOutMileage(""); }
  };

  const handleSave = () => {
    if (!shift) return;
    const inMileage = parseInt(clockInMileage, 10);
    if (isNaN(inMileage) || inMileage < 0) { toast.error("Enter a valid starting mileage"); return; }
    const outMileageVal = clockOutMileage.trim() === "" ? null : parseInt(clockOutMileage, 10);
    if (outMileageVal != null && (isNaN(outMileageVal) || outMileageVal < 0)) { toast.error("Enter a valid ending mileage"); return; }

    updateMutation.mutate({
      id: shift.id,
      clockInAt: fromDatetimeLocal(clockInAt),
      clockInMileage: inMileage,
      clockOutAt: clockOutAt.trim() === "" ? null : fromDatetimeLocal(clockOutAt),
      clockOutMileage: outMileageVal,
    });
  };

  return (
    <Dialog open={Boolean(shift)} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit Shift — {shift?.driverName} · Van {shift?.vanNumber}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Use this to fix a shift where the driver forgot to clock out at the right time, or mistyped their mileage.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Clock-In Time</Label>
              <Input type="datetime-local" value={clockInAt} onChange={(e) => setClockInAt(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Starting Mileage</Label>
              <Input type="number" min="0" value={clockInMileage} onChange={(e) => setClockInMileage(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Clock-Out Time</Label>
              <Input type="datetime-local" value={clockOutAt} onChange={(e) => setClockOutAt(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Ending Mileage</Label>
              <Input type="number" min="0" value={clockOutMileage} onChange={(e) => setClockOutMileage(e.target.value)} placeholder="Not clocked out" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Leaving Clock-Out Time blank marks this shift as still open (not clocked out).</p>
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full">
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
