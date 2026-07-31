import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Truck, BarChart3 } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

// Recharts' default tooltip box is always white/light — without this, dark
// mode's light-gray text color makes it unreadable against that background.
const tooltipStyle = {
  contentStyle: { backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, color: "#111" },
  itemStyle: { color: "#111" },
  labelStyle: { color: "#111", fontWeight: 600 },
};

export default function CostIntelligence() {
  const { theme } = useTheme();
  const dotColor = theme === "dark" ? "#fff" : "#000";
  const { data: monthlySpending, isLoading: loadingMonthly } = trpc.analytics.monthlySpending.useQuery({ months: 12 });
  const { data: costByVehicle, isLoading: loadingVehicle } = trpc.analytics.costByVehicle.useQuery();
  const { data: costPerMile, isLoading: loadingCostPerMile } = trpc.analytics.costPerMile.useQuery();
  const { data: costByCategory, isLoading: loadingCategory } = trpc.analytics.costByCategory.useQuery();
  const { data: shopComparison } = trpc.analytics.shopComparison.useQuery();
  const { data: averagePricing } = trpc.analytics.averagePricing.useQuery();

  const totalSpend = monthlySpending?.reduce((sum, m) => sum + m.total, 0) ?? 0;
  const avgMonthly = monthlySpending && monthlySpending.length > 0 ? totalSpend / monthlySpending.length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cost Intelligence</h1>
        <p className="text-muted-foreground text-sm mt-1">Fleet spending analysis and trends</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend (12mo)</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${Math.round(totalSpend).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Monthly</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${Math.round(avgMonthly).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Category</CardTitle>
            <BarChart3 className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{costByCategory?.[0]?.category || "—"}</div>
            <p className="text-xs text-muted-foreground">${Math.round(costByCategory?.[0]?.total || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Spending Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Monthly Spending Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMonthly ? (
            <Skeleton className="h-64" />
          ) : monthlySpending && monthlySpending.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlySpending}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Spend"]} {...tooltipStyle} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: dotColor }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No spending data available</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cost by Vehicle */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4" /> Cost by Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingVehicle ? (
              <Skeleton className="h-48" />
            ) : costByVehicle && costByVehicle.length > 0 ? (
              <div className="space-y-3">
                {costByVehicle.slice(0, 10).map((v) => (
                  <div key={v.vehicleId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Van {v.vanNumber}</span>
                      <span className="text-xs text-muted-foreground">
                        (${Math.round(v.repairTotal).toLocaleString()} repairs + ${Math.round(v.tollTotal).toLocaleString()} tolls)
                      </span>
                    </div>
                    <Badge variant="secondary" className="font-mono">${Math.round(v.total).toLocaleString()}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Cost by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Cost by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCategory ? (
              <Skeleton className="h-48" />
            ) : costByCategory && costByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={costByCategory.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Total"]} {...tooltipStyle} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Cost Per Mile */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4" /> Cost Per Mile
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCostPerMile ? (
              <Skeleton className="h-48" />
            ) : costPerMile && costPerMile.length > 0 ? (
              <div className="space-y-3">
                {costPerMile.slice(0, 10).map((v) => (
                  <div key={v.vehicleId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Van {v.vanNumber}</span>
                      <span className="text-xs text-muted-foreground">
                        (${Math.round(v.totalCost).toLocaleString()} / {v.mileage.toLocaleString()} mi, since {new Date(v.trackingStartAt).toLocaleDateString()})
                      </span>
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      {v.costPerMile != null ? `$${v.costPerMile.toFixed(2)}/mi` : "—"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No mileage data yet — logged via the driver mobile app's clock in/out
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Average Pricing by Category */}
      {averagePricing && averagePricing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Average Repair Pricing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Category</th>
                    <th className="text-right py-2 font-medium">Avg Total</th>
                    <th className="text-right py-2 font-medium">Parts</th>
                    <th className="text-right py-2 font-medium">Labor</th>
                  </tr>
                </thead>
                <tbody>
                  {averagePricing.slice(0, 10).map((c) => (
                    <tr key={c.category} className="border-b border-border/50">
                      <td className="py-2 text-sm">{c.category}</td>
                      <td className="text-right py-2 font-mono text-sm">${c.avgTotal.toFixed(2)}</td>
                      <td className="text-right py-2 text-muted-foreground text-xs">${c.avgParts.toFixed(2)}</td>
                      <td className="text-right py-2 text-muted-foreground text-xs">${c.avgLabor.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shop Comparison */}
      {shopComparison && shopComparison.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Shop Cost Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {shopComparison.map((s) => (
                <div key={s.shopId} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.count} repairs · {s.successRate}% success rate</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="font-mono">${s.avgCost} avg</Badge>
                    <p className="text-xs text-muted-foreground mt-1">${Math.round(s.totalCost).toLocaleString()} total</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
