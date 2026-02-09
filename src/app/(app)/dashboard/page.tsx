
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
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";


export default function DashboardPage() {
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const { startLoading, stopLoading, isLoading } = useLoading();
  const { userProfile } = useAuth();
  const isInvestmentConsultant = userProfile?.role === 'investment-consultant';
  const { toast } = useToast();

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [
        maintenanceData,
        tenantsData,
        propertiesData,
        paymentsData
      ] = await Promise.all([
        getMaintenanceRequests(),
        getTenants(), // Get all tenants, will be filtered later
        getProperties(),
        getAllPayments() // Get all payments for last 90 days
      ]);

      setMaintenanceRequests(maintenanceData);
      setTenants(tenantsData);
      setProperties(propertiesData);
      setPayments(paymentsData);
    };

    fetchData();
  }, []);

  const { filteredTenants, filteredMaintenanceRequests, filteredPayments, filteredProperties } = useMemo(() => {
    if (!selectedPropertyId) {
        return {
            filteredTenants: [],
            filteredMaintenanceRequests: [],
            filteredPayments: [],
            filteredProperties: []
        };
    }
    const selectedProps = properties.filter(p => p.id === selectedPropertyId);
    const selectedTenants = tenants.filter(t => t.propertyId === selectedPropertyId);
    const tenantIds = new Set(selectedTenants.map(t => t.id));
    const selectedPayments = payments.filter(p => tenantIds.has(p.tenantId));
    const selectedMaintenance = maintenanceRequests.filter(r => r.propertyId === selectedPropertyId);

    return { 
        filteredTenants: selectedTenants, 
        filteredMaintenanceRequests: selectedMaintenance, 
        filteredPayments: selectedPayments, 
        filteredProperties: selectedProps 
    };
}, [selectedPropertyId, properties, tenants, payments, maintenanceRequests]);

  const selectedProperty = useMemo(() => {
    if (!selectedPropertyId) return null;
    return properties.find(p => p.id === selectedPropertyId) || null;
  }, [selectedPropertyId, properties]);

  const handleExportPDF = async () => {
    if (!selectedPropertyId) {
        toast({
            variant: "destructive",
            title: "No Property Selected",
            description: "Please select a property to generate a report.",
        });
        return;
    }
    startLoading('Generating report for ' + selectedProperty?.name);
    try {
      const { generateDashboardReportPDF } = await import('@/lib/pdf-generator');

      // Use already filtered data where possible, but for a full report, might need all data
      const [
        allPaymentsForReport,
        allMaintenanceForReport,
        allTenantsForReport,
        allPropertiesForReport
      ] = await Promise.all([
        getAllPaymentsForReport(),
        getAllMaintenanceRequestsForReport(),
        getTenants(),
        getProperties()
      ]);

      // Filter all data for the selected property
      const propertyForReport = allPropertiesForReport.find(p => p.id === selectedPropertyId);
      if (!propertyForReport) return;

      const tenantsForProp = allTenantsForReport.filter(t => t.propertyId === selectedPropertyId);
      const maintenanceForProp = allMaintenanceForReport.filter(m => m.propertyId === selectedPropertyId);
      const tenantIds = new Set(tenantsForProp.map(t => t.id));
      const paymentsForProp = allPaymentsForReport.filter(p => tenantIds.has(p.tenantId));

      const totalTenants = tenantsForProp.length;
      const totalUnits = propertyForReport.units?.length || 0;
      
      const occupiedUnits = new Set(tenantsForProp.map(t => t.unitName)).size;
      const vacantUnits = totalUnits - occupiedUnits;
      const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
      
      const pendingMaintenance = maintenanceForProp.filter(r => r.status !== 'Completed').length;
      const totalArrears = tenantsForProp.reduce((sum, t) => sum + (t.dueBalance || 0), 0);
      
      const totalMgmtFees = paymentsForProp.reduce((sum, p) => {
        if (p.type === 'Deposit') return sum;
        const tenant = tenantsForProp.find(t => t.id === p.tenantId);
        if (!tenant) return sum;
        const unit = propertyForReport.units.find(u => u.name === tenant.unitName);
        const breakdown = calculateTransactionBreakdown(p, unit, tenant);
        return sum + breakdown.managementFee;
      }, 0);

      const statsForPDF = [
        { title: "Total Tenants", value: totalTenants },
        { title: "Total Units", value: totalUnits },
        { title: "Occupied Units", value: occupiedUnits },
        { title: "Vacant Units", value: vacantUnits },
        { title: "Occupancy Rate", value: `${occupancyRate.toFixed(1)}%` },
        { title: "Eracovs Management Revenue", value: `Ksh ${totalMgmtFees.toLocaleString()}` },
        { title: "Pending Maintenance", value: pendingMaintenance },
        { title: "Total Arrears", value: `Ksh ${totalArrears.toLocaleString()}` },
      ];

      const collectedThisMonth = paymentsForProp
        .filter(p => p.status === 'Paid' && isSameMonth(new Date(p.date), new Date()))
        .reduce((sum, p) => sum + p.amount, 0);

      const financialDataForPDF = [
        { name: 'Collected This Month', amount: collectedThisMonth },
        { name: 'Total Outstanding', amount: totalArrears },
      ];
      
      const rentBreakdownForPDF = (() => {
        const breakdown: { [key in UnitType]?: { smRent: number, landlordRent: number } } = {};
        unitTypes.forEach(type => {
          breakdown[type] = { smRent: 0, landlordRent: 0 };
        });
        const rentPayments = paymentsForProp.filter(p => p.status === 'Paid' && p.type === 'Rent');
        rentPayments.forEach(payment => {
          const tenant = tenantsForProp.find(t => t.id === payment.tenantId);
          if (!tenant) return;
          const unit = propertyForReport.units.find(u => u.name === tenant.unitName);
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
        count: maintenanceForProp.filter(r => r.status === status).length
      }));

      const orientationCounts: { [key in UnitOrientation]?: number } = {};
      propertyForReport.units.forEach(unit => {
        if (unit.unitOrientation) {
          orientationCounts[unit.unitOrientation] = (orientationCounts[unit.unitOrientation] || 0) + 1;
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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {selectedProperty ? selectedProperty.name : 'Portfolio Dashboard'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {selectedProperty ? "Here's a summary of this property today." : "Select a property to view its dashboard."}
          </p>
        </div>
        <div className="flex items-center gap-2">
            <Select onValueChange={setSelectedPropertyId} value={selectedPropertyId || ''}>
                <SelectTrigger className="w-[280px]">
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
            <Button variant="outline" onClick={handleExportPDF} disabled={isLoading || !selectedPropertyId}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              Export PDF Report
            </Button>
        </div>
      </div>
      
      {selectedPropertyId ? (
        <>
            <DashboardStats
                tenants={filteredTenants}
                properties={filteredProperties}
                maintenanceRequests={filteredMaintenanceRequests}
                payments={filteredPayments}
            />

            <div className="grid gap-8 md:grid-cols-2">
                <FinancialOverviewChart payments={filteredPayments} tenants={filteredTenants} />
                <OccupancyOverviewChart properties={filteredProperties} tenants={filteredTenants} />
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <MaintenanceOverviewChart maintenanceRequests={filteredMaintenanceRequests} />
                <OrientationOverviewChart properties={filteredProperties} />
            </div>

            <div className="grid gap-8">
                <RentBreakdownChart payments={filteredPayments} tenants={filteredTenants} properties={filteredProperties} />
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Detailed Property Analytics</CardTitle>
                    <CardDescription>Detailed occupancy and status breakdown for {selectedProperty?.name}.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Tabs defaultValue="status-analytics" className="w-full">
                        <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
                        <TabsTrigger value="status-analytics">Unit Status</TabsTrigger>
                        <TabsTrigger value="occupancy-analytics">Occupancy</TabsTrigger>
                        <TabsTrigger value="orientation-analytics">Orientation</TabsTrigger>
                        </TabsList>
                        <TabsContent value="status-analytics">
                        <StatusAnalytics property={selectedProperty!} />
                        </TabsContent>
                        <TabsContent value="occupancy-analytics">
                        <UnitAnalytics property={selectedProperty!} tenants={tenants} />
                        </TabsContent>
                        <TabsContent value="orientation-analytics">
                        <OrientationAnalytics property={selectedProperty!} tenants={tenants} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {!isInvestmentConsultant && (
                <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                    <CardTitle>Recent Maintenance Requests</CardTitle>
                    <CardDescription>Top pending requests from the last 90 days for this property.</CardDescription>
                    </div>
                    <Link href="/maintenance">
                    <Button variant="outline" size="sm">
                        View All <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    </Link>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-4">
                    {filteredMaintenanceRequests.filter(r => r.status !== 'Completed').slice(0, 3).map(req => (
                        <li key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 hover:bg-muted/30 rounded-lg transition-colors">
                        <div className="flex flex-col min-w-0 flex-1 mr-4">
                            <span className="font-medium truncate">{tenants.find(t=>t.id === req.tenantId)?.name || 'Unknown'} - <span className="text-muted-foreground">{selectedProperty?.name}</span></span>
                            <span className="text-sm text-muted-foreground truncate">{req.details}</span>
                        </div>
                        <span className="text-xs sm:text-sm font-medium whitespace-nowrap bg-muted px-2 py-1 rounded-full">{new Date(req.date).toLocaleDateString()}</span>
                        </li>
                    ))}
                    {filteredMaintenanceRequests.filter(r => r.status !== 'Completed').length === 0 && (
                        <p className="text-sm text-muted-foreground">No pending maintenance requests for this property.</p>
                    )}
                    </ul>
                </CardContent>
                </Card>
            )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed rounded-lg text-center">
              <div className="mx-auto bg-muted p-3 rounded-full mb-4 w-fit">
                <Building2 className="h-8 w-8 text-secondary-foreground" />
              </div>
              <h3 className="text-xl font-semibold">Select a Property</h3>
              <p className="text-muted-foreground mt-2 max-w-md">
                Choose a property from the dropdown above to see its dashboard.
              </p>
            </div>
      )}
    </div>
  );
}
