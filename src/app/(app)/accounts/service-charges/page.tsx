
'use client';

import { useEffect, useState, useMemo } from 'react';
import { getProperties, getPropertyOwners, getTenants, getAllPayments } from '@/lib/data';
import type { Property, PropertyOwner, Unit, Tenant, Payment } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, FileSignature, MoreHorizontal, CheckCircle, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { isSameMonth, startOfMonth, format, addMonths, subMonths, differenceInMonths } from 'date-fns';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useLoading } from '@/hooks/useLoading';
import { generateOwnerServiceChargeStatementPDF, generateVacantServiceChargeInvoicePDF } from '@/lib/pdf-generator';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AddPaymentDialog } from '@/components/financials/add-payment-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


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

interface VacantArrearsAccount {
    ownerId: string;
    ownerName: string;
    propertyId: string;
    propertyName: string;
    unitName: string;
    unitHandoverDate: string;
    monthsInArrears: number;
    totalDue: number;
    arrearsDetail: { month: string, amount: number }[];
    unit: Unit;
    owner: PropertyOwner;
    property: Property;
}

export default function ServiceChargesPage() {
  const [occupiedAccounts, setOccupiedAccounts] = useState<ServiceChargeAccount[]>([]);
  const [arrearsAccounts, setArrearsAccounts] = useState<VacantArrearsAccount[]>([]);
  
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
  
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));

  const fetchData = async () => {
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

  useEffect(() => {
    if(allProperties.length > 0) {
        // Occupied Units Logic
        const selfManagedUnits: (Unit & { propertyId: string, propertyName: string })[] = [];
        allProperties.forEach(p => {
            (p.units || []).forEach(u => {
                if (u.managementStatus === 'Client Self Fully Managed' && u.ownership === 'Landlord') {
                    selfManagedUnits.push({ ...u, propertyId: p.id, propertyName: p.name });
                }
            });
        });

        const occupiedServiceChargeAccounts = selfManagedUnits.map(unit => {
            const owner = allOwners.find(o => o.assignedUnits?.some(au => au.propertyId === unit.propertyId && au.unitNames.includes(unit.name)));
            const tenant = allTenants.find(t => t.propertyId === unit.propertyId && t.unitName === unit.name);
            
            let paymentStatus: ServiceChargeAccount['paymentStatus'] = 'Pending';
            let paymentAmount: number | undefined;
            
            if (!tenant) {
                paymentStatus = 'Vacant';
            } else {
                const relevantPayment = allPayments.find(p => 
                    p.tenantId === tenant.id &&
                    p.type === 'ServiceCharge' &&
                    p.status === 'Paid' &&
                    isSameMonth(new Date(p.date), selectedMonth)
                );
                if (relevantPayment && relevantPayment.amount >= (unit.serviceCharge || 0)) {
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
        setOccupiedAccounts(occupiedServiceChargeAccounts);

        // Vacant Units in Arrears Logic
        const vacantUnitsInArrears: VacantArrearsAccount[] = [];
        const unitsForArrears = allProperties.flatMap(p => p.units.map(u => ({...u, property: p}))).filter(u => 
            u.managementStatus === 'Client Self Fully Managed' &&
            u.ownership === 'Landlord' &&
            u.status === 'vacant' &&
            u.handoverStatus === 'Handed Over' &&
            u.handoverDate
        );

        unitsForArrears.forEach(unit => {
            const monthsSinceHandover = differenceInMonths(selectedMonth, new Date(unit.handoverDate!));

            if (monthsSinceHandover >= 3) {
                const owner = allOwners.find(o => o.assignedUnits?.some(au => au.propertyId === unit.property.id && au.unitNames.includes(unit.name)));
                if (owner) {
                    const arrearsDetail: { month: string, amount: number }[] = [];
                    for (let i = 3; i <= monthsSinceHandover; i++) {
                        const monthInArrears = addMonths(new Date(unit.handoverDate!), i);
                        arrearsDetail.push({
                            month: format(monthInArrears, 'MMMM yyyy'),
                            amount: unit.serviceCharge || 0
                        });
                    }

                    if(arrearsDetail.length > 0) {
                        vacantUnitsInArrears.push({
                            ownerId: owner.id,
                            ownerName: owner.name,
                            propertyId: unit.property.id,
                            propertyName: unit.property.name,
                            unitName: unit.name,
                            unitHandoverDate: unit.handoverDate!,
                            monthsInArrears: arrearsDetail.length,
                            totalDue: arrearsDetail.reduce((sum, item) => sum + item.amount, 0),
                            arrearsDetail,
                            unit,
                            owner,
                            property: unit.property
                        });
                    }
                }
            }
        });
        setArrearsAccounts(vacantUnitsInArrears);
    }
  }, [selectedMonth, allProperties, allOwners, allTenants, allPayments]);

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
    fetchData(); // Refetch all data
  };
  
  const handleGenerateInvoice = (arrears: VacantArrearsAccount) => {
    generateVacantServiceChargeInvoicePDF(arrears.owner, arrears.unit, arrears.property, arrears.arrearsDetail);
    toast({ title: 'Invoice Generated', description: `Invoice for ${arrears.unitName} has been downloaded.` });
  };


  const filteredAccounts = useMemo(() => {
    if (!searchTerm) return occupiedAccounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return occupiedAccounts.filter(acc =>
        acc.propertyName.toLowerCase().includes(lowercasedFilter) ||
        acc.unitName.toLowerCase().includes(lowercasedFilter) ||
        acc.ownerName?.toLowerCase().includes(lowercasedFilter)
    );
  }, [occupiedAccounts, searchTerm]);
  
  const filteredArrears = useMemo(() => {
    if (!searchTerm) return arrearsAccounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return arrearsAccounts.filter(acc =>
        acc.propertyName.toLowerCase().includes(lowercasedFilter) ||
        acc.unitName.toLowerCase().includes(lowercasedFilter) ||
        acc.ownerName?.toLowerCase().includes(lowercasedFilter)
    );
  }, [arrearsAccounts, searchTerm]);

  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Client Service Charges</h2>
          <p className="text-muted-foreground">Track service charge payments for self-managed client units.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-32 text-center">{format(selectedMonth, 'MMMM yyyy')}</span>
            <Button variant="outline" size="icon" onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
      </div>
      <Tabs defaultValue="occupied">
        <div className="flex justify-between items-center">
            <TabsList>
                <TabsTrigger value="occupied">Occupied Units</TabsTrigger>
                <TabsTrigger value="arrears">Vacant Units in Arrears</TabsTrigger>
            </TabsList>
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
        <TabsContent value="occupied">
           <OccupiedUnitsTab accounts={filteredAccounts} onConfirmPayment={handleConfirmPayment} />
        </TabsContent>
        <TabsContent value="arrears">
           <VacantArrearsTab arrears={filteredArrears} onGenerateInvoice={handleGenerateInvoice} />
        </TabsContent>
      </Tabs>
      
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

const OccupiedUnitsTab = ({ accounts, onConfirmPayment }: { accounts: ServiceChargeAccount[], onConfirmPayment: (acc: ServiceChargeAccount) => void }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Occupied Unit Service Charges</CardTitle>
                <CardDescription>Payments for units that are currently tenant-occupied.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
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
                        {accounts.map(acc => (
                            <TableRow key={`${acc.propertyId}-${acc.unitName}`}>
                                <TableCell>
                                    <div className="font-medium">{acc.propertyName}</div>
                                    <div className="text-sm text-muted-foreground">Unit {acc.unitName}</div>
                                </TableCell>
                                <TableCell>{acc.ownerName}</TableCell>
                                <TableCell>Ksh {acc.unitServiceCharge.toLocaleString()}</TableCell>
                                <TableCell>
                                    {acc.paymentStatus === 'Vacant' ? <Badge variant="secondary">Vacant</Badge> : 
                                    acc.paymentStatus === 'Paid' ? <Badge variant="default">Paid</Badge> : 
                                    <Badge variant="destructive">Pending</Badge>}
                                </TableCell>
                                <TableCell>{acc.paymentAmount ? `Ksh ${acc.paymentAmount.toLocaleString()}` : '-'}</TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onConfirmPayment(acc)}
                                        disabled={acc.paymentStatus === 'Vacant' || !acc.tenantId}
                                    >
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Confirm Payment
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                         {accounts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No occupied units match the criteria for this month.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};

const VacantArrearsTab = ({ arrears, onGenerateInvoice }: { arrears: VacantArrearsAccount[], onGenerateInvoice: (acc: VacantArrearsAccount) => void }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Vacant Units in Arrears</CardTitle>
                <CardDescription>Handed-over units vacant for over 3 months with outstanding service charges.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Owner</TableHead>
                            <TableHead>Property / Unit</TableHead>
                            <TableHead>Handover Date</TableHead>
                            <TableHead>Months in Arrears</TableHead>
                            <TableHead>Total Due</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {arrears.map(acc => (
                            <TableRow key={`${acc.propertyId}-${acc.unitName}`}>
                                <TableCell>
                                    <div className="font-medium">{acc.ownerName}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="font-medium">{acc.propertyName}</div>
                                    <div className="text-sm text-muted-foreground">Unit {acc.unitName}</div>
                                </TableCell>
                                <TableCell>{new Date(acc.unitHandoverDate).toLocaleDateString()}</TableCell>
                                <TableCell>{acc.monthsInArrears}</TableCell>
                                <TableCell>Ksh {acc.totalDue.toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" variant="destructive" onClick={() => onGenerateInvoice(acc)}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Generate Invoice
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {arrears.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No units in arrears for the selected period.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

