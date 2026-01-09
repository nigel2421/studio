
'use client';

import { DashboardStats } from "@/components/dashboard-stats";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getMaintenanceRequests, getTenants, getProperties } from "@/lib/data";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MaintenanceRequest, Tenant, Property } from "@/lib/types";

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
    .filter(r => r.status !== 'completed')
    .slice(0, 3);
  
  const getTenantName = (tenantId: string) => tenants.find(t => t.id === tenantId)?.name || 'Unknown';
  const getPropertyName = (propertyId: string) => properties.find(p => p.id === propertyId)?.name || 'Unknown';

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-2">Welcome, Property Manager</h2>
        <p className="text-muted-foreground">Here's a summary of your properties today.</p>
      </div>
      
      <DashboardStats />

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
                <li key={req.id} className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-medium">{getTenantName(req.tenantId)} - <span className="text-muted-foreground">{getPropertyName(req.propertyId)}</span></span>
                    <span className="text-sm text-muted-foreground truncate max-w-xs">{req.details}</span>
                  </div>
                  <span className="text-sm font-medium">{new Date(req.date).toLocaleDateString()}</span>
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
                <li key={prop.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                     <div className="bg-primary/10 p-2 rounded-full">
                        <Building2 className="h-5 w-5 text-primary" />
                     </div>
                     <div>
                        <span className="font-medium">{prop.name}</span>
                        <p className="text-sm text-muted-foreground">{prop.address}</p>
                     </div>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold">{Array.isArray(prop.units) ? prop.units.length : 0}</span>
                    <p className="text-xs text-muted-foreground">Units</p>
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
