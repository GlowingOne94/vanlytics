import { useRef, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import { useIsAdmin } from "@/_core/hooks/useIsAdmin";
import { toDateInputValue, fromDateInputValue } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Fuel, Upload, Trash2, AlertTriangle, CheckCircle2, DollarSign, Droplet, Users, FileSpreadsheet, FileText,
} from "lucide-react";
import { toast } from "sonner";

// Matches whatever the fuel card provider's "Summary by Driver Prompt ID"
// export calls each column — headers vary slightly between providers and
// even between report types, so this is deliberately tolerant.
function findColumn(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map(h => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = normalized.findIndex(h => h === candidate.toLowerCase());
    if (idx !== -1) return headers[idx];
  }
  return null;
}

type ParsedRow = {
  driverPromptId: string; numberOfTransactions: number; totalAmount: number;
  avgAmount?: number; highAmount?: number; lowAmount?: number;
  totalFuelUnits?: number; avgFuelUnitPrice?: number;
  totalNonFuelAmount?: number; totalTransactionFeeAmount?: number;
  transactionDate?: number; odometer?: number;
};

export default function Gas() {
  const { isAdmin } = useIsAdmin();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [startDate, setStartDate] = useState<number | null>(null);
  const [endDate, setEndDate] = useState<number | null>(null);

  const { data: usage, isLoading } = trpc.gas.usage.useQuery();
  const { data: imports } = trpc.gas.imports.useQuery();
  const { data: allDrivers } = trpc.drivers.list.useQuery();
  const utils = trpc.useUtils();

  const deleteImportMutation = trpc.gas.deleteImport.useMutation({
    onSuccess: () => {
      utils.gas.usage.invalidate();
      utils.gas.imports.invalidate();
      toast.success("Import removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const assignMutation = trpc.gas.assignDriver.useMutation({
    onSuccess: () => {
      utils.gas.usage.invalidate();
      toast.success("Assigned — future imports for this ID will match automatically");
    },
    onError: (err) => toast.error(err.message),
  });

  const periods = useMemo(() => Array.from(new Set((imports ?? []).map(i => i.periodLabel))), [imports]);

  const filteredUsage = useMemo(() => {
    if (!usage) return [];
    return usage.filter(u => {
      if (periodFilter !== "all" && u.periodLabel !== periodFilter) return false;
      if (driverFilter !== "all" && String(u.driverId) !== driverFilter) return false;
      if (startDate != null || endDate != null) {
        // Only transaction-level imports have a real date to filter by —
        // older monthly-summary rows are excluded rather than silently
        // included, since we can't actually verify they fall in range.
        if (!u.transactionDate) return false;
        const t = new Date(u.transactionDate).getTime();
        if (startDate != null && t < startDate) return false;
        if (endDate != null && t > endDate) return false;
      }
      return true;
    });
  }, [usage, periodFilter, driverFilter, startDate, endDate]);

  const hasUndatedRecords = useMemo(() => (usage ?? []).some(u => !u.transactionDate), [usage]);

  // Combine records for the same driver across the filtered period(s) — a
  // driver might have multiple import rows if viewing "All Periods".
  const byDriver = useMemo(() => {
    const map = new Map<string, {
      key: string; driverId: number | null; driverName: string | null; driverPromptId: string;
      transactions: number; totalAmount: number; totalFuelUnits: number; recordIds: number[];
    }>();
    for (const u of filteredUsage) {
      const key = u.driverId != null ? `driver-${u.driverId}` : `unmatched-${u.driverPromptId}`;
      const entry = map.get(key) ?? {
        key, driverId: u.driverId, driverName: u.driverName, driverPromptId: u.driverPromptId,
        transactions: 0, totalAmount: 0, totalFuelUnits: 0, recordIds: [],
      };
      entry.transactions += u.numberOfTransactions;
      entry.totalAmount += u.totalAmount;
      entry.totalFuelUnits += u.totalFuelUnits ?? 0;
      entry.recordIds.push(u.id);
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredUsage]);

  const totalSpend = filteredUsage.reduce((sum, u) => sum + u.totalAmount, 0);
  const totalGallons = filteredUsage.reduce((sum, u) => sum + (u.totalFuelUnits ?? 0), 0);
  const unmatchedCount = byDriver.filter(d => d.driverId == null).length;

  const filterSuffix = () => {
    const parts = [];
    if (periodFilter !== "all") parts.push(periodFilter.replace(/\s+/g, "-"));
    if (driverFilter !== "all") parts.push((allDrivers?.find(d => String(d.id) === driverFilter)?.name ?? "driver").replace(/\s+/g, "-"));
    return parts.length ? parts.join("_") : "all";
  };

  const exportExcel = () => {
    if (byDriver.length === 0) { toast.error("Nothing to export for the current filters"); return; }
    const rows = byDriver.map(d => ({
      Driver: d.driverId == null ? `Unassigned (Prompt ID ${d.driverPromptId})` : d.driverName,
      Transactions: d.transactions,
      "Gallons": Math.round(d.totalFuelUnits * 100) / 100,
      "Total Spend ($)": Math.round(d.totalAmount * 100) / 100,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gas Usage");
    XLSX.writeFile(wb, `gas-usage_${filterSuffix()}.xlsx`);
  };

  const exportPdf = () => {
    if (byDriver.length === 0) { toast.error("Nothing to export for the current filters"); return; }
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow pop-ups to print this report"); return; }

    const rows = byDriver.map(d => `
      <tr>
        <td>${d.driverId == null ? `Unassigned (Prompt ID ${d.driverPromptId})` : d.driverName}</td>
        <td style="text-align:right">${d.transactions}</td>
        <td style="text-align:right">${d.totalFuelUnits.toFixed(1)}</td>
        <td style="text-align:right">$${d.totalAmount.toFixed(2)}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Gas Usage Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 2px; }
            p.subtitle { color: #666; font-size: 12px; margin-top: 0; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th, td { border: 1px solid #ddd; padding: 8px 10px; }
            th { background: #1F2937; color: #fff; text-align: left; }
            tfoot td { font-weight: bold; background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Gas Usage Report</h1>
          <p class="subtitle">
            ${startDate || endDate ? `Dates: ${startDate ? new Date(startDate).toLocaleDateString() : "…"} – ${endDate ? new Date(endDate).toLocaleDateString() : "…"}` : `Period: ${periodFilter === "all" ? "All Periods" : periodFilter}`}
            ${driverFilter !== "all" ? ` · Driver: ${allDrivers?.find(d => String(d.id) === driverFilter)?.name ?? ""}` : ""}
          </p>
          <table>
            <thead><tr><th>Driver</th><th style="text-align:right">Transactions</th><th style="text-align:right">Gallons</th><th style="text-align:right">Total Spend</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td>Total</td><td style="text-align:right">${byDriver.reduce((s, d) => s + d.transactions, 0)}</td><td style="text-align:right">${totalGallons.toFixed(1)}</td><td style="text-align:right">$${totalSpend.toFixed(2)}</td></tr></tfoot>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Fuel className="h-6 w-6 text-primary" /> Gas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Fuel card usage audited by driver, using the Driver Prompt ID entered at the pump</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf}>
              <FileText className="h-4 w-4 mr-1" /> Export PDF
            </Button>
            <Button size="sm" onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Import Report
            </Button>
          </div>
        )}
      </div>

      {unmatchedCount > 0 && (
        <div className="flex items-start gap-2 text-sm bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 text-yellow-600">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{unmatchedCount} driver prompt ID{unmatchedCount === 1 ? "" : "s"} in this view {unmatchedCount === 1 ? "doesn't" : "don't"} match a known driver yet — assign {unmatchedCount === 1 ? "it" : "them"} below to include {unmatchedCount === 1 ? "it" : "them"} in reporting going forward.</span>
        </div>
      )}

      <div className="flex items-end gap-3 flex-wrap">
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
              const endOfDay = fromDateInputValue(e.target.value) + (24 * 60 * 60 * 1000 - 1);
              setEndDate(endOfDay);
            }}
          />
        </div>
        <div>
          <Label className="text-xs">Period:</Label>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Periods</SelectItem>
              {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Driver:</Label>
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Drivers</SelectItem>
              {allDrivers?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {(startDate || endDate) && (
          <Button variant="ghost" size="sm" onClick={() => { setStartDate(null); setEndDate(null); }}>
            Clear Dates
          </Button>
        )}
      </div>
      {(startDate || endDate) && hasUndatedRecords && (
        <p className="text-xs text-muted-foreground -mt-2">
          Note: older imports without per-transaction dates aren't included when a date range is set — only imports from a transaction-level report (with real dates) can be filtered this way.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-3">
          <DollarSign className="h-8 w-8 text-primary/40" />
          <div><p className="text-xs text-muted-foreground">Total Spend</p><p className="text-xl font-bold">${totalSpend.toFixed(2)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <Droplet className="h-8 w-8 text-primary/40" />
          <div><p className="text-xs text-muted-foreground">Total Gallons</p><p className="text-xl font-bold">{totalGallons.toFixed(1)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <Users className="h-8 w-8 text-primary/40" />
          <div><p className="text-xs text-muted-foreground">Drivers</p><p className="text-xl font-bold">{byDriver.length}</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">By Driver</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}</div>
          ) : byDriver.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No gas usage imported yet.</p>
          ) : (
            <div className="space-y-1">
              {byDriver.map(d => (
                <div key={d.key} className="flex items-center justify-between text-sm py-2.5 border-b last:border-0 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {d.driverId == null ? (
                      <>
                        <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30">Unassigned</Badge>
                        <span className="text-muted-foreground">Prompt ID {d.driverPromptId}</span>
                      </>
                    ) : (
                      <span className="font-medium">{d.driverName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">{d.transactions} txns · {d.totalFuelUnits.toFixed(1)} gal</span>
                    <span className="font-semibold w-20 text-right">${d.totalAmount.toFixed(2)}</span>
                    {isAdmin && d.driverId == null && (
                      <AssignDriverSelect recordId={d.recordIds[0]} onAssign={(driverId) => assignMutation.mutate({ recordId: d.recordIds[0], driverId })} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {imports && imports.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Import History</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {imports.map(imp => (
              <div key={imp.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                <div>
                  <p className="font-medium">{imp.periodLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {imp.driverCount} driver{imp.driverCount === 1 ? "" : "s"}
                    {imp.unmatchedCount > 0 && <span className="text-yellow-500"> · {imp.unmatchedCount} unmatched</span>}
                    {" · "}${imp.totalSpend.toFixed(2)} · {new Date(imp.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`Remove the "${imp.periodLabel}" import? This can't be undone.`)) {
                        deleteImportMutation.mutate({ id: imp.id });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
    </div>
  );
}

function AssignDriverSelect({ recordId, onAssign }: { recordId: number; onAssign: (driverId: number) => void }) {
  const { data: drivers } = trpc.drivers.list.useQuery();
  const [value, setValue] = useState("");
  return (
    <Select value={value} onValueChange={(v) => { setValue(v); onAssign(parseInt(v, 10)); }}>
      <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue placeholder="Assign driver..." /></SelectTrigger>
      <SelectContent>
        {drivers?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [periodLabel, setPeriodLabel] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<(ParsedRow & { driverId: number | null; driverName: string | null })[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: drivers } = trpc.drivers.list.useQuery();
  const utils = trpc.useUtils();

  const previewMutation = trpc.gas.previewImport.useMutation({
    onSuccess: (result) => { setPreview(result); setStep("review"); },
    onError: (err) => toast.error(err.message),
  });

  const confirmMutation = trpc.gas.confirmImport.useMutation({
    onSuccess: (result) => {
      utils.gas.usage.invalidate();
      utils.gas.imports.invalidate();
      toast.success(`Imported ${result.count} driver record${result.count === 1 ? "" : "s"}`);
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const reset = () => {
    setStep("upload"); setPeriodLabel(""); setFileName(""); setPreview([]); setAssignments({});
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        if (json.length === 0) { toast.error("No rows found in that file"); return; }

        const headers = Object.keys(json[0]);
        const promptIdCol = findColumn(headers, ["Driver Prompt ID", "Prompt ID", "Driver ID"]);
        const dateCol = findColumn(headers, ["Transaction Date"]);

        if (!promptIdCol) {
          toast.error("Couldn't find a Driver Prompt ID column in that file.");
          return;
        }

        let rows: ParsedRow[];

        if (dateCol) {
          // Transaction-level report — one row per fill-up, with a real
          // date/time and (usually) an odometer reading.
          const timeCol = findColumn(headers, ["Transaction Time"]);
          const costCol = findColumn(headers, ["Total Fuel Cost", "Total Amount"]);
          const unitsCol = findColumn(headers, ["Units"]);
          const unitCostCol = findColumn(headers, ["Unit Cost"]);
          const odometerCol = findColumn(headers, ["Current Odometer", "Odometer"]);

          if (!costCol) {
            toast.error("Found dates but couldn't find a Total Fuel Cost / Total Amount column.");
            return;
          }

          rows = json.map(row => {
            const dateVal = row[dateCol];
            const timeVal = timeCol ? row[timeCol] : "";
            const parsedDate = dateVal instanceof Date ? dateVal : new Date(`${dateVal} ${timeVal}`.trim());
            const odometerRaw = odometerCol ? Number(row[odometerCol]) : NaN;
            return {
              driverPromptId: String(row[promptIdCol]).trim(),
              numberOfTransactions: 1,
              totalAmount: Number(row[costCol]) || 0,
              totalFuelUnits: unitsCol ? Number(row[unitsCol]) || undefined : undefined,
              avgFuelUnitPrice: unitCostCol ? Number(row[unitCostCol]) || undefined : undefined,
              transactionDate: !isNaN(parsedDate.getTime()) ? parsedDate.getTime() : undefined,
              odometer: !isNaN(odometerRaw) && odometerRaw > 0 ? odometerRaw : undefined,
            };
          }).filter(r => r.driverPromptId);
        } else {
          // Monthly summary report — one row per driver for the whole period.
          const txnCol = findColumn(headers, ["Number of Transactions", "Transactions"]);
          const totalCol = findColumn(headers, ["Total Amount"]);
          const avgCol = findColumn(headers, ["Average Amount"]);
          const highCol = findColumn(headers, ["High Amount"]);
          const lowCol = findColumn(headers, ["Low Amount"]);
          const fuelUnitsCol = findColumn(headers, ["Total Fuel Units"]);
          const avgFuelPriceCol = findColumn(headers, ["Average Fuel Unit Price"]);
          const nonFuelCol = findColumn(headers, ["Total Non-Fuel Amount"]);
          const feeCol = findColumn(headers, ["Total Transaction Fee Amount"]);

          if (!txnCol || !totalCol) {
            toast.error("Couldn't find Number of Transactions / Total Amount columns — check this is the \"Summary by Driver Prompt ID\" report.");
            return;
          }

          rows = json.map(row => ({
            driverPromptId: String(row[promptIdCol]).trim(),
            numberOfTransactions: Number(row[txnCol]) || 0,
            totalAmount: Number(row[totalCol]) || 0,
            avgAmount: avgCol ? Number(row[avgCol]) || undefined : undefined,
            highAmount: highCol ? Number(row[highCol]) || undefined : undefined,
            lowAmount: lowCol ? Number(row[lowCol]) || undefined : undefined,
            totalFuelUnits: fuelUnitsCol ? Number(row[fuelUnitsCol]) || undefined : undefined,
            avgFuelUnitPrice: avgFuelPriceCol ? Number(row[avgFuelPriceCol]) || undefined : undefined,
            totalNonFuelAmount: nonFuelCol ? Number(row[nonFuelCol]) || undefined : undefined,
            totalTransactionFeeAmount: feeCol ? Number(row[feeCol]) || undefined : undefined,
          })).filter(r => r.driverPromptId);
        }

        previewMutation.mutate({ rows });
      } catch {
        toast.error("Couldn't read that file — make sure it's a valid CSV or Excel export.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const matchedCount = preview.filter(r => r.driverId != null || assignments[r.driverPromptId]).length;
  const unmatchedRows = preview.filter(r => r.driverId == null);

  const handleConfirm = () => {
    if (!periodLabel.trim()) { toast.error("Enter a period label, e.g. \"July 2026\""); return; }
    const rows = preview.map(r => ({
      driverPromptId: r.driverPromptId,
      driverId: r.driverId ?? assignments[r.driverPromptId] ?? null,
      numberOfTransactions: r.numberOfTransactions,
      totalAmount: r.totalAmount,
      avgAmount: r.avgAmount,
      highAmount: r.highAmount,
      lowAmount: r.lowAmount,
      totalFuelUnits: r.totalFuelUnits,
      avgFuelUnitPrice: r.avgFuelUnitPrice,
      totalNonFuelAmount: r.totalNonFuelAmount,
      totalTransactionFeeAmount: r.totalTransactionFeeAmount,
      transactionDate: r.transactionDate,
      odometer: r.odometer,
    }));
    confirmMutation.mutate({ periodLabel: periodLabel.trim(), fileName, rows });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import Gas Report</DialogTitle></DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload the "Summary by Driver Prompt ID" report from your fuel card provider's portal (CSV or Excel).
            </p>
            <div>
              <Label className="text-xs">Period Label *</Label>
              <Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. July 2026" />
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <Button variant="outline" onClick={() => { if (!periodLabel.trim()) { toast.error("Enter a period label first"); return; } fileInputRef.current?.click(); }} disabled={previewMutation.isPending}>
              <Upload className="h-4 w-4 mr-2" /> {previewMutation.isPending ? "Reading..." : "Choose File"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              {unmatchedRows.length === 0 ? (
                <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /> All {preview.length} rows matched to a known driver</span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-600"><AlertTriangle className="h-4 w-4" /> {matchedCount} of {preview.length} matched — assign the rest below</span>
              )}
            </div>

            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {preview.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-muted/30 rounded-md px-3 py-2">
                  <div>
                    {r.driverId != null ? (
                      <span className="font-medium">{r.driverName}</span>
                    ) : assignments[r.driverPromptId] ? (
                      <span className="font-medium">{drivers?.find(d => d.id === assignments[r.driverPromptId])?.name} <span className="text-muted-foreground">(assigned)</span></span>
                    ) : (
                      <span className="text-yellow-600">Prompt ID {r.driverPromptId} — not matched</span>
                    )}
                    <span className="text-muted-foreground ml-2">{r.numberOfTransactions} txns · ${r.totalAmount.toFixed(2)}</span>
                  </div>
                  {r.driverId == null && !assignments[r.driverPromptId] && (
                    <Select onValueChange={(v) => setAssignments({ ...assignments, [r.driverPromptId]: parseInt(v, 10) })}>
                      <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue placeholder="Assign..." /></SelectTrigger>
                      <SelectContent>
                        {drivers?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="flex-1">Start Over</Button>
              <Button onClick={handleConfirm} disabled={confirmMutation.isPending} className="flex-1">
                {confirmMutation.isPending ? "Saving..." : `Import ${preview.length} Records`}
              </Button>
            </div>
            {unmatchedRows.length - Object.keys(assignments).length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Unmatched rows can still be imported and assigned later from the Gas page.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
