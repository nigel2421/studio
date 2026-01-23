'use client';

import { DashboardStats } from "@/components/dashboard-stats";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { listenToMaintenanceRequests, listenToTenants, listenToProperties, listenToPayments } from "@/lib/data";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MaintenanceRequest, Tenant, Property, Payment } from "@/lib/types";
import { UnitAnalytics } from "@/components/unit-analytics";
import { StatusAnalytics } from "@/components/status-analytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { FinancialOverviewChart } from "@/components/dashboard/financial-overview-chart";
import { OccupancyOverviewChart } from "@/components/dashboard/occupancy-overview-chart";
import { MaintenanceOverviewChart } from "@/components/dashboard/maintenance-overview-chart";

export default function DashboardPage() {
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    const unsubMaintenance = listenToMaintenanceRequests(setMaintenanceRequests);
    const unsubTenants = listenToTenants(setTenants);
    const unsubProperties = listenToProperties(setProperties);
    const unsubPayments = listenToPayments(setPayments);

    return () => {
      unsubMaintenance();
      unsubTenants();
      unsubProperties();
      unsubPayments();
    };
  }, []);

  const recentRequests = maintenanceRequests
    .filter(r => r.status !== 'Completed')
    .slice(0, 3);

  const getTenantName = (tenantId: string) => tenants.find(t => t.id === tenantId)?.name || 'Unknown';
  const getPropertyName = (propertyId: string) => properties.find(p => p.id === propertyId)?.name || 'Unknown';

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Welcome, Property Manager</h2>
        <p className="text-muted-foreground text-sm sm:text-base">Here's a summary of your properties today.</p>
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

      {properties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Property Analytics</CardTitle>
            <CardDescription>
              Detailed analytics for each property in your portfolio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={properties.length > 0 ? properties[0].id : ""} className="w-full">
              <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
                {properties.map(property => (
                  <TabsTrigger key={property.id} value={property.id}>{property.name}</TabsTrigger>
                ))}
              </TabsList>
              {properties.map(property => (
                <TabsContent key={property.id} value={property.id} className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mt-4">Unit Status Analytics</h3>
                        <p className="text-sm text-muted-foreground">Breakdown of units by handover and management status.</p>
                        <StatusAnalytics property={property} />
                    </div>
                    <Separator />
                    <div>
                        <h3 className="text-lg font-semibold">Occupancy Analytics</h3>
                        <p className="text-sm text-muted-foreground">Floor-by-floor breakdown of rented vs. vacant units.</p>
                        <UnitAnalytics property={property} tenants={tenants} />
                    </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Maintenance Requests</CardTitle>
              <CardDescription>Top pending requests from tenants.</CardDescription>
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
        <div className="lg:col-span-1">
            <MaintenanceOverviewChart maintenanceRequests={maintenanceRequests} />
        </div>
      </div>
    </div>
  );
}
