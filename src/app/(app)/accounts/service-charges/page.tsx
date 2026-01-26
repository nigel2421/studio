
'use client';

import { useEffect, useState, useMemo } from 'react';
import { getProperties, getPropertyOwners, getTenants, getAllPayments, findOrCreateHomeownerTenant, addPayment } from '@/lib/data';
import type { Property, PropertyOwner, Unit, Tenant, Payment } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, FileSignature, MoreHorizontal, CheckCircle, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { isSameMonth, startOfMonth, format, addMonths, subMonths, differenceInMonths, isAfter } from 'date-fns';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AddPaymentDialog } from '@/components/financials/add-payment-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmOwnerPaymentDialog } from '@/components/financials/confirm-owner-payment-dialog';


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
    arrearsDetail: { month: string, amount: number, status: 'Paid' | 'Pending' }[];
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

  const { startLoading, stopLoading, isLoading: isSaving } = useLoading();
  const { toast } = useToast();

  const [isOwnerPaymentDialogOpen, setIsOwnerPaymentDialogOpen] = useState(false);
  const [ownerForPayment, setOwnerForPayment] = useState<PropertyOwner | null>(null);
  const [accountsForPayment, setAccountsForPayment] = useState<ServiceChargeAccount[]>([]);

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
                if (u.managementStatus === 'Client Managed' && u.ownership === 'Landlord' && u.handoverStatus === 'Handed Over') {
                    selfManagedUnits.push({ ...u, propertyId: p.id, propertyName: p.name });
                }
            });
        });

        const occupiedServiceChargeAccounts = selfManagedUnits.map(unit => {
            const owner = allOwners.find(o => o.assignedUnits?.some(au => au.propertyId === unit.propertyId && au.unitNames.includes(unit.name)));
            const tenant = allTenants.find(t => t.propertyId === unit.propertyId && t.unitName === unit.name);
            
            let paymentStatus: ServiceChargeAccount['paymentStatus'] = 'Pending';
            let paymentAmount: number | undefined;
            
            if (tenant) {
                 const relevantPayment = allPayments.find(p => 
                    p.tenantId === tenant.id &&
                    (p.type === 'ServiceCharge' || p.type === 'Rent') &&
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
            u.ownership === 'Landlord' &&
            u.handoverStatus === 'Handed Over' &&
            u.status === 'vacant'
        );

        unitsForArrears.forEach(unit => {
            const owner = allOwners.find(o => o.assignedUnits?.some(au => au.propertyId === unit.property.id && au.unitNames.includes(unit.name)));
            if (!owner) return;
            
            const homeownerTenant = allTenants.find(t => t.propertyId === unit.property.id && t.unitName === unit.name && t.residentType === 'Homeowner');
            
            const homeownerPayments = homeownerTenant ? allPayments.filter(p => p.tenantId === homeownerTenant.id && (p.type === 'ServiceCharge' || p.type === 'Rent')) : [];

            const paymentsByMonth = new Map<string, number>();
            homeownerPayments.forEach(p => {
                if (p.rentForMonth) {
                    paymentsByMonth.set(p.rentForMonth, (paymentsByMonth.get(p.rentForMonth) || 0) + p.amount);
                }
            });
            
            const handoverDate = new Date(unit.handoverDate!);
            const firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
            const today = new Date();
            const lastBillableMonth = startOfMonth(today);

            if (isAfter(firstBillableMonth, lastBillableMonth)) return;

            const monthsToBill = differenceInMonths(lastBillableMonth, firstBillableMonth);
            
            const arrearsDetail: { month: string, amount: number, status: 'Paid' | 'Pending' }[] = [];
            let totalDue = 0;
            let creditCarriedForward = 0;

            for (let i = 0; i <= monthsToBill; i++) {
                const monthDate = addMonths(firstBillableMonth, i);
                const monthString = format(monthDate, 'yyyy-MM');
                const monthLabel = format(monthDate, 'MMMM yyyy');
                const chargeForMonth = unit.serviceCharge || 0;
                
                if (chargeForMonth <= 0) continue;

                const paidForMonth = paymentsByMonth.get(monthString) || 0;
                const totalAvailableToPay = paidForMonth + creditCarriedForward;
                
                let status: 'Paid' | 'Pending';

                if (totalAvailableToPay >= chargeForMonth) {
                    status = 'Paid';
                    creditCarriedForward = totalAvailableToPay - chargeForMonth;
                } else {
                    status = 'Pending';
                    const amountPending = chargeForMonth - totalAvailableToPay;
                    totalDue += amountPending; // This will be the final running total of what's owed.
                    creditCarriedForward = 0;
                }
                
                arrearsDetail.push({ month: monthLabel, amount: chargeForMonth, status });
            }
            
            if (totalDue > 0) {
                vacantUnitsInArrears.push({
                    ownerId: owner.id,
                    ownerName: owner.name,
                    propertyId: unit.property.id,
                    propertyName: unit.property.name,
                    unitName: unit.name,
                    unitHandoverDate: unit.handoverDate!,
                    monthsInArrears: arrearsDetail.filter(d => d.status === 'Pending').length,
                    totalDue,
                    arrearsDetail,
                    unit,
                    owner,
                    property: unit.property
                });
            }
        });
        setArrearsAccounts(vacantUnitsInArrears);
    }
  }, [selectedMonth, allProperties, allOwners, allTenants, allPayments]);

  const handleOpenOwnerPaymentDialog = async (account: ServiceChargeAccount) => {
    if (!account.ownerId) {
        toast({ variant: 'destructive', title: 'Error', description: 'This unit is not assigned to an owner.' });
        return;
    }

    startLoading('Preparing consolidated payment...');
    try {
        const owner = allOwners.find(o => o.id === account.ownerId);
        if (!owner) throw new Error("Owner not found");

        const ownerAccounts = occupiedAccounts.filter(acc => acc.ownerId === account.ownerId && acc.paymentStatus === 'Pending');
        if (ownerAccounts.length === 0) {
            toast({ title: "No Pending Charges", description: "This owner has no pending service charges for the selected month." });
            return;
        }

        setOwnerForPayment(owner);
        setAccountsForPayment(ownerAccounts);
        setIsOwnerPaymentDialogOpen(true);

    } catch (error) {
        console.error("Error preparing consolidated payment:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not prepare consolidated payment.' });
    } finally {
        stopLoading();
    }
  };

  const handleConfirmOwnerPayment = async (paymentData: { amount: number; date: Date, notes: string, forMonth: string }) => {
    if (!ownerForPayment || accountsForPayment.length === 0) return;

    startLoading(`Recording payment for ${ownerForPayment.name}...`);
    try {
        let remainingAmount = paymentData.amount;

        // Step 1: Ensure all tenants exist and get their data.
        const tenantPromises = accountsForPayment.map(async (acc) => {
            let tenant = allTenants.find(t => t.propertyId === acc.propertyId && t.unitName === acc.unitName);
            if (tenant) return tenant;

            // If not found locally, try to find/create it in the database.
            const property = allProperties.find(p => p.id === acc.propertyId);
            const unit = property?.units.find(u => u.name === acc.unitName);
            if (property && unit && ownerForPayment) {
                return await findOrCreateHomeownerTenant(ownerForPayment, unit, property.id);
            }
            return null;
        });
        
        const tenantsForPayment = (await Promise.all(tenantPromises)).filter(Boolean) as Tenant[];
        
        if (tenantsForPayment.length !== accountsForPayment.length) {
            throw new Error(`Could not find or create resident accounts for all selected units. Expected ${accountsForPayment.length}, found ${tenantsForPayment.length}.`);
        }

        // Step 2: Create payment promises.
        const paymentPromises = [];
        let paymentsRecorded = 0;

        for (const account of accountsForPayment) {
            if (remainingAmount <= 0) break;

            const tenant = tenantsForPayment.find(t => t.propertyId === account.propertyId && t.unitName === account.unitName);
            if (tenant) {
                const amountToApply = Math.min(remainingAmount, account.unitServiceCharge);
                
                paymentPromises.push(addPayment({
                    tenantId: tenant.id,
                    amount: amountToApply,
                    date: format(paymentData.date, 'yyyy-MM-dd'),
                    notes: `Part of consolidated payment. ${paymentData.notes}`,
                    rentForMonth: paymentData.forMonth,
                    status: 'Paid',
                    type: 'ServiceCharge',
                }));

                remainingAmount -= amountToApply;
                paymentsRecorded++;
            }
        }
        
        // Step 3: Execute all payments.
        await Promise.all(paymentPromises);

        toast({ title: "Payment Recorded", description: `${paymentsRecorded} service charge payment(s) for ${ownerForPayment.name} have been recorded.` });
        
        setIsOwnerPaymentDialogOpen(false);
        fetchData(); // Refreshes all data.

    } catch (error: any) {
        console.error("Error recording consolidated payment:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'An error occurred while recording the payment.' });
    } finally {
        stopLoading();
    }
  }

  const handleGenerateInvoice = async (arrears: VacantArrearsAccount) => {
    const { generateVacantServiceChargeInvoicePDF } = await import('@/lib/pdf-generator');
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
           <OccupiedUnitsTab accounts={filteredAccounts} onConfirmPayment={handleOpenOwnerPaymentDialog} />
        </TabsContent>
        <TabsContent value="arrears">
           <VacantArrearsTab arrears={filteredArrears} onGenerateInvoice={handleGenerateInvoice} />
        </TabsContent>
      </Tabs>
      
      {ownerForPayment && (
        <ConfirmOwnerPaymentDialog
          isOpen={isOwnerPaymentDialogOpen}
          onClose={() => setIsOwnerPaymentDialogOpen(false)}
          ownerName={ownerForPayment.name}
          accounts={accountsForPayment}
          onConfirm={handleConfirmOwnerPayment}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

const OccupiedUnitsTab = ({ accounts, onConfirmPayment }: { accounts: ServiceChargeAccount[], onConfirmPayment: (acc: ServiceChargeAccount) => void }) => {
    const { toast } = useToast();

    const handleConfirmClick = (acc: ServiceChargeAccount) => {
        if (acc.paymentStatus === 'Vacant') {
            toast({
                variant: "destructive",
                title: "Cannot Record Payment",
                description: "This unit is vacant. Service charges for vacant units are handled under the 'Vacant Units in Arrears' tab or billed directly to the landlord.",
            });
            return;
        }
        onConfirmPayment(acc);
    };
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Occupied Unit Service Charges</CardTitle>
                <CardDescription>Payments for units that are currently client-occupied.</CardDescription>
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
                                     <Badge variant={
                                        acc.paymentStatus === 'Paid' ? 'default' :
                                        acc.paymentStatus === 'Pending' ? 'destructive' :
                                        'secondary'
                                    }>
                                        {acc.paymentStatus}
                                    </Badge>
                                </TableCell>
                                <TableCell>{acc.paymentAmount ? `Ksh ${acc.paymentAmount.toLocaleString()}` : '-'}</TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleConfirmClick(acc)}
                                        disabled={acc.paymentStatus === 'Paid'}
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
                <CardDescription>Handed-over units vacant with outstanding service charges.</CardDescription>
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

    

    

    

    
