
'use client';

import { useEffect, useState, useMemo } from 'react';
import { getProperties, getPropertyOwners, getTenants, getAllPayments } from '@/lib/data';
import type { Property, PropertyOwner, Unit, Tenant, Payment } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, FileSignature } from 'lucide-react';
import { isSameMonth, startOfMonth } from 'date-fns';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/ui/pagination-controls';

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

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [properties, owners, tenants, payments] = await Promise.all([
          getProperties(),
          getPropertyOwners(),
          getTenants(),
          getAllPayments(),
        ]);

        const selfManagedUnits: (Unit & { propertyId: string, propertyName: string })[] = [];
        properties.forEach(p => {
          p.units.forEach(u => {
            if (u.managementStatus === 'Client Self Fully Managed' && u.ownership === 'Landlord') {
              selfManagedUnits.push({ ...u, propertyId: p.id, propertyName: p.name });
            }
          });
        });

        const currentMonthStart = startOfMonth(new Date());

        const serviceChargeAccounts = selfManagedUnits.map(unit => {
          const owner = owners.find(o => o.assignedUnits?.some(au => au.propertyId === unit.propertyId && au.unitNames.includes(unit.name)));
          const tenant = tenants.find(t => t.propertyId === unit.propertyId && t.unitName === unit.name);
          
          let paymentStatus: ServiceChargeAccount['paymentStatus'] = 'Pending';
          let paymentAmount: number | undefined;
          let paymentDate: string | undefined;
          
          if (!tenant) {
            paymentStatus = 'Vacant';
          } else {
            const relevantPayment = payments.find(p => 
              p.tenantId === tenant.id &&
              p.type === 'ServiceCharge' &&
              isSameMonth(new Date(p.date), currentMonthStart)
            );
            
            if (relevantPayment) {
              paymentStatus = 'Paid';
              paymentAmount = relevantPayment.amount;
              paymentDate = new Date(relevantPayment.date).toLocaleDateString();
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
            paymentDate,
          };
        });
        
        setAccounts(serviceChargeAccounts);

      } catch (error) {
        console.error("Failed to fetch service charge data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredAccounts = useMemo(() => {
    if (!searchTerm) return accounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return accounts.filter(acc =>
        acc.propertyName.toLowerCase().includes(lowercasedFilter) ||
        acc.unitName.toLowerCase().includes(lowercasedFilter) ||
        acc.ownerName?.toLowerCase().includes(lowercasedFilter) ||
        acc.tenantName?.toLowerCase().includes(lowercasedFilter)
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
                        placeholder="Search by unit, owner, tenant..."
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
                            <TableHead>Tenant</TableHead>
                            <TableHead>Expected Amount</TableHead>
                            <TableHead>Status (Current Month)</TableHead>
                            <TableHead>Paid Amount</TableHead>
                            <TableHead>Actions</TableHead>
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
                                <TableCell>{acc.tenantName || <Badge variant="outline">Vacant</Badge>}</TableCell>
                                <TableCell>Ksh {acc.unitServiceCharge.toLocaleString()}</TableCell>
                                <TableCell>
                                    <Badge variant={getStatusVariant(acc.paymentStatus)}>
                                        {acc.paymentStatus}
                                    </Badge>
                                </TableCell>
                                <TableCell>{acc.paymentAmount ? `Ksh ${acc.paymentAmount.toLocaleString()}` : '-'}</TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="sm" disabled={!acc.ownerId}>
                                        <FileSignature className="mr-2 h-4 w-4" />
                                        Statement
                                    </Button>
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
    </div>
  );
}
