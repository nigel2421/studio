
import { DashboardStats } from "@/components/dashboard-stats";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getMaintenanceRequests, getTenants, getProperties, getAllPayments } from "@/lib/data";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import { Suspense } from "react";
import { MaintenanceRequest, Tenant, Property, Payment } from "@/lib/types";
import { UnitAnalytics } from "@/components/unit-analytics";
import { StatusAnalytics } from "@/components/status-analytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancialOverviewChart } from "@/components/dashboard/financial-overview-chart";
import { OccupancyOverviewChart } from "@/components/dashboard/occupancy-overview-chart";
import { MaintenanceOverviewChart } from "@/components/dashboard/maintenance-overview-chart";
import { OrientationOverviewChart } from "@/components/dashboard/orientation-overview-chart";
import { RentBreakdownChart } from "@/components/dashboard/rent-breakdown-chart";
import { OrientationAnalytics } from "@/components/orientation-analytics";
import { PropertySelector } from "@/components/dashboard/property-selector";
import { ExportPdfButton } from "@/components/dashboard/export-pdf-button";

async function DashboardData({ propertyId }: { propertyId: string | null }) {
    if (!propertyId) {
        return (
            <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed rounded-lg text-center">
              <div className="mx-auto bg-muted p-3 rounded-full mb-4 w-fit">
                <Building2 className="h-8 w-8 text-secondary-foreground" />
              </div>
              <h3 className="text-xl font-semibold">Select a Property</h3>
              <p className="text-muted-foreground mt-2 max-w-md">
                Choose a property from the dropdown above to see its dashboard.
              </p>
            </div>
        );
    }
    
    // Fetch all data once
    const [
        allProperties,
        allTenants,
        allMaintenanceRequests,
        allPayments
    ] = await Promise.all([
        getProperties(),
        getTenants(),
        getMaintenanceRequests(),
        getAllPayments()
    ]);
    
    // Filter data on the server for the selected property
    const selectedProperty = allProperties.find(p => p.id === propertyId) || null;
    const filteredProperties = selectedProperty ? [selectedProperty] : [];
    const filteredTenants = allTenants.filter(t => t.propertyId === propertyId);
    const tenantIdsInProperty = new Set(filteredTenants.map(t => t.id));
    const filteredPayments = allPayments.filter(p => tenantIdsInProperty.has(p.tenantId));
    const filteredMaintenanceRequests = allMaintenanceRequests.filter(r => r.propertyId === propertyId);
    const isInvestmentConsultant = false; // This needs to be passed down or checked differently. For now, assume not.

    return (
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
                            {selectedProperty && <StatusAnalytics property={selectedProperty} />}
                        </TabsContent>
                        <TabsContent value="occupancy-analytics">
                            {selectedProperty && <UnitAnalytics property={selectedProperty} tenants={allTenants} />}
                        </TabsContent>
                        <TabsContent value="orientation-analytics">
                            {selectedProperty && <OrientationAnalytics property={selectedProperty} tenants={allTenants} />}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {!isInvestmentConsultant && (
                <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                    <CardTitle>Recent Maintenance Requests</CardTitle>
                    <CardDescription>Top pending requests for this property.</CardDescription>
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
                            <span className="font-medium truncate">{allTenants.find(t=>t.id === req.tenantId)?.name || 'Unknown'} - <span className="text-muted-foreground">{selectedProperty?.name}</span></span>
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
    );
}

async function DashboardPageContent({ searchParams }: { searchParams: { propertyId?: string } }) {
  const properties = await getProperties();
  const selectedPropertyId = searchParams.propertyId || null;
  const selectedProperty = properties.find(p => p.id === selectedPropertyId) || null;

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
            <PropertySelector properties={properties} selectedPropertyId={selectedPropertyId} />
            <ExportPdfButton propertyId={selectedPropertyId} propertyName={selectedProperty?.name} />
        </div>
      </div>
      
      <Suspense fallback={<div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
        <DashboardData propertyId={selectedPropertyId} />
      </Suspense>
    </div>
  );
}

export default function DashboardPage({ searchParams }: { searchParams: { propertyId?: string } }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <DashboardPageContent searchParams={searchParams} />
    </Suspense>
  )
}
