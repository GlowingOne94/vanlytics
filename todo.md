# Vanlytics - Project TODO

## Foundation
- [x] Database schema (vehicles, repairs, maintenance, shops, alerts, documents)
- [x] Backend API routes for all features
- [x] Dark/light mode theme with persistent toggle

## Dashboard
- [x] Fleet KPIs: active vehicles, vehicles down
- [x] Average monthly repair cost & total fleet repair cost (year)
- [x] Most/least reliable shop display
- [x] Vehicles costing the most money
- [x] Alert summaries at a glance
- [x] Upcoming maintenance summary on dashboard
- [x] Vehicles due for service KPI (vehicles with maintenance due within 30 days)

## Vehicle Profiles
- [x] Vehicle list with search
- [x] Individual vehicle profile (VIN, mileage, year, model, status, driver, engine, transmission)
- [x] Color-coded health indicator (green/yellow/red)
- [x] Status management (Active, Down, Awaiting Parts, At Shop, Retired)
- [x] Vehicle photo upload UI
- [x] Vehicle filter by status (dropdown filter in Vehicles page)

## Repair History
- [x] Full repair logging (date, mileage, shop, mechanic, complaint, diagnosis, parts, costs)
- [x] Old part returned tracking
- [x] Repair successful flag
- [x] Warranty months field in form
- [x] Repair document upload UI
- [x] Intelligent repeat repair detection and flagging (AC, battery, alternator, radiator, refrigerant)

## Preventive Maintenance
- [x] Service interval definitions (oil, transmission, brakes, filters, belts, tires, wheelchair lift, etc.)
- [x] Automatic due-date estimation based on mileage/time
- [x] Maintenance completion logging
- [x] Due-date alert generation (automated alerts for overdue/upcoming maintenance)

## Shop Directory
- [x] Shop profiles (name, phone, address, contact, specialties, labor rate)
- [x] Shop comparison and ranking
- [x] Recommendation tracking (Yes/No/Maybe)
- [x] Full performance scoring (success rate, cost vs fleet average, repeat repairs, overall score)

## Cost Intelligence
- [x] Per-vehicle cost breakdown
- [x] Fleet-wide spend trends over time
- [x] Category analysis charts (by repair type)
- [x] Parts vs labor analysis (total parts, labor, tax costs)
- [x] Average pricing for common repairs (by category)
- [x] Shop cost outlier flagging (cost vs fleet average)

## Alerts & Notifications
- [x] Alert list UI with mark read/dismiss
- [x] Automated alert generation (maintenance due, warranty, high-cost, repeat repairs)

## Analytics & Reports
- [x] Monthly/annual repair spending charts
- [x] Exportable reports (CSV/JSON with all metrics)
- [x] Cost-per-mile calculations (with vehicle ranking)
- [x] Repair frequency trends chart (monthly repair counts)
- [ ] PDF export (future enhancement)

## AI Fleet Advisor
- [x] Chat interface using built-in LLM
- [x] Fleet health Q&A with fleet context
- [x] Repair recommendations
- [x] Cost optimization suggestions

## Search & UI
- [x] Backend global search (VIN, plate, repair, mechanic, shop)
- [x] Mobile-responsive design
- [x] Sidebar navigation with DashboardLayout
- [x] Global search UI in header/command palette (Cmd+K)
