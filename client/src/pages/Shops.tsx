import { trpc } from "@/lib/trpc";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Store, Phone, MapPin, Star, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const specialtyOptions = [
  "AC", "Transmission", "Engine", "Electrical", "Wheelchair Lift",
  "Body Work", "Tires", "Suspension", "Inspection", "Emergency Repairs", "Brakes", "Exhaust",
];

export default function Shops() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { data: shops, isLoading } = trpc.shops.list.useQuery();
  const { data: shopPerformance } = trpc.analytics.shopPerformance.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.shops.create.useMutation({
    onSuccess: () => {
      utils.shops.list.invalidate();
      setDialogOpen(false);
      toast.success("Shop added successfully");
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.shops.update.useMutation({
    onSuccess: () => {
      utils.shops.list.invalidate();
      setDialogOpen(false);
      toast.success("Shop updated");
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.shops.delete.useMutation({
    onSuccess: () => {
      utils.shops.list.invalidate();
      setDialogOpen(false);
      toast.success("Shop deleted");
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    contactPerson: "",
    specialties: [] as string[],
    averageLaborRate: "",
    recommendation: "maybe" as "yes" | "no" | "maybe",
    notes: "",
  });

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "", phone: "", address: "", contactPerson: "",
      specialties: [], averageLaborRate: "", recommendation: "maybe", notes: "",
    });
  };

  const openAddShop = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditShop = (shop: NonNullable<typeof shops>[number]) => {
    setEditingId(shop.id);
    setForm({
      name: shop.name,
      phone: shop.phone ?? "",
      address: shop.address ?? "",
      contactPerson: shop.contactPerson ?? "",
      specialties: Array.isArray(shop.specialties) ? (shop.specialties as string[]) : [],
      averageLaborRate: shop.averageLaborRate ?? "",
      recommendation: (shop.recommendation as "yes" | "no" | "maybe") ?? "maybe",
      notes: shop.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) { toast.error("Shop name is required"); return; }
    const payload = {
      name: form.name,
      phone: form.phone || undefined,
      address: form.address || undefined,
      contactPerson: form.contactPerson || undefined,
      specialties: form.specialties.length > 0 ? form.specialties : undefined,
      averageLaborRate: form.averageLaborRate || undefined,
      recommendation: form.recommendation,
      notes: form.notes || undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = () => {
    if (!editingId) return;
    if (!window.confirm(`Delete ${form.name}? This can't be undone.`)) return;
    deleteMutation.mutate({ id: editingId });
  };

  const toggleSpecialty = (s: string) => {
    setForm(prev => ({
      ...prev,
      specialties: prev.specialties.includes(s)
        ? prev.specialties.filter(x => x !== s)
        : [...prev.specialties, s],
    }));
  };

  const filtered = shops?.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.address || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.contactPerson || "").toLowerCase().includes(search.toLowerCase())
  );

  const recommendationColors: Record<string, string> = {
    yes: "bg-green-500/10 text-green-600",
    no: "bg-red-500/10 text-red-600",
    maybe: "bg-yellow-500/10 text-yellow-600",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shop Directory</h1>
          <p className="text-muted-foreground text-sm mt-1">{shops?.length ?? 0} shops tracked</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <Button size="sm" onClick={openAddShop}><Plus className="h-4 w-4 mr-1" /> Add Shop</Button>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit Shop" : "Add New Shop"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Shop name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
                </div>
                <div>
                  <Label>Contact Person</Label>
                  <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" />
              </div>
              <div>
                <Label>Avg Labor Rate ($/hr)</Label>
                <Input value={form.averageLaborRate} onChange={(e) => setForm({ ...form, averageLaborRate: e.target.value })} placeholder="e.g. 125" />
              </div>
              <div>
                <Label>Specialties</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {specialtyOptions.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.specialties.includes(s)} onCheckedChange={() => toggleSpecialty(s)} />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Would Recommend?</Label>
                <Select value={form.recommendation} onValueChange={(v: "yes" | "no" | "maybe") => setForm({ ...form, recommendation: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="maybe">Maybe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="flex-1">
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Add Shop"}
                </Button>
                {editingId && (
                  <Button
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search shops..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((shop) => (
            <Card key={shop.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Store className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{shop.name}</h3>
                      {shop.contactPerson && (
                        <p className="text-xs text-muted-foreground">{shop.contactPerson}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {shop.recommendation && (
                      <Badge variant="outline" className={recommendationColors[shop.recommendation]}>
                        {shop.recommendation === "yes" ? "Recommended" : shop.recommendation === "no" ? "Not Recommended" : "Maybe"}
                      </Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEditShop(shop)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {shop.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {shop.phone}
                    </div>
                  )}
                  {shop.address && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {shop.address}
                    </div>
                  )}
                  {shop.averageLaborRate && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Star className="h-3 w-3" /> ${shop.averageLaborRate}/hr avg labor
                    </div>
                  )}
                </div>
                {shop.specialties && Array.isArray(shop.specialties) && (shop.specialties as string[]).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(shop.specialties as string[]).map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Store className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No shops found</h3>
          <p className="text-sm text-muted-foreground mt-1">Add your first shop to start tracking</p>
        </div>
      )}
    </div>
  );
}
