
'use client';

import { useEffect, useState, useMemo } from 'react';
import { getTenants, getProperties, getAllPayments, getAllPendingWaterBills } from '@/lib/data';
import type { Tenant, Property, Payment, WaterMeterReading } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Percent, Users, Eye, AlertCircle, PlusCircle, ClipboardList, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { downloadCSV } from '@/lib/utils';
import { TransactionHistoryDialog } from '@/components/financials/transaction-history-dialog';
import { AddPaymentDialog } from '@/components/financials/add-payment-dialog';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { reconcileMonthlyBilling } from '@/lib/financial-logic';

export default function AccountsPage() {
  const [residents, setResidents] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingWaterBills, setPendingWaterBills] = useState<WaterMeterReading[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const fetchAllData = async () => {
    try {
      const [tenantsData, propertiesData, paymentsData, pendingWaterBillsData] = await Promise.all([
        getTenants(), 
        getProperties(),
        getAllPayments(),
        getAllPendingWaterBills(),
      ]);
      setResidents(tenantsData);
      setProperties(propertiesData);
      setPayments(paymentsData);
      setPendingWaterBills(pendingWaterBillsData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const displayResidents = useMemo(() => {
    if (!residents.length || !properties.length) return [];

    const propertiesMap = new Map(properties.map(p => [p.id, p]));
    
    const pendingBillsByTenant = new Map<string, number>();
    pendingWaterBills.forEach(bill => {
        const total = pendingBillsByTenant.get(bill.tenantId) || 0;
        pendingBillsByTenant.set(bill.tenantId, total + bill.amount);
    });

    return residents.map(tenant => {
        const property = propertiesMap.get(tenant.propertyId);
        const unit = property?.units.find(u => u.name === tenant.unitName);
        const updates = reconcileMonthlyBilling(tenant, unit, new Date());

        const updatedTenant = { ...tenant, lease: { ...tenant.lease } };

        if (updates.dueBalance !== undefined) {
            updatedTenant.dueBalance = updates.dueBalance;
        }
        if (updates.accountBalance !== undefined) {
            updatedTenant.accountBalance = updates.accountBalance;
        }
        if (updates['lease.paymentStatus'] !== undefined) {
            updatedTenant.lease.paymentStatus = updates['lease.paymentStatus'];
        }
        if (updates['lease.lastBilledPeriod'] !== undefined) {
            updatedTenant.lease.lastBilledPeriod = updates['lease.lastBilledPeriod'];
        }
        
        const totalPendingWater = pendingBillsByTenant.get(tenant.id) || 0;
        let chargeArrears = updatedTenant.dueBalance || 0;

        if (chargeArrears > 0) {
            chargeArrears = Math.max(0, chargeArrears - totalPendingWater);
        }

        return { ...updatedTenant, chargeArrears };
    });
  }, [residents, properties, pendingWaterBills]);

  const getPropertyName = (propertyId: string) => {
    const property = properties.find((p) => p.id === propertyId);
    return property ? property.name : 'N/A';
  };

  const getPaymentStatusVariant = (status?: Tenant['lease']['paymentStatus']) => {
    switch (status) {
      case 'Paid':
        return 'default';
      case 'Pending':
        return 'secondary';
      case 'Overdue':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const paymentsCollected = useMemo(() => payments
    .filter(p => (p.type === 'Rent' || p.type === 'ServiceCharge') && p.status === 'Paid')
    .reduce((sum, p) => sum + p.amount, 0), [payments]);

  const totalArrears = useMemo(() => displayResidents
    .reduce((sum, t) => sum + (t.chargeArrears || 0), 0), [displayResidents]);

  const totalUnits = useMemo(() => properties.reduce((sum, p) => sum + (Array.isArray(p.units) ? p.units.length : 0), 0), [properties]);
  const occupiedUnits = displayResidents.length;
  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

  const stats = [
    { title: "Payments Collected", value: `Ksh ${paymentsCollected.toLocaleString()}`, icon: DollarSign, color: "text-green-500" },
    { title: "Total Arrears", value: `Ksh ${totalArrears.toLocaleString()}`, icon: AlertCircle, color: "text-red-500" },
    { title: "Occupied Units", value: `${occupiedUnits}`, icon: Users, color: "text-purple-500" },
    { title: "Occupancy Rate", value: `${occupancyRate.toFixed(1)}%`, icon: Percent, color: "text-indigo-500" },
  ];

  const filteredResidents = displayResidents.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.unitName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredResidents.length / pageSize);
  const paginatedResidents = filteredResidents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleViewHistory = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setIsHistoryOpen(true);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Financial Accounts</h2>
          <p className="text-muted-foreground">A financial overview of your properties.</p>
        </div>
        <AddPaymentDialog properties={properties} tenants={residents} onPaymentAdded={fetchAllData} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 text-muted-foreground ${stat.color}`} />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

        <Card>
            <CardHeader>
              <CardTitle>Resident Financial Status</CardTitle>
              <CardDescription>Detailed list of resident lease and payment information.</CardDescription>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 gap-4">
                <div className="relative w-full sm:w-[300px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search resident, unit or email..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadCSV(filteredResidents, 'financial_status.csv')}>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resident</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Monthly Charge</TableHead>
                    <TableHead>Balance (Due)</TableHead>
                    <TableHead>Excess (Cr)</TableHead>
                    <TableHead className="text-right">Payment Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedResidents.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-sm text-muted-foreground">{tenant.email}</div>
                      </TableCell>
                      <TableCell>
                        <div>{getPropertyName(tenant.propertyId)}</div>
                        <div className="text-sm text-muted-foreground">Unit: {tenant.unitName}</div>
                      </TableCell>
                      <TableCell>
                        {tenant.lease && typeof (tenant.lease.rent || tenant.lease.serviceCharge) === 'number'
                          ? `Ksh ${(tenant.lease.rent || tenant.lease.serviceCharge).toLocaleString()}`
                          : 'N/A'
                        }
                      </TableCell>
                      <TableCell className="font-semibold text-destructive">
                        Ksh {(tenant.chargeArrears || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-green-600 font-semibold">
                        Ksh {(tenant.accountBalance || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={getPaymentStatusVariant(tenant.lease?.paymentStatus)}>
                          {tenant.lease?.paymentStatus || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleViewHistory(tenant)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <div className="p-4 border-t">
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredResidents.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </Card>
      
      <TransactionHistoryDialog
        tenant={selectedTenant}
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        onPaymentAdded={fetchAllData}
        allTenants={residents}
        allProperties={properties}
      />
    </div>
  );
}
