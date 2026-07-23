import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import { fileToBase64 } from "@/components/DocumentField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Route as RouteIcon, Upload, AlertTriangle, Link2, Unlink, Users, Truck, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

// ---------- Shared helpers ----------

const STATUS_OPTIONS = ["imported", "unassigned", "assigned", "dispatched", "in_progress", "completed", "cancelled", "no_show"] as const;
type TripStatus = typeof STATUS_OPTIONS[number];

const STATUS_STYLES: Record<TripStatus, string> = {
  imported: "bg-muted text-muted-foreground border-border",
  unassigned: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  assigned: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  dispatched: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  in_progress: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  completed: "bg-green-500/15 text-green-500 border-green-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  no_show: "bg-red-500/15 text-red-500 border-red-500/30",
};

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Target fields the importer needs to fill in.
const TARGET_FIELDS: { key: string; label: string; required: boolean }[] = [
  { key: "passengerLabel", label: "Passenger Name / Label", required: false },
  { key: "jobId", label: "Job ID", required: false },
  { key: "pickupTime", label: "Pickup Time", required: true },
  { key: "appointmentTime", label: "Appointment Time", required: false },
  { key: "pickupAddress", label: "Pickup Address", required: true },
  { key: "dropoffAddress", label: "Drop-off Address", required: true },
  { key: "legType", label: "A-leg / B-leg", required: false },
  { key: "mobilityType", label: "Mobility Type", required: false },
  { key: "wheelchairCount", label: "Wheelchair Count", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "facilityName", label: "Facility Name", required: false },
  { key: "notes", label: "Notes", required: false },
];

function guessColumn(headers: string[], key: string): string | null {
  const patterns: Record<string, RegExp> = {
    passengerLabel: /patient|passenger|name/i,
    jobId: /job\s*id|trip\s*id|confirmation/i,
    pickupTime: /pick.?up.*time|pu\s*time/i,
    appointmentTime: /appt|appointment/i,
    pickupAddress: /pick.?up.*(addr|location)|pu\s*addr/i,
    dropoffAddress: /drop.?off|destination|do\s*addr/i,
    legType: /leg/i,
    mobilityType: /mobility|wheelchair type|equipment/i,
    wheelchairCount: /wheelchair.*count|# ?wheelchair|w\/c/i,
    phone: /phone|contact/i,
    facilityName: /facility/i,
    notes: /note/i,
  };
  const pattern = patterns[key];
  if (!pattern) return null;
  return headers.find(h => pattern.test(h)) ?? null;
}

function combineDateAndTime(tripDateBase: number, raw: unknown): number {
  if (raw instanceof Date) {
    // If SheetJS parsed a real datetime (year looks real), use it directly.
    if (raw.getFullYear() > 1980) return raw.getTime();
  }
  const base = new Date(tripDateBase);
  if (typeof raw === "string") {
    const match = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3]?.toUpperCase();
      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
      base.setHours(hours, minutes, 0, 0);
      return base.getTime();
    }
  }
  if (typeof raw === "number") {
    // Excel time-of-day serial (fraction of a day).
    if (raw < 1) {
      const totalMinutes = Math.round(raw * 24 * 60);
      base.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
      return base.getTime();
    }
  }
  return base.getTime();
}

export default function RoutePlanning() {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(Date.now()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <RouteIcon className="h-6 w-6 text-primary" /> Route Planning
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Phase 1A — manual dispatch assistance with synthetic test data. No live optimizer, GPS, or real patient data yet.
        </p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Daily Dashboard</TabsTrigger>
          <TabsTrigger value="import">Import Trips</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DailyDashboard selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ImportWizard onImported={(date) => setSelectedDate(date)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== DAILY DASHBOARD ====================

function DailyDashboard({
  selectedDate, setSelectedDate,
}: {
  selectedDate: number;
  setSelectedDate: (d: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: tripsForDay, isLoading } = trpc.routePlanning.listByDate.useQuery({ tripDate: selectedDate });
  const { data: pairSuggestions } = trpc.routePlanning.suggestPairs.useQuery({ tripDate: selectedDate });
  const { data: drivers } = trpc.drivers.list.useQuery();
  const { data: vehicles } = trpc.vehicles.list.useQuery();

  const linkPairMutation = trpc.routePlanning.linkPair.useMutation({
    onSuccess: () => {
      utils.routePlanning.listByDate.invalidate({ tripDate: selectedDate });
      utils.routePlanning.suggestPairs.invalidate({ tripDate: selectedDate });
      toast.success("Trips linked as A-leg/B-leg pair");
    },
    onError: (err) => toast.error(err.message),
  });

  const unlinkPairMutation = trpc.routePlanning.unlinkPair.useMutation({
    onSuccess: () => {
      utils.routePlanning.listByDate.invalidate({ tripDate: selectedDate });
      toast.success("Pair unlinked");
    },
    onError: (err) => toast.error(err.message),
  });

  const assignMutation = trpc.routePlanning.assign.useMutation({
    onSuccess: () => {
      utils.routePlanning.listByDate.invalidate({ tripDate: selectedDate });
      toast.success("Assignment updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const statusMutation = trpc.routePlanning.updateStatus.useMutation({
    onSuccess: () => {
      utils.routePlanning.listByDate.invalidate({ tripDate: selectedDate });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.routePlanning.delete.useMutation({
    onSuccess: () => {
      utils.routePlanning.listByDate.invalidate({ tripDate: selectedDate });
      toast.success("Trip removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const activeDrivers = (drivers ?? []).filter(d => d.status === "active");
  const activeVehicles = (vehicles ?? []).filter(v => v.status === "active");

  const summary = useMemo(() => {
    const t = tripsForDay ?? [];
    return {
      total: t.length,
      unassigned: t.filter(x => x.status === "unassigned" || x.status === "imported").length,
      assigned: t.filter(x => x.status === "assigned").length,
      dispatched: t.filter(x => x.status === "dispatched" || x.status === "in_progress").length,
      completed: t.filter(x => x.status === "completed").length,
      cancelled: t.filter(x => x.status === "cancelled" || x.status === "no_show").length,
    };
  }, [tripsForDay]);

  const changeDay = (deltaDays: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + deltaDays);
    setSelectedDate(startOfDay(d.getTime()));
  };

  return (
    <div className="space-y-6">
      {/* Date navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => changeDay(-1)}>← Previous</Button>
        <Button variant="outline" size="sm" onClick={() => setSelectedDate(startOfDay(Date.now()))}>Today</Button>
        <Button variant="outline" size="sm" onClick={() => changeDay(1)}>Next →</Button>
        <Input
          type="date"
          className="w-auto"
          value={new Date(selectedDate).toISOString().split("T")[0]}
          onChange={(e) => setSelectedDate(startOfDay(new Date(e.target.value).getTime()))}
        />
        <span className="text-sm text-muted-foreground ml-2">
          {new Date(selectedDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Trips", value: summary.total },
          { label: "Unassigned", value: summary.unassigned },
          { label: "Assigned", value: summary.assigned },
          { label: "Dispatched", value: summary.dispatched },
          { label: "Completed", value: summary.completed },
          { label: "Cancelled", value: summary.cancelled },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pair suggestions */}
      {pairSuggestions && pairSuggestions.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" /> Possible A-leg/B-leg Matches — Confirmation Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pairSuggestions.map((s, i) => {
              const tripA = tripsForDay?.find(t => t.id === s.tripAId);
              const tripB = tripsForDay?.find(t => t.id === s.tripBId);
              if (!tripA || !tripB) return null;
              return (
                <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-md border text-sm">
                  <div>
                    <p className="font-medium">{tripA.passengerLabel || "Unlabeled"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(tripA.pickupTime)} → {formatTime(tripB.pickupTime)} · {s.reason}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => linkPairMutation.mutate({ tripAId: s.tripAId, tripBId: s.tripBId })}>
                    <Link2 className="h-3.5 w-3.5 mr-1" /> Confirm Pair
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Trip list */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : !tripsForDay || tripsForDay.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No trips imported for this date yet.</p>
      ) : (
        <div className="space-y-2">
          {tripsForDay.map(trip => (
            <Card key={trip.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{trip.passengerLabel || `Trip #${trip.id}`}</p>
                      {trip.jobId && <span className="text-xs text-muted-foreground">Job {trip.jobId}</span>}
                      {trip.legType !== "unknown" && (
                        <Badge variant="outline" className="text-xs">
                          {trip.legType}-leg
                        </Badge>
                      )}
                      {trip.pairedTripId && (
                        <Button
                          variant="ghost" size="sm" className="h-5 px-1.5 text-xs text-muted-foreground"
                          onClick={() => unlinkPairMutation.mutate({ tripId: trip.id })}
                        >
                          <Unlink className="h-3 w-3 mr-1" /> Unlink
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pickup {formatTime(trip.pickupTime)}
                      {trip.appointmentTime && ` · Appt ${formatTime(trip.appointmentTime)}`}
                      {" · "}{trip.mobilityType}
                      {trip.wheelchairCount > 0 && ` (${trip.wheelchairCount} WC)`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                      {trip.pickupAddress} → {trip.dropoffAddress}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${STATUS_STYLES[trip.status as TripStatus]}`}>
                      {trip.status.replace("_", " ")}
                    </Badge>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => { if (window.confirm("Remove this trip?")) deleteMutation.mutate({ id: trip.id }); }}
                    >
                      <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t">
                  <div>
                    <Label className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> Driver</Label>
                    <Select
                      value={trip.assignedDriverId ? String(trip.assignedDriverId) : undefined}
                      onValueChange={(v) => assignMutation.mutate({
                        tripId: trip.id,
                        driverId: parseInt(v),
                        vehicleId: trip.assignedVehicleId,
                      })}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        {activeDrivers.map(d => (
                          <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1"><Truck className="h-3 w-3" /> Vehicle</Label>
                    <Select
                      value={trip.assignedVehicleId ? String(trip.assignedVehicleId) : undefined}
                      onValueChange={(v) => assignMutation.mutate({
                        tripId: trip.id,
                        driverId: trip.assignedDriverId,
                        vehicleId: parseInt(v),
                      })}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        {activeVehicles.map(v => (
                          <SelectItem key={v.id} value={String(v.id)}>Van {v.vanNumber}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select
                      value={trip.status}
                      onValueChange={(v) => statusMutation.mutate({ tripId: trip.id, status: v as TripStatus })}
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== IMPORT WIZARD ====================

function ImportWizard({ onImported }: { onImported: (date: number) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [tripDate, setTripDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = trpc.routePlanning.createImport.useMutation({
    onSuccess: (result) => {
      toast.success(`Imported ${result.count} trips`);
      setFile(null);
      setHeaders([]);
      setRows([]);
      setMapping({});
      setSubmitting(false);
      onImported(startOfDay(new Date(tripDate).getTime()));
    },
    onError: (err) => { toast.error(err.message); setSubmitting(false); },
  });

  const handleFile = async (f: File) => {
    setFile(f);
    const buffer = await f.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (json.length === 0) {
      toast.error("No rows found in that file");
      return;
    }
    const detectedHeaders = Object.keys(json[0]);
    setHeaders(detectedHeaders);
    setRows(json);

    const guessed: Record<string, string> = {};
    for (const field of TARGET_FIELDS) {
      const guess = guessColumn(detectedHeaders, field.key);
      if (guess) guessed[field.key] = guess;
    }
    setMapping(guessed);
  };

  const missingRequired = TARGET_FIELDS.filter(f => f.required && !mapping[f.key]);

  const handleConfirmImport = async () => {
    if (!file) return;
    if (missingRequired.length > 0) {
      toast.error(`Map required fields first: ${missingRequired.map(f => f.label).join(", ")}`);
      return;
    }
    setSubmitting(true);

    const tripDateMs = startOfDay(new Date(tripDate).getTime());
    const mappedRows = rows.map(row => {
      const get = (key: string) => (mapping[key] ? row[mapping[key]] : undefined);
      return {
        jobId: get("jobId") ? String(get("jobId")) : undefined,
        pickupTime: combineDateAndTime(tripDateMs, get("pickupTime")),
        appointmentTime: get("appointmentTime") ? combineDateAndTime(tripDateMs, get("appointmentTime")) : undefined,
        pickupAddress: String(get("pickupAddress") ?? ""),
        dropoffAddress: String(get("dropoffAddress") ?? ""),
        legType: (["A", "B"].includes(String(get("legType")).toUpperCase()) ? String(get("legType")).toUpperCase() : "unknown") as "A" | "B" | "unknown",
        passengerLabel: get("passengerLabel") ? String(get("passengerLabel")) : undefined,
        mobilityType: (/wheelchair/i.test(String(get("mobilityType") ?? "")) ? "wheelchair" : "ambulatory") as "ambulatory" | "wheelchair" | "stretcher",
        wheelchairCount: get("wheelchairCount") ? parseInt(String(get("wheelchairCount"))) || 0 : 0,
        twoPersonAssist: "no" as const,
        phone: get("phone") ? String(get("phone")) : undefined,
        facilityName: get("facilityName") ? String(get("facilityName")) : undefined,
        notes: get("notes") ? String(get("notes")) : undefined,
      };
    });

    const { base64, contentType, fileName } = await fileToBase64(file);
    importMutation.mutate({
      tripDate: tripDateMs,
      fileName,
      fileBase64: base64,
      contentType,
      rows: mappedRows,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Upload a trip spreadsheet (.xlsx or .csv)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Choose File
            </Button>
            {file && <span className="text-sm text-muted-foreground">{file.name} ({rows.length} rows)</span>}
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-sm">Trip Date</Label>
              <Input type="date" className="w-auto" value={tripDate} onChange={(e) => setTripDate(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Testing tip: use synthetic passenger names and fictional addresses only — do not upload real patient data
            until BAAs are in place with hosting/email/AI vendors.
          </p>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Confirm column mapping</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TARGET_FIELDS.map(field => (
                <div key={field.key}>
                  <Label className="text-xs">
                    {field.label}{field.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[field.key] || "__none__"}
                    onValueChange={(v) => setMapping({ ...mapping, [field.key]: v === "__none__" ? "" : v })}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="— not mapped —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— not mapped —</SelectItem>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Preview (first 5 rows)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="space-y-2 min-w-[600px]">
                {rows.slice(0, 5).map((row, i) => (
                  <div key={i} className="text-xs p-2 rounded-md border">
                    {TARGET_FIELDS.filter(f => mapping[f.key]).map(f => (
                      <span key={f.key} className="mr-4">
                        <span className="text-muted-foreground">{f.label}:</span> {String(row[mapping[f.key]] ?? "")}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              {missingRequired.length > 0 && (
                <p className="text-xs text-destructive mt-3 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Map required fields before importing: {missingRequired.map(f => f.label).join(", ")}
                </p>
              )}
              <Button
                className="mt-4"
                onClick={handleConfirmImport}
                disabled={submitting || missingRequired.length > 0}
              >
                {submitting ? "Importing..." : `Confirm Import (${rows.length} trips)`}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
