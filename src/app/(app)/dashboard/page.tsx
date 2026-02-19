
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { OrientationAnalytics } from "@/components/orientation-analytics";
import { PropertySelector } from "@/components/dashboard/property-selector";
import { ExportPdfButton } from "@/components/dashboard/export-pdf-button";
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardCharts } from '@/components/dashboard/dashboard-charts';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardPage() {
    const searchParams = useSearchParams();
    const propertyId = searchParams?.get('propertyId');
    const { userProfile, isLoading: authLoading } = useAuth();

    const [allProperties, setAllProperties] = useState<Property[]>([]);
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Optimization: Fetch the list of properties first to determine the active ID
            const props = await getProperties();
            setAllProperties(props);

            const activePropId = propertyId || props[0]?.id;
            
            if (activePropId) {
                // Optimization: Fetch all property-specific data in parallel
                const [propDetails, propTenants, propMaint] = await Promise.all([
                    getProperty(activePropId),
                    getTenants({ propertyId: activePropId }),
                    getMaintenanceRequests({ propertyId: activePropId }),
                ]);

                if (propDetails) {
                    setSelectedProperty(propDetails);
                    setTenants(propTenants);
                    setMaintenanceRequests(propMaint);

                    // Fetch payments only after tenants are loaded
                    const tenantIds = propTenants.map(t => t.id);
                    if (tenantIds.length > 0) {
                        const propPayments = await getPaymentsForTenants(tenantIds);
                        setPayments(propPayments);
                    } else {
                        setPayments([]);
                    }
                }
            }
        } catch (error) {
            console.error("Failed to fetch dashboard data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [propertyId]);

    useEffect(() => {
        if (!authLoading && userProfile) {
            fetchData();
        }
    }, [authLoading, userProfile, fetchData]);

    if (authLoading || (isLoading && allProperties.length === 0)) {
        return <DashboardSkeleton />;
    }

    const isInvestmentConsultant = userProfile?.role === 'investment-consultant';

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                        {selectedProperty?.name || 'Portfolio Dashboard'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {selectedProperty ? "Here's a summary of this property today." : "Select a property to view its dashboard."}
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                    <PropertySelector properties={allProperties} selectedPropertyId={selectedProperty?.id || null} />
                    <ExportPdfButton propertyId={selectedProperty?.id || null} propertyName={selectedProperty?.name} />
                </div>
            </div>

            {selectedProperty ? (
                <>
                    <DashboardStats
                        tenants={tenants}
                        properties={[selectedProperty]}
                        maintenanceRequests={maintenanceRequests}
                        payments={payments}
                    />

                    <DashboardCharts
                        payments={payments}
                        tenants={tenants}
                        selectedProperty={selectedProperty}
                        maintenanceRequests={maintenanceRequests}
                    />

                    <Card>
                        <CardHeader>
                            <CardTitle>Detailed Property Analytics</CardTitle>
                            <CardDescription>Detailed occupancy and status breakdown for {selectedProperty.name}.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
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
                                    {maintenanceRequests.filter(r => r.status !== 'Completed').slice(0, 3).map(req => (
                                        <li key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 hover:bg-muted/30 rounded-lg transition-colors">
                                            <div className="flex flex-col min-w-0 flex-1 mr-4">
                                                <span className="font-medium truncate">{tenants.find(t => t.id === req.tenantId)?.name || 'Unknown'} - <span className="text-muted-foreground">{selectedProperty?.name}</span></span>
                                                <span className="text-sm text-muted-foreground truncate">{req.description}</span>
                                            </div>
                                            <span className="text-xs sm:text-sm font-medium whitespace-nowrap bg-muted px-2 py-1 rounded-full">{new Date(req.date).toLocaleDateString()}</span>
                                        </li>
                                    ))}
                                    {maintenanceRequests.filter(r => r.status !== 'Completed').length === 0 && (
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
