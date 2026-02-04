
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { getProperties, getPropertyOwners, getTenants, getAllPayments, findOrCreateHomeownerTenant, addPayment, getLandlords } from '@/lib/data';
import type { Property, PropertyOwner, Unit, Tenant, Payment, Landlord } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, MoreHorizontal, CheckCircle, ChevronLeft, ChevronRight, FileText, Eye, ChevronDown, FileSignature, PlusCircle, Building2, AlertCircle, PieChart, DollarSign } from 'lucide-react';
import { isSameMonth, startOfMonth, format, addMonths, subMonths, isAfter, parseISO, isValid } from 'date-fns';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AddPaymentDialog } from '@/components/financials/add-payment-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmOwnerPaymentDialog } from '@/components/financials/confirm-owner-payment-dialog';
import { OwnerTransactionHistoryDialog } from '@/components/financials/owner-transaction-history-dialog';
import {
    groupAccounts,
    processServiceChargeData,
    ServiceChargeAccount,
    GroupedServiceChargeAccount,
    VacantArrearsAccount,
} from '@/lib/service-charge';


export default function ServiceChargesPage() {
  const [selfManagedAccounts, setSelfManagedAccounts] = useState<ServiceChargeAccount[]>([]);
  const [managedVacantAccounts, setManagedVacantAccounts] = useState<ServiceChargeAccount[]>([]);
  const [arrearsAccounts, setArrearsAccounts] = useState<VacantArrearsAccount[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [smCurrentPage, setSmCurrentPage] = useState(1);
  const [smPageSize, setSmPageSize] = useState(10);
  const [smStatusFilter, setSmStatusFilter] = useState<'all' | 'Paid' | 'Pending'>('all');

  const [mvCurrentPage, setMvCurrentPage] = useState(1);
  const [mvPageSize, setMvPageSize] = useState(10);
  const [mvStatusFilter, setMvStatusFilter] = useState<'all' | 'Paid' | 'Pending' | 'N/A'>('all');

  const [arrearsCurrentPage, setArrearsCurrentPage] = useState(1);
  const [arrearsPageSize, setArrearsPageSize] = useState(10);
  
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [allOwners, setAllOwners] = useState<PropertyOwner[]>([]);
  const [allLandlords, setAllLandlords] = useState<Landlord[]>([]);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);

  const { startLoading, stopLoading, isLoading: isSaving } = useLoading();
  const { toast } = useToast();

  const [isOwnerPaymentDialogOpen, setIsOwnerPaymentDialogOpen] = useState(false);
  const [ownerForPayment, setOwnerForPayment] = useState<PropertyOwner | Landlord | null>(null);
  const [accountsForPayment, setAccountsForPayment] = useState<ServiceChargeAccount[]>([]);
  const [totalBalanceForDialog, setTotalBalanceForDialog] = useState(0);

  
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [ownerForHistory, setOwnerForHistory] = useState<PropertyOwner | Landlord | null>(null);
  const [statusForHistory, setStatusForHistory] = useState<'Paid' | 'Pending' | 'N/A' | null>(null);


  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');

  const fetchData = async () => {
    try {
      const [propertiesData, ownersData, tenantsData, paymentsData, landlordsData] = await Promise.all([
        getProperties(),
        getPropertyOwners(),
        getTenants(),
        getAllPayments(),
        getLandlords(),
      ]);
      
      setAllProperties(propertiesData);
      setAllOwners(ownersData);
      setAllTenants(tenantsData);
      setAllPayments(paymentsData);
      setAllLandlords(landlordsData);

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
    if (loading) return;

    const {
        clientOccupiedServiceChargeAccounts,
        managedVacantServiceChargeAccounts,
        vacantArrears,
    } = processServiceChargeData(
        allProperties,
        allOwners,
        allTenants,
        allPayments,
        allLandlords,
        selectedMonth
    );

    setSelfManagedAccounts(clientOccupiedServiceChargeAccounts);
    setManagedVacantAccounts(managedVacantServiceChargeAccounts);
    setArrearsAccounts(vacantArrears);

  }, [loading, selectedMonth, allProperties, allOwners, allTenants, allPayments, allLandlords]);

  const {
      filteredSelfManagedAccounts,
      filteredManagedVacantAccounts,
      filteredArrearsAccounts
  } = useMemo(() => {
      if (selectedPropertyId === 'all') {
          return {
              filteredSelfManagedAccounts: selfManagedAccounts,
              filteredManagedVacantAccounts: managedVacantAccounts,
              filteredArrearsAccounts: arrearsAccounts,
          };
      }
      return {
          filteredSelfManagedAccounts: selfManagedAccounts.filter(a => a.propertyId === selectedPropertyId),
          filteredManagedVacantAccounts: managedVacantAccounts.filter(a => a.propertyId === selectedPropertyId),
          filteredArrearsAccounts: arrearsAccounts.filter(a => a.propertyId === selectedPropertyId),
      };
  }, [selectedPropertyId, selfManagedAccounts, managedVacantAccounts, arrearsAccounts]);
  
  const stats = useMemo(() => {
      const relevantAccounts = [...filteredSelfManagedAccounts, ...filteredManagedVacantAccounts].filter(acc => acc.paymentStatus !== 'N/A');
      const totalUnits = relevantAccounts.length;

      const paidAccounts = relevantAccounts.filter(a => a.paymentStatus === 'Paid');
      const pendingAccounts = relevantAccounts.filter(a => a.paymentStatus === 'Pending');

      const totalPaid = paidAccounts.reduce((sum, acc) => sum + acc.unitServiceCharge, 0);
      const totalPending = pendingAccounts.reduce((sum, acc) => sum + acc.unitServiceCharge, 0);

      const totalCharged = totalPaid + totalPending;
      const paidPercentage = totalCharged > 0 ? (totalPaid / totalCharged) * 100 : 0;

      return { totalUnits, totalPaid, totalPending, paidPercentage };
  }, [filteredSelfManagedAccounts, filteredManagedVacantAccounts]);


  const handleOpenHistoryDialog = (group: GroupedServiceChargeAccount) => {
    let ownerForDialog: PropertyOwner | Landlord | undefined;
    ownerForDialog = allOwners.find(o => o.id === group.ownerId) || allLandlords.find(l => l.id === group.ownerId);
    
    if (ownerForDialog) {
        setOwnerForHistory(ownerForDialog);
        setStatusForHistory(group.paymentStatus);
        setIsHistoryOpen(true);
    } else {
        toast({ variant: 'destructive', title: 'Error', description: 'Owner details not found.' });
    }
  };

  const handleOpenOwnerPaymentDialog = async (account: ServiceChargeAccount, source: 'client-occupied' | 'managed-vacant') => {
    if (!account.ownerId) {
        toast({ variant: 'destructive', title: 'Error', description: 'This unit is not assigned to an owner.' });
        return;
    }

    startLoading('Preparing consolidated payment...');
    try {
        const owner: PropertyOwner | Landlord | undefined = 
            allOwners.find(o => o.id === account.ownerId) ||
            allLandlords.find(l => l.id === account.ownerId);

        if (!owner) throw new Error("Owner not found");
        
        // --- START: Calculate total balance from transaction history ---
        const ownerUnits: Unit[] = allProperties.flatMap(p =>
            (p.units || []).filter(u => {
                const isDirectlyAssigned = u.landlordId === owner.id;
                const ownerWithAssignedUnits = owner as PropertyOwner;
                const isAssignedViaOwnerObject = ownerWithAssignedUnits.assignedUnits?.some(au => au.propertyId === p.id && au.unitNames.includes(u.name));
                return isDirectlyAssigned || isAssignedViaOwnerObject;
            }).map(u => ({ ...u, propertyId: p.id, propertyName: p.name }))
        );

        const relevantTenants = allTenants.filter(t =>
            t.residentType === 'Homeowner' &&
            ownerUnits.some(u => u.propertyId === t.propertyId && u.name === t.unitName)
        );
        const relevantTenantIds = relevantTenants.map(t => t.id);
        const allOwnerPayments = allPayments.filter(p => relevantTenantIds.includes(p.tenantId));

        const allHistoricalTransactions: { date: Date, charge: number, payment: number }[] = [];

        allOwnerPayments.forEach(p => {
            allHistoricalTransactions.push({
                date: new Date(p.date),
                charge: 0,
                payment: p.amount
            });
        });

        ownerUnits.forEach(unit => {
            const monthlyCharge = unit.serviceCharge || 0;
            if (monthlyCharge <= 0) return;

            const tenant = relevantTenants.find(t => t.propertyId === unit.propertyId && t.unitName === unit.name);

            let firstBillableMonth: Date | null = null;
            
            if (tenant?.lease.lastBilledPeriod && tenant.lease.lastBilledPeriod.trim() !== '' && !/^\d{4}-NaN$/.test(tenant.lease.lastBilledPeriod)) {
                firstBillableMonth = startOfMonth(addMonths(new Date(tenant.lease.lastBilledPeriod + '-02'), 1));
            } else if (unit.handoverStatus === 'Handed Over') {
                const dateToUse = unit.handoverDate || tenant?.lease.startDate;
                if (dateToUse) {
                    const effectiveDate = new Date(dateToUse);
                    if(isValid(effectiveDate)) {
                        const handoverDay = effectiveDate.getDate();
                        if (handoverDay <= 10) {
                            firstBillableMonth = startOfMonth(effectiveDate);
                        } else {
                            firstBillableMonth = startOfMonth(addMonths(effectiveDate, 1));
                        }
                    }
                }
            }

            if (firstBillableMonth) {
                let loopDate = firstBillableMonth;
                const endOfPeriod = new Date(); // Calculate up to today
                while (loopDate <= endOfPeriod) {
                    allHistoricalTransactions.push({
                        date: loopDate,
                        charge: monthlyCharge,
                        payment: 0,
                    });
                    loopDate = addMonths(loopDate, 1);
                }
            }
        });

        const combinedItems = [...allHistoricalTransactions].sort((a, b) => {
            const dateDiff = a.date.getTime() - b.date.getTime();
            if (dateDiff !== 0) return dateDiff;
            if (a.charge > 0 && b.payment > 0) return -1;
            if (a.payment > 0 && b.charge > 0) return 1;
            return 0;
        });

        let runningBalance = 0;
        combinedItems.forEach(item => {
            runningBalance += item.charge;
            runningBalance -= item.payment;
        });
        const totalBalanceDue = runningBalance > 0 ? runningBalance : 0;
        // --- END: Calculate total balance ---
        
        const sourceAccounts = source === 'client-occupied' ? selfManagedAccounts : managedVacantAccounts;

        const ownerAccounts = sourceAccounts.filter(acc => acc.ownerId === account.ownerId && acc.paymentStatus === 'Pending');
        
        if (totalBalanceDue <= 0) {
            toast({ title: "No Pending Charges", description: "This owner has no outstanding balance." });
            stopLoading();
            return;
        }

        setOwnerForPayment(owner);
        setAccountsForPayment(ownerAccounts);
        setTotalBalanceForDialog(totalBalanceDue);
        setIsOwnerPaymentDialogOpen(true);

    } catch (error) {
        console.error("Error preparing consolidated payment:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not prepare consolidated payment.' });
    } finally {
        stopLoading();
    }
  };

  const handleConfirmOwnerPayment = async (paymentData: { amount: number; date: Date, notes: string, forMonth: string; paymentMethod: Payment['paymentMethod'], transactionId: string }) => {
    if (!ownerForPayment || accountsForPayment.length === 0) return;

    startLoading(`Recording payment for ${ownerForPayment.name}...`);
    try {
        let remainingAmount = paymentData.amount;

        const tenantPromises = accountsForPayment.map(async (acc) => {
            let tenant = allTenants.find(t => t.propertyId === acc.propertyId && t.unitName === acc.unitName);
            if (tenant) return tenant;

            const property = allProperties.find(p => p.id === acc.propertyId);
            const unit = property?.units.find(u => u.name === acc.unitName);
            if (property && unit && ownerForPayment) {
                 const ownerAsPropertyOwner: PropertyOwner = {
                    id: ownerForPayment.id,
                    name: ownerForPayment.name,
                    email: ownerForPayment.email,
                    phone: ownerForPayment.phone,
                    userId: ownerForPayment.userId,
                    bankAccount: 'bankAccount' in ownerForPayment ? ownerForPayment.bankAccount : undefined,
                    assignedUnits: 'assignedUnits' in ownerForPayment ? ownerForPayment.assignedUnits : [],
                };
                return await findOrCreateHomeownerTenant(ownerAsPropertyOwner, unit, property.id);
            }
            return null;
        });
        
        const tenantsForPayment = (await Promise.all(tenantPromises)).filter(Boolean) as Tenant[];
        
        if (tenantsForPayment.length !== accountsForPayment.length) {
            throw new Error(`Could not find or create resident accounts for all selected units. Expected ${accountsForPayment.length}, found ${tenantsForPayment.length}.`);
        }

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
                    notes: paymentData.notes,
                    rentForMonth: paymentData.forMonth,
                    status: 'Paid',
                    type: 'ServiceCharge',
                    paymentMethod: paymentData.paymentMethod,
                    transactionId: paymentData.transactionId,
                }));

                remainingAmount -= amountToApply;
                paymentsRecorded++;
            }
        }
        
        await Promise.all(paymentPromises);

        toast({ title: "Payment Recorded", description: `${paymentsRecorded} service charge payment(s) for ${ownerForPayment.name} have been recorded.` });
        
        setIsOwnerPaymentDialogOpen(false);
        fetchData();

    } catch (error: any) {
        console.error("Error recording consolidated payment:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'An error occurred while recording the payment.' });
    } finally {
        stopLoading();
    }
  }

  const handleGenerateInvoice = async (arrears: VacantArrearsAccount) => {
    const { generateVacantServiceChargeInvoicePDF } = await import('@/lib/pdf-generator');
    generateVacantServiceChargeInvoicePDF(arrears.owner, arrears.unit, arrears.property, arrears.arrearsDetail, arrears.totalDue);
    toast({ title: 'Invoice Generated', description: `Invoice for ${arrears.unitName} has been downloaded.` });
  };


  const filteredGroupedSmAccounts = useMemo(() => groupAccounts(filteredSelfManagedAccounts), [filteredSelfManagedAccounts]);
  const filteredGroupedMvAccounts = useMemo(() => groupAccounts(filteredManagedVacantAccounts), [filteredManagedVacantAccounts]);


  const finalFilteredSelfManaged = useMemo(() => {
    let accounts = filteredGroupedSmAccounts;
    if (smStatusFilter !== 'all') {
      accounts = accounts.filter(group => group.paymentStatus === smStatusFilter);
    }
    if (!searchTerm) return accounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return accounts.filter(group =>
        group.ownerName?.toLowerCase().includes(lowercasedFilter) ||
        group.units.some(u => u.unitName.toLowerCase().includes(lowercasedFilter) || u.propertyName.toLowerCase().includes(lowercasedFilter))
    );
  }, [filteredGroupedSmAccounts, searchTerm, smStatusFilter]);
  
  const smTotalPages = Math.ceil(finalFilteredSelfManaged.length / smPageSize);
  const paginatedSmAccounts = finalFilteredSelfManaged.slice((smCurrentPage - 1) * smPageSize, smCurrentPage * smPageSize);

  const finalFilteredManagedVacant = useMemo(() => {
    let accounts = filteredGroupedMvAccounts;
    if (mvStatusFilter !== 'all') {
        accounts = accounts.filter(group => group.paymentStatus === mvStatusFilter);
    }
    if (!searchTerm) return accounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return accounts.filter(group =>
        group.ownerName?.toLowerCase().includes(lowercasedFilter) ||
        group.units.some(u => u.unitName.toLowerCase().includes(lowercasedFilter) || u.propertyName.toLowerCase().includes(lowercasedFilter))
    );
  }, [filteredGroupedMvAccounts, searchTerm, mvStatusFilter]);

  const mvTotalPages = Math.ceil(finalFilteredManagedVacant.length / mvPageSize);
  const paginatedMvAccounts = finalFilteredManagedVacant.slice((mvCurrentPage - 1) * mvPageSize, mvCurrentPage * mvPageSize);
  
  const finalFilteredArrears = useMemo(() => {
    if (!searchTerm) return filteredArrearsAccounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return filteredArrearsAccounts.filter(acc =>
        acc.propertyName.toLowerCase().includes(lowercasedFilter) ||
        acc.unitName.toLowerCase().includes(lowercasedFilter) ||
        acc.ownerName?.toLowerCase().includes(lowercasedFilter)
    );
  }, [filteredArrearsAccounts, searchTerm]);

  const arrearsTotalPages = Math.ceil(finalFilteredArrears.length / arrearsPageSize);
  const paginatedArrears = finalFilteredArrears.slice((arrearsCurrentPage - 1) * arrearsPageSize, arrearsCurrentPage * arrearsPageSize);

  return (
    <div className="space-y-6">
       <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Client Service Charges</h2>
          <p className="text-muted-foreground">Track service charge payments for all client-owned units.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
             <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                <SelectTrigger className="w-full sm:w-[240px]">
                    <SelectValue placeholder="Filter by property..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Properties</SelectItem>
                    {allProperties.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <div className="flex items-center gap-2 justify-end w-full">
              <Button variant="outline" size="icon" onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium w-32 text-center">{format(selectedMonth, 'MMMM yyyy')}</span>
              <Button variant="outline" size="icon" onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
        </div>
      </div>
      
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Billable Client Units</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUnits}</div>
              <p className="text-xs text-muted-foreground">Units with a service charge for {format(selectedMonth, 'MMMM')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paid Service Charge</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Ksh {stats.totalPaid.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Collected for {format(selectedMonth, 'MMMM')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Service Charge</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Ksh {stats.totalPending.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Outstanding for {format(selectedMonth, 'MMMM')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paid Percentage</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.paidPercentage.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Of total billable charges for {format(selectedMonth, 'MMMM')}</p>
            </CardContent>
          </Card>
      </div>

      <Tabs defaultValue="client-occupied">
        <div className="flex justify-between items-center">
            <TabsList>
                <TabsTrigger value="client-occupied">Client Occupied</TabsTrigger>
                <TabsTrigger value="managed-vacant">Managed Vacant</TabsTrigger>
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
        <TabsContent value="client-occupied">
           <ServiceChargeStatusTable
              title="Client Occupied Unit Service Charges"
              description="Payments for units currently occupied and managed by clients."
              accounts={paginatedSmAccounts}
              onConfirmPayment={(acc) => handleOpenOwnerPaymentDialog(acc, 'client-occupied')}
              onViewHistory={handleOpenHistoryDialog}
              statusFilter={smStatusFilter}
              onStatusFilterChange={(status) => { setSmStatusFilter(status as any); setSmCurrentPage(1); }}
              currentPage={smCurrentPage}
              pageSize={smPageSize}
              totalPages={smTotalPages}
              onPageChange={setSmCurrentPage}
              onPageSizeChange={setSmPageSize}
              totalItems={finalFilteredSelfManaged.length}
            />
        </TabsContent>
        <TabsContent value="managed-vacant">
            <ServiceChargeStatusTable
              title="Managed Vacant Unit Service Charges"
              description="Service charge payments for handed-over vacant units managed by Eracov."
              accounts={paginatedMvAccounts}
              onConfirmPayment={(acc) => handleOpenOwnerPaymentDialog(acc, 'managed-vacant')}
              onViewHistory={handleOpenHistoryDialog}
              statusFilter={mvStatusFilter}
              onStatusFilterChange={(status) => { setMvStatusFilter(status as any); setMvCurrentPage(1); }}
              currentPage={mvCurrentPage}
              pageSize={mvPageSize}
              totalPages={mvTotalPages}
              onPageChange={setMvCurrentPage}
              onPageSizeChange={setMvPageSize}
              totalItems={finalFilteredManagedVacant.length}
            />
        </TabsContent>
        <TabsContent value="arrears">
           <VacantArrearsTab
              arrears={paginatedArrears}
              onGenerateInvoice={handleGenerateInvoice}
              currentPage={arrearsCurrentPage}
              pageSize={arrearsPageSize}
              totalPages={arrearsTotalPages}
              onPageChange={setArrearsCurrentPage}
              onPageSizeChange={setArrearsPageSize}
              totalItems={finalFilteredArrears.length}
            />
        </TabsContent>
      </Tabs>
      
      {ownerForPayment && (
        <ConfirmOwnerPaymentDialog
          isOpen={isOwnerPaymentDialogOpen}
          onClose={() => setIsOwnerPaymentDialogOpen(false)}
          ownerName={ownerForPayment.name}
          accounts={accountsForPayment}
          totalBalanceDue={totalBalanceForDialog}
          onConfirm={handleConfirmOwnerPayment}
          isSaving={isSaving}
        />
      )}
      {ownerForHistory && (
        <OwnerTransactionHistoryDialog
            open={isHistoryOpen}
            onOpenChange={setIsHistoryOpen}
            owner={ownerForHistory}
            allProperties={allProperties}
            allTenants={allTenants}
            allPayments={allPayments}
            selectedMonth={selectedMonth}
            paymentStatusForMonth={statusForHistory}
        />
      )}
    </div>
  );
}

const ServiceChargeStatusTable = ({
    title,
    description,
    accounts,
    onConfirmPayment,
    onViewHistory,
    statusFilter,
    onStatusFilterChange,
    currentPage,
    pageSize,
    totalPages,
    onPageChange,
    onPageSizeChange,
    totalItems,
}: {
    title: string;
    description: string;
    accounts: GroupedServiceChargeAccount[];
    onConfirmPayment: (acc: ServiceChargeAccount) => void;
    onViewHistory: (group: GroupedServiceChargeAccount) => void;
    statusFilter: 'all' | 'Paid' | 'Pending' | 'N/A';
    onStatusFilterChange: (status: 'all' | 'Paid' | 'Pending' | 'N/A') => void;
    currentPage: number;
    pageSize: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    totalItems: number;
}) => {
    const { toast } = useToast();

    const handleConfirmClick = (group: GroupedServiceChargeAccount) => {
        if (group.paymentStatus === 'N/A') {
            toast({
                variant: "destructive",
                title: "Cannot Record Payment",
                description: "This owner has no units that are billable for the selected month.",
            });
            return;
        }
        // Pass the first unit as a representative to get the ownerId
        onConfirmPayment(group.units[0]);
    };
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
                <div className="flex justify-end">
                    <Select value={statusFilter} onValueChange={onStatusFilterChange as any}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="Paid">Paid</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="N/A">Not Billable</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Owner</TableHead>
                            <TableHead>Units</TableHead>
                            <TableHead>Total S. Charge</TableHead>
                            <TableHead>Payment Status</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {accounts.map(group => (
                            <TableRow key={group.groupId}>
                                <TableCell>{group.ownerName}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-2">
                                        {group.units.map(unit => (
                                            <div key={unit.unitName} className="text-xs">
                                                <span className="font-semibold">{unit.unitName}</span> ({unit.propertyName}) - <span className="font-mono">Ksh {unit.unitServiceCharge.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell>Ksh {group.totalServiceCharge.toLocaleString()}</TableCell>
                                <TableCell>
                                     <Badge variant={
                                        group.paymentStatus === 'Paid' ? 'default' :
                                        group.paymentStatus === 'Pending' ? 'destructive' :
                                        group.paymentStatus === 'N/A' ? 'outline' :
                                        'secondary'
                                    }>
                                        {group.paymentStatus}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8"
                                            onClick={() => onViewHistory(group)}
                                        >
                                            <FileSignature className="mr-2 h-4 w-4" />
                                            View Statement
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleConfirmClick(group)}
                                            disabled={group.paymentStatus === 'Paid' || group.paymentStatus === 'N/A'}
                                            className="h-8"
                                        >
                                            <PlusCircle className="mr-2 h-4 w-4" />
                                            Record Payment
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                         {accounts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No units match the criteria for this month.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
            <div className="p-4 border-t">
                <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={totalItems}
                    onPageChange={onPageChange}
                    onPageSizeChange={onPageSizeChange}
                />
            </div>
        </Card>
    );
};

const VacantArrearsTab = ({
    arrears,
    onGenerateInvoice,
    currentPage,
    pageSize,
    totalPages,
    onPageChange,
    onPageSizeChange,
    totalItems,
}: {
    arrears: VacantArrearsAccount[];
    onGenerateInvoice: (acc: VacantArrearsAccount) => void;
    currentPage: number;
    pageSize: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    totalItems: number;
}) => {
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
            <div className="p-4 border-t">
                <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={totalItems}
                    onPageChange={onPageChange}
                    onPageSizeChange={onPageSizeChange}
                />
            </div>
        </Card>
    );
}

    

    

    

