import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
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
import { ClipboardCheck, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Status = "valid" | "expiring_soon" | "expired" | "never";

const STATUS_STYLES: Record<Status, { label: string; className: string }> = {
  valid: { label: "Valid", className: "bg-green-500/15 text-green-500 border-green-500/30" },
  expiring_soon: { label: "Expiring Soon", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  expired: { label: "Expired", className: "bg-red-500/15 text-red-500 border-red-500/30" },
  never: { label: "Never Inspected", className: "bg-muted text-muted-foreground border-border" },
};

const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function DotInspections() {
  const { data: vehicles, isLoading: loadingVehicles } = trpc.vehicles.list.useQuery();
  const { data: latestByVehicle, isLoading: loadingLatest } = trpc.dotInspections.latestByVehicle.useQuery();
  const utils = trpc.useUtils();

  const [dialogTarget, setDialogTarget] = useState<{ vehicleId: number; vanNumber: string } | null>(null);
  const [form, setForm] = useState({ inspectionDate: Date.now(), mileageAtInspection: 0, inspector: "", notes: "" });

  const createMutation = trpc.dotInspections.create.useMutation({
    onSuccess: () => {
      utils.dotInspections.latestByVehicle.invalidate();
      setDialogTarget(null);
      toast.success("Inspection logged");
    },
    onError: (err) => toast.error(err.message),
  });

  const loading = loadingVehicles || loadingLatest;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const now = Date.now();
  const rows = (vehicles ?? []).map(v => {
    const latest = latestByVehicle?.[v.id] ?? null;
    let status: Status = "never";
    let daysRemaining: number | null = null;

    if (latest) {
      daysRemaining = Math.floor((latest.expiryDate - now) / DAY_MS);
      if (daysRemaining <= 0) status = "expired";
      else if (daysRemaining <= EXPIRING_SOON_DAYS) status = "expiring_soon";
      else status = "valid";
    }

    return { vehicle: v, latest, status, daysRemaining };
  }).sort((a, b) => {
    const order: Record<Status, number> = { expired: 0, expiring_soon: 1, never: 2, valid: 3 };
    return order[a.status] - order[b.status];
  });

  const openDialog = (vehicleId: number, vanNumber: string, currentMileage: number) => {
    setDialogTarget({ vehicleId, vanNumber });
    setForm({ inspectionDate: Date.now(), mileageAtInspection: currentMileage, inspector: "", notes: "" });
  };

  const handleSave = () => {
    if (!dialogTarget) return;
    createMutation.mutate({
      vehicleId: dialogTarget.vehicleId,
      inspectionDate: form.inspectionDate,
      mileageAtInspection: form.mileageAtInspection || undefined,
      inspector: form.inspector || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">DOT Inspections</h1>
        <p className="text-muted-foreground text-sm mt-1">Required every 6 months — track last inspection and expiry per vehicle</p>
      </div>

      <div className="space-y-2">
        {rows.map(({ vehicle, latest, status, daysRemaining }) => (
          <Card key={vehicle.id}>
            <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">Van {vehicle.vanNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {latest ? (
                      <>
                        Last inspected {new Date(latest.inspectionDate).toLocaleDateString()}
                        {latest.mileageAtInspection ? ` @ ${latest.mileageAtInspection.toLocaleString()}mi` : ""}
                        {" · "}
                        {daysRemaining! <= 0
                          ? `Expired ${new Date(latest.expiryDate).toLocaleDateString()}`
                          : `Expires ${new Date(latest.expiryDate).toLocaleDateString()} (${daysRemaining}d)`}
                      </>
                    ) : (
                      "No inspection on record"
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={STATUS_STYLES[status].className}>{STATUS_STYLES[status].label}</Badge>
                <Button size="sm" variant="outline" onClick={() => openDialog(vehicle.id, vehicle.vanNumber, vehicle.mileage)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Log Inspection
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(dialogTarget)} onOpenChange={(open) => { if (!open) setDialogTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTarget ? `Log DOT Inspection — Van ${dialogTarget.vanNumber}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Inspection date</Label>
                <Input
                  type="date"
                  value={new Date(form.inspectionDate).toISOString().split("T")[0]}
                  onChange={(e) => setForm({ ...form, inspectionDate: new Date(e.target.value).getTime() })}
                />
              </div>
              <div>
                <Label>Mileage</Label>
                <Input
                  type="number"
                  value={form.mileageAtInspection || ""}
                  onChange={(e) => setForm({ ...form, mileageAtInspection: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Expires {new Date(new Date(form.inspectionDate).setMonth(new Date(form.inspectionDate).getMonth() + 6)).toLocaleDateString()}
            </p>
            <div>
              <Label>Inspector — optional</Label>
              <Input value={form.inspector} onChange={(e) => setForm({ ...form, inspector: e.target.value })} />
            </div>
            <div>
              <Label>Notes — optional</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button onClick={handleSave} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Log Inspection"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
