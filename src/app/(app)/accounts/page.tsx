'use client';

import { useEffect, useState, useMemo } from 'react';
import { getTenants, getProperties, getAllPaymentsForReport } from '@/lib/data';
import type { Tenant, Property, Payment } from '@/lib/types';
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
import { generateLedger, getRecommendedPaymentStatus } from '@/lib/financial-logic';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AccountsPage() {
  const [residents, setResidents] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const fetchAllData = async () => {
    try {
      const [tenantsData, propertiesData, paymentsData] = await Promise.all([
        getTenants(), 
        getProperties(),
        getAllPaymentsForReport(),
      ]);
      setResidents(tenantsData);
      setProperties(propertiesData);
      setPayments(paymentsData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const tenantsOnly = useMemo(() => {
    return residents
      .filter(r => r.residentType === 'Tenant')
      .map(tenant => ({
          ...tenant,
          // Ensure paymentStatus is always fresh based on balance and 5th of month rule
          lease: {
              ...tenant.lease,
              paymentStatus: getRecommendedPaymentStatus(tenant)
          }
      }));
  }, [residents]);

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
    .filter(p => p.type === 'Rent' && p.status === 'Paid')
    .reduce((sum, p) => sum + p.amount, 0), [payments]);

  const totalArrears = useMemo(() => tenantsOnly
    .reduce((sum, t) => sum + (t.dueBalance || 0), 0), [tenantsOnly]);

  const totalUnits = useMemo(() => properties.reduce((sum, p) => sum + (Array.isArray(p.units) ? p.units.length : 0), 0), [properties]);
  const occupiedUnits = tenantsOnly.length;
  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

  const stats = [
    { title: "Rent Collected", value: `Ksh ${paymentsCollected.toLocaleString()}`, icon: DollarSign, color: "text-green-500" },
    { title: "Total Rent Arrears", value: `Ksh ${totalArrears.toLocaleString()}`, icon: AlertCircle, color: "text-red-500" },
    { title: "Active Tenants", value: `${occupiedUnits}`, icon: Users, color: "text-purple-500" },
    { title: "Portfolio Occupancy", value: `${occupancyRate.toFixed(1)}%`, icon: Percent, color: "text-indigo-500" },
  ];

  const filteredTenants = useMemo(() => {
    return tenantsOnly.filter(t => {
      const searchMatch =
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.unitName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      const statusMatch = statusFilter === 'all' || t.lease?.paymentStatus === statusFilter;
      
      return searchMatch && statusMatch;
    });
  }, [tenantsOnly, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredTenants.length / pageSize);
  const paginatedTenants = filteredTenants.slice(
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
          <h2 className="text-3xl font-bold tracking-tight">Tenant Accounts</h2>
          <p className="text-muted-foreground">A financial overview of tenant rent accounts.</p>
        </div>
        <AddPaymentDialog properties={properties} tenants={tenantsOnly} onPaymentAdded={fetchAllData} />
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
              <CardTitle>Tenant Financial Status</CardTitle>
              <CardDescription>Detailed list of tenant lease and payment information.</CardDescription>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-[300px]">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search tenant, unit or email..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadCSV(filteredTenants, 'financial_status.csv')}>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Monthly Rent</TableHead>
                    <TableHead>Balance (Due)</TableHead>
                    <TableHead>Excess (Cr)</TableHead>
                    <TableHead className="text-right">Payment Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTenants.map((tenant) => (
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
                        {tenant.lease && typeof tenant.lease.rent === 'number'
                          ? `Ksh ${tenant.lease.rent.toLocaleString()}`
                          : 'N/A'
                        }
                      </TableCell>
                      <TableCell className="font-semibold text-destructive">
                        Ksh {(tenant.dueBalance || 0).toLocaleString()}
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
                          <Eye className="mr-2 h-4 w-4" />
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
                totalItems={filteredTenants.length}
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
        allTenants={tenantsOnly}
        allProperties={properties}
      />
    </div>
  );
}
