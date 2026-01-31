
'use client';

import { DashboardStats } from "@/components/dashboard-stats";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getMaintenanceRequests, getTenants, getProperties, getAllPayments, getAllPaymentsForReport, getAllMaintenanceRequestsForReport } from "@/lib/data";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2, FileDown, Loader2 } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { MaintenanceRequest, Tenant, Property, Payment, Unit, UnitType, unitTypes, UnitOrientation, unitOrientations } from "@/lib/types";
import { UnitAnalytics } from "@/components/unit-analytics";
import { StatusAnalytics } from "@/components/status-analytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { FinancialOverviewChart } from "@/components/dashboard/financial-overview-chart";
import { OccupancyOverviewChart } from "@/components/dashboard/occupancy-overview-chart";
import { MaintenanceOverviewChart } from "@/components/dashboard/maintenance-overview-chart";
import { OrientationOverviewChart } from "@/components/dashboard/orientation-overview-chart";
import { RentBreakdownChart } from "@/components/dashboard/rent-breakdown-chart";
import { isSameMonth } from "date-fns";
import { calculateTransactionBreakdown } from "@/lib/financial-utils";
import { OrientationAnalytics } from "@/components/orientation-analytics";
import { useLoading } from "@/hooks/useLoading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


export default function DashboardPage() {
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const { startLoading, stopLoading, isLoading } = useLoading();

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const selectedProperty = useMemo(() => {
    if (!selectedPropertyId) return null;
    return properties.find(p => p.id === selectedPropertyId) || null;
  }, [selectedPropertyId, properties]);

  useEffect(() => {
    const fetchData = async () => {
      const [
        maintenanceData,
        tenantsData,
        propertiesData,
        paymentsData
      ] = await Promise.all([
        getMaintenanceRequests(),
        getTenants(100), // Limit to recent tenants for quick dashboard load
        getProperties(),
        getAllPayments(100) // Limit to 100 recent payments
      ]);

      setMaintenanceRequests(maintenanceData);
      setTenants(tenantsData);
      setProperties(propertiesData);
      setPayments(paymentsData);
    };

    fetchData();
  }, []);

  const handleExportPDF = async () => {
    startLoading('Generating full report...');
    try {
      const { generateDashboardReportPDF } = await import('@/lib/pdf-generator');

      const [
        allPaymentsForReport,
        allMaintenanceForReport,
        allTenantsForReport, // Assuming tenants/props are small enough or we accept this for the report
        allPropertiesForReport
      ] = await Promise.all([
        getAllPaymentsForReport(),
        getAllMaintenanceRequestsForReport(),
        getTenants(),
        getProperties()
      ]);

      const totalTenants = allTenantsForReport.length;
      const totalProperties = allPropertiesForReport.length;
      const pendingMaintenance = allMaintenanceForReport.filter(r => r.status !== 'Completed').length;
      const totalArrears = allTenantsForReport
        .filter(t => (t.dueBalance || 0) > 0)
        .reduce((sum, t) => sum + (t.dueBalance || 0), 0);
      const totalUnits = allPropertiesForReport.reduce((sum, p) => sum + (p.units?.length || 0), 0);

      const occupiedUnits = (() => {
        const occupiedUnitIdentifiers = new Set<string>();
        allTenantsForReport.forEach(tenant => {
          occupiedUnitIdentifiers.add(`${tenant.propertyId}-${tenant.unitName}`);
        });
        allPropertiesForReport.forEach(property => {
          if (Array.isArray(property.units)) {
            property.units.forEach(unit => {
              if (unit.status !== 'vacant') {
                occupiedUnitIdentifiers.add(`${property.id}-${unit.name}`);
              }
            });
          }
        });
        return occupiedUnitIdentifiers.size;
      })();

      const vacantUnits = totalUnits - occupiedUnits;
      const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

      const totalMgmtFees = allPaymentsForReport.reduce((sum, p) => {
        if (p.type === 'Deposit') return sum;
        const tenant = allTenantsForReport.find(t => t.id === p.tenantId);
        if (!tenant) return sum;
        const property = allPropertiesForReport.find(prop => prop.id === tenant.propertyId);
        const unit = property?.units.find(u => u.name === tenant.unitName);
        const breakdown = calculateTransactionBreakdown(p, unit, tenant);
        return sum + breakdown.managementFee;
      }, 0);

      const statsForPDF = [
        { title: "Total Tenants", value: totalTenants },
        { title: "Properties Managed", value: totalProperties },
        { title: "Occupied Units", value: occupiedUnits },
        { title: "Vacant Units", value: vacantUnits },
        { title: "Occupancy Rate", value: `${occupancyRate.toFixed(1)}%` },
        { title: "Eracovs Management Revenue", value: `Ksh ${totalMgmtFees.toLocaleString()}` },
        { title: "Pending Maintenance", value: pendingMaintenance },
        { title: "Total Arrears", value: `Ksh ${totalArrears.toLocaleString()}` },
      ];

      const collectedThisMonth = allPaymentsForReport
        .filter(p => p.status === 'Paid' && isSameMonth(new Date(p.date), new Date()))
        .reduce((sum, p) => sum + p.amount, 0);
      const totalOutstanding = allTenantsForReport.reduce((sum, t) => sum + (t.dueBalance || 0), 0);
      const financialDataForPDF = [
        { name: 'Collected This Month', amount: collectedThisMonth },
        { name: 'Total Outstanding', amount: totalOutstanding },
      ];

      const rentBreakdownForPDF = (() => {
        const unitMap = new Map<string, Unit>();
        allPropertiesForReport.forEach(p => {
          if (p.units) {
            p.units.forEach(u => {
              unitMap.set(`${p.id}-${u.name}`, u);
            });
          }
        });
        const breakdown: { [key in UnitType]?: { smRent: number, landlordRent: number } } = {};
        unitTypes.forEach(type => {
          breakdown[type] = { smRent: 0, landlordRent: 0 };
        });
        const rentPayments = allPaymentsForReport.filter(p => p.status === 'Paid' && p.type === 'Rent');
        rentPayments.forEach(payment => {
          const tenant = allTenantsForReport.find(t => t.id === payment.tenantId);
          if (!tenant) return;
          const unit = unitMap.get(`${tenant.propertyId}-${tenant.unitName}`);
          if (!unit || !unit.unitType) return;
          if (breakdown[unit.unitType]) {
            if (unit.ownership === 'SM') {
              breakdown[unit.unitType]!.smRent += payment.amount;
            } else if (unit.ownership === 'Landlord') {
              breakdown[unit.unitType]!.landlordRent += payment.amount;
            }
          }
        });
        return unitTypes.map(type => ({
          unitType: type,
          ...breakdown[type]
        })).filter(d => (d.smRent ?? 0) > 0 || (d.landlordRent ?? 0) > 0);
      })();

      const maintenanceBreakdownForPDF = (['New', 'In Progress', 'Completed'] as const).map(status => ({
        status,
        count: allMaintenanceForReport.filter(r => r.status === status).length
      }));

      const orientationCounts: { [key in UnitOrientation]?: number } = {};
      allPropertiesForReport.forEach(property => {
        if (Array.isArray(property.units)) {
          property.units.forEach(unit => {
            if (unit.unitOrientation) {
              orientationCounts[unit.unitOrientation] = (orientationCounts[unit.unitOrientation] || 0) + 1;
            }
          });
        }
      });
      const orientationBreakdownForPDF = unitOrientations.map(orientation => ({
        name: orientation.toLowerCase().replace(/_/g, ' '),
        value: orientationCounts[orientation] || 0,
      })).filter(d => d.value > 0);

      generateDashboardReportPDF(statsForPDF, financialDataForPDF, rentBreakdownForPDF, maintenanceBreakdownForPDF, orientationBreakdownForPDF);
    } catch (error) {
      console.error("Error generating PDF report:", error);
    } finally {
      stopLoading();
    }
  }

  const recentRequests = maintenanceRequests
    .filter(r => r.status !== 'Completed')
    .slice(0, 3);

  const getTenantName = (tenantId: string) => tenants.find(t => t.id === tenantId)?.name || 'Unknown';
  const getPropertyName = (propertyId: string) => properties.find(p => p.id === propertyId)?.name || 'Unknown';

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Welcome, Property Manager</h2>
          <p className="text-sm text-muted-foreground">Here's a summary of your properties today.</p>
        </div>
        <Button variant="outline" onClick={handleExportPDF} disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
          Export PDF Report
        </Button>
      </div>

      <DashboardStats
        tenants={tenants}
        properties={properties}
        maintenanceRequests={maintenanceRequests}
        payments={payments}
      />

      <div className="grid gap-8 md:grid-cols-2">
        <FinancialOverviewChart payments={payments} tenants={tenants} />
        <OccupancyOverviewChart properties={properties} tenants={tenants} />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <MaintenanceOverviewChart maintenanceRequests={maintenanceRequests} />
        <OrientationOverviewChart properties={properties} />
      </div>

      <div className="grid gap-8">
        <RentBreakdownChart payments={payments} tenants={tenants} properties={properties} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detailed Property Analytics</CardTitle>
          <CardDescription>Select a property to view its detailed occupancy and status breakdown.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Select onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-full sm:w-[300px]">
              <SelectValue placeholder="Select a property..." />
            </SelectTrigger>
            <SelectContent>
              {properties.map(property => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedProperty ? (
            <div className="space-y-6 pt-6 border-t">
              <Tabs defaultValue="status-analytics" className="w-full">
                <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
                  <TabsTrigger value="status-analytics">Unit Status</TabsTrigger>
                  <TabsTrigger value="occupancy-analytics">Occupancy</TabsTrigger>
                  <TabsTrigger value="orientation-analytics">Orientation</TabsTrigger>
                </TabsList>
                <TabsContent value="status-analytics">
                  <StatusAnalytics property={selectedProperty} />
                </TabsContent>
                <TabsContent value="occupancy-analytics">
                  <UnitAnalytics property={selectedProperty} tenants={tenants} />
                </TabsContent>
                <TabsContent value="orientation-analytics">
                  <OrientationAnalytics property={selectedProperty} tenants={tenants} />
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg text-center">
              <div className="mx-auto bg-muted p-3 rounded-full mb-4 w-fit">
                <Building2 className="h-8 w-8 text-secondary-foreground" />
              </div>
              <h3 className="text-xl font-semibold">Select a Property</h3>
              <p className="text-muted-foreground mt-2 max-w-md">
                Choose a property from the dropdown above to see its detailed analytics.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Maintenance Requests</CardTitle>
            <CardDescription>Top pending requests from the last 90 days.</CardDescription>
          </div>
          <Link href="/maintenance">
            <Button variant="outline" size="sm">
              View All <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {recentRequests.map(req => (
              <li key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 hover:bg-muted/30 rounded-lg transition-colors">
                <div className="flex flex-col min-w-0 flex-1 mr-4">
                  <span className="font-medium truncate">{getTenantName(req.tenantId)} - <span className="text-muted-foreground">{getPropertyName(req.propertyId)}</span></span>
                  <span className="text-sm text-muted-foreground truncate">{req.details}</span>
                </div>
                <span className="text-xs sm:text-sm font-medium whitespace-nowrap bg-muted px-2 py-1 rounded-full">{new Date(req.date).toLocaleDateString()}</span>
              </li>
            ))}
            {recentRequests.length === 0 && (
              <p className="text-sm text-muted-foreground">No pending maintenance requests.</p>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}


