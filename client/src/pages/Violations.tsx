import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useIsAdmin } from "@/_core/hooks/useIsAdmin";
import { toDateInputValue, fromDateInputValue } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Siren, Plus, RefreshCw, ExternalLink, Upload, Trash2, DollarSign, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  disputed: { label: "Disputed", className: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  pending_payment: { label: "Pending Payment", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  finalized: { label: "Finalized", className: "bg-gray-500/15 text-gray-500 border-gray-500/30" },
};

const STRIKE_FINES = [50, 100, 150, 200, 250]; // MTA's progressive schedule, capped at $250

export default function Violations() {
  const { isAdmin } = useIsAdmin();
  const [statusFilter, setStatusFilter] = useState("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data: violationsList, isLoading } = trpc.violations.list.useQuery();
  const { data: vehicles } = trpc.vehicles.list.useQuery();
  const utils = trpc.useUtils();

  const syncMutation = trpc.violations.syncNow.useMutation({
    onSuccess: (result) => {
      utils.violations.list.invalidate();
      if (result.errors.length > 0) {
        toast.error(`Synced with some issues: ${result.errors[0]}${result.errors.length > 1 ? ` (+${result.errors.length - 1} more)` : ""}`);
      } else {
        toast.success(`Checked ${result.checked} plate${result.checked === 1 ? "" : "s"} — ${result.found} violation${result.found === 1 ? "" : "s"} on file`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const statusMutation = trpc.violations.updateStatus.useMutation({
    onSuccess: () => { utils.violations.list.invalidate(); toast.success("Status updated"); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.violations.delete.useMutation({
    onSuccess: () => { utils.violations.list.invalidate(); toast.success("Violation removed"); },
    onError: (err) => toast.error(err.message),
  });

  const filtered = (violationsList ?? []).filter(v => statusFilter === "all" || v.status === statusFilter);
  const totalDue = (violationsList ?? []).reduce((sum, v) => sum + (v.amountDue ?? 0), 0);
  const openCount = (violationsList ?? []).filter(v => v.status === "open").length;

  // Warn about any plate that's about to hit (or already at) the $250 cap
  // on its next bus-lane violation.
  const plateStrikeMax = new Map<string, number>();
  for (const v of violationsList ?? []) {
    if (v.strikeNumber != null) {
      plateStrikeMax.set(v.plateNumber, Math.max(plateStrikeMax.get(v.plateNumber) ?? 0, v.strikeNumber));
    }
  }
  const platesNearCap = Array.from(plateStrikeMax.entries()).filter(([, max]) => max >= 4);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Siren className="h-6 w-6 text-primary" /> Violations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Bus lane, camera, and parking tickets — synced automatically from NYC's public records where possible</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} /> {syncMutation.isPending ? "Syncing..." : "Sync Now"}
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Violation
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-3">
          <DollarSign className="h-8 w-8 text-primary/40" />
          <div><p className="text-xs text-muted-foreground">Total Amount Due</p><p className="text-xl font-bold">${totalDue.toFixed(2)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <Siren className="h-8 w-8 text-primary/40" />
          <div><p className="text-xs text-muted-foreground">Open</p><p className="text-xl font-bold">{openCount}</p></div>
        </CardContent></Card>
      </div>

      {platesNearCap.length > 0 && (
        <div className="flex items-start gap-2 text-sm bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 text-yellow-600">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {platesNearCap.map(([plate, max]) => `${plate} (strike ${max}${max >= 5 ? ", at the $250 cap" : `, next one is $${STRIKE_FINES[max]}`})`).join("; ")}
            {" — "}worth a reminder to whoever's driving these vans about bus lane awareness.
          </span>
        </div>
      )}

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="disputed">Disputed</TabsTrigger>
          <TabsTrigger value="pending_payment">Pending Payment</TabsTrigger>
          <TabsTrigger value="finalized">Finalized</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No violations on file{statusFilter !== "all" ? " for this status" : ""}.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(v => (
            <ViolationRow key={v.id} violation={v} isAdmin={isAdmin} onStatusChange={(status) => statusMutation.mutate({ id: v.id, status })} onDelete={() => {
              if (window.confirm(`Remove this violation (${v.summonsNumber ?? v.violationType ?? "ticket"})? This can't be undone.`)) {
                deleteMutation.mutate({ id: v.id });
              }
            }} />
          ))}
        </div>
      )}

      <AddViolationDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} vehicles={vehicles} />
    </div>
  );
}

function ViolationRow({
  violation: v, isAdmin, onStatusChange, onDelete,
}: {
  violation: any;
  isAdmin: boolean;
  onStatusChange: (status: "open" | "disputed" | "pending_payment" | "finalized") => void;
  onDelete: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const uploadMutation = trpc.violations.uploadDocument.useMutation({
    onSuccess: () => { utils.violations.list.invalidate(); toast.success("Document attached"); },
    onError: (err) => toast.error(err.message),
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({ violationId: v.id, fileName: file.name, fileBase64: base64, contentType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <Card>
      <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={STATUS_STYLES[v.status].className}>{STATUS_STYLES[v.status].label}</Badge>
          {v.strikeNumber != null && (
            <Badge variant="outline" className="bg-orange-500/15 text-orange-500 border-orange-500/30">Strike {v.strikeNumber}</Badge>
          )}
          {v.source === "auto_sync" && (
            <Badge variant="outline" className="text-xs">Auto-synced</Badge>
          )}
          <div>
            <p className="text-sm font-medium">
              {v.violationType || "Violation"}
              {v.vanNumber ? ` · Van ${v.vanNumber}` : ` · ${v.plateNumber}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(v.issueDate).toLocaleDateString()}
              {v.issuingAgency ? ` · ${v.issuingAgency}` : ""}
              {v.summonsNumber ? ` · #${v.summonsNumber}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-semibold">${(v.amountDue ?? v.fineAmount ?? 0).toFixed(2)}</p>
            {v.amountDue != null && v.fineAmount != null && v.amountDue !== v.fineAmount && (
              <p className="text-xs text-muted-foreground">of ${v.fineAmount.toFixed(2)}</p>
            )}
          </div>
          {(v.summonsImageUrl || v.documentUrl) && (
            <a href={v.summonsImageUrl || v.documentUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="h-8 w-8"><ExternalLink className="h-3.5 w-3.5" /></Button>
            </a>
          )}
          {isAdmin && (
            <>
              <Select value={v.status} onValueChange={onStatusChange}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="disputed">Disputed</SelectItem>
                  <SelectItem value="pending_payment">Pending Payment</SelectItem>
                  <SelectItem value="finalized">Finalized</SelectItem>
                </SelectContent>
              </Select>
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
              {!v.documentUrl && !v.summonsImageUrl && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AddViolationDialog({ open, onOpenChange, vehicles }: { open: boolean; onOpenChange: (open: boolean) => void; vehicles: { id: number; vanNumber: string; licensePlate?: string | null }[] | undefined }) {
  const [vehicleId, setVehicleId] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [violationType, setViolationType] = useState("");
  const [issuingAgency, setIssuingAgency] = useState("");
  const [issueDate, setIssueDate] = useState(Date.now());
  const [fineAmount, setFineAmount] = useState("");
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const createMutation = trpc.violations.create.useMutation({
    onSuccess: () => {
      utils.violations.list.invalidate();
      toast.success("Violation added");
      onOpenChange(false);
      setVehicleId(""); setPlateNumber(""); setViolationType(""); setIssuingAgency(""); setFineAmount(""); setNotes("");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Violation</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">For anything outside NYC's automated system — other jurisdictions, or older tickets.</p>
          <div>
            <Label className="text-xs">Vehicle</Label>
            <Select value={vehicleId} onValueChange={(v) => { setVehicleId(v); const veh = vehicles?.find(x => String(x.id) === v); if (veh?.licensePlate) setPlateNumber(veh.licensePlate); }}>
              <SelectTrigger><SelectValue placeholder="Select a van" /></SelectTrigger>
              <SelectContent>
                {vehicles?.map(v => <SelectItem key={v.id} value={String(v.id)}>Van {v.vanNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Plate Number *</Label>
            <Input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Input value={violationType} onChange={(e) => setViolationType(e.target.value)} placeholder="e.g. Double Parking" />
            </div>
            <div>
              <Label className="text-xs">Issuing Agency</Label>
              <Input value={issuingAgency} onChange={(e) => setIssuingAgency(e.target.value)} placeholder="e.g. NYPD" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={toDateInputValue(issueDate)} onChange={(e) => setIssueDate(e.target.value ? fromDateInputValue(e.target.value) : Date.now())} />
            </div>
            <div>
              <Label className="text-xs">Fine Amount</Label>
              <Input type="number" min="0" step="0.01" value={fineAmount} onChange={(e) => setFineAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button
            className="w-full"
            disabled={createMutation.isPending || !plateNumber.trim()}
            onClick={() => createMutation.mutate({
              vehicleId: vehicleId ? parseInt(vehicleId, 10) : undefined,
              plateNumber: plateNumber.trim(),
              violationType: violationType.trim() || undefined,
              issuingAgency: issuingAgency.trim() || undefined,
              issueDate,
              fineAmount: fineAmount ? parseFloat(fineAmount) : undefined,
              notes: notes.trim() || undefined,
            })}
          >
            {createMutation.isPending ? "Saving..." : "Add Violation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
