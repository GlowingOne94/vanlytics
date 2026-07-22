import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Vehicles from "./pages/Vehicles";
import VehicleDetail from "./pages/VehicleDetail";
import Repairs from "./pages/Repairs";
import Maintenance from "./pages/Maintenance";
import DotInspections from "./pages/DotInspections";
import Shops from "./pages/Shops";
import CostIntelligence from "./pages/CostIntelligence";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import Advisor from "./pages/Advisor";
import Team from "./pages/Team";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";

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

function Router() {
  return (
    <Switch>
      {/* These two pages must render regardless of login state — a visitor
          resetting a password or accepting an invite may not have an active
          session yet. Everything else requires auth, gated inside
          DashboardLayout. */}
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/accept-invite" component={AcceptInvite} />
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
