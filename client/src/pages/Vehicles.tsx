import { trpc } from "@/lib/trpc";
import { useIsAdmin } from "@/_core/hooks/useIsAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Filter, Plus, Search, Truck, Printer, Archive } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 border-green-200",
  down: "bg-red-500/10 text-red-600 border-red-200",
  awaiting_parts: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  at_shop: "bg-blue-500/10 text-blue-600 border-blue-200",
  retired: "bg-gray-500/10 text-gray-600 border-gray-200",
};

const healthColors: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

export default function Vehicles() {
  const { isAdmin } = useIsAdmin();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: vehicles, isLoading } = trpc.vehicles.list.useQuery();
  const { data: drivers } = trpc.drivers.list.useQuery();
  const activeDrivers = (drivers ?? []).filter(d => d.status === "active");
  const utils = trpc.useUtils();
  const createMutation = trpc.vehicles.create.useMutation({
    onSuccess: () => {
      utils.vehicles.list.invalidate();
      setDialogOpen(false);
      toast.success("Vehicle added successfully");
    },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState({
    vanNumber: "",
    vin: "",
    year: new Date().getFullYear(),
    make: "",
    model: "",
    licensePlate: "",
    ezpassTag: "",
    engine: "",
    transmission: "",
    assignedDriver: "",
    mileage: 0,
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fleetView, setFleetView] = useState<"active" | "retired">("active");

  const retiredCount = useMemo(() => (vehicles ?? []).filter(v => v.status === "retired").length, [vehicles]);
  const activeCount = useMemo(() => (vehicles ?? []).filter(v => v.status !== "retired").length, [vehicles]);

  const filtered = useMemo(() => {
    return vehicles?.filter((v) => {
      const matchesSearch =
        v.vanNumber.toLowerCase().includes(search.toLowerCase()) ||
        v.vin.toLowerCase().includes(search.toLowerCase()) ||
        (v.licensePlate || "").toLowerCase().includes(search.toLowerCase()) ||
        (v.assignedDriver || "").toLowerCase().includes(search.toLowerCase());
      // Retired Fleet tab shows only retired vehicles. Active Fleet tab
      // shows everything else — a van being "Down" or "At Shop" still
      // belongs to your active fleet, it's just having a bad week.
      const matchesFleetView = fleetView === "retired" ? v.status === "retired" : v.status !== "retired";
      const matchesStatus = statusFilter === "all" || v.status === statusFilter;
      return matchesSearch && matchesFleetView && matchesStatus;
    });
  }, [vehicles, search, statusFilter, fleetView]);

  const handleCreate = () => {
    if (!form.vanNumber || !form.vin) {
      toast.error("Van number and VIN are required");
      return;
    }
    if (!form.make.trim() || !form.model.trim()) {
      toast.error("Make and model are required");
      return;
    }
    createMutation.mutate({
      vanNumber: form.vanNumber,
      vin: form.vin,
      year: form.year,
      make: form.make.trim(),
      model: form.model.trim(),
      licensePlate: form.licensePlate || undefined,
      ezpassTag: form.ezpassTag || undefined,
      engine: form.engine || undefined,
      transmission: form.transmission || undefined,
      assignedDriver: form.assignedDriver || undefined,
      mileage: form.mileage,
    });
  };

  const printTagList = () => {
    const rows = (vehicles ?? [])
      .slice()
      .sort((a, b) => a.vanNumber.localeCompare(b.vanNumber, undefined, { numeric: true }))
      .map(v => `
        <tr>
          <td>${v.vanNumber}</td>
          <td>${v.licensePlate || "—"}</td>
          <td>${v.ezpassTag || "—"}</td>
        </tr>
      `).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow pop-ups to print this list");
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Vanlytics — E-ZPass Tag List</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            p.meta { color: #555; font-size: 13px; margin-top: 0; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #ddd; font-size: 14px; }
            th { background: #f3f3f3; }
          </style>
        </head>
        <body>
          <h1>Vanlytics — E-ZPass Tag List</h1>
          <p class="meta">Printed: ${new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          <table>
            <thead>
              <tr><th>Van #</th><th>License Plate</th><th>E-ZPass Tag #</th></tr>
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
          <h1 className="text-2xl font-bold tracking-tight">Fleet</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {fleetView === "retired" ? retiredCount : activeCount} vehicle{(fleetView === "retired" ? retiredCount : activeCount) === 1 ? "" : "s"} {fleetView === "retired" ? "retired" : "in active fleet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={printTagList}>
            <Printer className="h-4 w-4 mr-1" /> Print Tag List
          </Button>
          {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Vehicle
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Vehicle</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Van Number *</Label>
                  <Input
                    placeholder="e.g. 55"
                    value={form.vanNumber}
                    onChange={(e) => setForm({ ...form, vanNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Year *</Label>
                  <Input
                    type="number"
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) || 2024 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Make *</Label>
                  <Input
                    placeholder="e.g. Ford, Dodge, Mercedes"
                    value={form.make}
                    onChange={(e) => setForm({ ...form, make: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Model *</Label>
                  <Input
                    placeholder="e.g. Transit Ambulette, Sprinter"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>VIN *</Label>
                <Input
                  placeholder="17-character VIN"
                  maxLength={17}
                  value={form.vin}
                  onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>License Plate</Label>
                  <Input
                    placeholder="Plate #"
                    value={form.licensePlate}
                    onChange={(e) => setForm({ ...form, licensePlate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>E-ZPass Tag #</Label>
                  <Input
                    placeholder="Tag #"
                    value={form.ezpassTag}
                    onChange={(e) => setForm({ ...form, ezpassTag: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Mileage</Label>
                  <Input
                    type="number"
                    value={form.mileage}
                    onChange={(e) => setForm({ ...form, mileage: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Engine</Label>
                  <Input
                    placeholder="e.g. 3.5L V6"
                    value={form.engine}
                    onChange={(e) => setForm({ ...form, engine: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Transmission</Label>
                  <Input
                    placeholder="e.g. 6-Speed Auto"
                    value={form.transmission}
                    onChange={(e) => setForm({ ...form, transmission: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Assigned Driver</Label>
                <Select
                  value={form.assignedDriver || undefined}
                  onValueChange={(v) => setForm({ ...form, assignedDriver: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="No driver assigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No driver assigned</SelectItem>
                    {activeDrivers.map((d) => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding..." : "Add Vehicle"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
          )}
        </div>
      </div>

      <Tabs value={fleetView} onValueChange={(v) => { setFleetView(v as "active" | "retired"); setStatusFilter("all"); }}>
        <TabsList>
          <TabsTrigger value="active">
            <Truck className="h-3.5 w-3.5 mr-1.5" /> Active Fleet ({activeCount})
          </TabsTrigger>
          <TabsTrigger value="retired">
            <Archive className="h-3.5 w-3.5 mr-1.5" /> Retired ({retiredCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by van #, VIN, plate, driver..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {fleetView === "active" && (
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-1" />
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="down">Down</SelectItem>
            <SelectItem value="awaiting_parts">Awaiting Parts</SelectItem>
            <SelectItem value="at_shop">At Shop</SelectItem>
          </SelectContent>
        </Select>
        )}
      </div>

      {/* Vehicle Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((vehicle) => (
            <Card
              key={vehicle.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setLocation(`/vehicles/${vehicle.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Truck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Van {vehicle.vanNumber}</h3>
                      <p className="text-xs text-muted-foreground">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${healthColors[vehicle.healthScore]}`} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Mileage:</span>{" "}
                    <span className="font-medium">{vehicle.mileage.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Driver:</span>{" "}
                    <span className="font-medium">{vehicle.assignedDriver || "—"}</span>
                  </div>
                </div>
                <div className="mt-3">
                  <Badge variant="outline" className={`text-xs ${statusColors[vehicle.status]}`}>
                    {vehicle.status.replace("_", " ")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Truck className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No vehicles found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Try a different search term" : "Add your first vehicle to get started"}
          </p>
        </div>
      )}
    </div>
  );
}
