import { trpc } from "@/lib/trpc";
import { useIsAdmin } from "@/_core/hooks/useIsAdmin";
import { toDateInputValue, fromDateInputValue } from "@/lib/utils";
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
import { ClipboardCheck, Plus, Pencil, History, Trash2, ExternalLink, Upload, X } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { DocumentField, fileToBase64 } from "@/components/DocumentField";

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
  const { isAdmin } = useIsAdmin();
  const { data: vehicles, isLoading: loadingVehicles } = trpc.vehicles.list.useQuery();
  const { data: latestByVehicle, isLoading: loadingLatest } = trpc.dotInspections.latestByVehicle.useQuery();
  const utils = trpc.useUtils();

  // Log / Edit dialog
  const [dialogTarget, setDialogTarget] = useState<{ vehicleId: number; vanNumber: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ inspectionDate: Date.now(), mileageAtInspection: 0, inspector: "", notes: "", documentUrl: null as string | null });
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // History dialog
  const [historyTarget, setHistoryTarget] = useState<{ vehicleId: number; vanNumber: string } | null>(null);
  const [uploadingRowId, setUploadingRowId] = useState<number | null>(null);
  const { data: history } = trpc.dotInspections.list.useQuery(
    { vehicleId: historyTarget?.vehicleId },
    { enabled: Boolean(historyTarget) }
  );

  const createMutation = trpc.dotInspections.create.useMutation({
    onSuccess: (result) => {
      utils.dotInspections.latestByVehicle.invalidate();
      utils.dotInspections.list.invalidate();
      setEditingId(result.id);
      toast.success("Inspection logged — you can attach a document below");
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.dotInspections.update.useMutation({
    onSuccess: () => {
      utils.dotInspections.latestByVehicle.invalidate();
      utils.dotInspections.list.invalidate();
      setDialogTarget(null);
      toast.success("Inspection updated");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.dotInspections.delete.useMutation({
    onSuccess: () => {
      utils.dotInspections.latestByVehicle.invalidate();
      utils.dotInspections.list.invalidate();
      toast.success("Inspection removed");
    },
    onError: (err) => toast.error(err.message),
  });
  const uploadDocMutation = trpc.dotInspections.uploadDocument.useMutation({
    onSuccess: (result) => {
      utils.dotInspections.latestByVehicle.invalidate();
      utils.dotInspections.list.invalidate();
      setUploadingDoc(false);
      setUploadingRowId(null);
      setForm(f => ({ ...f, documentUrl: result.url }));
      toast.success("Document uploaded");
    },
    onError: (err) => { toast.error(err.message); setUploadingDoc(false); setUploadingRowId(null); },
  });
  const removeDocMutation = trpc.dotInspections.removeDocument.useMutation({
    onSuccess: () => {
      utils.dotInspections.latestByVehicle.invalidate();
      utils.dotInspections.list.invalidate();
      setForm(f => ({ ...f, documentUrl: null }));
      toast.success("Document removed");
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

  // Always available — logging a new inspection never overwrites history,
  // it just adds another dated record (so backdated/past inspections work).
  const openLogNew = (vehicleId: number, vanNumber: string, currentMileage: number) => {
    setEditingId(null);
    setDialogTarget({ vehicleId, vanNumber });
    setForm({ inspectionDate: Date.now(), mileageAtInspection: currentMileage, inspector: "", notes: "", documentUrl: null });
  };

  const openEdit = (vehicleId: number, vanNumber: string, inspection: NonNullable<typeof latestByVehicle>[number]) => {
    setEditingId(inspection.id);
    setDialogTarget({ vehicleId, vanNumber });
    setForm({
      inspectionDate: inspection.inspectionDate,
      mileageAtInspection: inspection.mileageAtInspection ?? 0,
      inspector: inspection.inspector ?? "",
      notes: inspection.notes ?? "",
      documentUrl: inspection.documentUrl ?? null,
    });
  };

  const handleUploadDoc = async (file: File) => {
    if (!editingId) return;
    setUploadingDoc(true);
    const { base64, contentType, fileName } = await fileToBase64(file);
    uploadDocMutation.mutate({ id: editingId, fileName, fileBase64: base64, contentType });
  };

  const handleHistoryRowUpload = async (id: number, file: File) => {
    setUploadingRowId(id);
    const { base64, contentType, fileName } = await fileToBase64(file);
    uploadDocMutation.mutate({ id, fileName, fileBase64: base64, contentType });
  };

  const handleSave = () => {
    if (!dialogTarget) return;
    const payload = {
      inspectionDate: form.inspectionDate,
      mileageAtInspection: form.mileageAtInspection || undefined,
      inspector: form.inspector || undefined,
      notes: form.notes || undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate({ vehicleId: dialogTarget.vehicleId, ...payload });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">DOT Inspections</h1>
        <p className="text-muted-foreground text-sm mt-1">Required every 6 months — track history and paperwork per vehicle</p>
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
                <Button size="sm" variant="ghost" onClick={() => setHistoryTarget({ vehicleId: vehicle.id, vanNumber: vehicle.vanNumber })}>
                  <History className="h-3.5 w-3.5 mr-1" /> History
                </Button>
                {isAdmin && latest && (
                  <Button size="sm" variant="ghost" onClick={() => openEdit(vehicle.id, vehicle.vanNumber, latest)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Latest
                  </Button>
                )}
                {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => openLogNew(vehicle.id, vehicle.vanNumber, vehicle.mileage)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Log Inspection
                </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Log / Edit dialog */}
      <Dialog open={Boolean(dialogTarget)} onOpenChange={(open) => { if (!open) { setDialogTarget(null); setEditingId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTarget ? `${editingId ? "Edit" : "Log"} DOT Inspection — Van ${dialogTarget.vanNumber}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Inspection date</Label>
                <Input
                  type="date"
                  value={toDateInputValue(form.inspectionDate)}
                  onChange={(e) => setForm({ ...form, inspectionDate: fromDateInputValue(e.target.value, form.inspectionDate) })}
                />
                <p className="text-xs text-muted-foreground mt-1">Pick any past date to add historical records.</p>
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
            {editingId && (
              <DocumentField
                label="Inspection Document"
                fileUrl={form.documentUrl}
                uploading={uploadingDoc}
                onUpload={handleUploadDoc}
                onRemove={() => removeDocMutation.mutate({ id: editingId })}
              />
            )}
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingId ? "Save Changes" : "Log Inspection"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={Boolean(historyTarget)} onOpenChange={(open) => { if (!open) setHistoryTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inspection History — Van {historyTarget?.vanNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {!history || history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No inspections logged yet for this vehicle.</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 p-3 rounded-md border text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{new Date(h.inspectionDate).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.mileageAtInspection ? `${h.mileageAtInspection.toLocaleString()} mi · ` : ""}
                      Expires {new Date(h.expiryDate).toLocaleDateString()}
                      {h.inspector ? ` · ${h.inspector}` : ""}
                    </p>
                    {h.documentUrl && (
                      <a href={h.documentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-1 mt-1">
                        View document <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && (
                    <>
                    <HistoryRowUploader
                      inspectionId={h.id}
                      hasDocument={Boolean(h.documentUrl)}
                      uploading={uploadingRowId === h.id}
                      onUpload={(file) => handleHistoryRowUpload(h.id, file)}
                      onRemove={() => removeDocMutation.mutate({ id: h.id })}
                    />
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => { if (window.confirm("Delete this inspection record?")) deleteMutation.mutate({ id: h.id }); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryRowUploader({
  inspectionId, hasDocument, uploading, onUpload, onRemove,
}: {
  inspectionId: number;
  hasDocument: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.doc,.docx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        title={hasDocument ? "Replace document" : "Attach document"}
      >
        <Upload className="h-3.5 w-3.5" />
      </Button>
      {hasDocument && (
        <Button
          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          title="Remove document"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </>
  );
}

