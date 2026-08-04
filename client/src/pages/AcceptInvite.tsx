import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { setActiveOrgId } from "@/_core/activeOrg";

export default function AcceptInvite() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";

  const { data: invite, isLoading } = trpc.invites.getByToken.useQuery(
    { token },
    { enabled: Boolean(token) }
  );
  const { user, loading: authLoading } = useAuth();

  const acceptMutation = trpc.organizations.acceptInvite.useMutation();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  // Default to "create account" — most invites go to people who've never
  // used Vanlytics before. Flip to login mode once we know for sure the
  // invited email already has an account, rather than making everyone
  // notice and click a toggle link to get to the form they actually need.
  const [creatingAccount, setCreatingAccount] = useState(true);
  useEffect(() => {
    if (invite) setCreatingAccount(!invite.hasExistingAccount);
  }, [invite?.hasExistingAccount]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function goToDashboard(organizationId: number) {
    setActiveOrgId(organizationId);
    window.location.href = "/";
  }

  async function handleAcceptAsLoggedInUser() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await acceptMutation.mutateAsync({ token });
      goToDashboard(result.organizationId);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoggedOutSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const endpoint = creatingAccount ? "/api/invites/accept-signup" : "/api/invites/accept-login";
      const body = creatingAccount ? { token, name, password } : { token, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      goToDashboard(data.organizationId);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-sm text-muted-foreground">Loading invite...</p>
      </div>
    );
  }

  if (!invite || invite.expired || invite.accepted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
          <img src="/logo.png" alt="Vanlytics" className="h-10 w-auto" />
          <h1 className="text-xl font-semibold">Invite not available</h1>
          <p className="text-sm text-muted-foreground">
            {!invite
              ? "This invite link doesn't look right."
              : invite.accepted
                ? "This invite has already been accepted."
                : "This invite has expired. Ask whoever invited you to send a new one."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-6 p-8 max-w-md w-full">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Vanlytics" className="h-10 w-auto" />
          <h1 className="text-2xl font-bold tracking-tight">Vanlytics</h1>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          You've been invited to join <strong>{invite.organizationName}</strong> as{" "}
          <strong>{invite.email}</strong>.
        </p>

        {user && user.email.toLowerCase() === invite.email.toLowerCase() ? (
          <>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleAcceptAsLoggedInUser} disabled={submitting} size="lg" className="w-full">
              {submitting ? "Joining..." : `Join ${invite.organizationName}`}
            </Button>
          </>
        ) : user ? (
          <p className="text-sm text-destructive text-center">
            You're logged in as {user.email}, but this invite is for a different email address.
            Log out and try the link again.
          </p>
        ) : (
          <form onSubmit={handleLoggedOutSubmit} className="w-full flex flex-col gap-4">
            {creatingAccount && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{creatingAccount ? "Choose a password" : "Password"}</Label>
              <Input
                id="password"
                type="password"
                minLength={creatingAccount ? 8 : undefined}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={submitting} className="w-full">
              {submitting ? "Please wait..." : creatingAccount ? "Create account & join" : "Log in & join"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => {
                setError(null);
                setCreatingAccount(!creatingAccount);
              }}
            >
              {creatingAccount
                ? "Already have an account? Log in instead"
                : "Don't have an account yet? Set a password to create one"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
