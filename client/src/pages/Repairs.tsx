import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Search, Wrench, Upload, FileText, AlertCircle, Trash2, Pencil, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useIsAdmin } from "@/_core/hooks/useIsAdmin";
import { toDateInputValue, fromDateInputValue } from "@/lib/utils";

const categories = [
  "AC/HVAC", "Brakes", "Cooling", "DOT Inspection", "Electrical", "Engine", "Exhaust",
  "Filters", "Fluids", "Registration", "Suspension", "Tires", "Towing", "Transmission",
  "Wheelchair Lift", "Body", "Other",
];

function RepairInvoices({ repairId }: { repairId: number }) {
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: documents } = trpc.repairs.getDocuments.useQuery({ repairId }, { enabled: expanded });

  const uploadMutation = trpc.repairs.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success("Invoice uploaded");
      utils.repairs.getDocuments.invalidate({ repairId });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.repairs.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Invoice removed");
      utils.repairs.getDocuments.invalidate({ repairId });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const oversized = files.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`Skipped ${oversized.length} file(s) over 10MB: ${oversized.map(f => f.name).join(", ")}`);
    }

    const validFiles = files.filter(f => f.size <= 10 * 1024 * 1024);
    for (const file of validFiles) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMutation.mutate({
          repairId,
          fileName: file.name,
          fileBase64: base64,
          contentType: file.type,
        });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  return (
    <div>
      <input ref={fileInputRef} type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={handleUpload} />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setExpanded(!expanded)}
        title="View/upload invoices"
      >
        <FileText className="h-3 w-3" />
      </Button>
      {expanded && (
        <div className="mt-2 p-3 rounded-md border bg-muted/20 space-y-2">
          {documents === undefined ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : documents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No invoices uploaded yet.</p>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-2 text-sm">
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate"
                >
                  {doc.fileName}
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => deleteMutation.mutate({ id: doc.id })}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={uploadMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {uploadMutation.isPending ? "Uploading..." : "Upload Invoice"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Repairs() {
  const { isAdmin } = useIsAdmin();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { data: repairs, isLoading } = trpc.repairs.list.useQuery();
  const { data: vehicles } = trpc.vehicles.list.useQuery();
  const { data: shops } = trpc.shops.list.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.repairs.create.useMutation({
    onSuccess: () => {
      utils.repairs.list.invalidate();
      setDialogOpen(false);
      toast.success("Repair logged successfully");
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.repairs.update.useMutation({
    onSuccess: () => {
      utils.repairs.list.invalidate();
      setDialogOpen(false);
      toast.success("Repair updated");
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.repairs.delete.useMutation({
    onSuccess: () => {
      utils.repairs.list.invalidate();
      toast.success("Repair deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDelete = (id: number) => {
    if (!window.confirm("Delete this repair record? This cannot be undone.")) return;
    deleteMutation.mutate({ id });
  };

  const [form, setForm] = useState({
    vehicleId: 0,
    shopId: null as number | null,
    date: Date.now(),
    mileage: 0,
    mechanic: "",
    complaint: "",
    diagnosis: "",
    partsReplaced: "",
    partsCost: "0",
    laborCost: "0",
    tax: "0",
    totalCost: "0",
    warrantyMonths: 0,
    oldPartReturned: "no" as "yes" | "no",
    repairSuccessful: "yes" as "yes" | "no",
    category: "",
    notes: "",
  });

  const computeTotal = (parts: string, labor: string, tax: string) => {
    const sum = (Number(parts) || 0) + (Number(labor) || 0) + (Number(tax) || 0);
    return String(Math.round(sum * 100) / 100);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      vehicleId: 0, shopId: null, date: Date.now(), mileage: 0, mechanic: "",
      complaint: "", diagnosis: "", partsReplaced: "", partsCost: "0", laborCost: "0",
      tax: "0", totalCost: "0", warrantyMonths: 0, oldPartReturned: "no",
      repairSuccessful: "yes", category: "", notes: "",
    });
  };

  const handleEdit = (r: NonNullable<typeof repairs>[number]) => {
    setEditingId(r.id);
    setForm({
      vehicleId: r.vehicleId,
      shopId: r.shopId ?? null,
      date: r.date,
      mileage: r.mileage ?? 0,
      mechanic: r.mechanic ?? "",
      complaint: r.complaint ?? "",
      diagnosis: r.diagnosis ?? "",
      partsReplaced: Array.isArray(r.partsReplaced) ? r.partsReplaced.join(", ") : "",
      partsCost: r.partsCost ?? "0",
      laborCost: r.laborCost ?? "0",
      tax: r.tax ?? "0",
      totalCost: r.totalCost ?? "0",
      warrantyMonths: r.warrantyMonths ?? 0,
      oldPartReturned: (r.oldPartReturned as "yes" | "no") ?? "no",
      repairSuccessful: (r.repairSuccessful as "yes" | "no") ?? "yes",
      category: r.category ?? "",
      notes: r.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.vehicleId) { toast.error("Select a vehicle"); return; }
    const parts = form.partsReplaced ? form.partsReplaced.split(",").map(p => p.trim()).filter(Boolean) : [];
    const money = (v: string) => (v.trim() !== "" && !isNaN(Number(v)) ? v.trim() : "0");
    const payload = {
      vehicleId: form.vehicleId,
      shopId: form.shopId,
      date: form.date,
      mileage: form.mileage || undefined,
      mechanic: form.mechanic || undefined,
      complaint: form.complaint || undefined,
      diagnosis: form.diagnosis || undefined,
      partsReplaced: parts.length > 0 ? parts : undefined,
      partsCost: money(form.partsCost),
      laborCost: money(form.laborCost),
      tax: money(form.tax),
      totalCost: money(form.totalCost),
      warrantyMonths: form.warrantyMonths || undefined,
      oldPartReturned: form.oldPartReturned,
      repairSuccessful: form.repairSuccessful,
      category: form.category || undefined,
      notes: form.notes || undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [shopFilter, setShopFilter] = useState("all");

  const filtered = repairs?.filter(
    (r) =>
      (vehicleFilter === "all" || String(r.vehicleId) === vehicleFilter) &&
      (shopFilter === "all" || String(r.shopId) === shopFilter) &&
      ((r.complaint || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.diagnosis || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.mechanic || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.category || "").toLowerCase().includes(search.toLowerCase()))
  );

  const exportRepairsCsv = () => {
    if (!filtered || filtered.length === 0) {
      toast.error("Nothing to export for the current filter");
      return;
    }
    const csvField = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const headers = ["Van #", "Date", "Category", "Complaint", "Diagnosis", "Shop", "Mechanic", "Parts", "Labor", "Tax", "Total"];
    const lines = filtered.map(r => {
      const vehicle = vehicles?.find(v => v.id === r.vehicleId);
      const shop = shops?.find(s => s.id === r.shopId);
      return [
        vehicle?.vanNumber || "Unknown",
        new Date(r.date).toLocaleDateString(),
        r.category || "",
        r.complaint || "",
        r.diagnosis || "",
        shop?.name || "",
        r.mechanic || "",
        r.partsCost || "0",
        r.laborCost || "0",
        r.tax || "0",
        r.totalCost || "0",
      ].map(v => csvField(String(v))).join(",");
    });
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const vanLabel = vehicleFilter === "all" ? "all-vans" : `van-${vehicles?.find(v => String(v.id) === vehicleFilter)?.vanNumber || vehicleFilter}`;
    const shopLabel = shopFilter === "all" ? "" : `-${(shops?.find(s => String(s.id) === shopFilter)?.name || "shop").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    a.download = `repairs-${vanLabel}${shopLabel}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printRepairsPdf = () => {
    if (!filtered || filtered.length === 0) {
      toast.error("Nothing to print for the current filter");
      return;
    }
    const rows = filtered.map(r => {
      const vehicle = vehicles?.find(v => v.id === r.vehicleId);
      const shop = shops?.find(s => s.id === r.shopId);
      return `
        <tr>
          <td>Van ${vehicle?.vanNumber || "Unknown"}</td>
          <td>${new Date(r.date).toLocaleDateString()}</td>
          <td>${r.category || ""}</td>
          <td>${r.complaint || ""}</td>
          <td>${shop?.name || ""}</td>
          <td>$${r.totalCost || "0"}</td>
        </tr>
      `;
    }).join("");
    const vanLabel = vehicleFilter === "all" ? "All Vans" : `Van ${vehicles?.find(v => String(v.id) === vehicleFilter)?.vanNumber || vehicleFilter}`;
    const shopLabel = shopFilter === "all" ? "" : ` · ${shops?.find(s => String(s.id) === shopFilter)?.name || "Shop"}`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow pop-ups to print this list");
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Vanlytics — Repair History</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            p.meta { color: #555; font-size: 13px; margin-top: 0; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #ddd; font-size: 13px; }
            th { background: #f3f3f3; }
          </style>
        </head>
        <body>
          <h1>Vanlytics — Repair History (${vanLabel}${shopLabel})</h1>
          <p class="meta">Printed: ${new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · ${filtered.length} repair${filtered.length === 1 ? "" : "s"}</p>
          <table>
            <thead>
              <tr><th>Van #</th><th>Date</th><th>Category</th><th>Complaint</th><th>Shop</th><th>Total</th></tr>
            </thead>
            <tbody>${rows}</tbody>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Repairs</h1>
          <p className="text-muted-foreground text-sm mt-1">{repairs?.length ?? 0} total repairs logged</p>
        </div>
        {isAdmin && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Import History
          </Button>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Log Repair
          </Button>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit Repair" : "Log New Repair"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vehicle *</Label>
                  <Select value={form.vehicleId ? String(form.vehicleId) : undefined} onValueChange={(v) => setForm({ ...form, vehicleId: parseInt(v) })}>
                    <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                    <SelectContent>
                      {vehicles?.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>Van {v.vanNumber}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Shop</Label>
                  <Select value={form.shopId ? String(form.shopId) : undefined} onValueChange={(v) => setForm({ ...form, shopId: parseInt(v) })}>
                    <SelectTrigger><SelectValue placeholder="Select shop" /></SelectTrigger>
                    <SelectContent>
                      {shops?.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={toDateInputValue(form.date)}
                    onChange={(e) => setForm({ ...form, date: fromDateInputValue(e.target.value, form.date) })} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category || undefined} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Mileage</Label>
                  <Input type="number" value={form.mileage || ""} onChange={(e) => setForm({ ...form, mileage: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Mechanic</Label>
                  <Input value={form.mechanic} onChange={(e) => setForm({ ...form, mechanic: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Complaint</Label>
                <Textarea value={form.complaint} onChange={(e) => setForm({ ...form, complaint: e.target.value })} placeholder="What was the issue?" />
              </div>
              <div>
                <Label>Diagnosis</Label>
                <Textarea value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="What was found?" />
              </div>
              <div>
                <Label>Parts Replaced (comma-separated)</Label>
                <Input value={form.partsReplaced} onChange={(e) => setForm({ ...form, partsReplaced: e.target.value })} placeholder="e.g. AC Compressor, Belt" />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label>Parts $</Label>
                  <Input
                    value={form.partsCost}
                    onChange={(e) => {
                      const partsCost = e.target.value;
                      setForm({ ...form, partsCost, totalCost: computeTotal(partsCost, form.laborCost, form.tax) });
                    }}
                  />
                </div>
                <div>
                  <Label>Labor $</Label>
                  <Input
                    value={form.laborCost}
                    onChange={(e) => {
                      const laborCost = e.target.value;
                      setForm({ ...form, laborCost, totalCost: computeTotal(form.partsCost, laborCost, form.tax) });
                    }}
                  />
                </div>
                <div>
                  <Label>Tax $</Label>
                  <Input
                    value={form.tax}
                    onChange={(e) => {
                      const tax = e.target.value;
                      setForm({ ...form, tax, totalCost: computeTotal(form.partsCost, form.laborCost, tax) });
                    }}
                  />
                </div>
                <div>
                  <Label>Total $</Label>
                  <Input value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Warranty (months)</Label>
                  <Input type="number" value={form.warrantyMonths || ""} onChange={(e) => setForm({ ...form, warrantyMonths: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Old Part Returned?</Label>
                  <Select value={form.oldPartReturned} onValueChange={(v: "yes" | "no") => setForm({ ...form, oldPartReturned: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Successful?</Label>
                  <Select value={form.repairSuccessful} onValueChange={(v: "yes" | "no") => setForm({ ...form, repairSuccessful: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingId ? "Save Changes" : "Log Repair"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
        )}
      </div>

      <ImportHistoryDialog open={importOpen} onOpenChange={setImportOpen} vehicles={vehicles} />

      <div className="flex items-end gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search repairs..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Van</Label>
          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vans</SelectItem>
              {vehicles?.map(v => <SelectItem key={v.id} value={String(v.id)}>Van {v.vanNumber}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Shop</Label>
          <Select value={shopFilter} onValueChange={setShopFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shops</SelectItem>
              {shops?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={exportRepairsCsv}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={printRepairsPdf}>
          <Printer className="h-4 w-4 mr-1" /> Print / PDF
        </Button>
      </div>

      {/* Repair List */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : filtered && filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((r) => {
            const vehicle = vehicles?.find((v) => v.id === r.vehicleId);
            const shop = shops?.find((s) => s.id === r.shopId);
            return (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">Van {vehicle?.vanNumber || "?"}</span>
                        {r.category && <Badge variant="outline" className="text-xs">{r.category}</Badge>}
                        {r.repairSuccessful === "no" && (
                          <Badge variant="destructive" className="text-xs flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Failed
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{r.complaint || "No complaint recorded"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.date).toLocaleDateString()} · {shop?.name || "Unknown shop"}
                        {r.mechanic && ` · ${r.mechanic}`}
                      </p>
                      {r.warrantyMonths && r.warrantyMonths > 0 && (
                        <p className="text-xs text-blue-500">
                          Warranty: {r.warrantyMonths}mo (exp {new Date(r.date + r.warrantyMonths * 30 * 24 * 60 * 60 * 1000).toLocaleDateString()})
                        </p>
                      )}
                      {r.partsReplaced && r.partsReplaced.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Parts: {Array.isArray(r.partsReplaced) ? r.partsReplaced.join(", ") : ""}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex items-start gap-1">
                      <RepairInvoices repairId={r.id} />
                      {isAdmin && (
                      <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => handleEdit(r)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(r.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      </>
                      )}
                      <div>
                        <Badge variant="secondary" className="font-mono">${r.totalCost}</Badge>
                        {r.repairSuccessful === "yes" ? (
                          <p className="text-xs text-green-600 mt-1">Successful</p>
                        ) : r.repairSuccessful === "no" ? (
                          <p className="text-xs text-red-600 mt-1">Failed</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <Wrench className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No repairs found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Try a different search" : "Log your first repair to get started"}
          </p>
        </div>
      )}
    </div>
  );
}

const REPAIR_IMPORT_FIELDS: { key: string; label: string; required: boolean }[] = [
  { key: "carNickname", label: "Van / Car Nickname", required: true },
  { key: "category", label: "Maintenance Type", required: false },
  { key: "date", label: "Maintenance Date", required: true },
  { key: "totalCost", label: "Maintenance Cost", required: true },
  { key: "mileage", label: "Maintenance Mileage", required: false },
  { key: "complaint", label: "Maintenance Notes", required: false },
];

function guessRepairImportColumn(headers: string[], key: string): string | null {
  const patterns: Record<string, RegExp> = {
    carNickname: /car.?nickname|van|vehicle/i,
    category: /maintenance.?type|type|category/i,
    date: /date/i,
    totalCost: /cost/i,
    mileage: /mileage/i,
    complaint: /notes?/i,
  };
  const pattern = patterns[key];
  return headers.find(h => pattern.test(h)) ?? null;
}

// Parses M/D/YYYY (and similar) using local date components — never routes
// through a raw `new Date(string)` call, which is what caused the
// off-by-one-day timezone bug we fixed elsewhere in the app.
function parseImportDate(raw: unknown): number {
  if (raw instanceof Date) {
    return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate()).getTime();
  }
  const str = String(raw ?? "").trim();
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month - 1, day).getTime();
  }
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()).getTime();
  }
  return Date.now();
}

function parseImportNumber(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const cleaned = String(raw ?? "").replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function ImportHistoryDialog({
  open, onOpenChange, vehicles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: { vanNumber: string }[] | undefined;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const importMutation = trpc.repairs.createImport.useMutation({
    onSuccess: (result) => {
      utils.repairs.list.invalidate();
      if (result.skipped > 0) {
        toast.error(
          `Imported ${result.imported}, skipped ${result.skipped} (no matching van): ${result.unmatchedNicknames.join(", ")}`,
          { duration: 10000 }
        );
      } else {
        toast.success(`Imported ${result.imported} repair records`);
      }
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
    const withData = json.filter(row => Object.values(row).some(v => String(v).trim() !== ""));
    if (withData.length === 0) {
      toast.error("No rows with data found in that file");
      return;
    }
    const detectedHeaders = Object.keys(withData[0]);
    setHeaders(detectedHeaders);
    setRows(withData);

    const guessed: Record<string, string> = {};
    for (const field of REPAIR_IMPORT_FIELDS) {
      const guess = guessRepairImportColumn(detectedHeaders, field.key);
      if (guess) guessed[field.key] = guess;
    }
    setMapping(guessed);
  };

  const missingRequired = REPAIR_IMPORT_FIELDS.filter(f => f.required && !mapping[f.key]);

  const handleConfirmImport = () => {
    if (missingRequired.length > 0) {
      toast.error(`Map required fields first: ${missingRequired.map(f => f.label).join(", ")}`);
      return;
    }
    setSubmitting(true);
    const get = (row: Record<string, unknown>, key: string) => (mapping[key] ? row[mapping[key]] : undefined);
    const mappedRows = rows.map(row => ({
      carNickname: String(get(row, "carNickname") ?? "").trim(),
      category: get(row, "category") ? String(get(row, "category")).trim() : undefined,
      date: parseImportDate(get(row, "date")),
      totalCost: parseImportNumber(get(row, "totalCost")),
      mileage: get(row, "mileage") ? parseImportNumber(get(row, "mileage")) : undefined,
      complaint: get(row, "complaint") ? String(get(row, "complaint")).trim() : undefined,
    })).filter(r => r.carNickname);

    importMutation.mutate({ rows: mappedRows });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Repair History</DialogTitle>
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
            Each row must reference a van already in Fleet — "Van 68" and "68" both match a van whose
            number on file is <span className="font-mono">68</span>. Vans currently on file:{" "}
            {vehicles?.map(v => v.vanNumber).join(", ") || "none yet"}.
          </p>

          {headers.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                {REPAIR_IMPORT_FIELDS.map(field => (
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
                  <AlertCircle className="h-3.5 w-3.5" /> Map required fields: {missingRequired.map(f => f.label).join(", ")}
                </p>
              )}

              <Button onClick={handleConfirmImport} disabled={submitting || missingRequired.length > 0} className="w-full">
                {submitting ? "Importing..." : `Confirm Import (${rows.length} rows)`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
