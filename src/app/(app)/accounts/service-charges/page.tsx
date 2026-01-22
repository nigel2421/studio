'use client';

import { useEffect, useState, useMemo } from 'react';
import { getProperties, getPropertyOwners, getTenants, getAllPayments } from '@/lib/data';
import type { Property, PropertyOwner, Unit, Tenant, Payment } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, FileSignature, MoreHorizontal, CheckCircle } from 'lucide-react';
import { isSameMonth, startOfMonth } from 'date-fns';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useLoading } from '@/hooks/useLoading';
import { generateOwnerServiceChargeStatementPDF } from '@/lib/pdf-generator';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AddPaymentDialog } from '@/components/financials/add-payment-dialog';

interface ServiceChargeAccount {
  propertyId: string;
  propertyName: string;
  unitName: string;
  unitServiceCharge: number;
  ownerId?: string;
  ownerName?: string;
  tenantId?: string;
  tenantName?: string;
  paymentStatus: 'Paid' | 'Pending' | 'Vacant';
  paymentAmount?: number;
  paymentDate?: string;
}

export default function ServiceChargesPage() {
  const [accounts, setAccounts] = useState<ServiceChargeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allOwners, setAllOwners] = useState<PropertyOwner[]>([]);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const { startLoading, stopLoading } = useLoading();
  const { toast } = useToast();

  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedTenantForPayment, setSelectedTenantForPayment] = useState<Tenant | null>(null);

  const fetchData = async () => {
    // No setLoading here, to avoid flicker on re-fetch
    try {
      const [propertiesData, ownersData, tenantsData, paymentsData] = await Promise.all([
        getProperties(),
        getPropertyOwners(),
        getTenants(),
        getAllPayments(),
      ]);
      
      setAllProperties(propertiesData);
      setAllOwners(ownersData);
      setAllTenants(tenantsData);
      setAllPayments(paymentsData);

      const selfManagedUnits: (Unit & { propertyId: string, propertyName: string })[] = [];
      propertiesData.forEach(p => {
        (p.units || []).forEach(u => {
          if (u.managementStatus === 'Client Self Fully Managed' && u.ownership === 'Landlord') {
            selfManagedUnits.push({ ...u, propertyId: p.id, propertyName: p.name });
          }
        });
      });

      const currentMonthStart = startOfMonth(new Date());

      const serviceChargeAccounts = selfManagedUnits.map(unit => {
        const owner = ownersData.find(o => o.assignedUnits?.some(au => au.propertyId === unit.propertyId && au.unitNames.includes(unit.name)));
        const tenant = tenantsData.find(t => t.propertyId === unit.propertyId && t.unitName === unit.name);
        
        let paymentStatus: ServiceChargeAccount['paymentStatus'] = 'Pending';
        let paymentAmount: number | undefined;
        
        if (!tenant) {
          paymentStatus = 'Vacant';
        } else {
          const relevantPayment = paymentsData.find(p => 
            p.tenantId === tenant.id &&
            p.type === 'ServiceCharge' &&
            isSameMonth(new Date(p.date), currentMonthStart)
          );
          
          if (relevantPayment) {
            paymentStatus = 'Paid';
            paymentAmount = relevantPayment.amount;
          }
        }

        return {
          propertyId: unit.propertyId,
          propertyName: unit.propertyName,
          unitName: unit.name,
          unitServiceCharge: unit.serviceCharge || 0,
          ownerId: owner?.id,
          ownerName: owner?.name || 'Unassigned',
          tenantId: tenant?.id,
          tenantName: tenant?.name,
          paymentStatus,
          paymentAmount,
        };
      });
      
      setAccounts(serviceChargeAccounts);

    } catch (error) {
      console.error("Failed to fetch service charge data:", error);
    } finally {
      if (loading) setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, []);

  const handleConfirmPayment = (account: ServiceChargeAccount) => {
    if (!account.tenantId) {
        toast({ variant: 'destructive', title: 'Cannot Record Payment', description: 'This unit is vacant and does not have an active resident to bill.' });
        return;
    }
    const tenant = allTenants.find(t => t.id === account.tenantId);
    if (!tenant) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not find resident details for this unit.' });
        return;
    }
    setSelectedTenantForPayment(tenant);
    setIsPaymentDialogOpen(true);
  };
  
  const handlePaymentAdded = () => {
    setIsPaymentDialogOpen(false);
    fetchData();
  };

  const handleGenerateStatement = (ownerId: string) => {
    startLoading('Generating Statement...');
    try {
        const owner = allOwners.find(o => o.id === ownerId);
        if (!owner) {
            throw new Error("Owner not found");
        }

        const ownerAssignedUnitIdentifiers = new Set(
            owner.assignedUnits.flatMap(au => au.unitNames.map(un => `${au.propertyId}-${un}`))
        );

        const relevantTenants = allTenants.filter(t => 
            ownerAssignedUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`)
        );
        const relevantTenantIds = relevantTenants.map(t => t.id);

        const serviceChargePayments = allPayments.filter(p =>
            relevantTenantIds.includes(p.tenantId) && p.type === 'ServiceCharge'
        );

        const paymentsForPDF = serviceChargePayments.map(p => {
            const tenant = allTenants.find(t => t.id === p.tenantId);
            const property = allProperties.find(prop => prop.id === tenant?.propertyId);
            return {
                date: p.date,
                property: property?.name || 'N/A',
                unit: tenant?.unitName || 'N/A',
                amount: p.amount
            };
        });

        generateOwnerServiceChargeStatementPDF(owner, paymentsForPDF);
    } catch (error: any) {
        console.error("Error generating statement:", error);
    } finally {
        stopLoading();
    }
  };


  const filteredAccounts = useMemo(() => {
    if (!searchTerm) return accounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return accounts.filter(acc =>
        acc.propertyName.toLowerCase().includes(lowercasedFilter) ||
        acc.unitName.toLowerCase().includes(lowercasedFilter) ||
        acc.ownerName?.toLowerCase().includes(lowercasedFilter)
    );
  }, [accounts, searchTerm]);

  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [filteredAccounts, currentPage, pageSize]);
  
  const totalPages = Math.ceil(filteredAccounts.length / pageSize);

  const getStatusVariant = (status: ServiceChargeAccount['paymentStatus']) => {
    switch (status) {
      case 'Paid': return 'default';
      case 'Pending': return 'destructive';
      case 'Vacant': return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Client Service Charges</h2>
          <p className="text-muted-foreground">Track service charge payments for self-managed client units.</p>
        </div>
      </div>
      <Card>
        <CardHeader>
             <div className="flex justify-between items-center">
                 <CardTitle>Service Charge Accounts</CardTitle>
                 <div className="relative w-full sm:w-[300px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by unit, owner..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
        </CardHeader>
        <CardContent className="p-0">
            {loading ? (
                 <div className="flex justify-center items-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 </div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Property / Unit</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Service Charge</TableHead>
                            <TableHead>Payment Status</TableHead>
                            <TableHead>Paid Amount</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedAccounts.map(acc => (
                            <TableRow key={`${acc.propertyId}-${acc.unitName}`}>
                                <TableCell>
                                    <div className="font-medium">{acc.propertyName}</div>
                                    <div className="text-sm text-muted-foreground">Unit {acc.unitName}</div>
                                </TableCell>
                                <TableCell>{acc.ownerName}</TableCell>
                                <TableCell>Ksh {acc.unitServiceCharge.toLocaleString()}</TableCell>
                                <TableCell>
                                    <Badge variant={getStatusVariant(acc.paymentStatus)}>
                                        {acc.paymentStatus}
                                    </Badge>
                                </TableCell>
                                <TableCell>{acc.paymentAmount ? `Ksh ${acc.paymentAmount.toLocaleString()}` : '-'}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Open menu</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() => handleConfirmPayment(acc)}
                                                disabled={acc.paymentStatus === 'Vacant' || !acc.tenantId}
                                            >
                                                <CheckCircle className="mr-2 h-4 w-4" />
                                                Confirm Payment
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => handleGenerateStatement(acc.ownerId!)}
                                                disabled={!acc.ownerId}
                                            >
                                                <FileSignature className="mr-2 h-4 w-4" />
                                                Generate Statement
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </CardContent>
        {filteredAccounts.length > 0 && (
          <div className="p-4 border-t">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={filteredAccounts.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </Card>
      <AddPaymentDialog
        properties={allProperties}
        tenants={allTenants}
        onPaymentAdded={handlePaymentAdded}
        open={isPaymentDialogOpen}
        onOpenChange={setIsPaymentDialogOpen}
        tenant={selectedTenantForPayment}
        defaultPaymentType="ServiceCharge"
      />
    </div>
  );
}
