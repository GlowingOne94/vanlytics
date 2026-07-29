import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputOTP, InputOTPGroup, InputOTPSlot,
} from "@/components/ui/input-otp";
import { useTheme } from "@/contexts/ThemeContext";
import { Truck, Clock, LogOut, Sun, Moon, AlertCircle, Smartphone, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { toast } from "sonner";

// A stable identifier for this phone/browser, scoped per org so the same
// device visiting two different orgs' portal links registers separately.
// Persisted in localStorage — inside the Expo wrapper's WebView this
// survives app restarts (it only resets if the app is reinstalled or its
// data is cleared).
function getOrCreateDeviceId(slug: string): string {
  const key = `driver_device_id_${slug}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function deviceCode(deviceId: string): string {
  const hex = deviceId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

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

  const [deviceId] = useState(() => getOrCreateDeviceId(slug ?? "unknown"));
  const [deviceStatus, setDeviceStatus] = useState<
    { assigned: false } | { assigned: true; driverName: string; hasPin: boolean } | null
  >(null);

  const registerDeviceMutation = trpc.driverPortal.registerDevice.useMutation({
    onSuccess: (result) => setDeviceStatus(result),
    onError: () => setDeviceStatus({ assigned: false }),
  });

  useEffect(() => {
    if (org?.id && !loadingMe && !me) {
      registerDeviceMutation.mutate({ organizationId: org.id, deviceId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id, loadingMe, me]);

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
      ) : !deviceStatus ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !deviceStatus.assigned ? (
        <WaitingForAssignmentScreen
          deviceId={deviceId}
          onCheckAgain={() => registerDeviceMutation.mutate({ organizationId: org.id, deviceId })}
          checking={registerDeviceMutation.isPending}
        />
      ) : !deviceStatus.hasPin ? (
        <Card className="w-full">
          <CardContent className="p-6 text-center space-y-2">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">PIN not set up yet</p>
            <p className="text-sm text-muted-foreground">
              This device is linked to {deviceStatus.driverName}, but no PIN has been set. Ask your dispatcher to set one from Driver Abstracts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <LoginScreen
          organizationId={org.id}
          deviceId={deviceId}
          driverName={deviceStatus.driverName}
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
          onClick={() => toggleTheme?.()}
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

function WaitingForAssignmentScreen({
  deviceId, onCheckAgain, checking,
}: { deviceId: string; onCheckAgain: () => void; checking: boolean }) {
  return (
    <Card className="w-full">
      <CardContent className="p-6 text-center space-y-4">
        <Smartphone className="h-8 w-8 mx-auto text-muted-foreground" />
        <div>
          <p className="font-medium">This device isn't set up yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Tell your dispatcher this device code so they can link it to you:
          </p>
        </div>
        <p className="text-2xl font-mono font-bold tracking-wider">{deviceCode(deviceId)}</p>
        <Button variant="outline" onClick={onCheckAgain} disabled={checking} className="w-full">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Checking..." : "Check again"}
        </Button>
      </CardContent>
    </Card>
  );
}

function LoginScreen({
  organizationId, deviceId, driverName, onLoggedIn,
}: { organizationId: number; deviceId: string; driverName: string; onLoggedIn: () => void }) {
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
    loginMutation.mutate({ organizationId, deviceId, pin: value });
  };

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
      </CardContent>
    </Card>
  );
}

function ShiftScreen({ driverName, onLoggedOut }: { driverName: string; onLoggedOut: () => void }) {
  const utils = trpc.useUtils();
  const { data: openShift, isLoading: loadingShift } = trpc.driverPortal.myOpenShift.useQuery();
  const { data: assignedVehicle, isLoading: loadingVehicle } = trpc.driverPortal.myAssignedVehicle.useQuery();

  const logoutMutation = trpc.driverPortal.logout.useMutation({
    onSuccess: () => onLoggedOut(),
  });

  const [startMileage, setStartMileage] = useState("");
  const [endMileage, setEndMileage] = useState("");
  const [clockingOut, setClockingOut] = useState(false);

  const clockInMutation = trpc.driverPortal.clockIn.useMutation({
    onSuccess: (result) => {
      utils.driverPortal.myOpenShift.invalidate();
      toast.success(`Clocked in to Van ${result.vanNumber} — drive safe`);
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
    if (assignedVehicle && !startMileage) {
      setStartMileage(String(assignedVehicle.mileage));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedVehicle?.id]);

  if (loadingShift || loadingVehicle) {
    return <Skeleton className="h-56 w-full rounded-xl" />;
  }

  const handleClockIn = () => {
    const mileage = parseInt(startMileage, 10);
    if (!Number.isFinite(mileage) || mileage < 0) { toast.error("Enter a valid starting mileage"); return; }
    clockInMutation.mutate({ startMileage: mileage });
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
          <LogOut className="h-3.5 w-3.5 mr-1" /> Log out
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
      ) : !assignedVehicle ? (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">No van assigned</p>
            <p className="text-sm text-muted-foreground">
              You don't have a van assigned yet. Contact dispatch to get set up before clocking in.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4" /> Van {assignedVehicle.vanNumber}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
