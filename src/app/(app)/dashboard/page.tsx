

import { Suspense } from 'react';
import { getProperty, getTenants, getProperties, getPaymentsForTenants, getMaintenanceRequests } from "@/lib/data";
import { DashboardStats } from "@/components/dashboard-stats";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2 } from "lucide-react";
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
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const getDashboardData = async (propId: string) => {
    try {
        const [selectedProperty, tenants, maintenanceRequests] = await Promise.all([
            getProperty(propId),
            getTenants({ propertyId: propId }),
            getMaintenanceRequests({ propertyId: propId }),
        ]);

        if (!selectedProperty) {
            return null;
        }

        const tenantIds = tenants.map(t => t.id);
        const payments = await getPaymentsForTenants(tenantIds);

        return {
            selectedProperty,
            tenants,
            maintenanceRequests,
            payments,
        };
    } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        return null;
    }
};

function DashboardSkeleton() {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <Skeleton className="h-8 w-64 mb-2" />
                    <Skeleton className="h-4 w-80" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-10 w-[280px]" />
                    <Skeleton className="h-10 w-[180px]" />
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <div className="grid gap-8 md:grid-cols-2">
                <Skeleton className="h-80" />
                <Skeleton className="h-80" />
            </div>
        </div>
    );
}

async function DashboardContent({ searchParams }: { searchParams?: { propertyId?: string } }) {
    const propertyId = searchParams?.propertyId;
    
    const allProperties = await getProperties();
    const selectedPropertyId = propertyId || allProperties[0]?.id || null;

    const data = selectedPropertyId ? await getDashboardData(selectedPropertyId) : null;
    const isInvestmentConsultant = false; 

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                        {data?.selectedProperty?.name || 'Portfolio Dashboard'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {data?.selectedProperty ? "Here's a summary of this property today." : "Select a property to view its dashboard."}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <PropertySelector properties={allProperties} selectedPropertyId={selectedPropertyId} />
                    <ExportPdfButton propertyId={selectedPropertyId} propertyName={data?.selectedProperty?.name} />
                </div>
            </div>

            {data ? (
                <>
                    <DashboardStats
                        tenants={data.tenants}
                        properties={[data.selectedProperty]}
                        maintenanceRequests={data.maintenanceRequests}
                        payments={data.payments}
                    />

                    <div className="grid gap-8 md:grid-cols-2">
                        <FinancialOverviewChart payments={data.payments} tenants={data.tenants} />
                        <OccupancyOverviewChart properties={[data.selectedProperty]} tenants={data.tenants} />
                    </div>

                    <div className="grid gap-8 md:grid-cols-2">
                        <MaintenanceOverviewChart maintenanceRequests={data.maintenanceRequests} />
                        <OrientationOverviewChart properties={[data.selectedProperty]} />
                    </div>

                    <div className="grid gap-8">
                        <RentBreakdownChart payments={data.payments} tenants={data.tenants} properties={[data.selectedProperty]} />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Detailed Property Analytics</CardTitle>
                            <CardDescription>Detailed occupancy and status breakdown for {data.selectedProperty?.name}.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <Tabs defaultValue="status-analytics" className="w-full">
                                <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
                                    <TabsTrigger value="status-analytics">Unit Status</TabsTrigger>
                                    <TabsTrigger value="occupancy-analytics">Occupancy</TabsTrigger>
                                    <TabsTrigger value="orientation-analytics">Orientation</TabsTrigger>
                                </TabsList>
                                <TabsContent value="status-analytics">
                                    {data.selectedProperty && <StatusAnalytics property={data.selectedProperty} />}
                                </TabsContent>
                                <TabsContent value="occupancy-analytics">
                                    {data.selectedProperty && <UnitAnalytics property={data.selectedProperty} tenants={data.tenants} />}
                                </TabsContent>
                                <TabsContent value="orientation-analytics">
                                    {data.selectedProperty && <OrientationAnalytics property={data.selectedProperty} tenants={data.tenants} />}
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
                                    {data.maintenanceRequests.filter(r => r.status !== 'Completed').slice(0, 3).map(req => (
                                        <li key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 hover:bg-muted/30 rounded-lg transition-colors">
                                            <div className="flex flex-col min-w-0 flex-1 mr-4">
                                                <span className="font-medium truncate">{data.tenants.find(t => t.id === req.tenantId)?.name || 'Unknown'} - <span className="text-muted-foreground">{data.selectedProperty?.name}</span></span>
                                                <span className="text-sm text-muted-foreground truncate">{req.details}</span>
                                            </div>
                                            <span className="text-xs sm:text-sm font-medium whitespace-nowrap bg-muted px-2 py-1 rounded-full">{new Date(req.date).toLocaleDateString()}</span>
                                        </li>
                                    ))}
                                    {data.maintenanceRequests.filter(r => r.status !== 'Completed').length === 0 && (
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


export default function DashboardPage({ searchParams }: { searchParams?: { propertyId?: string } }) {
    return (
        <Suspense fallback={<DashboardSkeleton />}>
            <DashboardContent searchParams={searchParams} />
        </Suspense>
    );
}

