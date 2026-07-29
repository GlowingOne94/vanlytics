import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Gauge, Clock, Download, Truck, UserCircle } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const tooltipStyle = {
  contentStyle: { backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, color: "#111" },
  itemStyle: { color: "#111" },
  labelStyle: { color: "#111", fontWeight: 600 },
};

type RangeKey = "7d" | "30d" | "90d" | "all";
const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", all: "All time",
};

function rangeToDates(range: RangeKey): { startDate?: number; endDate?: number } {
  if (range === "all") return {};
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return { startDate: Date.now() - days * 24 * 60 * 60 * 1000, endDate: Date.now() };
}

export default function MileageAnalysis() {
  const [range, setRange] = useState<RangeKey>("30d");
  const dates = useMemo(() => rangeToDates(range), [range]);

  const { data: summary, isLoading: loadingSummary } = trpc.mileageAnalysis.summary.useQuery(dates);
  const { data: shifts, isLoading: loadingShifts } = trpc.mileageAnalysis.shifts.useQuery(dates);

  const totalMiles = summary?.byVehicle.reduce((sum, v) => sum + v.milesDriven, 0) ?? 0;
  const totalHours = summary?.byDriver.reduce((sum, d) => sum + d.hoursWorked, 0) ?? 0;

  const exportCSV = () => {
    if (!shifts) return;
    const headers = "Driver,Van,Clock In,Clock Out,Start Mileage,End Mileage,Miles Driven,Status\n";
    const rows = shifts.map(s => [
      s.driverName,
      `Van ${s.vanNumber}`,
      new Date(s.clockInAt).toLocaleString(),
      s.clockOutAt ? new Date(s.clockOutAt).toLocaleString() : "",
      s.startMileage,
      s.endMileage ?? "",
      s.milesDriven ?? "",
      s.status,
    ].join(",")).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mileage-analysis-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loading = loadingSummary || loadingShifts;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mileage Analysis</h1>
          <p className="text-muted-foreground text-sm mt-1">Miles driven per van and hours worked per driver, from clock in/out logs</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
                <SelectItem key={key} value={key}>{RANGE_LABELS[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-72 rounded-lg" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Gauge className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{totalMiles.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total miles driven</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Total hours worked</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <UserCircle className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{summary?.openShiftCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Currently clocked in</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Miles per Van</CardTitle>
              </CardHeader>
              <CardContent>
                {!summary || summary.byVehicle.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No closed shifts in this range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={summary.byVehicle}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="vanNumber" tick={{ fontSize: 12 }} tickFormatter={(v) => `Van ${v}`} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v.toLocaleString()} mi`, "Miles"]} labelFormatter={(v) => `Van ${v}`} />
                      <Bar dataKey="milesDriven" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><UserCircle className="h-4 w-4" /> Hours per Driver</CardTitle>
              </CardHeader>
              <CardContent>
                {!summary || summary.byDriver.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No closed shifts in this range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={summary.byDriver}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="driverName" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)} hrs`, "Hours"]} />
                      <Bar dataKey="hoursWorked" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shift Log</CardTitle>
            </CardHeader>
            <CardContent>
              {!shifts || shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No shifts logged in this range yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Driver</TableHead>
                        <TableHead>Van</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead className="text-right">Miles</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shifts.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{s.driverName}</TableCell>
                          <TableCell>Van {s.vanNumber}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{new Date(s.clockInAt).toLocaleString()}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.clockOutAt ? new Date(s.clockOutAt).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">{s.milesDriven ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={s.status === "open" ? "bg-blue-500/15 text-blue-500 border-blue-500/30" : ""}>
                              {s.status === "open" ? "Clocked In" : "Closed"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
