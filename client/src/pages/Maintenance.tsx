import { trpc } from "@/lib/trpc";
import { toDateInputValue, fromDateInputValue } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, CheckCircle, AlertTriangle, Gauge } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Status = "overdue" | "due_soon" | "ok" | "never";

const STATUS_STYLES: Record<Status, { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "bg-red-500/15 text-red-500 border-red-500/30" },
  due_soon: { label: "Due Soon", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  ok: { label: "OK", className: "bg-green-500/15 text-green-500 border-green-500/30" },
  never: { label: "Not Logged", className: "bg-muted text-muted-foreground border-border" },
};

const DUE_SOON_MILES = 1000;
const DUE_SOON_DAYS = 30;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function Maintenance() {
  const { data: services, isLoading: loadingServices } = trpc.maintenance.getServices.useQuery();
  const { data: vehicles, isLoading: loadingVehicles } = trpc.vehicles.list.useQuery();
  const { data: latestByPair, isLoading: loadingLatest } = trpc.maintenance.latestByVehicleAndService.useQuery();
  const utils = trpc.useUtils();

  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [mileageInput, setMileageInput] = useState("");

  const [markDoneTarget, setMarkDoneTarget] = useState<{ vehicleId: number; serviceId: number; vanNumber: string; serviceName: string } | null>(null);
  const [markDoneForm, setMarkDoneForm] = useState({ completedAt: Date.now(), mileageAtService: 0, cost: "0", notes: "" });

  const updateMileageMutation = trpc.vehicles.update.useMutation({
    onSuccess: () => {
      utils.vehicles.list.invalidate();
      toast.success("Mileage updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const createRecordMutation = trpc.maintenance.createRecord.useMutation({
    onSuccess: () => {
      utils.maintenance.latestByVehicleAndService.invalidate();
      utils.maintenance.getRecords.invalidate();
      setMarkDoneTarget(null);
      toast.success("Marked as done");
    },
    onError: (err) => toast.error(err.message),
  });

  const loading = loadingServices || loadingVehicles || loadingLatest;

  // Compute due-status for every vehicle x service combination.
  const rows = useMemo(() => {
    if (!services || !vehicles || !latestByPair) return [];
    const now = Date.now();
    const out: {
      vehicleId: number; vanNumber: string; vehicleMileage: number;
      serviceId: number; serviceName: string; category: string;
      lastRecord: { completedAt: number; mileageAtService: number | null } | null;
      nextDueMileage: number | null; nextDueDate: number | null;
      milesRemaining: number | null; daysRemaining: number | null;
      status: Status;
    }[] = [];

    for (const vehicle of vehicles) {
      for (const service of services) {
        const lastRecord = latestByPair[`${vehicle.id}-${service.id}`] ?? null;

        if (!lastRecord) {
          out.push({
            vehicleId: vehicle.id, vanNumber: vehicle.vanNumber, vehicleMileage: vehicle.mileage,
            serviceId: service.id, serviceName: service.name, category: service.category || "Other",
            lastRecord: null, nextDueMileage: null, nextDueDate: null,
            milesRemaining: null, daysRemaining: null, status: "never",
          });
          continue;
        }

        const nextDueMileage = service.intervalMiles && lastRecord.mileageAtService != null
          ? lastRecord.mileageAtService + service.intervalMiles : null;
        const nextDueDate = service.intervalMonths
          ? lastRecord.completedAt + service.intervalMonths * MONTH_MS : null;
        const milesRemaining = nextDueMileage != null ? nextDueMileage - vehicle.mileage : null;
        const daysRemaining = nextDueDate != null ? Math.floor((nextDueDate - now) / DAY_MS) : null;

        let status: Status = "ok";
        if ((milesRemaining != null && milesRemaining <= 0) || (daysRemaining != null && daysRemaining <= 0)) {
          status = "overdue";
        } else if ((milesRemaining != null && milesRemaining <= DUE_SOON_MILES) || (daysRemaining != null && daysRemaining <= DUE_SOON_DAYS)) {
          status = "due_soon";
        }

        out.push({
          vehicleId: vehicle.id, vanNumber: vehicle.vanNumber, vehicleMileage: vehicle.mileage,
          serviceId: service.id, serviceName: service.name, category: service.category || "Other",
          lastRecord, nextDueMileage, nextDueDate, milesRemaining, daysRemaining, status,
        });
      }
    }
    return out;
  }, [services, vehicles, latestByPair]);

  const needsAttention = useMemo(() => {
    return rows
      .filter(r => r.status === "overdue" || r.status === "due_soon")
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "overdue" ? -1 : 1;
        const aRank = Math.min(a.milesRemaining ?? Infinity, (a.daysRemaining ?? Infinity) * 1000);
        const bRank = Math.min(b.milesRemaining ?? Infinity, (b.daysRemaining ?? Infinity) * 1000);
        return aRank - bRank;
      });
  }, [rows]);

  const selectedVehicle = vehicles?.find(v => v.id === selectedVehicleId);
  const vehicleRows = rows.filter(r => r.vehicleId === selectedVehicleId);
  const vehicleRowsByCategory = vehicleRows.reduce((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {} as Record<string, typeof vehicleRows>);

  const openMarkDone = (vehicleId: number, serviceId: number, vanNumber: string, serviceName: string, currentMileage: number) => {
    setMarkDoneTarget({ vehicleId, serviceId, vanNumber, serviceName });
    setMarkDoneForm({ completedAt: Date.now(), mileageAtService: currentMileage, cost: "0", notes: "" });
  };

  const handleMarkDoneSave = () => {
    if (!markDoneTarget) return;
    const service = services?.find(s => s.id === markDoneTarget.serviceId);
    const nextDueMileage = service?.intervalMiles ? markDoneForm.mileageAtService + service.intervalMiles : undefined;
    const nextDueDate = service?.intervalMonths ? markDoneForm.completedAt + service.intervalMonths * MONTH_MS : undefined;
    createRecordMutation.mutate({
      vehicleId: markDoneTarget.vehicleId,
      serviceId: markDoneTarget.serviceId,
      completedAt: markDoneForm.completedAt,
      mileageAtService: markDoneForm.mileageAtService || undefined,
      nextDueMileage,
      nextDueDate,
      cost: markDoneForm.cost && markDoneForm.cost !== "0" ? markDoneForm.cost : undefined,
      notes: markDoneForm.notes || undefined,
    });
  };

  const handleUpdateMileage = () => {
    if (!selectedVehicleId) return;
    const mileage = parseInt(mileageInput, 10);
    if (isNaN(mileage) || mileage < 0) { toast.error("Enter a valid mileage"); return; }
    updateMileageMutation.mutate({ id: selectedVehicleId, mileage });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Preventive Maintenance</h1>
        <p className="text-muted-foreground text-sm mt-1">Service schedules, current status, and completion history</p>
      </div>

      {/* Needs Attention */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" /> Needs Attention
        </h2>
        {needsAttention.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nothing overdue or due soon right now.</p>
        ) : (
          <div className="space-y-2">
            {needsAttention.map(r => (
              <Card key={`${r.vehicleId}-${r.serviceId}`}>
                <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-medium">Van {r.vanNumber} — {r.serviceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.category}
                      {r.lastRecord && ` · Last done ${new Date(r.lastRecord.completedAt).toLocaleDateString()}`}
                      {r.milesRemaining != null && ` · ${r.milesRemaining <= 0 ? `${Math.abs(r.milesRemaining).toLocaleString()} mi overdue` : `${r.milesRemaining.toLocaleString()} mi remaining`}`}
                      {r.daysRemaining != null && ` · ${r.daysRemaining <= 0 ? `${Math.abs(r.daysRemaining)}d overdue` : `${r.daysRemaining}d remaining`}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={STATUS_STYLES[r.status].className}>{STATUS_STYLES[r.status].label}</Badge>
                    <Button size="sm" variant="outline" onClick={() => openMarkDone(r.vehicleId, r.serviceId, r.vanNumber, r.serviceName, r.vehicleMileage)}>
                      Mark Done Today
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Per-vehicle schedule */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" /> Vehicle Schedule
        </h2>
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label>Vehicle</Label>
              <Select
                value={selectedVehicleId ? String(selectedVehicleId) : undefined}
                onValueChange={(v) => {
                  const id = parseInt(v);
                  setSelectedVehicleId(id);
                  const veh = vehicles?.find(x => x.id === id);
                  setMileageInput(veh ? String(veh.mileage) : "");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles?.map(v => <SelectItem key={v.id} value={String(v.id)}>Van {v.vanNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedVehicle && (
              <>
                <div>
                  <Label className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> Current Mileage</Label>
                  <Input type="number" value={mileageInput} onChange={(e) => setMileageInput(e.target.value)} className="w-36" />
                </div>
                <Button size="sm" onClick={handleUpdateMileage} disabled={updateMileageMutation.isPending}>
                  {updateMileageMutation.isPending ? "Saving..." : "Update Mileage"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {selectedVehicle ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {Object.entries(vehicleRowsByCategory).map(([category, catRows]) => (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">{category}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {catRows.map(r => (
                    <div key={r.serviceId} className="flex items-center justify-between text-sm gap-2">
                      <div>
                        <p>{r.serviceName}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.lastRecord
                            ? `Last: ${new Date(r.lastRecord.completedAt).toLocaleDateString()}${r.lastRecord.mileageAtService ? ` @ ${r.lastRecord.mileageAtService.toLocaleString()}mi` : ""}`
                            : "Never logged"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className={`text-xs ${STATUS_STYLES[r.status].className}`}>
                          {STATUS_STYLES[r.status].label}
                        </Badge>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => openMarkDone(r.vehicleId, r.serviceId, r.vanNumber, r.serviceName, r.vehicleMileage)}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">Select a vehicle to see its full schedule.</p>
        )}
      </div>

      <Dialog open={Boolean(markDoneTarget)} onOpenChange={(open) => { if (!open) setMarkDoneTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {markDoneTarget ? `${markDoneTarget.serviceName} — Van ${markDoneTarget.vanNumber}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date completed</Label>
                <Input
                  type="date"
                  value={toDateInputValue(markDoneForm.completedAt)}
                  onChange={(e) => setMarkDoneForm({ ...markDoneForm, completedAt: fromDateInputValue(e.target.value, markDoneForm.completedAt) })}
                />
              </div>
              <div>
                <Label>Mileage</Label>
                <Input
                  type="number"
                  value={markDoneForm.mileageAtService || ""}
                  onChange={(e) => setMarkDoneForm({ ...markDoneForm, mileageAtService: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <Label>Cost ($) — optional</Label>
              <Input value={markDoneForm.cost} onChange={(e) => setMarkDoneForm({ ...markDoneForm, cost: e.target.value })} />
            </div>
            <div>
              <Label>Notes — optional</Label>
              <Input value={markDoneForm.notes} onChange={(e) => setMarkDoneForm({ ...markDoneForm, notes: e.target.value })} />
            </div>
            <Button onClick={handleMarkDoneSave} disabled={createRecordMutation.isPending}>
              {createRecordMutation.isPending ? "Saving..." : "Mark as Done"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
