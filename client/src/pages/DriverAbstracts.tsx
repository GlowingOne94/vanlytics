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
import { UserCircle, Plus, Pencil, Trash2, HeartPulse, FileSearch, IdCard } from "lucide-react";
import { DocumentField, fileToBase64 } from "@/components/DocumentField";
import { useState } from "react";
import { toast } from "sonner";

type Status = "valid" | "expiring_soon" | "expired" | "never";

const STATUS_STYLES: Record<Status, { label: string; className: string }> = {
  valid: { label: "OK", className: "bg-green-500/15 text-green-500 border-green-500/30" },
  expiring_soon: { label: "Due Soon", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  expired: { label: "Expired", className: "bg-red-500/15 text-red-500 border-red-500/30" },
  never: { label: "None on File", className: "bg-muted text-muted-foreground border-border" },
};

const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function addYears(ms: number, years: number) {
  const d = new Date(ms);
  d.setFullYear(d.getFullYear() + years);
  return d.getTime();
}

function statusFor(expiryMs: number | null | undefined, now: number): { status: Status; daysRemaining: number | null } {
  if (!expiryMs) return { status: "never", daysRemaining: null };
  const daysRemaining = Math.floor((expiryMs - now) / DAY_MS);
  if (daysRemaining <= 0) return { status: "expired", daysRemaining };
  if (daysRemaining <= EXPIRING_SOON_DAYS) return { status: "expiring_soon", daysRemaining };
  return { status: "valid", daysRemaining };
}

export default function DriverAbstracts() {
  const { data: drivers, isLoading: loadingDrivers } = trpc.drivers.list.useQuery();
  const { data: latestMedical, isLoading: loadingMedical } = trpc.driverMedicalCerts.latestByDriver.useQuery();
  const { data: latestAbstract, isLoading: loadingAbstract } = trpc.driverAbstracts.latestByDriver.useQuery();
  const utils = trpc.useUtils();

  // Driver create/edit dialog
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [editingDriverId, setEditingDriverId] = useState<number | null>(null);
  const [driverForm, setDriverForm] = useState({
    name: "", licenseNumber: "", phone: "", ssnLast4: "", dateOfBirth: "", cdlExpiry: "", cdlDocumentUrl: null as string | null, notes: "",
  });

  const createDriverMutation = trpc.drivers.create.useMutation({
    onSuccess: (result) => {
      utils.drivers.list.invalidate();
      setEditingDriverId(result.id);
      toast.success("Driver added — you can attach a CDL document below");
    },
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

  const [uploadingCdl, setUploadingCdl] = useState(false);
  const uploadCdlMutation = trpc.drivers.uploadCdlDocument.useMutation({
    onSuccess: (result) => {
      utils.drivers.list.invalidate();
      setUploadingCdl(false);
      setDriverForm(f => ({ ...f, cdlDocumentUrl: result.url }));
      toast.success("CDL document uploaded");
    },
    onError: (err) => { toast.error(err.message); setUploadingCdl(false); },
  });
  const removeCdlMutation = trpc.drivers.removeCdlDocument.useMutation({
    onSuccess: () => {
      utils.drivers.list.invalidate();
      setDriverForm(f => ({ ...f, cdlDocumentUrl: null }));
      toast.success("CDL document removed");
    },
    onError: (err) => toast.error(err.message),
  });
  const handleCdlUpload = async (file: File) => {
    if (!editingDriverId) return;
    setUploadingCdl(true);
    const { base64, contentType, fileName } = await fileToBase64(file);
    uploadCdlMutation.mutate({ driverId: editingDriverId, fileName, fileBase64: base64, contentType });
  };

  // Medical cert dialog
  const [medicalTarget, setMedicalTarget] = useState<{ driverId: number; driverName: string } | null>(null);
  const [editingCertId, setEditingCertId] = useState<number | null>(null);
  const [medForm, setMedForm] = useState({ examDate: Date.now(), expiryDate: addYears(Date.now(), 2), renewalYears: "2" as "1" | "2", examiner: "", notes: "", documentUrl: null as string | null });

  const createCertMutation = trpc.driverMedicalCerts.create.useMutation({
    onSuccess: (result) => {
      utils.driverMedicalCerts.latestByDriver.invalidate();
      setEditingCertId(result.id);
      toast.success("Medical cert logged — you can attach a document below");
    },
    onError: (err) => toast.error(err.message),
  });
  const updateCertMutation = trpc.driverMedicalCerts.update.useMutation({
    onSuccess: () => { utils.driverMedicalCerts.latestByDriver.invalidate(); setMedicalTarget(null); toast.success("Medical cert updated"); },
    onError: (err) => toast.error(err.message),
  });

  const [uploadingCertDoc, setUploadingCertDoc] = useState(false);
  const uploadCertDocMutation = trpc.driverMedicalCerts.uploadDocument.useMutation({
    onSuccess: (result) => {
      utils.driverMedicalCerts.latestByDriver.invalidate();
      setUploadingCertDoc(false);
      setMedForm(f => ({ ...f, documentUrl: result.url }));
      toast.success("Document uploaded");
    },
    onError: (err) => { toast.error(err.message); setUploadingCertDoc(false); },
  });
  const removeCertDocMutation = trpc.driverMedicalCerts.removeDocument.useMutation({
    onSuccess: () => {
      utils.driverMedicalCerts.latestByDriver.invalidate();
      setMedForm(f => ({ ...f, documentUrl: null }));
      toast.success("Document removed");
    },
    onError: (err) => toast.error(err.message),
  });
  const handleCertDocUpload = async (file: File) => {
    if (!editingCertId) return;
    setUploadingCertDoc(true);
    const { base64, contentType, fileName } = await fileToBase64(file);
    uploadCertDocMutation.mutate({ id: editingCertId, fileName, fileBase64: base64, contentType });
  };

  // Abstract (MVR) dialog
  const [abstractTarget, setAbstractTarget] = useState<{ driverId: number; driverName: string } | null>(null);
  const [editingAbstractId, setEditingAbstractId] = useState<number | null>(null);
  const [abstractForm, setAbstractForm] = useState({ pulledDate: Date.now(), nextDueDate: addYears(Date.now(), 1), notes: "", documentUrl: null as string | null });

  const createAbstractMutation = trpc.driverAbstracts.create.useMutation({
    onSuccess: (result) => {
      utils.driverAbstracts.latestByDriver.invalidate();
      setEditingAbstractId(result.id);
      toast.success("Abstract logged — you can attach a document below");
    },
    onError: (err) => toast.error(err.message),
  });
  const updateAbstractMutation = trpc.driverAbstracts.update.useMutation({
    onSuccess: () => { utils.driverAbstracts.latestByDriver.invalidate(); setAbstractTarget(null); toast.success("Abstract updated"); },
    onError: (err) => toast.error(err.message),
  });

  const [uploadingAbstractDoc, setUploadingAbstractDoc] = useState(false);
  const uploadAbstractDocMutation = trpc.driverAbstracts.uploadDocument.useMutation({
    onSuccess: (result) => {
      utils.driverAbstracts.latestByDriver.invalidate();
      setUploadingAbstractDoc(false);
      setAbstractForm(f => ({ ...f, documentUrl: result.url }));
      toast.success("Document uploaded");
    },
    onError: (err) => { toast.error(err.message); setUploadingAbstractDoc(false); },
  });
  const removeAbstractDocMutation = trpc.driverAbstracts.removeDocument.useMutation({
    onSuccess: () => {
      utils.driverAbstracts.latestByDriver.invalidate();
      setAbstractForm(f => ({ ...f, documentUrl: null }));
      toast.success("Document removed");
    },
    onError: (err) => toast.error(err.message),
  });
  const handleAbstractDocUpload = async (file: File) => {
    if (!editingAbstractId) return;
    setUploadingAbstractDoc(true);
    const { base64, contentType, fileName } = await fileToBase64(file);
    uploadAbstractDocMutation.mutate({ id: editingAbstractId, fileName, fileBase64: base64, contentType });
  };

  const loading = loadingDrivers || loadingMedical || loadingAbstract;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const now = Date.now();
  const rows = (drivers ?? []).map(d => {
    const medical = latestMedical?.[d.id] ?? null;
    const abstract = latestAbstract?.[d.id] ?? null;
    return {
      driver: d,
      medical,
      medicalStatus: statusFor(medical?.expiryDate, now),
      cdlStatus: statusFor(d.cdlExpiry, now),
      abstract,
      abstractStatus: statusFor(abstract?.nextDueDate, now),
    };
  }).sort((a, b) => {
    const worst = (r: typeof a) => {
      const order: Record<Status, number> = { expired: 0, expiring_soon: 1, never: 2, valid: 3 };
      return Math.min(order[r.medicalStatus.status], order[r.cdlStatus.status], order[r.abstractStatus.status]);
    };
    return worst(a) - worst(b);
  });

  // Driver dialog handlers
  const openAddDriver = () => {
    setEditingDriverId(null);
    setDriverForm({ name: "", licenseNumber: "", phone: "", ssnLast4: "", dateOfBirth: "", cdlExpiry: "", cdlDocumentUrl: null, notes: "" });
    setDriverDialogOpen(true);
  };
  const openEditDriver = (d: NonNullable<typeof drivers>[number]) => {
    setEditingDriverId(d.id);
    setDriverForm({
      name: d.name,
      licenseNumber: d.licenseNumber ?? "",
      phone: d.phone ?? "",
      ssnLast4: d.ssnLast4 ?? "",
      dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth).toISOString().split("T")[0] : "",
      cdlExpiry: d.cdlExpiry ? new Date(d.cdlExpiry).toISOString().split("T")[0] : "",
      cdlDocumentUrl: d.cdlDocumentUrl ?? null,
      notes: d.notes ?? "",
    });
    setDriverDialogOpen(true);
  };
  const handleSaveDriver = () => {
    if (!driverForm.name.trim()) { toast.error("Enter a driver name"); return; }
    if (driverForm.ssnLast4 && !/^\d{0,4}$/.test(driverForm.ssnLast4)) { toast.error("SSN last 4 must be digits only"); return; }
    const payload = {
      name: driverForm.name.trim(),
      licenseNumber: driverForm.licenseNumber || undefined,
      phone: driverForm.phone || undefined,
      ssnLast4: driverForm.ssnLast4 || undefined,
      dateOfBirth: driverForm.dateOfBirth ? new Date(driverForm.dateOfBirth).getTime() : undefined,
      cdlExpiry: driverForm.cdlExpiry ? new Date(driverForm.cdlExpiry).getTime() : undefined,
      notes: driverForm.notes || undefined,
    };
    if (editingDriverId) {
      updateDriverMutation.mutate({ id: editingDriverId, ...payload });
    } else {
      createDriverMutation.mutate(payload);
    }
  };
  const handleDeleteDriver = (id: number, name: string) => {
    if (!window.confirm(`Remove ${name}? This won't delete their medical/abstract history, just the driver record.`)) return;
    deleteDriverMutation.mutate({ id });
  };

  // Medical cert dialog handlers
  const openLogMedical = (driverId: number, driverName: string) => {
    setEditingCertId(null);
    setMedicalTarget({ driverId, driverName });
    setMedForm({ examDate: Date.now(), expiryDate: addYears(Date.now(), 2), renewalYears: "2", examiner: "", notes: "", documentUrl: null });
  };
  const openEditMedical = (driverId: number, driverName: string, cert: NonNullable<typeof latestMedical>[number]) => {
    setEditingCertId(cert.id);
    setMedicalTarget({ driverId, driverName });
    setMedForm({
      examDate: cert.examDate, expiryDate: cert.expiryDate,
      renewalYears: cert.renewalYears as "1" | "2", examiner: cert.examiner ?? "", notes: cert.notes ?? "",
      documentUrl: cert.documentUrl ?? null,
    });
  };
  const handleExamDateOrIntervalChange = (examDate: number, renewalYears: "1" | "2") => {
    setMedForm({ ...medForm, examDate, renewalYears, expiryDate: addYears(examDate, parseInt(renewalYears)) });
  };
  const handleSaveMedical = () => {
    if (!medicalTarget) return;
    const payload = {
      examDate: medForm.examDate, expiryDate: medForm.expiryDate, renewalYears: medForm.renewalYears,
      examiner: medForm.examiner || undefined, notes: medForm.notes || undefined,
    };
    if (editingCertId) {
      updateCertMutation.mutate({ id: editingCertId, ...payload });
    } else {
      createCertMutation.mutate({ driverId: medicalTarget.driverId, ...payload });
    }
  };

  // Abstract dialog handlers
  const openLogAbstract = (driverId: number, driverName: string) => {
    setEditingAbstractId(null);
    setAbstractTarget({ driverId, driverName });
    setAbstractForm({ pulledDate: Date.now(), nextDueDate: addYears(Date.now(), 1), notes: "", documentUrl: null });
  };
  const openEditAbstract = (driverId: number, driverName: string, abstract: NonNullable<typeof latestAbstract>[number]) => {
    setEditingAbstractId(abstract.id);
    setAbstractTarget({ driverId, driverName });
    setAbstractForm({
      pulledDate: abstract.pulledDate, nextDueDate: abstract.nextDueDate,
      notes: abstract.notes ?? "", documentUrl: abstract.documentUrl ?? null,
    });
  };
  const handlePulledDateChange = (pulledDate: number) => {
    setAbstractForm({ ...abstractForm, pulledDate, nextDueDate: addYears(pulledDate, 1) });
  };
  const handleSaveAbstract = () => {
    if (!abstractTarget) return;
    const payload = { pulledDate: abstractForm.pulledDate, nextDueDate: abstractForm.nextDueDate, notes: abstractForm.notes || undefined };
    if (editingAbstractId) {
      updateAbstractMutation.mutate({ id: editingAbstractId, ...payload });
    } else {
      createAbstractMutation.mutate({ driverId: abstractTarget.driverId, ...payload });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Abstracts</h1>
          <p className="text-muted-foreground text-sm mt-1">Driver records, CDL status, medical certs, and MVR reviews</p>
        </div>
        <Button size="sm" onClick={openAddDriver}>
          <Plus className="h-4 w-4 mr-1" /> Add Driver
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No drivers added yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ driver, medical, medicalStatus, cdlStatus, abstract, abstractStatus }) => (
            <Card key={driver.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <UserCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        {driver.name}
                        {driver.status === "inactive" && <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {driver.licenseNumber && `Lic# ${driver.licenseNumber}`}
                        {driver.phone && ` · ${driver.phone}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t">
                  {/* CDL status */}
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <IdCard className="h-3.5 w-3.5" /> CDL
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[cdlStatus.status].className}`}>
                        {driver.cdlExpiry ? new Date(driver.cdlExpiry).toLocaleDateString() : STATUS_STYLES[cdlStatus.status].label}
                      </Badge>
                    </div>
                  </div>

                  {/* Medical status */}
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <HeartPulse className="h-3.5 w-3.5" /> Medical
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[medicalStatus.status].className}`}>
                        {medical ? new Date(medical.expiryDate).toLocaleDateString() : STATUS_STYLES[medicalStatus.status].label}
                      </Badge>
                      {medical ? (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => openEditMedical(driver.id, driver.name, medical)}>
                          Edit
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => openLogMedical(driver.id, driver.name)}>
                          Log
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Abstract status */}
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FileSearch className="h-3.5 w-3.5" /> Abstract
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[abstractStatus.status].className}`}>
                        {abstract ? new Date(abstract.nextDueDate).toLocaleDateString() : STATUS_STYLES[abstractStatus.status].label}
                      </Badge>
                      {abstract ? (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => openEditAbstract(driver.id, driver.name, abstract)}>
                          Edit
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => openLogAbstract(driver.id, driver.name)}>
                          Log
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Driver info dialog */}
      <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date of Birth</Label>
                <Input type="date" value={driverForm.dateOfBirth} onChange={(e) => setDriverForm({ ...driverForm, dateOfBirth: e.target.value })} />
              </div>
              <div>
                <Label>SSN (last 4)</Label>
                <Input
                  value={driverForm.ssnLast4}
                  maxLength={4}
                  placeholder="1234"
                  onChange={(e) => setDriverForm({ ...driverForm, ssnLast4: e.target.value.replace(/\D/g, "") })}
                />
              </div>
            </div>
            <div>
              <Label>CDL Expiration Date</Label>
              <Input type="date" value={driverForm.cdlExpiry} onChange={(e) => setDriverForm({ ...driverForm, cdlExpiry: e.target.value })} />
            </div>
            {editingDriverId && (
              <DocumentField
                label="CDL Document"
                fileUrl={driverForm.cdlDocumentUrl}
                uploading={uploadingCdl}
                onUpload={handleCdlUpload}
                onRemove={() => removeCdlMutation.mutate({ driverId: editingDriverId })}
              />
            )}
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
            <DialogTitle>{medicalTarget ? `${editingCertId ? "Edit" : "Log"} Medical Cert — ${medicalTarget.driverName}` : ""}</DialogTitle>
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
              <p className="text-xs text-muted-foreground mt-1">Suggested from exam date + renewal period — adjust if needed.</p>
            </div>
            <div>
              <Label>Examiner — optional</Label>
              <Input value={medForm.examiner} onChange={(e) => setMedForm({ ...medForm, examiner: e.target.value })} />
            </div>
            <div>
              <Label>Notes — optional</Label>
              <Input value={medForm.notes} onChange={(e) => setMedForm({ ...medForm, notes: e.target.value })} />
            </div>
            {editingCertId && (
              <DocumentField
                label="Medical Cert Document"
                fileUrl={medForm.documentUrl}
                uploading={uploadingCertDoc}
                onUpload={handleCertDocUpload}
                onRemove={() => removeCertDocMutation.mutate({ id: editingCertId })}
              />
            )}
            <Button onClick={handleSaveMedical} disabled={createCertMutation.isPending || updateCertMutation.isPending}>
              {createCertMutation.isPending || updateCertMutation.isPending ? "Saving..." : editingCertId ? "Save Changes" : "Log Medical Cert"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Abstract (MVR) dialog */}
      <Dialog open={Boolean(abstractTarget)} onOpenChange={(open) => { if (!open) { setAbstractTarget(null); setEditingAbstractId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{abstractTarget ? `${editingAbstractId ? "Edit" : "Log"} Abstract (MVR) — ${abstractTarget.driverName}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Date pulled</Label>
              <Input
                type="date"
                value={new Date(abstractForm.pulledDate).toISOString().split("T")[0]}
                onChange={(e) => handlePulledDateChange(new Date(e.target.value).getTime())}
              />
            </div>
            <div>
              <Label>Next review due</Label>
              <Input
                type="date"
                value={new Date(abstractForm.nextDueDate).toISOString().split("T")[0]}
                onChange={(e) => setAbstractForm({ ...abstractForm, nextDueDate: new Date(e.target.value).getTime() })}
              />
              <p className="text-xs text-muted-foreground mt-1">Suggested one year out — adjust if needed.</p>
            </div>
            <div>
              <Label>Notes — optional</Label>
              <Input
                value={abstractForm.notes}
                placeholder="e.g. clean record, violations noted, points"
                onChange={(e) => setAbstractForm({ ...abstractForm, notes: e.target.value })}
              />
            </div>
            {editingAbstractId && (
              <DocumentField
                label="Abstract Document"
                fileUrl={abstractForm.documentUrl}
                uploading={uploadingAbstractDoc}
                onUpload={handleAbstractDocUpload}
                onRemove={() => removeAbstractDocMutation.mutate({ id: editingAbstractId })}
              />
            )}
            <Button onClick={handleSaveAbstract} disabled={createAbstractMutation.isPending || updateAbstractMutation.isPending}>
              {createAbstractMutation.isPending || updateAbstractMutation.isPending
                ? "Saving..."
                : editingAbstractId ? "Save Changes" : "Log Abstract"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
