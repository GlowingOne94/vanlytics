import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getActiveOrgId } from "@/_core/activeOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Users, Clock, Trash2, Settings, DollarSign, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function Team() {
  const activeOrgId = getActiveOrgId();
  const { data: memberships } = trpc.organizations.list.useQuery();
  const currentMembership = memberships?.find(m => m.organizationId === activeOrgId);
  const isAdmin = currentMembership?.role === "admin";

  const { data: members, isLoading: membersLoading } = trpc.organizations.members.useQuery();
  const { data: pendingInvites } = trpc.organizations.pendingInvites.useQuery(undefined, {
    enabled: isAdmin,
  });
  const { data: orgSettings } = trpc.organizations.getSettings.useQuery();
  const { data: billingStatus } = trpc.billing.getStatus.useQuery(undefined, { enabled: isAdmin });

  const utils = trpc.useUtils();

  const updateSettingsMutation = trpc.organizations.updateSettings.useMutation({
    onSuccess: () => {
      utils.organizations.getSettings.invalidate();
      toast.success("Settings updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const checkoutMutation = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (result) => { if (result.url) window.location.href = result.url; },
    onError: (err) => toast.error(err.message),
  });

  const portalMutation = trpc.billing.createPortalSession.useMutation({
    onSuccess: (result) => { if (result.url) window.location.href = result.url; },
    onError: (err) => toast.error(err.message),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");

  const inviteMutation = trpc.organizations.invite.useMutation({
    onSuccess: () => {
      toast.success(`Invite sent to ${email}`);
      setEmail("");
      setRole("user");
      utils.organizations.pendingInvites.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const revokeMutation = trpc.organizations.revokeInvite.useMutation({
    onSuccess: () => {
      toast.success("Invite revoked");
      utils.organizations.pendingInvites.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const handleInvite = () => {
    if (!email) {
      toast.error("Enter an email address");
      return;
    }
    inviteMutation.mutate({ email, role });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {currentMembership?.organizationName ?? "Your company"} — manage who has access
        </p>
      </div>

      {isAdmin && orgSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" /> Organization Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">Business type</Label>
              <Select
                value={orgSettings.industryType}
                onValueChange={(v) => updateSettingsMutation.mutate({ industryType: v as "nemt" | "other" })}
              >
                <SelectTrigger className="w-full sm:w-[280px] mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nemt">NEMT / Medical Transportation</SelectItem>
                  <SelectItem value="other">Other Fleet Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4 pt-2 border-t">
              <div>
                <p className="text-sm font-medium">Track driver medical certifications</p>
                <p className="text-xs text-muted-foreground">
                  Shows medical-cert tracking on the Driver Abstracts page. Turn off if your drivers don't require DOT medical cards.
                </p>
              </div>
              <Switch
                checked={orgSettings.enabledModules.driverMedical}
                onCheckedChange={(checked) => updateSettingsMutation.mutate({ enabledModules: { driverMedical: checked } })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Billing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Current plan: <span className="font-medium capitalize">{(billingStatus?.planTier ?? "none").replace("_", " ")}</span>
              {billingStatus?.subscriptionStatus && (
                <span className="text-muted-foreground"> ({billingStatus.subscriptionStatus})</span>
              )}
            </p>
            {billingStatus?.isGrandfathered ? (
              <p className="text-sm text-green-600 flex items-center gap-1.5">
                <Check className="h-4 w-4" /> This account is grandfathered — exempt from billing and any future plan limits.
              </p>
            ) : billingStatus?.hasStripeCustomer ? (
              <Button size="sm" variant="outline" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
                {portalMutation.isPending ? "Loading..." : "Manage Billing"}
              </Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(["starter", "fleet", "fleet_pro"] as const).map(plan => (
                  <Button
                    key={plan}
                    size="sm"
                    variant="outline"
                    disabled={checkoutMutation.isPending}
                    onClick={() => checkoutMutation.mutate({ plan })}
                  >
                    Subscribe — {plan.replace("_", " ")}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Invite a teammate
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label className="sr-only">Email</Label>
              <Input
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <Select value={role} onValueChange={v => setRole(v as "user" | "admin")}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleInvite} disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? "Sending..." : "Send invite"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Members
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {membersLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : members && members.length > 0 ? (
            members.map(m => (
              <div key={m.userId} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{m.name || m.email}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No members found.</p>
          )}
        </CardContent>
      </Card>

      {isAdmin && pendingInvites && pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Pending invites
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <p className="text-sm">{inv.email}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">{inv.role}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={revokeMutation.isPending}
                    onClick={() => {
                      if (!window.confirm(`Revoke the invite for ${inv.email}?`)) return;
                      revokeMutation.mutate({ id: inv.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
