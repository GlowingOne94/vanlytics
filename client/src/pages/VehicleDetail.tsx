import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentField, fileToBase64 } from "@/components/DocumentField";
import { ArrowLeft, Pencil, Save, Truck, X, Upload, Camera } from "lucide-react";
import { useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "down", label: "Down" },
  { value: "awaiting_parts", label: "Awaiting Parts" },
  { value: "at_shop", label: "At Shop" },
  { value: "retired", label: "Retired" },
];

const healthOptions = [
  { value: "green", label: "Good" },
  { value: "yellow", label: "Fair" },
  { value: "red", label: "Poor" },
];

const healthColors: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

export default function VehicleDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const vehicleId = parseInt(params.id || "0");
  const [editing, setEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: vehicle, isLoading } = trpc.vehicles.getById.useQuery({ id: vehicleId });
  const { data: repairs } = trpc.repairs.list.useQuery({ vehicleId });
  const { data: maintenanceRecords } = trpc.maintenance.getRecords.useQuery({ vehicleId });
  const { data: services } = trpc.maintenance.getServices.useQuery();
  const { data: drivers } = trpc.drivers.list.useQuery();
  const utils = trpc.useUtils();

  const updateMutation = trpc.vehicles.update.useMutation({
    onSuccess: () => {
      utils.vehicles.getById.invalidate({ id: vehicleId });
      setEditing(false);
      toast.success("Vehicle updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const [uploadingDoc, setUploadingDoc] = useState<"title" | "registration" | "insurance" | null>(null);
  const uploadDocMutation = trpc.vehicles.uploadDocument.useMutation({
    onSuccess: () => {
      utils.vehicles.getById.invalidate({ id: vehicleId });
      setUploadingDoc(null);
      toast.success("Document uploaded");
    },
    onError: (err) => { toast.error(err.message); setUploadingDoc(null); },
  });
  const removeDocMutation = trpc.vehicles.removeDocument.useMutation({
    onSuccess: () => {
      utils.vehicles.getById.invalidate({ id: vehicleId });
      toast.success("Document removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDocUpload = async (docType: "title" | "registration" | "insurance", file: File) => {
    setUploadingDoc(docType);
    const { base64, contentType, fileName } = await fileToBase64(file);
    uploadDocMutation.mutate({ vehicleId, docType, fileName, fileBase64: base64, contentType });
  };

  const uploadPhotoMutation = trpc.vehicles.uploadPhoto.useMutation({
    onSuccess: () => {
      utils.vehicles.getById.invalidate({ id: vehicleId });
      toast.success("Photo uploaded");
    },
    onError: (err) => toast.error(err.message),
  });

  const [editForm, setEditForm] = useState<Record<string, any>>({});

  const startEditing = () => {
    if (vehicle) {
      setEditForm({
        vanNumber: vehicle.vanNumber,
        vin: vehicle.vin,
        licensePlate: vehicle.licensePlate || "",
        year: vehicle.year,
        mileage: vehicle.mileage,
        engine: vehicle.engine || "",
        transmission: vehicle.transmission || "",
        assignedDriver: vehicle.assignedDriver || "",
        status: vehicle.status,
        healthScore: vehicle.healthScore,
        insuranceIssued: vehicle.insuranceIssued ? new Date(vehicle.insuranceIssued).toISOString().split("T")[0] : "",
        insuranceExpiry: vehicle.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toISOString().split("T")[0] : "",
        registrationIssued: vehicle.registrationIssued ? new Date(vehicle.registrationIssued).toISOString().split("T")[0] : "",
        registrationExpiry: vehicle.registrationExpiry ? new Date(vehicle.registrationExpiry).toISOString().split("T")[0] : "",
        notes: vehicle.notes || "",
      });
      setEditing(true);
    }
  };

  const saveEdits = () => {
    updateMutation.mutate({
      id: vehicleId,
      ...editForm,
      mileage: parseInt(editForm.mileage) || 0,
      year: parseInt(editForm.year) || 2024,
      insuranceIssued: editForm.insuranceIssued ? new Date(editForm.insuranceIssued).getTime() : undefined,
      insuranceExpiry: editForm.insuranceExpiry ? new Date(editForm.insuranceExpiry).getTime() : undefined,
      registrationIssued: editForm.registrationIssued ? new Date(editForm.registrationIssued).getTime() : undefined,
      registrationExpiry: editForm.registrationExpiry ? new Date(editForm.registrationExpiry).getTime() : undefined,
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadPhotoMutation.mutate({
        vehicleId,
        fileName: file.name,
        fileBase64: base64,
        contentType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Vehicle not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => setLocation("/vehicles")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Fleet
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/vehicles")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            {/* Vehicle Photo */}
            <div
              className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden cursor-pointer relative group"
              onClick={() => fileInputRef.current?.click()}
            >
              {vehicle.photoUrl ? (
                <img src={vehicle.photoUrl} alt={`Van ${vehicle.vanNumber}`} className="h-full w-full object-cover" />
              ) : (
                <Truck className="h-6 w-6 text-primary" />
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-4 w-4 text-white" />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <div>
              <h1 className="text-xl font-bold">Van {vehicle.vanNumber}</h1>
              <p className="text-sm text-muted-foreground">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </p>
            </div>
            <div className={`h-3 w-3 rounded-full ${healthColors[vehicle.healthScore]}`} />
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={saveEdits} disabled={updateMutation.isPending}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="repairs">Repairs ({repairs?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {editing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Van Number</Label>
                    <Input value={editForm.vanNumber} onChange={(e) => setEditForm({ ...editForm, vanNumber: e.target.value })} />
                  </div>
                  <div>
                    <Label>VIN</Label>
                    <Input value={editForm.vin} onChange={(e) => setEditForm({ ...editForm, vin: e.target.value })} />
                  </div>
                  <div>
                    <Label>License Plate</Label>
                    <Input value={editForm.licensePlate} onChange={(e) => setEditForm({ ...editForm, licensePlate: e.target.value })} />
                  </div>
                  <div>
                    <Label>Year</Label>
                    <Input type="number" value={editForm.year} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} />
                  </div>
                  <div>
                    <Label>Mileage</Label>
                    <Input type="number" value={editForm.mileage} onChange={(e) => setEditForm({ ...editForm, mileage: e.target.value })} />
                  </div>
                  <div>
                    <Label>Engine</Label>
                    <Input value={editForm.engine} onChange={(e) => setEditForm({ ...editForm, engine: e.target.value })} />
                  </div>
                  <div>
                    <Label>Transmission</Label>
                    <Input value={editForm.transmission} onChange={(e) => setEditForm({ ...editForm, transmission: e.target.value })} />
                  </div>
                  <div>
                    <Label>Assigned Driver</Label>
                    <Select
                      value={editForm.assignedDriver || undefined}
                      onValueChange={(v) => setEditForm({ ...editForm, assignedDriver: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="No driver assigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No driver assigned</SelectItem>
                        {(drivers ?? [])
                          .filter(d => d.status === "active" || d.name === editForm.assignedDriver)
                          .map((d) => (
                            <SelectItem key={d.id} value={d.name}>
                              {d.name}{d.status !== "active" ? " (inactive)" : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Health</Label>
                    <Select value={editForm.healthScore} onValueChange={(v) => setEditForm({ ...editForm, healthScore: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {healthOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Insurance Issued</Label>
                    <Input type="date" value={editForm.insuranceIssued} onChange={(e) => setEditForm({ ...editForm, insuranceIssued: e.target.value })} />
                  </div>
                  <div>
                    <Label>Insurance Expires</Label>
                    <Input type="date" value={editForm.insuranceExpiry} onChange={(e) => setEditForm({ ...editForm, insuranceExpiry: e.target.value })} />
                  </div>
                  <div>
                    <Label>Registration Issued</Label>
                    <Input type="date" value={editForm.registrationIssued} onChange={(e) => setEditForm({ ...editForm, registrationIssued: e.target.value })} />
                  </div>
                  <div>
                    <Label>Registration Expires</Label>
                    <Input type="date" value={editForm.registrationExpiry} onChange={(e) => setEditForm({ ...editForm, registrationExpiry: e.target.value })} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <InfoRow label="VIN" value={vehicle.vin} />
                  <InfoRow label="License Plate" value={vehicle.licensePlate || "—"} />
                  <InfoRow label="Year" value={String(vehicle.year)} />
                  <InfoRow label="Make / Model" value={`${vehicle.make} ${vehicle.model}`} />
                  <InfoRow label="Mileage" value={`${vehicle.mileage.toLocaleString()} mi`} />
                  <InfoRow label="Engine" value={vehicle.engine || "—"} />
                  <InfoRow label="Transmission" value={vehicle.transmission || "—"} />
                  <InfoRow label="Assigned Driver" value={vehicle.assignedDriver || "—"} />
                  <InfoRow label="Status" value={vehicle.status.replace("_", " ")} />
                  <InfoRow
                    label="Insurance"
                    value={vehicle.insuranceExpiry
                      ? `${vehicle.insuranceIssued ? new Date(vehicle.insuranceIssued).toLocaleDateString() + " – " : ""}${new Date(vehicle.insuranceExpiry).toLocaleDateString()}`
                      : "—"}
                  />
                  <InfoRow
                    label="Registration"
                    value={vehicle.registrationExpiry
                      ? `${vehicle.registrationIssued ? new Date(vehicle.registrationIssued).toLocaleDateString() + " – " : ""}${new Date(vehicle.registrationExpiry).toLocaleDateString()}`
                      : "—"}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DocumentField
                label="Title"
                fileUrl={vehicle.titleDocumentUrl}
                uploading={uploadingDoc === "title"}
                onUpload={(file) => handleDocUpload("title", file)}
                onRemove={() => removeDocMutation.mutate({ vehicleId, docType: "title" })}
              />
              <DocumentField
                label="Registration"
                fileUrl={vehicle.registrationDocumentUrl}
                uploading={uploadingDoc === "registration"}
                onUpload={(file) => handleDocUpload("registration", file)}
                onRemove={() => removeDocMutation.mutate({ vehicleId, docType: "registration" })}
              />
              <DocumentField
                label="Insurance"
                fileUrl={vehicle.insuranceDocumentUrl}
                uploading={uploadingDoc === "insurance"}
                onUpload={(file) => handleDocUpload("insurance", file)}
                onRemove={() => removeDocMutation.mutate({ vehicleId, docType: "insurance" })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="repairs" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {repairs && repairs.length > 0 ? (
                <div className="space-y-4">
                  {repairs.map((r) => (
                    <div key={r.id} className="flex items-start justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{r.complaint || r.category || "Repair"}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(r.date).toLocaleDateString()} · {r.mileage?.toLocaleString() || "—"} mi
                          {r.mechanic && ` · ${r.mechanic}`}
                        </p>
                        {r.diagnosis && <p className="text-xs text-muted-foreground mt-1">{r.diagnosis}</p>}
                        {r.warrantyMonths && r.warrantyMonths > 0 && (
                          <p className="text-xs text-blue-500 mt-1">
                            Warranty: {r.warrantyMonths} months (expires {new Date(r.date + r.warrantyMonths * 30 * 24 * 60 * 60 * 1000).toLocaleDateString()})
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary" className="font-mono">${r.totalCost}</Badge>
                        {r.repairSuccessful === "yes" && (
                          <p className="text-xs text-green-600 mt-1">Successful</p>
                        )}
                        {r.repairSuccessful === "no" && (
                          <p className="text-xs text-red-600 mt-1">Failed</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No repair history</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {maintenanceRecords && maintenanceRecords.length > 0 ? (
                <div className="space-y-4">
                  {maintenanceRecords.map((m) => {
                    const service = services?.find(s => s.id === m.serviceId);
                    return (
                      <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <p className="font-medium text-sm">{service?.name || `Service #${m.serviceId}`}</p>
                          <p className="text-xs text-muted-foreground">
                            Completed: {new Date(m.completedAt).toLocaleDateString()}
                            {m.mileageAtService && ` · ${m.mileageAtService.toLocaleString()} mi`}
                          </p>
                        </div>
                        <div className="text-right">
                          {m.cost && <Badge variant="secondary" className="font-mono">${m.cost}</Badge>}
                          {m.nextDueDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Next: {new Date(m.nextDueDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No maintenance records</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5 capitalize">{value}</p>
    </div>
  );
}
