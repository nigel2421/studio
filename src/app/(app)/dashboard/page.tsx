'use client';

import { DashboardStats } from "@/components/dashboard-stats";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { listenToMaintenanceRequests, listenToTenants, listenToProperties, listenToPayments } from "@/lib/data";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2, FileDown } from "lucide-react";
import { useEffect, useState } from "react";
import { MaintenanceRequest, Tenant, Property, Payment, Unit, UnitType, unitTypes } from "@/lib/types";
import { UnitAnalytics } from "@/components/unit-analytics";
import { StatusAnalytics } from "@/components/status-analytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { FinancialOverviewChart } from "@/components/dashboard/financial-overview-chart";
import { OccupancyOverviewChart } from "@/components/dashboard/occupancy-overview-chart";
import { MaintenanceOverviewChart } from "@/components/dashboard/maintenance-overview-chart";
import { OrientationOverviewChart } from "@/components/dashboard/orientation-overview-chart";
import { OrientationAnalytics } from "@/components/orientation-analytics";
import { RentBreakdownChart } from "@/components/dashboard/rent-breakdown-chart";
import { generateDashboardReportPDF } from "@/lib/pdf-generator";
import { isSameMonth } from "date-fns";
import { calculateTransactionBreakdown } from "@/lib/financial-utils";

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
  
  const handleExportPDF = () => {
    // 1. Prepare stats data
    const totalTenants = tenants.length;
    const totalProperties = properties.length;
    const pendingMaintenance = maintenanceRequests.filter(r => r.status !== 'Completed').length;
    const totalArrears = tenants
      .filter(t => (t.dueBalance || 0) > 0)
      .reduce((sum, t) => sum + (t.dueBalance || 0), 0);
    const totalUnits = properties.reduce((sum, p) => sum + (p.units?.length || 0), 0);
    const occupiedUnits = (() => {
      const occupiedUnitIdentifiers = new Set<string>();
      tenants.forEach(tenant => {
        occupiedUnitIdentifiers.add(`${tenant.propertyId}-${tenant.unitName}`);
      });
      properties.forEach(property => {
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
    const totalMgmtFees = payments.reduce((sum, p) => {
        if (p.type === 'Deposit') return sum;
        const tenant = tenants.find(t => t.id === p.tenantId);
        if (!tenant) return sum;
        const property = properties.find(prop => prop.id === tenant.propertyId);
        const unit = property?.units.find(u => u.name === tenant.unitName);
        const unitRent = unit?.rentAmount || tenant.lease.rent || 0;
        const serviceCharge = unit?.serviceCharge || tenant.lease.serviceCharge || 0;
        const breakdown = calculateTransactionBreakdown(p.amount, unitRent, serviceCharge);
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

    // 2. Prepare financial data
    const collectedThisMonth = payments
      .filter(p => p.status === 'Paid' && isSameMonth(new Date(p.date), new Date()))
      .reduce((sum, p) => sum + p.amount, 0);
    const totalOutstanding = tenants.reduce((sum, t) => sum + (t.dueBalance || 0), 0);
    const financialDataForPDF = [
      { name: 'Collected This Month', amount: collectedThisMonth },
      { name: 'Total Outstanding', amount: totalOutstanding },
    ];
    
    // 3. Prepare rent breakdown data
    const rentBreakdownForPDF = (() => {
        const unitMap = new Map<string, Unit>();
        properties.forEach(p => {
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
        const rentPayments = payments.filter(p => p.status === 'Paid' && p.type === 'Rent');
        rentPayments.forEach(payment => {
            const tenant = tenants.find(t => t.id === payment.tenantId);
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
    
    generateDashboardReportPDF(statsForPDF, financialDataForPDF, rentBreakdownForPDF);
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
         <Button variant="outline" onClick={handleExportPDF}>
          <FileDown className="mr-2 h-4 w-4" />
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
                    <Separator />
                    <div>
                        <h3 className="text-lg font-semibold">Orientation Analytics</h3>
                        <p className="text-sm text-muted-foreground">Floor-by-floor breakdown of rented vs. vacant units by orientation.</p>
                        <OrientationAnalytics property={property} tenants={tenants} />
                    </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
