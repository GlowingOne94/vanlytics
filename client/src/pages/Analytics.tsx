import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Download, TrendingUp, DollarSign, Activity } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

// Recharts' default tooltip box is always white/light — without this, dark
// mode's light-gray text color makes it unreadable against that background.
const tooltipStyle = {
  contentStyle: { backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, color: "#111" },
  itemStyle: { color: "#111" },
  labelStyle: { color: "#111", fontWeight: 600 },
};

export default function Analytics() {
  const { theme } = useTheme();
  const dotColor = theme === "dark" ? "#fff" : "#000";
  const { data: monthlySpending, isLoading: loadingMonthly } = trpc.analytics.monthlySpending.useQuery({ months: 12 });
  const { data: costByVehicle } = trpc.analytics.costByVehicle.useQuery();
  const { data: costByCategory } = trpc.analytics.costByCategory.useQuery();
  const { data: shopComparison } = trpc.analytics.shopComparison.useQuery();
  const { data: costPerMile } = trpc.analytics.costPerMile.useQuery();
  const { data: repairFrequency } = trpc.analytics.repairFrequency.useQuery();
  const { data: partsVsLabor } = trpc.analytics.partsVsLabor.useQuery();

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      monthlySpending,
      costByVehicle,
      costByCategory,
      shopComparison,
      costPerMile,
      repairFrequency,
      partsVsLabor,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fleet-report-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!costByVehicle) return;
    const headers = "Vehicle,Total Cost,Repair Count,Cost Per Mile\n";
    const cpmData = costPerMile || [];
    const rows = costByVehicle.map(v => {
      const cpm = cpmData.find(c => c.vanNumber === v.vanNumber);
      return `Van ${v.vanNumber},$${v.total},${v.count},${cpm ? `$${cpm.costPerMile}` : "N/A"}`;
    }).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fleet-costs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics & Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Fleet performance insights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportReport}>
            <Download className="h-4 w-4 mr-1" /> Full Report
          </Button>
        </div>
      </div>

      {/* Parts vs Labor Summary */}
      {partsVsLabor && (partsVsLabor.totalParts > 0 || partsVsLabor.totalLabor > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Parts Cost</p>
              <p className="text-xl font-bold mt-1">${partsVsLabor.totalParts.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Labor Cost</p>
              <p className="text-xl font-bold mt-1">${partsVsLabor.totalLabor.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Tax</p>
              <p className="text-xl font-bold mt-1">${partsVsLabor.totalTax.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monthly Spending */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Monthly Repair Spending
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMonthly ? (
            <Skeleton className="h-64" />
          ) : monthlySpending && monthlySpending.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlySpending}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Spend"]} {...tooltipStyle} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No data available yet</p>
          )}
        </CardContent>
      </Card>

      {/* Repair Frequency Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" /> Repair Frequency Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          {repairFrequency && repairFrequency.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={repairFrequency}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [`${value} repairs`, "Count"]} {...tooltipStyle} />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: dotColor }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No repair frequency data yet</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category Breakdown Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {costByCategory && costByCategory.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={costByCategory.slice(0, 8)}
                      dataKey="total"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                    >
                      {costByCategory.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {costByCategory.slice(0, 8).map((c, i) => (
                    <div key={c.category} className="flex items-center gap-2 text-xs">
                      <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span>{c.category}</span>
                      <span className="text-muted-foreground">${c.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Shop Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Shop Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {shopComparison && shopComparison.length > 0 ? (
              <div className="space-y-3">
                {shopComparison.map((s, i) => (
                  <div key={s.shopId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-4">#{i + 1}</span>
                      <span className="text-sm font-medium">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{s.successRate}%</Badge>
                      <Badge variant="secondary" className="font-mono text-xs">${s.avgCost}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No shop data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost Per Mile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Cost Per Mile
          </CardTitle>
        </CardHeader>
        <CardContent>
          {costPerMile && costPerMile.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Vehicle</th>
                    <th className="text-right py-2 font-medium">Mileage</th>
                    <th className="text-right py-2 font-medium">Total Cost</th>
                    <th className="text-right py-2 font-medium">Cost/Mile</th>
                  </tr>
                </thead>
                <tbody>
                  {costPerMile.slice(0, 15).map((v) => (
                    <tr key={v.vehicleId} className="border-b border-border/50">
                      <td className="py-2">Van {v.vanNumber}</td>
                      <td className="text-right py-2 text-muted-foreground">{v.mileage.toLocaleString()}</td>
                      <td className="text-right py-2">${v.totalCost.toLocaleString()}</td>
                      <td className="text-right py-2 font-mono">
                        <Badge variant={v.costPerMile > 0.1 ? "destructive" : "secondary"} className="text-xs">
                          ${v.costPerMile.toFixed(4)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No cost-per-mile data (requires vehicles with mileage and repair records)</p>
          )}
        </CardContent>
      </Card>

      {/* Vehicle Cost Ranking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Vehicle Cost Ranking
          </CardTitle>
        </CardHeader>
        <CardContent>
          {costByVehicle && costByVehicle.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, costByVehicle.slice(0, 15).length * 32)}>
              <BarChart data={costByVehicle.slice(0, 15)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="vanNumber" tick={{ fontSize: 11 }} width={60} tickFormatter={(v) => `Van ${v}`} />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Total Cost"]} {...tooltipStyle} />
                <Bar dataKey="total" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No vehicle cost data</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
