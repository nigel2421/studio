
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Users, Building2, Wrench, AlertCircle, Building, Briefcase, BedDouble, UserCog, Home } from "lucide-react";
import type { Tenant, Property, MaintenanceRequest, Payment } from "@/lib/types";
import { calculateTransactionBreakdown } from "@/lib/financial-utils";

interface DashboardStatsProps {
  tenants: Tenant[];
  properties: Property[];
  maintenanceRequests: MaintenanceRequest[];
  payments: Payment[];
}

export function DashboardStats({ tenants, properties, maintenanceRequests, payments }: DashboardStatsProps) {
  const totalTenants = tenants.length;
  const totalProperties = properties.length;
  const pendingMaintenance = maintenanceRequests.filter(r => r.status !== 'Completed').length;
  const overdueRents = tenants.filter(t => t.lease && t.lease.paymentStatus === 'Overdue').length;

  const totalUnits = properties.reduce((sum, p) => sum + (p.units?.length || 0), 0);

  const occupiedUnits = (() => {
    const occupiedUnitIdentifiers = new Set<string>();

    // Add units that have a tenant
    tenants.forEach(tenant => {
      occupiedUnitIdentifiers.add(`${tenant.propertyId}-${tenant.unitName}`);
    });

    // Add units that are marked as occupied by their status (e.g., airbnb, client occupied)
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

  const stats = [
    { title: "Total Tenants", value: totalTenants, icon: Users, color: "text-blue-500" },
    { title: "Properties Managed", value: totalProperties, icon: Building, color: "text-green-500" },
    { title: "Occupied Units", value: occupiedUnits, icon: Building2, color: "text-purple-500" },
    { title: "Vacant Units", value: vacantUnits, icon: Home, color: "text-gray-500" },
    { title: "Eracovs Management Revenue", value: `Ksh ${totalMgmtFees.toLocaleString()}`, icon: Briefcase, color: "text-emerald-500" },
    { title: "Pending Maintenance", value: pendingMaintenance, icon: Wrench, color: "text-yellow-500" },
    { title: "Overdue Rents", value: overdueRents, icon: AlertCircle, color: "text-red-500" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 text-muted-foreground ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">
              {/* Additional context if needed */}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
