import { trpc } from "@/lib/trpc";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserCircle, Plus, Pencil, Trash2, HeartPulse } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Status = "valid" | "expiring_soon" | "expired" | "never";

const STATUS_STYLES: Record<Status, { label: string; className: string }> = {
  valid: { label: "Valid", className: "bg-green-500/15 text-green-500 border-green-500/30" },
  expiring_soon: { label: "Expiring Soon", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  expired: { label: "Expired", className: "bg-red-500/15 text-red-500 border-red-500/30" },
  never: { label: "No Medical on File", className: "bg-muted text-muted-foreground border-border" },
};

const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function addYears(ms: number, years: number) {
  const d = new Date(ms);
  d.setFullYear(d.getFullYear() + years);
  return d.getTime();
}

export default function DriverAbstracts() {
  const { data: drivers, isLoading: loadingDrivers } = trpc.drivers.list.useQuery();
  const { data: latestByDriver, isLoading: loadingLatest } = trpc.driverMedicalCerts.latestByDriver.useQuery();
  const utils = trpc.useUtils();

  // Driver create/edit dialog
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [editingDriverId, setEditingDriverId] = useState<number | null>(null);
  const [driverForm, setDriverForm] = useState({ name: "", licenseNumber: "", phone: "", notes: "" });

  const createDriverMutation = trpc.drivers.create.useMutation({
    onSuccess: () => { utils.drivers.list.invalidate(); setDriverDialogOpen(false); toast.success("Driver added"); },
    onError: (err) => toast.error(err.message),
  });
  const updateDriverMutation = trpc.drivers.update.useMutation({
    onSuccess: () => { utils.drivers.list.invalidate(); setDriverDialogOpen(false); toast.success("Driver updated"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteDriverMutation = trpc.drivers.delete.useMutation({
    onSuccess: () => { utils.drivers.list.invalidate(); toast.success("Driver removed"); },
    onError: (err) => toast.error(err.message),
  });

  // Medical cert log/edit dialog
  const [medicalTarget, setMedicalTarget] = useState<{ driverId: number; driverName: string } | null>(null);
  const [editingCertId, setEditingCertId] = useState<number | null>(null);
  const [medForm, setMedForm] = useState({ examDate: Date.now(), expiryDate: addYears(Date.now(), 2), renewalYears: "2" as "1" | "2", examiner: "", notes: "" });

  const createCertMutation = trpc.driverMedicalCerts.create.useMutation({
    onSuccess: () => { utils.driverMedicalCerts.latestByDriver.invalidate(); setMedicalTarget(null); toast.success("Medical cert logged"); },
    onError: (err) => toast.error(err.message),
  });
  const updateCertMutation = trpc.driverMedicalCerts.update.useMutation({
    onSuccess: () => { utils.driverMedicalCerts.latestByDriver.invalidate(); setMedicalTarget(null); toast.success("Medical cert updated"); },
    onError: (err) => toast.error(err.message),
  });

  const loading = loadingDrivers || loadingLatest;

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
  const rows = (drivers ?? []).map(d => {
    const latest = latestByDriver?.[d.id] ?? null;
    let status: Status = "never";
    let daysRemaining: number | null = null;
    if (latest) {
      daysRemaining = Math.floor((latest.expiryDate - now) / DAY_MS);
      if (daysRemaining <= 0) status = "expired";
      else if (daysRemaining <= EXPIRING_SOON_DAYS) status = "expiring_soon";
      else status = "valid";
    }
    return { driver: d, latest, status, daysRemaining };
  }).sort((a, b) => {
    const order: Record<Status, number> = { expired: 0, expiring_soon: 1, never: 2, valid: 3 };
    return order[a.status] - order[b.status];
  });

  // Driver dialog handlers
  const openAddDriver = () => {
    setEditingDriverId(null);
    setDriverForm({ name: "", licenseNumber: "", phone: "", notes: "" });
    setDriverDialogOpen(true);
  };
  const openEditDriver = (d: NonNullable<typeof drivers>[number]) => {
    setEditingDriverId(d.id);
    setDriverForm({ name: d.name, licenseNumber: d.licenseNumber ?? "", phone: d.phone ?? "", notes: d.notes ?? "" });
    setDriverDialogOpen(true);
  };
  const handleSaveDriver = () => {
    if (!driverForm.name.trim()) { toast.error("Enter a driver name"); return; }
    const payload = {
      name: driverForm.name.trim(),
      licenseNumber: driverForm.licenseNumber || undefined,
      phone: driverForm.phone || undefined,
      notes: driverForm.notes || undefined,
    };
    if (editingDriverId) {
      updateDriverMutation.mutate({ id: editingDriverId, ...payload });
    } else {
      createDriverMutation.mutate(payload);
    }
  };
  const handleDeleteDriver = (id: number, name: string) => {
    if (!window.confirm(`Remove ${name}? This won't delete their medical history, just the driver record.`)) return;
    deleteDriverMutation.mutate({ id });
  };

  // Medical cert dialog handlers
  const openLogMedical = (driverId: number, driverName: string) => {
    setEditingCertId(null);
    setMedicalTarget({ driverId, driverName });
    setMedForm({ examDate: Date.now(), expiryDate: addYears(Date.now(), 2), renewalYears: "2", examiner: "", notes: "" });
  };
  const openEditMedical = (driverId: number, driverName: string, cert: NonNullable<typeof latestByDriver>[number]) => {
    setEditingCertId(cert.id);
    setMedicalTarget({ driverId, driverName });
    setMedForm({
      examDate: cert.examDate,
      expiryDate: cert.expiryDate,
      renewalYears: cert.renewalYears as "1" | "2",
      examiner: cert.examiner ?? "",
      notes: cert.notes ?? "",
    });
  };
  const handleExamDateOrIntervalChange = (examDate: number, renewalYears: "1" | "2") => {
    setMedForm({ ...medForm, examDate, renewalYears, expiryDate: addYears(examDate, parseInt(renewalYears)) });
  };
  const handleSaveMedical = () => {
    if (!medicalTarget) return;
    const payload = {
      examDate: medForm.examDate,
      expiryDate: medForm.expiryDate,
      renewalYears: medForm.renewalYears,
      examiner: medForm.examiner || undefined,
      notes: medForm.notes || undefined,
    };
    if (editingCertId) {
      updateCertMutation.mutate({ id: editingCertId, ...payload });
    } else {
      createCertMutation.mutate({ driverId: medicalTarget.driverId, ...payload });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Abstracts</h1>
          <p className="text-muted-foreground text-sm mt-1">Driver records and DOT medical certification status</p>
        </div>
        <Button size="sm" onClick={openAddDriver}>
          <Plus className="h-4 w-4 mr-1" /> Add Driver
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No drivers added yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ driver, latest, status, daysRemaining }) => (
            <Card key={driver.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <UserCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {driver.name}
                      {driver.status === "inactive" && <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {driver.licenseNumber && `Lic# ${driver.licenseNumber} · `}
                      {driver.phone && `${driver.phone} · `}
                      {latest ? (
                        <>
                          Medical exam {new Date(latest.examDate).toLocaleDateString()} ({latest.renewalYears}yr)
                          {" · "}
                          {daysRemaining! <= 0
                            ? `Expired ${new Date(latest.expiryDate).toLocaleDateString()}`
                            : `Expires ${new Date(latest.expiryDate).toLocaleDateString()} (${daysRemaining}d)`}
                        </>
                      ) : (
                        "No medical certificate on file"
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className={STATUS_STYLES[status].className}>{STATUS_STYLES[status].label}</Badge>
                  {latest && (
                    <Button size="sm" variant="ghost" onClick={() => openEditMedical(driver.id, driver.name, latest)}>
                      <HeartPulse className="h-3.5 w-3.5 mr-1" /> Edit Medical
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openLogMedical(driver.id, driver.name)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Log Medical
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDriver(driver)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteDriver(driver.id, driver.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Driver info dialog */}
      <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingDriverId ? "Edit Driver" : "Add Driver"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={driverForm.name} onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>License Number</Label>
                <Input value={driverForm.licenseNumber} onChange={(e) => setDriverForm({ ...driverForm, licenseNumber: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={driverForm.phone} onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={driverForm.notes} onChange={(e) => setDriverForm({ ...driverForm, notes: e.target.value })} />
            </div>
            <Button onClick={handleSaveDriver} disabled={createDriverMutation.isPending || updateDriverMutation.isPending}>
              {createDriverMutation.isPending || updateDriverMutation.isPending ? "Saving..." : editingDriverId ? "Save Changes" : "Add Driver"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Medical cert dialog */}
      <Dialog open={Boolean(medicalTarget)} onOpenChange={(open) => { if (!open) { setMedicalTarget(null); setEditingCertId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {medicalTarget ? `${editingCertId ? "Edit" : "Log"} Medical Cert — ${medicalTarget.driverName}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Exam date</Label>
                <Input
                  type="date"
                  value={new Date(medForm.examDate).toISOString().split("T")[0]}
                  onChange={(e) => handleExamDateOrIntervalChange(new Date(e.target.value).getTime(), medForm.renewalYears)}
                />
              </div>
              <div>
                <Label>Renewal period</Label>
                <Select value={medForm.renewalYears} onValueChange={(v) => handleExamDateOrIntervalChange(medForm.examDate, v as "1" | "2")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 year</SelectItem>
                    <SelectItem value="2">2 years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Expiration date</Label>
              <Input
                type="date"
                value={new Date(medForm.expiryDate).toISOString().split("T")[0]}
                onChange={(e) => setMedForm({ ...medForm, expiryDate: new Date(e.target.value).getTime() })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Suggested based on exam date + renewal period — adjust if your examiner set a different date.
              </p>
            </div>
            <div>
              <Label>Examiner — optional</Label>
              <Input value={medForm.examiner} onChange={(e) => setMedForm({ ...medForm, examiner: e.target.value })} />
            </div>
            <div>
              <Label>Notes — optional</Label>
              <Input value={medForm.notes} onChange={(e) => setMedForm({ ...medForm, notes: e.target.value })} />
            </div>
            <Button onClick={handleSaveMedical} disabled={createCertMutation.isPending || updateCertMutation.isPending}>
              {createCertMutation.isPending || updateCertMutation.isPending
                ? "Saving..."
                : editingCertId ? "Save Changes" : "Log Medical Cert"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
