import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import { toDateInputValue, fromDateInputValue } from "@/lib/utils";
import { fileToBase64 } from "@/components/DocumentField";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Receipt, Upload, AlertTriangle, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function endOfDay(ms: number) {
  return startOfDay(ms) + (24 * 60 * 60 * 1000 - 1);
}

// Matches the real E-ZPass statement export format: one combined Tag/Plate
// column (it doesn't say which), a Class code, Entry/Exit Plaza, a Date
// column, a separate Exit Time column, and an Amount that comes through as
// a negative dollar figure (e.g. "$-7.46").
const TARGET_FIELDS: { key: string; label: string; required: boolean }[] = [
  { key: "tagOrPlate", label: "Tag/Plate #", required: false },
  { key: "referenceId", label: "Lane Txn ID", required: false },
  { key: "transactionDate", label: "Date", required: true },
  { key: "transactionTime", label: "Exit Time", required: false },
  { key: "entryPlaza", label: "Entry Plaza", required: false },
  { key: "exitPlaza", label: "Exit Plaza", required: false },
  { key: "vehicleClass", label: "Class", required: false },
  { key: "agency", label: "Agency", required: false },
  { key: "amount", label: "Amount", required: true },
];

function guessColumn(headers: string[], key: string): string | null {
  const patterns: Record<string, RegExp> = {
    tagOrPlate: /tag\s*\/?\s*plate|transponder/i,
    referenceId: /txn\s*id|transaction\s*id|lane/i,
    transactionDate: /^date$|transaction\s*date|posting\s*date/i,
    transactionTime: /time/i,
    entryPlaza: /entry\s*plaza|^entry$/i,
    exitPlaza: /exit\s*plaza|^exit$/i,
    vehicleClass: /class/i,
    agency: /agency|facility/i,
    amount: /amount|charge|toll/i,
  };
  const pattern = patterns[key];
  if (!pattern) return null;
  return headers.find(h => pattern.test(h)) ?? null;
}

function combineDateAndTime(dateRaw: unknown, timeRaw: unknown): number {
  let base: Date;
  if (dateRaw instanceof Date) {
    base = new Date(dateRaw);
  } else if (typeof dateRaw === "string" && dateRaw) {
    base = new Date(dateRaw);
  } else {
    base = new Date();
  }
  if (isNaN(base.getTime())) base = new Date();

  if (timeRaw) {
    if (timeRaw instanceof Date) {
      base.setHours(timeRaw.getHours(), timeRaw.getMinutes(), timeRaw.getSeconds());
    } else if (typeof timeRaw === "string") {
      const match = timeRaw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = match[3] ? parseInt(match[3], 10) : 0;
        const ampm = match[4]?.toUpperCase();
        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        base.setHours(hours, minutes, seconds);
      }
    } else if (typeof timeRaw === "number" && timeRaw < 1) {
      const totalSeconds = Math.round(timeRaw * 24 * 60 * 60);
      base.setHours(0, 0, 0, 0);
      base.setSeconds(totalSeconds);
    }
  }
  return base.getTime();
}

// E-ZPass reports charges as negative ("$-7.46") — stored and displayed as
// a positive charge amount, consistent with every other cost field in Vanlytics.
function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return Math.abs(raw);
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.abs(parsed);
}

export default function Tolls() {
  const today = startOfDay(Date.now());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(endOfDay(today));
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();
  const { data: transactions, isLoading } = trpc.tolls.list.useQuery({ startDate, endDate });

  const deleteMutation = trpc.tolls.delete.useMutation({
    onSuccess: () => {
      utils.tolls.list.invalidate();
      toast.success("Transaction removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteManyMutation = trpc.tolls.deleteMany.useMutation({
    onSuccess: (result) => {
      utils.tolls.list.invalidate();
      setSelectedIds(new Set());
      toast.success(`${result.count} transaction${result.count === 1 ? "" : "s"} removed`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteAllInRangeMutation = trpc.tolls.deleteAllInRange.useMutation({
    onSuccess: () => {
      utils.tolls.list.invalidate();
      setSelectedIds(new Set());
      toast.success("All transactions in this range removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const rematchMutation = trpc.tolls.rematchUnmatched.useMutation({
    onSuccess: (result) => {
      utils.tolls.list.invalidate();
      toast.success(result.rematchedCount > 0
        ? `Matched ${result.rematchedCount} previously unmatched transaction${result.rematchedCount === 1 ? "" : "s"}`
        : "No additional matches found — double check the Tag #/Plate on file for that vehicle");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const rangeLabel = `${new Date(startDate).toLocaleDateString()} – ${new Date(endDate).toLocaleDateString()}`;

  const exportCsv = () => {
    if (displayedTransactions.length === 0) {
      toast.error("Nothing to export for the current filters");
      return;
    }
    const csvField = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

    const headers = ["Van #", "Tag #/License Plate", "Class", "Date", "Time", "Exit Plaza", "Amount"];
    const lines = displayedTransactions.map(t => [
      t.vanNumber || "Unmatched",
      t.tagOrPlate?.trim() || "",
      t.vehicleClass || "",
      new Date(t.transactionAt).toLocaleDateString(),
      new Date(t.transactionAt).toLocaleTimeString(),
      t.exitPlaza || "",
      t.amount.toFixed(2),
    ].map(v => csvField(String(v))).join(","));

    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tolls-${toDateInputValue(startDate)}-to-${toDateInputValue(endDate)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = useMemo(() => {
    const rows = transactions ?? [];
    const total = rows.reduce((sum, t) => sum + t.amount, 0);
    const unmatched = rows.filter(t => !t.vanNumber).length;
    return { total, count: rows.length, unmatched };
  }, [transactions]);

  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [vehicleFilter, setVehicleFilter] = useState("all");

  const vanOptions = useMemo(() => {
    const vans = new Set((transactions ?? []).map(t => t.vanNumber).filter((v): v is string => Boolean(v)));
    return Array.from(vans).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [transactions]);

  const displayedTransactions = useMemo(() => {
    let rows = transactions ?? [];

    if (vehicleFilter === "unmatched") {
      rows = rows.filter(t => !t.vanNumber);
    } else if (vehicleFilter !== "all") {
      rows = rows.filter(t => t.vanNumber === vehicleFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(t =>
        t.tagOrPlate?.toLowerCase().includes(q) ||
        t.exitPlaza?.toLowerCase().includes(q) ||
        t.entryPlaza?.toLowerCase().includes(q) ||
        t.agency?.toLowerCase().includes(q) ||
        t.referenceId?.toLowerCase().includes(q) ||
        t.vanNumber?.toLowerCase().includes(q)
      );
    }

    return [...rows].sort((a, b) => {
      const diff = new Date(a.transactionAt).getTime() - new Date(b.transactionAt).getTime();
      return sortOrder === "asc" ? diff : -diff;
    });
  }, [transactions, search, sortOrder, vehicleFilter]);

  const allSelected = displayedTransactions.length > 0 && displayedTransactions.every(t => selectedIds.has(t.id));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedTransactions.map(t => t.id)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> Tolls
          </h1>
          <p className="text-muted-foreground text-sm mt-1">E-ZPass transactions, matched to your fleet by tag # or license plate</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => rematchMutation.mutate()} disabled={rematchMutation.isPending}>
            {rematchMutation.isPending ? "Re-matching..." : "Re-match Unmatched"}
          </Button>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Import Statement
          </Button>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="w-auto"
            value={toDateInputValue(startDate)}
            onChange={(e) => setStartDate(startOfDay(fromDateInputValue(e.target.value, startDate)))}
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="w-auto"
            value={toDateInputValue(endDate)}
            onChange={(e) => setEndDate(endOfDay(fromDateInputValue(e.target.value, endDate)))}
          />
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={() => { setStartDate(startOfDay(Date.now())); setEndDate(endOfDay(Date.now())); }}
        >
          Reset to Today
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Charged</p><p className="text-xl font-bold">${summary.total.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Transactions</p><p className="text-xl font-bold">{summary.count}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Unmatched</p><p className="text-xl font-bold">{summary.unmatched}</p></CardContent></Card>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Tag/plate, plaza, agency, ref #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Vehicle</Label>
          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicles</SelectItem>
              <SelectItem value="unmatched">Unmatched Only</SelectItem>
              {vanOptions.map(v => <SelectItem key={v} value={v}>Van {v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Sort by Date/Time</Label>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "asc" | "desc")}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest First</SelectItem>
              <SelectItem value="asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : displayedTransactions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          {transactions && transactions.length > 0 ? "No transactions match your search/filter." : "No toll transactions in this date range."}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 p-2 rounded-md border bg-muted/20">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              Select all ({displayedTransactions.length})
            </label>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <Button
                  size="sm" variant="outline" className="text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (!window.confirm(`Delete ${selectedIds.size} selected transaction${selectedIds.size === 1 ? "" : "s"}?`)) return;
                    deleteManyMutation.mutate({ ids: Array.from(selectedIds) });
                  }}
                  disabled={deleteManyMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected ({selectedIds.size})
                </Button>
              )}
              <Button
                size="sm" variant="outline" className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (!window.confirm(`Delete ALL ${transactions.length} transactions from ${rangeLabel}? This can't be undone.`)) return;
                  deleteAllInRangeMutation.mutate({ startDate, endDate });
                }}
                disabled={deleteAllInRangeMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete All in Range
              </Button>
            </div>
          </div>
          <div className="space-y-2">
          {displayedTransactions.map(t => (
            <Card key={t.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelected(t.id)} />
                  {t.vanNumber ? (
                    <Badge variant="outline">Van {t.vanNumber}</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Unmatched
                    </Badge>
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {t.entryPlaza ? `${t.entryPlaza} → ` : ""}{t.exitPlaza || "Unknown plaza"}
                      {t.vehicleClass && <span className="text-muted-foreground font-normal"> · Class {t.vehicleClass}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.transactionAt).toLocaleString()}
                      {t.tagOrPlate ? ` · Tag/Plate ${t.tagOrPlate.trim()}` : ""}
                      {t.agency ? ` · ${t.agency}` : ""}
                      {t.referenceId ? ` · Ref ${t.referenceId}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold">${t.amount.toFixed(2)}</p>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => { if (window.confirm("Remove this toll transaction?")) deleteMutation.mutate({ id: t.id }); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        </>
      )}

      <TollImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function TollImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const importMutation = trpc.tolls.createImport.useMutation({
    onSuccess: (result) => {
      toast.success(`Imported ${result.count} transactions (${result.matchedCount} matched to a vehicle)`);
      utils.tolls.list.invalidate();
      setFile(null);
      setHeaders([]);
      setRows([]);
      setMapping({});
      setSubmitting(false);
      onOpenChange(false);
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

    const mappedRows = rows.map(row => {
      const get = (key: string) => (mapping[key] ? row[mapping[key]] : undefined);
      return {
        tagOrPlate: get("tagOrPlate") ? String(get("tagOrPlate")).trim() : undefined,
        referenceId: get("referenceId") ? String(get("referenceId")).trim() : undefined,
        transactionAt: combineDateAndTime(get("transactionDate"), get("transactionTime")),
        entryPlaza: get("entryPlaza") ? String(get("entryPlaza")).trim() || undefined : undefined,
        exitPlaza: get("exitPlaza") ? String(get("exitPlaza")).trim() || undefined : undefined,
        vehicleClass: get("vehicleClass") ? String(get("vehicleClass")).trim() || undefined : undefined,
        agency: get("agency") ? String(get("agency")).trim() || undefined : undefined,
        amount: parseAmount(get("amount")),
      };
    });

    const { base64, contentType, fileName } = await fileToBase64(file);
    importMutation.mutate({ fileName, fileBase64: base64, contentType, rows: mappedRows });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import E-ZPass Statement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
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
          </div>
          <p className="text-xs text-muted-foreground">
            Export a CSV or Excel statement from your E-ZPass portal (not a PDF) for the most reliable import.
          </p>

          {headers.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
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
              </div>

              {missingRequired.length > 0 && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Map required fields: {missingRequired.map(f => f.label).join(", ")}
                </p>
              )}

              <Button onClick={handleConfirmImport} disabled={submitting || missingRequired.length > 0} className="w-full">
                {submitting ? "Importing..." : `Confirm Import (${rows.length} transactions)`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
