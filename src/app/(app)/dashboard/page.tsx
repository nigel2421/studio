
'use client';

import { DashboardStats } from "@/components/dashboard-stats";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getMaintenanceRequests, getTenants, getProperties } from "@/lib/data";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MaintenanceRequest, Tenant, Property } from "@/lib/types";
import { UnitAnalytics } from "@/components/unit-analytics";
import { AIPropertyInsights } from "@/components/ai-property-insights";

export default function DashboardPage() {
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    getMaintenanceRequests().then(setMaintenanceRequests);
    getTenants().then(setTenants);
    getProperties().then(setProperties);
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

      <DashboardStats />

      {properties.length > 0 && (
        <AIPropertyInsights property={properties[0]} />
      )}

      {properties.map(property => (
        <UnitAnalytics key={property.id} property={property} tenants={tenants} />
      ))}

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-1">
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
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Properties Overview</CardTitle>
            <CardDescription>A summary of your managed properties.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {properties.map(prop => (
                <li key={prop.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors gap-3">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary/10 p-2 rounded-full shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <span className="font-medium">{prop.name}</span>
                      <p className="text-sm text-muted-foreground break-all">{prop.address}</p>
                    </div>
                  </div>
                  <div className="flex sm:block items-center justify-between sm:text-right w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0">
                    <span className="text-sm text-muted-foreground sm:hidden">Units</span>
                    <div>
                      <span className="font-semibold">{Array.isArray(prop.units) ? prop.units.length : 0}</span>
                      <p className="text-xs text-muted-foreground hidden sm:block">Units</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
