import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  InputOTP, InputOTPGroup, InputOTPSlot,
} from "@/components/ui/input-otp";
import { useTheme } from "@/contexts/ThemeContext";
import { Truck, Clock, LogOut, Sun, Moon, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { toast } from "sonner";

function useElapsed(sinceMs: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sinceMs) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [sinceMs]);
  if (!sinceMs) return "";
  const totalSeconds = Math.max(0, Math.floor((now - sinceMs) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export default function DriverPortal() {
  const { slug } = useParams<{ slug: string }>();
  const { theme, toggleTheme } = useTheme();
  const utils = trpc.useUtils();

  const { data: org, isLoading: loadingOrg } = trpc.driverPortal.getOrgBySlug.useQuery(
    { slug: slug ?? "" },
    { enabled: Boolean(slug) }
  );
  const { data: me, isLoading: loadingMe } = trpc.driverPortal.me.useQuery();

  if (loadingOrg || loadingMe) {
    return (
      <PortalShell theme={theme} toggleTheme={toggleTheme}>
        <Skeleton className="h-40 w-full max-w-sm rounded-xl" />
      </PortalShell>
    );
  }

  if (!org) {
    return (
      <PortalShell theme={theme} toggleTheme={toggleTheme}>
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 text-center space-y-2">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">Link not found</p>
            <p className="text-sm text-muted-foreground">
              This driver portal link isn't valid. Check the link with your dispatcher.
            </p>
          </CardContent>
        </Card>
      </PortalShell>
    );
  }

  return (
    <PortalShell theme={theme} toggleTheme={toggleTheme} orgName={org.name}>
      {me ? (
        <ShiftScreen
          driverName={me.name}
          onLoggedOut={() => utils.driverPortal.me.invalidate()}
        />
      ) : (
        <LoginScreen
          organizationId={org.id}
          onLoggedIn={() => utils.driverPortal.me.invalidate()}
        />
      )}
    </PortalShell>
  );
}

function PortalShell({
  children, theme, toggleTheme, orgName,
}: {
  children: React.ReactNode;
  theme: string;
  toggleTheme?: () => void;
  orgName?: string;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center bg-background px-4 py-8">
      <div className="w-full max-w-sm flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Vanlytics" className="h-6 w-auto" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{orgName ?? "Vanlytics"}</p>
            <p className="text-xs text-muted-foreground">Driver Portal</p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      <div className="w-full max-w-sm flex-1 flex items-start justify-center">
        {children}
      </div>
    </div>
  );
}

function LoginScreen({ organizationId, onLoggedIn }: { organizationId: number; onLoggedIn: () => void }) {
  const { data: drivers, isLoading } = trpc.driverPortal.listDrivers.useQuery({ organizationId });
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [pin, setPin] = useState("");

  const loginMutation = trpc.driverPortal.login.useMutation({
    onSuccess: (result) => {
      toast.success(`Welcome, ${result.driverName}`);
      onLoggedIn();
    },
    onError: (err) => {
      toast.error(err.message);
      setPin("");
    },
  });

  const handlePinComplete = (value: string) => {
    if (!selectedDriverId) return;
    loginMutation.mutate({ organizationId, driverId: selectedDriverId, pin: value });
  };

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  if (!selectedDriverId) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">Who's driving?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!drivers || drivers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No drivers have portal access yet. Ask your dispatcher to set up your PIN.
            </p>
          ) : (
            drivers.map((d) => (
              <Button
                key={d.id}
                variant="outline"
                className="w-full h-12 justify-start text-base"
                onClick={() => setSelectedDriverId(d.id)}
              >
                {d.name}
              </Button>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  const driverName = drivers?.find((d) => d.id === selectedDriverId)?.name ?? "";

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base">Enter PIN — {driverName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 flex flex-col items-center">
        <InputOTP
          maxLength={4}
          value={pin}
          onChange={(value) => setPin(value)}
          onComplete={handlePinComplete}
          disabled={loginMutation.isPending}
          inputMode="numeric"
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
            <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
            <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
            <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
          </InputOTPGroup>
        </InputOTP>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setSelectedDriverId(null); setPin(""); }}
          disabled={loginMutation.isPending}
        >
          Not you? Pick a different name
        </Button>
      </CardContent>
    </Card>
  );
}

function ShiftScreen({ driverName, onLoggedOut }: { driverName: string; onLoggedOut: () => void }) {
  const utils = trpc.useUtils();
  const { data: openShift, isLoading: loadingShift } = trpc.driverPortal.myOpenShift.useQuery();
  const { data: vehicles, isLoading: loadingVehicles } = trpc.driverPortal.activeVehicles.useQuery();

  const logoutMutation = trpc.driverPortal.logout.useMutation({
    onSuccess: () => onLoggedOut(),
  });

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [startMileage, setStartMileage] = useState("");
  const [endMileage, setEndMileage] = useState("");
  const [clockingOut, setClockingOut] = useState(false);

  const clockInMutation = trpc.driverPortal.clockIn.useMutation({
    onSuccess: () => {
      utils.driverPortal.myOpenShift.invalidate();
      toast.success("Clocked in — drive safe");
    },
    onError: (err) => toast.error(err.message),
  });

  const clockOutMutation = trpc.driverPortal.clockOut.useMutation({
    onSuccess: (result) => {
      utils.driverPortal.myOpenShift.invalidate();
      setClockingOut(false);
      setEndMileage("");
      toast.success(`Clocked out — ${result.milesDriven} miles logged`);
    },
    onError: (err) => toast.error(err.message),
  });

  const elapsed = useElapsed(openShift ? new Date(openShift.clockInAt).getTime() : null);

  useEffect(() => {
    if (selectedVehicleId && !startMileage) {
      const v = vehicles?.find((v) => String(v.id) === selectedVehicleId);
      if (v) setStartMileage(String(v.mileage));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicleId]);

  if (loadingShift || loadingVehicles) {
    return <Skeleton className="h-56 w-full rounded-xl" />;
  }

  const handleClockIn = () => {
    const vehicleId = parseInt(selectedVehicleId, 10);
    const mileage = parseInt(startMileage, 10);
    if (!vehicleId) { toast.error("Pick your van"); return; }
    if (!Number.isFinite(mileage) || mileage < 0) { toast.error("Enter a valid starting mileage"); return; }
    clockInMutation.mutate({ vehicleId, startMileage: mileage });
  };

  const handleClockOut = () => {
    if (!openShift) return;
    const mileage = parseInt(endMileage, 10);
    if (!Number.isFinite(mileage) || mileage < openShift.startMileage) {
      toast.error(`Enter a mileage of at least ${openShift.startMileage}`);
      return;
    }
    clockOutMutation.mutate({ shiftId: openShift.id, endMileage: mileage });
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Hi, {driverName}</p>
        <Button variant="ghost" size="sm" onClick={() => logoutMutation.mutate()}>
          <LogOut className="h-3.5 w-3.5 mr-1" /> Switch driver
        </Button>
      </div>

      {openShift ? (
        <Card>
          <CardContent className="p-5 space-y-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Currently clocked in</p>
              <p className="text-2xl font-bold mt-1 flex items-center justify-center gap-2">
                <Truck className="h-5 w-5" /> Van {openShift.vanNumber}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-3xl font-mono font-semibold tabular-nums">
              <Clock className="h-6 w-6 text-muted-foreground" />
              {elapsed}
            </div>
            <p className="text-sm text-muted-foreground">
              Started at {new Date(openShift.clockInAt).toLocaleTimeString()} · Odometer in: {openShift.startMileage}
            </p>

            {!clockingOut ? (
              <Button className="w-full h-12 text-base" variant="destructive" onClick={() => setClockingOut(true)}>
                Clock Out
              </Button>
            ) : (
              <div className="space-y-3 text-left">
                <div>
                  <Label>Ending mileage (odometer)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="h-12 text-lg"
                    value={endMileage}
                    autoFocus
                    onChange={(e) => setEndMileage(e.target.value)}
                    placeholder={`${openShift.startMileage} or higher`}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setClockingOut(false)}>Cancel</Button>
                  <Button
                    className="flex-1"
                    onClick={handleClockOut}
                    disabled={clockOutMutation.isPending}
                  >
                    {clockOutMutation.isPending ? "Saving..." : "Confirm"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start your shift</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Which van?</Label>
              <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select a van" /></SelectTrigger>
                <SelectContent>
                  {(vehicles ?? []).map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>Van {v.vanNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Starting mileage (odometer)</Label>
              <Input
                type="number"
                inputMode="numeric"
                className="h-12 text-lg"
                value={startMileage}
                onChange={(e) => setStartMileage(e.target.value)}
              />
            </div>
            <Button className="w-full h-12 text-base" onClick={handleClockIn} disabled={clockInMutation.isPending}>
              {clockInMutation.isPending ? "Clocking in..." : "Clock In"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
