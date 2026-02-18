
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Users, Building2, Wrench, AlertCircle, Building, Briefcase, BedDouble, UserCog, Home, Percent } from "lucide-react";
import type { Tenant, Property, MaintenanceRequest, Payment, Unit } from "@/lib/types";
import { calculateTransactionBreakdown } from "@/lib/financial-utils";
import { cn } from "@/lib/utils";

interface DashboardStatsProps {
  tenants: Tenant[];
  properties: Property[];
  maintenanceRequests: MaintenanceRequest[];
  payments: Payment[];
}

export function DashboardStats({ tenants, properties, maintenanceRequests, payments }: DashboardStatsProps) {
  // Only count residents with type 'Tenant' to align with the Residents module
  const activeTenantsOnly = tenants.filter(t => t.residentType === 'Tenant');
  const totalTenants = activeTenantsOnly.length;
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

  const stats = [
    { title: "Total Tenants", value: totalTenants, icon: Users, variant: 'default' },
    { title: "Occupancy Rate", value: `${occupancyRate.toFixed(1)}%`, icon: Percent, variant: 'success' },
    { title: "Vacant Units", value: vacantUnits, icon: Home, variant: 'default' },
    { title: "Total Arrears", value: `Ksh ${totalArrears.toLocaleString()}`, icon: AlertCircle, variant: 'danger' },
    { title: "Pending Maint.", value: pendingMaintenance, icon: Wrench, variant: 'warning' },
  ];

  const variantStyles = {
    default: {
      card: 'bg-card',
      icon: 'text-muted-foreground',
      value: 'text-foreground'
    },
    success: {
      card: 'bg-green-500/5 border-green-500/20',
      icon: 'text-green-600',
      value: 'text-green-900'
    },
    warning: {
      card: 'bg-yellow-500/5 border-yellow-500/20',
      icon: 'text-yellow-600',
      value: 'text-yellow-900'
    },
    danger: {
      card: 'bg-red-500/5 border-red-500/20',
      icon: 'text-red-600',
      value: 'text-red-900'
    },
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {stats.map((stat, index) => {
        const styles = variantStyles[stat.variant as keyof typeof variantStyles] || variantStyles.default;
        return (
          <Card key={index} className={cn(styles.card)}>
            <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={cn('h-4 w-4', styles.icon)} />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className={cn("text-2xl font-bold", styles.value)}>{stat.value}</div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
