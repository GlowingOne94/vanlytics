import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { AuthGate } from "./components/AuthGate";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Vehicles from "./pages/Vehicles";
import VehicleDetail from "./pages/VehicleDetail";
import Repairs from "./pages/Repairs";
import Maintenance from "./pages/Maintenance";
import DotInspections from "./pages/DotInspections";
import DriverAbstracts from "./pages/DriverAbstracts";
import Shops from "./pages/Shops";
import CostIntelligence from "./pages/CostIntelligence";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import Advisor from "./pages/Advisor";
import Team from "./pages/Team";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import Marketing from "./pages/Marketing";

function AuthenticatedApp() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/vehicles" component={Vehicles} />
        <Route path="/vehicles/:id" component={VehicleDetail} />
        <Route path="/repairs" component={Repairs} />
        <Route path="/maintenance" component={Maintenance} />
        <Route path="/dot-inspections" component={DotInspections} />
        <Route path="/drivers" component={DriverAbstracts} />
        <Route path="/shops" component={Shops} />
        <Route path="/costs" component={CostIntelligence} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/advisor" component={Advisor} />
        <Route path="/team" component={Team} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

// The root path shows different things depending on who's visiting: a
// public marketing/pricing page for anonymous visitors (so potential
// customers landing on the domain see the product, not a bare login form),
// and the actual dashboard for signed-in users.
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <Marketing />;
  return <AuthenticatedApp />;
}

// A dedicated, linkable login/signup URL for marketing page CTAs. Redirects
// away automatically if the visitor is already signed in.
function LoginRoute() {
  const { user, loading, refresh } = useAuth();
  const [, setLocation] = useLocation();
  if (loading) return <DashboardLayoutSkeleton />;
  if (user) {
    setLocation("/");
    return null;
  }
  return (
    <AuthGate
      onAuthenticated={() => {
        refresh();
        setLocation("/");
      }}
    />
  );
}

function Router() {
  return (
    <Switch>
      {/* These pages must render regardless of login state. */}
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/accept-invite" component={AcceptInvite} />
      <Route path="/pricing" component={Marketing} />
      <Route path="/login" component={LoginRoute} />
      <Route path="/" component={RootRoute} />
      <Route>
        <AuthenticatedApp />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
