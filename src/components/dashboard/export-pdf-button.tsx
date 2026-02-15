'use client';

import { Button } from "@/components/ui/button";
import { useLoading } from "@/hooks/useLoading";
import { useToast } from "@/hooks/use-toast";
import { getAllMaintenanceRequestsForReport, getAllPaymentsForReport, getProperties, getTenants } from "@/lib/data";
import { calculateTransactionBreakdown } from "@/lib/financial-utils";
import { Payment, MaintenanceRequest, Tenant, Property, Unit, UnitOrientation, unitOrientations, UnitType, unitTypes } from "@/lib/types";
import { isSameMonth } from "date-fns";
import { FileDown, Loader2 } from "lucide-react";

interface ExportPdfButtonProps {
    propertyId: string | null;
    propertyName?: string;
}

export function ExportPdfButton({ propertyId, propertyName }: ExportPdfButtonProps) {
    const { startLoading, stopLoading, isLoading } = useLoading();
    const { toast } = useToast();

    const handleExportPDF = async () => {
        if (!propertyId) {
            toast({
                variant: "destructive",
                title: "No Property Selected",
                description: "Please select a property to generate a report.",
            });
            return;
        }
        startLoading('Generating report for ' + propertyName);
        try {
          const { generateDashboardReportPDF } = await import('@/lib/pdf-generator');
    
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
    
          const propertyForReport = allPropertiesForReport.find((p: Property) => p.id === propertyId);
          if (!propertyForReport) return;
    
          const tenantsForProp = allTenantsForReport.filter((t: Tenant) => t.propertyId === propertyId);
          const maintenanceForProp = allMaintenanceForReport.filter((m: MaintenanceRequest) => m.propertyId === propertyId);
          const tenantIds = new Set(tenantsForProp.map((t: Tenant) => t.id));
          const paymentsForProp = allPaymentsForReport.filter((p: Payment) => tenantIds.has(p.tenantId));
    
          const totalTenants = tenantsForProp.length;
          const totalUnits = propertyForReport.units?.length || 0;
          
          const occupiedUnits = new Set(tenantsForProp.map((t: Tenant) => t.unitName)).size;
          const vacantUnits = totalUnits - occupiedUnits;
          const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
          
          const pendingMaintenance = maintenanceForProp.filter((r: MaintenanceRequest) => r.status !== 'Completed').length;
          const totalArrears = tenantsForProp.reduce((sum: number, t: Tenant) => sum + (t.dueBalance || 0), 0);
          
          const totalMgmtFees = paymentsForProp.reduce((sum: number, p: Payment) => {
            if (p.type === 'Deposit') return sum;
            const tenant = tenantsForProp.find((t: Tenant) => t.id === p.tenantId);
            if (!tenant) return sum;
            const unit = propertyForReport.units.find((u: Unit) => u.name === tenant.unitName);
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
            .filter((p: Payment) => p.status === 'Paid' && isSameMonth(new Date(p.date), new Date()))
            .reduce((sum: number, p: Payment) => sum + p.amount, 0);
    
          const financialDataForPDF = [
            { name: 'Collected This Month', amount: collectedThisMonth },
            { name: 'Total Outstanding', amount: totalArrears },
          ];
          
          const rentBreakdownForPDF = (() => {
            const breakdown: { [key in UnitType]?: { smRent: number, landlordRent: number } } = {};
            unitTypes.forEach(type => {
              breakdown[type] = { smRent: 0, landlordRent: 0 };
            });
            const rentPayments = paymentsForProp.filter((p: Payment) => p.status === 'Paid' && p.type === 'Rent');
            rentPayments.forEach((payment: Payment) => {
              const tenant = tenantsForProp.find((t: Tenant) => t.id === payment.tenantId);
              if (!tenant) return;
              const unit = propertyForReport.units.find((u: Unit) => u.name === tenant.unitName);
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
            count: maintenanceForProp.filter((r: MaintenanceRequest) => r.status === status).length
          }));
    
          const orientationCounts: { [key in UnitOrientation]?: number } = {};
          propertyForReport.units.forEach((unit: Unit) => {
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
          toast({variant: 'destructive', title: 'Error', description: 'Failed to generate PDF report.'});
        } finally {
          stopLoading();
        }
      }

    return (
        <Button className="w-full sm:w-auto" variant="outline" onClick={handleExportPDF} disabled={isLoading || !propertyId}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            Export PDF Report
        </Button>
    )
}
