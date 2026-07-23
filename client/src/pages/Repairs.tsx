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
import { Plus, Search, Wrench, Upload, FileText, AlertCircle, Trash2, Pencil } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const categories = [
  "AC/HVAC", "Brakes", "Cooling", "DOT Inspection", "Electrical", "Engine", "Exhaust",
  "Filters", "Fluids", "Suspension", "Tires", "Transmission", "Wheelchair Lift", "Body", "Other",
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
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10MB"); return; }
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
    e.target.value = "";
  };

  return (
    <div>
      <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={handleUpload} />
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
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
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

  const filtered = repairs?.filter(
    (r) =>
      (r.complaint || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.diagnosis || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.mechanic || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.category || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Repairs</h1>
          <p className="text-muted-foreground text-sm mt-1">{repairs?.length ?? 0} total repairs logged</p>
        </div>
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
                  <Input type="date" value={new Date(form.date).toISOString().split("T")[0]}
                    onChange={(e) => setForm({ ...form, date: new Date(e.target.value).getTime() })} />
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search repairs..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
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
