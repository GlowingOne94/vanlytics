import { useRef, useState, useMemo } from "react";
import * as XLSX from "xlsx";
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
  Siren, Plus, RefreshCw, ExternalLink, Upload, Trash2, DollarSign, AlertTriangle, FileSpreadsheet, FileText,
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
  const [typeFilter, setTypeFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
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

  // Populated from whatever violation types actually appear in the data —
  // stays accurate automatically as new types show up from future syncs,
  // rather than a hardcoded list that can go stale.
  const typeOptions = useMemo(() => {
    const types = new Set((violationsList ?? []).map(v => v.violationType).filter((t): t is string => Boolean(t)));
    return Array.from(types).sort();
  }, [violationsList]);

  const filtered = (violationsList ?? []).filter(v =>
    (statusFilter === "all" || v.status === statusFilter) &&
    (typeFilter === "all" || v.violationType === typeFilter) &&
    (vehicleFilter === "all" || String(v.vehicleId) === vehicleFilter)
  );
  const totalDue = (violationsList ?? []).reduce((sum, v) => sum + (v.amountDue ?? 0), 0);
  const openCount = (violationsList ?? []).filter(v => v.status === "open").length;

  const filteredTotal = filtered.reduce((sum, v) => sum + (v.amountDue ?? v.fineAmount ?? 0), 0);
  const filteredFinesTotal = filtered.reduce((sum, v) => sum + (v.fineAmount ?? 0), 0);
  const isFiltered = typeFilter !== "all" || vehicleFilter !== "all" || statusFilter !== "all";

  const filterLabel = () => {
    const parts = [];
    if (vehicleFilter !== "all") parts.push(`Van ${vehicles?.find(v => String(v.id) === vehicleFilter)?.vanNumber ?? ""}`);
    if (typeFilter !== "all") parts.push(typeFilter);
    if (statusFilter !== "all") parts.push(STATUS_STYLES[statusFilter]?.label ?? statusFilter);
    return parts.length ? parts.join(" · ") : "All Violations";
  };

  const exportExcel = () => {
    if (filtered.length === 0) { toast.error("Nothing to export for the current filters"); return; }
    const rows = filtered.map(v => ({
      Date: new Date(v.issueDate).toLocaleDateString(),
      Vehicle: v.vanNumber ? `Van ${v.vanNumber}` : v.plateNumber,
      Plate: v.plateNumber,
      "Violation Type": v.violationType ?? "",
      Agency: v.issuingAgency ?? "",
      "Summons #": v.summonsNumber ?? "",
      Strike: v.strikeNumber ?? "",
      Status: STATUS_STYLES[v.status]?.label ?? v.status,
      "Fine Amount": v.fineAmount ?? 0,
      "Amount Due": v.amountDue ?? v.fineAmount ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 22 }, { wch: 14 }, { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Violations");
    XLSX.writeFile(wb, `violations_${filterLabel().replace(/[^a-z0-9]+/gi, "-")}.xlsx`);
  };

  const exportPdf = () => {
    if (filtered.length === 0) { toast.error("Nothing to export for the current filters"); return; }
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow pop-ups to print this report"); return; }

    const rows = filtered.map(v => `
      <tr>
        <td>${new Date(v.issueDate).toLocaleDateString()}</td>
        <td>${v.vanNumber ? `Van ${v.vanNumber}` : v.plateNumber}</td>
        <td>${v.violationType ?? "—"}</td>
        <td>${v.summonsNumber ?? "—"}</td>
        <td>${v.strikeNumber ?? "—"}</td>
        <td>${STATUS_STYLES[v.status]?.label ?? v.status}</td>
        <td style="text-align:right">$${(v.fineAmount ?? 0).toFixed(2)}</td>
        <td style="text-align:right">$${(v.amountDue ?? v.fineAmount ?? 0).toFixed(2)}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Violations Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 2px; }
            p.subtitle { color: #666; font-size: 12px; margin-top: 0; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 7px 9px; }
            th { background: #1F2937; color: #fff; text-align: left; }
            tfoot td { font-weight: bold; background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Violations Report</h1>
          <p class="subtitle">${filterLabel()} · ${filtered.length} violation${filtered.length === 1 ? "" : "s"} · Generated ${new Date().toLocaleDateString()}</p>
          <table>
            <thead><tr><th>Date</th><th>Vehicle</th><th>Type</th><th>Summons #</th><th>Strike</th><th>Status</th><th style="text-align:right">Fine</th><th style="text-align:right">Amount Due</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td colspan="6">Total</td><td style="text-align:right">$${filteredFinesTotal.toFixed(2)}</td><td style="text-align:right">$${filteredTotal.toFixed(2)}</td></tr></tfoot>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

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
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf}>
              <FileText className="h-4 w-4 mr-1" /> Export PDF
            </Button>
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

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">Violation Type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {typeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
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
        {isFiltered && (
          <>
            <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setVehicleFilter("all"); }}>
              Clear Filters
            </Button>
            <p className="text-sm text-muted-foreground ml-auto">
              {filtered.length} violation{filtered.length === 1 ? "" : "s"} · <span className="font-semibold text-foreground">${filteredTotal.toFixed(2)} due</span> of ${filteredFinesTotal.toFixed(2)} total fined
            </p>
          </>
        )}
      </div>

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
