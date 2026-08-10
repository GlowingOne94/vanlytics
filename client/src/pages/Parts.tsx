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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Package, Plus, Search, Trash2, Pencil, ChevronDown, ChevronUp,
  Camera, Sparkles, X, FileText, AlertTriangle, CheckCircle2, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "AC/HVAC", "Brakes", "Cooling", "DOT Inspection", "Electrical", "Engine", "Exhaust",
  "Filters", "Fluids", "Registration", "Suspension", "Tires", "Towing", "Transmission",
  "Wheelchair Lift", "Body", "Other",
];

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  in_stock: { label: "In Stock", className: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  partially_used: { label: "Partially Used", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  fully_used: { label: "Fully Used", className: "bg-gray-500/15 text-gray-500 border-gray-500/30" },
};

export default function Parts() {
  const { isAdmin } = useIsAdmin();
  const [tab, setTab] = useState("parts");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<any>(null);
  const [expandedPartId, setExpandedPartId] = useState<number | null>(null);

  const { data: parts, isLoading } = trpc.parts.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.parts.delete.useMutation({
    onSuccess: () => { utils.parts.list.invalidate(); utils.parts.invoices.list.invalidate(); toast.success("Part deleted"); },
    onError: (err) => toast.error(err.message),
  });

  const openEdit = (p: NonNullable<typeof parts>[number]) => {
    setEditingPart(p);
    setEditDialogOpen(true);
  };

  const handleDelete = (id: number, name: string) => {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    deleteMutation.mutate({ id });
  };

  const filtered = parts?.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.category || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalInStockValue = (parts ?? []).reduce((sum, p) => sum + p.quantityRemaining * p.unitCost, 0);
  const totalUsedValue = (parts ?? []).reduce((sum, p) => sum + (p.quantityPurchased - p.quantityRemaining) * p.unitCost, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" /> Parts
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Log parts you've bought ahead of a specific repair, then assign them as they're used</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setInvoiceDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Log Invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">In Stock Value</p><p className="text-xl font-bold">${totalInStockValue.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Used Value</p><p className="text-xl font-bold">${totalUsedValue.toFixed(2)}</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="parts"><Package className="h-3.5 w-3.5 mr-1.5" /> Parts</TabsTrigger>
          <TabsTrigger value="invoices"><FileText className="h-3.5 w-3.5 mr-1.5" /> Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="parts" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search parts..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
                <SelectItem value="partially_used">Partially Used</SelectItem>
                <SelectItem value="fully_used">Fully Used</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
          ) : !filtered || filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No parts logged yet.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => (
                <Card key={p.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={STATUS_STYLES[p.status].className}>{STATUS_STYLES[p.status].label}</Badge>
                        <div>
                          <p className="text-sm font-medium">
                            {p.name}
                            {p.category && <span className="text-muted-foreground font-normal"> · {p.category}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p.quantityRemaining} of {p.quantityPurchased} remaining
                            {p.shopName ? ` · ${p.shopName}` : ""}
                            {p.invoiceReference ? ` · Inv# ${p.invoiceReference}` : ""}
                            {` · ${new Date(p.datePurchased).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-sm font-semibold">${p.totalCost.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">${p.unitCost.toFixed(2)}/unit</p>
                        </div>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setExpandedPartId(expandedPartId === p.id ? null : p.id)}
                        >
                          {expandedPartId === p.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(p.id, p.name)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {expandedPartId === p.id && (
                      <PartUsagePanel partId={p.id} quantityRemaining={p.quantityRemaining} isAdmin={isAdmin} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab />
        </TabsContent>
      </Tabs>

      <LogInvoiceDialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen} />
      <EditPartDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} part={editingPart} />
    </div>
  );
}

// ============ INVOICES TAB (the "file cabinet") ============

function InvoicesTab() {
  const { data: invoices, isLoading } = trpc.parts.invoices.list.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  }
  if (!invoices || invoices.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">No invoices logged yet — use "Log Invoice" to add one.</p>;
  }

  return (
    <div className="space-y-2">
      {invoices.map(inv => (
        <Card key={inv.id}>
          <CardContent className="p-3">
            <button className="w-full flex items-center justify-between gap-3 flex-wrap text-left" onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}>
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {inv.shopName || "Unknown Shop"}
                    {inv.invoiceReference ? ` · Inv# ${inv.invoiceReference}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(inv.datePurchased).toLocaleDateString()} · {inv.itemCount} item{inv.itemCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold">${inv.computedTotal.toFixed(2)}</p>
                  {inv.printedTotal != null && (
                    <p className={`text-xs flex items-center gap-1 justify-end ${inv.totalMismatch ? "text-yellow-500" : "text-muted-foreground"}`}>
                      {inv.totalMismatch ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      Invoice says ${inv.printedTotal.toFixed(2)}
                    </p>
                  )}
                </div>
                {expandedId === inv.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
            {expandedId === inv.id && <InvoiceDetail invoiceId={inv.id} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InvoiceDetail({ invoiceId }: { invoiceId: number }) {
  const { data: invoice, isLoading } = trpc.parts.invoices.get.useQuery({ id: invoiceId });

  if (isLoading || !invoice) {
    return <Skeleton className="h-24 rounded-md mt-3" />;
  }

  return (
    <div className="mt-3 pt-3 border-t space-y-4">
      {invoice.totalMismatch && (
        <div className="flex items-start gap-2 text-xs bg-yellow-500/10 border border-yellow-500/30 rounded-md p-2 text-yellow-600">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Line items add up to ${invoice.computedTotal.toFixed(2)}, but the invoice's printed total is ${invoice.printedTotal?.toFixed(2)}. Worth double-checking against the original pages below.</span>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Line Items</p>
        <div className="space-y-1">
          {invoice.lineItems.map(li => (
            <div key={li.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-md px-3 py-2">
              <span>{li.name}{li.category ? ` · ${li.category}` : ""} — Qty {li.quantityPurchased} × ${li.unitCost.toFixed(2)}</span>
              <span className="font-medium">${li.totalCost.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {invoice.documents.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Original Pages</p>
          <div className="flex gap-2 flex-wrap">
            {invoice.documents.map(doc => (
              <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="block">
                <img src={doc.fileUrl} alt={`Page ${doc.pageNumber}`} className="h-24 w-20 object-cover rounded-md border hover:opacity-80" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ LOG INVOICE (multi-page photo upload + AI scan) ============

type LineItem = { name: string; category: string; quantity: string; unitCost: string };
type PendingPage = { base64: string; contentType: string; previewUrl: string };
const BLANK_LINE: LineItem = { name: "", category: "", quantity: "1", unitCost: "" };

function LogInvoiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [shopId, setShopId] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [datePurchased, setDatePurchased] = useState(Date.now());
  const [printedTotal, setPrintedTotal] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...BLANK_LINE }]);
  const [pages, setPages] = useState<PendingPage[]>([]);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: shops } = trpc.shops.list.useQuery();
  const utils = trpc.useUtils();

  const scanMutation = trpc.parts.scanInvoice.useMutation({
    onSuccess: (result) => {
      if (result.shopName && shops) {
        const match = shops.find(s => s.name.toLowerCase().includes(result.shopName!.toLowerCase()) || result.shopName!.toLowerCase().includes(s.name.toLowerCase()));
        if (match) setShopId(String(match.id));
      }
      if (result.invoiceDate) {
        const parsed = new Date(result.invoiceDate);
        if (!isNaN(parsed.getTime())) setDatePurchased(parsed.getTime());
      }
      if (result.invoiceReference) setInvoiceReference(result.invoiceReference);
      if (result.printedTotal != null) setPrintedTotal(String(result.printedTotal));

      if (result.lineItems.length > 0) {
        setLineItems(result.lineItems.map((item: any) => ({
          name: item.name || "",
          category: CATEGORIES.includes(item.category) ? item.category : "",
          quantity: String(item.quantity || 1),
          unitCost: String(item.unitCost ?? ""),
        })));
        toast.success(`Read ${result.lineItems.length} line item${result.lineItems.length === 1 ? "" : "s"} — review before saving`);
      } else {
        toast.error("Couldn't find any line items in those photos — try clearer shots or enter them manually.");
      }
      setScanning(false);
    },
    onError: (err) => { toast.error(err.message); setScanning(false); },
  });

  const createMutation = trpc.parts.createInvoice.useMutation({
    onSuccess: (result) => {
      utils.parts.list.invalidate();
      utils.parts.invoices.list.invalidate();
      toast.success(`Logged ${result.count} part${result.count === 1 ? "" : "s"}`);
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const reset = () => {
    setShopId(""); setInvoiceReference(""); setDatePurchased(Date.now()); setPrintedTotal("");
    setLineItems([{ ...BLANK_LINE }]); setPages([]);
  };

  const handleAddPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10MB per page"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setPages(prev => [...prev, { base64, contentType: file.type, previewUrl: dataUrl }]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removePage = (index: number) => setPages(pages.filter((_, i) => i !== index));

  const handleScan = () => {
    if (pages.length === 0) return;
    setScanning(true);
    scanMutation.mutate({ pages: pages.map(p => ({ imageBase64: p.base64, contentType: p.contentType })) });
  };

  const updateLine = (index: number, field: keyof LineItem, value: string) => {
    setLineItems(lineItems.map((li, i) => (i === index ? { ...li, [field]: value } : li)));
  };
  const addLine = () => setLineItems([...lineItems, { ...BLANK_LINE }]);
  const removeLine = (index: number) => setLineItems(lineItems.filter((_, i) => i !== index));

  const computedTotal = lineItems.reduce((sum, li) => {
    const qty = parseInt(li.quantity, 10) || 0;
    const cost = parseFloat(li.unitCost) || 0;
    return sum + qty * cost;
  }, 0);
  const parsedPrintedTotal = printedTotal ? parseFloat(printedTotal) : null;
  const totalMismatch = parsedPrintedTotal != null && Math.abs(parsedPrintedTotal - computedTotal) > 0.01;

  const handleSubmit = () => {
    const validLines = lineItems.filter(li => li.name.trim());
    if (validLines.length === 0) { toast.error("Add at least one part"); return; }

    const parsedLines = [];
    for (const li of validLines) {
      const quantity = parseInt(li.quantity, 10);
      const unitCost = parseFloat(li.unitCost);
      if (isNaN(quantity) || quantity < 1) { toast.error(`Invalid quantity for "${li.name}"`); return; }
      if (isNaN(unitCost) || unitCost < 0) { toast.error(`Invalid unit cost for "${li.name}"`); return; }
      parsedLines.push({ name: li.name.trim(), category: li.category || undefined, quantity, unitCost });
    }

    createMutation.mutate({
      shopId: shopId ? parseInt(shopId, 10) : undefined,
      invoiceReference: invoiceReference.trim() || undefined,
      datePurchased,
      printedTotal: parsedPrintedTotal ?? undefined,
      pages: pages.map(p => ({ imageBase64: p.base64, contentType: p.contentType })),
      lineItems: parsedLines,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Log Invoice</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddPage} />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Camera className="h-4 w-4 mr-2" /> {pages.length === 0 ? "Add Invoice Photo" : "Add Another Page"}
              </Button>
              {pages.length > 0 && (
                <Button type="button" onClick={handleScan} disabled={scanning}>
                  {scanning ? "Reading..." : <><Sparkles className="h-4 w-4 mr-2" /> Scan {pages.length} Page{pages.length === 1 ? "" : "s"}</>}
                </Button>
              )}
            </div>
            {pages.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-3">
                {pages.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.previewUrl} alt={`Page ${i + 1}`} className="h-20 w-16 object-cover rounded-md border" />
                    <button
                      className="absolute -top-1.5 -right-1.5 bg-background border rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                      onClick={() => removePage(i)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-0.5 right-0.5 text-[10px] bg-black/60 text-white rounded px-1">{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">Multi-page invoice? Add every page before scanning, so line items and the total are read together.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t">
            <div>
              <Label className="text-xs">Shop / Supplier</Label>
              <Select value={shopId || "__none__"} onValueChange={(v) => setShopId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="— none —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {shops?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Invoice Date</Label>
              <Input
                type="date"
                value={toDateInputValue(datePurchased)}
                onChange={(e) => setDatePurchased(e.target.value ? fromDateInputValue(e.target.value) : Date.now())}
              />
            </div>
            <div>
              <Label className="text-xs">Invoice #</Label>
              <Input value={invoiceReference} onChange={(e) => setInvoiceReference(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Printed Total</Label>
              <Input type="number" min="0" step="0.01" value={printedTotal} onChange={(e) => setPrintedTotal(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-2 block">Parts on this invoice</Label>
            <div className="space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-4 h-9"
                    placeholder="Part name"
                    value={li.name}
                    onChange={(e) => updateLine(i, "name", e.target.value)}
                  />
                  <Select value={li.category || "__none__"} onValueChange={(v) => updateLine(i, "category", v === "__none__" ? "" : v)}>
                    <SelectTrigger className="col-span-3 h-9"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— none —</SelectItem>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    className="col-span-2 h-9" type="number" min="1" placeholder="Qty"
                    value={li.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)}
                  />
                  <Input
                    className="col-span-2 h-9" type="number" min="0" step="0.01" placeholder="Unit $"
                    value={li.unitCost} onChange={(e) => updateLine(i, "unitCost", e.target.value)}
                  />
                  <Button
                    variant="ghost" size="icon" className="col-span-1 h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLine(i)}
                    disabled={lineItems.length === 1}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Line
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2 text-sm">
            {totalMismatch && (
              <span className="text-yellow-500 flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" /> Doesn't match printed total (${parsedPrintedTotal?.toFixed(2)})
              </span>
            )}
            <p className="text-muted-foreground">Line Items Total: <span className="font-semibold text-foreground">${computedTotal.toFixed(2)}</span></p>
          </div>

          <Button onClick={handleSubmit} disabled={createMutation.isPending} className="w-full">
            {createMutation.isPending ? "Saving..." : "Log Invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ EDIT PART (single item) ============

function EditPartDialog({ open, onOpenChange, part }: { open: boolean; onOpenChange: (open: boolean) => void; part: any }) {
  const [form, setForm] = useState({
    name: "", category: "", shopId: "", quantityPurchased: "1", unitCost: "",
    datePurchased: Date.now(), notes: "",
  });
  const { data: shops } = trpc.shops.list.useQuery();
  const utils = trpc.useUtils();

  const updateMutation = trpc.parts.update.useMutation({
    onSuccess: () => { utils.parts.list.invalidate(); onOpenChange(false); toast.success("Part updated"); },
    onError: (err) => toast.error(err.message),
  });

  // Sync form when a new part is opened for editing.
  if (open && part && form.name === "" && part.name) {
    setForm({
      name: part.name,
      category: part.category || "",
      shopId: part.shopId ? String(part.shopId) : "",
      quantityPurchased: String(part.quantityPurchased),
      unitCost: String(part.unitCost),
      datePurchased: new Date(part.datePurchased).getTime(),
      notes: part.notes || "",
    });
  }

  const handleClose = (o: boolean) => {
    onOpenChange(o);
    if (!o) setForm({ name: "", category: "", shopId: "", quantityPurchased: "1", unitCost: "", datePurchased: Date.now(), notes: "" });
  };

  const handleSave = () => {
    if (!part) return;
    if (!form.name.trim()) { toast.error("Part name is required"); return; }
    const quantityPurchased = parseInt(form.quantityPurchased, 10);
    const unitCost = parseFloat(form.unitCost);
    if (isNaN(quantityPurchased) || quantityPurchased < 1) { toast.error("Enter a valid quantity"); return; }
    if (isNaN(unitCost) || unitCost < 0) { toast.error("Enter a valid unit cost"); return; }

    updateMutation.mutate({
      id: part.id,
      name: form.name.trim(),
      category: form.category || undefined,
      shopId: form.shopId ? parseInt(form.shopId, 10) : null,
      quantityPurchased,
      unitCost,
      datePurchased: form.datePurchased,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Part</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Part Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category || "__none__"} onValueChange={(v) => setForm({ ...form, category: v === "__none__" ? "" : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="— none —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Shop / Supplier</Label>
              <Select value={form.shopId || "__none__"} onValueChange={(v) => setForm({ ...form, shopId: v === "__none__" ? "" : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="— none —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {shops?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantity Purchased *</Label>
              <Input type="number" min="1" value={form.quantityPurchased} onChange={(e) => setForm({ ...form, quantityPurchased: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Unit Cost *</Label>
              <Input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Date Purchased</Label>
            <Input
              type="date"
              value={toDateInputValue(form.datePurchased)}
              onChange={(e) => setForm({ ...form, datePurchased: e.target.value ? fromDateInputValue(e.target.value) : Date.now() })}
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full">
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ USAGE TRACKING (unchanged) ============

function PartUsagePanel({ partId, quantityRemaining, isAdmin }: { partId: number; quantityRemaining: number; isAdmin: boolean }) {
  const [logOpen, setLogOpen] = useState(false);
  const { data: usages, isLoading } = trpc.parts.usages.list.useQuery({ partId });
  const { data: vehicles } = trpc.vehicles.list.useQuery();
  const utils = trpc.useUtils();

  const deleteUsageMutation = trpc.parts.usages.delete.useMutation({
    onSuccess: () => {
      utils.parts.usages.list.invalidate({ partId });
      utils.parts.list.invalidate();
      toast.success("Usage removed, quantity returned to stock");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="mt-3 pt-3 border-t">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Usage History</p>
        {isAdmin && quantityRemaining > 0 && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLogOpen(true)}>
            Log Usage
          </Button>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-10 rounded-md" />
      ) : !usages || usages.length === 0 ? (
        <p className="text-xs text-muted-foreground">Not used yet.</p>
      ) : (
        <div className="space-y-1.5">
          {usages.map(u => (
            <div key={u.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-md px-3 py-2">
              <span>
                {u.quantityUsed} used on Van {u.vanNumber} · {new Date(u.dateUsed).toLocaleDateString()}
                {u.repairId ? ` · Repair #${u.repairId}` : ""}
              </span>
              {isAdmin && (
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (window.confirm("Remove this usage record and return the quantity to stock?")) {
                      deleteUsageMutation.mutate({ id: u.id });
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <LogUsageDialog open={logOpen} onOpenChange={setLogOpen} partId={partId} quantityRemaining={quantityRemaining} vehicles={vehicles} />
    </div>
  );
}

function LogUsageDialog({
  open, onOpenChange, partId, quantityRemaining, vehicles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partId: number;
  quantityRemaining: number;
  vehicles: { id: number; vanNumber: string }[] | undefined;
}) {
  const [quantityUsed, setQuantityUsed] = useState("1");
  const [vehicleId, setVehicleId] = useState("");
  const [repairId, setRepairId] = useState("");
  const [dateUsed, setDateUsed] = useState(Date.now());
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const { data: repairs } = trpc.repairs.list.useQuery(
    { vehicleId: vehicleId ? parseInt(vehicleId, 10) : undefined },
    { enabled: Boolean(vehicleId) }
  );

  const usageMutation = trpc.parts.usages.create.useMutation({
    onSuccess: () => {
      utils.parts.usages.list.invalidate({ partId });
      utils.parts.list.invalidate();
      toast.success("Usage logged");
      onOpenChange(false);
      setQuantityUsed("1"); setVehicleId(""); setRepairId(""); setNotes("");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log Part Usage</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Quantity Used * ({quantityRemaining} remaining)</Label>
            <Input type="number" min="1" max={quantityRemaining} value={quantityUsed} onChange={(e) => setQuantityUsed(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Vehicle *</Label>
            <Select value={vehicleId} onValueChange={(v) => { setVehicleId(v); setRepairId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select a van" /></SelectTrigger>
              <SelectContent>
                {vehicles?.map(v => <SelectItem key={v.id} value={String(v.id)}>Van {v.vanNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {vehicleId && (
            <div>
              <Label className="text-xs">Link to a Repair (optional)</Label>
              <Select value={repairId || "__none__"} onValueChange={(v) => setRepairId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {repairs?.map(r => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      #{r.id} — {r.category || "Repair"} ({new Date(r.date).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Date Used</Label>
            <Input
              type="date"
              value={toDateInputValue(dateUsed)}
              onChange={(e) => setDateUsed(e.target.value ? fromDateInputValue(e.target.value) : Date.now())}
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button
            className="w-full"
            disabled={usageMutation.isPending || !vehicleId || !quantityUsed}
            onClick={() => {
              const qty = parseInt(quantityUsed, 10);
              if (isNaN(qty) || qty < 1) { toast.error("Enter a valid quantity"); return; }
              if (qty > quantityRemaining) { toast.error(`Only ${quantityRemaining} remaining`); return; }
              usageMutation.mutate({
                partId,
                quantityUsed: qty,
                vehicleId: parseInt(vehicleId, 10),
                repairId: repairId ? parseInt(repairId, 10) : undefined,
                dateUsed,
                notes: notes.trim() || undefined,
              });
            }}
          >
            {usageMutation.isPending ? "Saving..." : "Log Usage"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
