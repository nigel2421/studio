'use client';

import { useEffect, useState, useMemo } from 'react';
import { getTenants, getProperties, getAllPayments } from '@/lib/data';
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

export default function AccountsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // State for Rent tab
  const [rentCurrentPage, setRentCurrentPage] = useState(1);
  const [rentPageSize, setRentPageSize] = useState(10);
  const [rentSearchTerm, setRentSearchTerm] = useState('');

  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const fetchAllData = async () => {
    try {
      const [tenantsData, propertiesData, paymentsData] = await Promise.all([
        getTenants(), 
        getProperties(),
        getAllPayments()
      ]);
      setTenants(tenantsData.filter(t => t.residentType === 'Tenant'));
      setProperties(propertiesData);
      setPayments(paymentsData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

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

  const rentCollected = useMemo(() => payments
    .filter(p => p.type === 'Rent' && p.status === 'Paid')
    .reduce((sum, p) => sum + p.amount, 0), [payments]);

  const rentArrears = useMemo(() => tenants
    .reduce((sum, t) => sum + (t.dueBalance || 0), 0), [tenants]);

  const totalUnits = useMemo(() => properties.reduce((sum, p) => sum + (Array.isArray(p.units) ? p.units.length : 0), 0), [properties]);
  const occupiedUnits = tenants.length;
  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

  const stats = [
    { title: "Rent Collected", value: `Ksh ${rentCollected.toLocaleString()}`, icon: DollarSign, color: "text-green-500" },
    { title: "Rent Arrears", value: `Ksh ${rentArrears.toLocaleString()}`, icon: AlertCircle, color: "text-red-500" },
    { title: "Occupied Units", value: `${occupiedUnits}`, icon: Users, color: "text-purple-500" },
    { title: "Occupancy Rate", value: `${occupancyRate.toFixed(1)}%`, icon: Percent, color: "text-indigo-500" },
  ];

  // Filtering for Rent tab
  const filteredRentTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(rentSearchTerm.toLowerCase()) ||
    t.unitName.toLowerCase().includes(rentSearchTerm.toLowerCase()) ||
    t.email.toLowerCase().includes(rentSearchTerm.toLowerCase())
  );

  const rentTotalPages = Math.ceil(filteredRentTenants.length / rentPageSize);
  const paginatedRentTenants = filteredRentTenants.slice(
    (rentCurrentPage - 1) * rentPageSize,
    rentCurrentPage * rentPageSize
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
        <AddPaymentDialog properties={properties} tenants={tenants} onPaymentAdded={fetchAllData} />
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
                <div className="relative w-full sm:w-[300px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tenant, unit or email..."
                    className="pl-9"
                    value={rentSearchTerm}
                    onChange={(e) => setRentSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadCSV(filteredRentTenants, 'rent_financial_status.csv')}>
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
                    <TableHead>Rent Amount</TableHead>
                    <TableHead>Balance (Due)</TableHead>
                    <TableHead>Excess (Cr)</TableHead>
                    <TableHead className="text-right">Payment Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRentTenants.map((tenant) => (
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
                currentPage={rentCurrentPage}
                totalPages={rentTotalPages}
                pageSize={rentPageSize}
                totalItems={filteredRentTenants.length}
                onPageChange={setRentCurrentPage}
                onPageSizeChange={setRentPageSize}
              />
            </div>
          </Card>
      
      <TransactionHistoryDialog
        tenant={selectedTenant}
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        onPaymentAdded={fetchAllData}
        allTenants={tenants}
        allProperties={properties}
      />
    </div>
  );
}
