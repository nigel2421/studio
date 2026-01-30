
'use client';

import { useEffect, useState, useMemo } from 'react';
import { getProperties, getPropertyOwners, getTenants, getAllPayments, findOrCreateHomeownerTenant, addPayment, getLandlords } from '@/lib/data';
import type { Property, PropertyOwner, Unit, Tenant, Payment, Landlord } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, FileSignature, MoreHorizontal, CheckCircle, ChevronLeft, ChevronRight, FileText, Eye } from 'lucide-react';
import { isSameMonth, startOfMonth, format, addMonths, subMonths, isAfter, parseISO, isBefore, isValid } from 'date-fns';
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
import { TransactionHistoryDialog } from '@/components/financials/transaction-history-dialog';


interface ServiceChargeAccount {
  propertyId: string;
  propertyName: string;
  unitName: string;
  unitServiceCharge: number;
  ownerId?: string;
  ownerName?: string;
  tenantId?: string;
  tenantName?: string;
  paymentStatus: 'Paid' | 'Pending' | 'N/A';
  paymentAmount?: number;
  paymentForMonth?: string;
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
  const [ownerForPayment, setOwnerForPayment] = useState<PropertyOwner | null>(null);
  const [accountsForPayment, setAccountsForPayment] = useState<ServiceChargeAccount[]>([]);
  const [historyTenant, setHistoryTenant] = useState<Tenant | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));

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
    if(loading) return;

    // --- Client Occupied Units Logic (formerly Self-managed) ---
    const clientOccupiedUnits: (Unit & { propertyId: string, propertyName: string })[] = [];
    allProperties.forEach(p => {
        (p.units || []).forEach(u => {
            if (u.status === 'client occupied' && u.managementStatus === 'Client Managed' && u.handoverStatus === 'Handed Over') {
                clientOccupiedUnits.push({ ...u, propertyId: p.id, propertyName: p.name });
            }
        });
    });

    const clientOccupiedServiceChargeAccounts = clientOccupiedUnits.map(unit => {
        let owner: { id: string; name: string } | undefined;

        if (unit.landlordId) {
            owner = allLandlords.find(l => l.id === unit.landlordId);
        }
        
        if (!owner) {
            owner = allOwners.find(o => o.assignedUnits?.some(au => au.propertyId === unit.propertyId && au.unitNames.includes(unit.name)));
        }

        const tenant = allTenants.find(t => t.propertyId === unit.propertyId && t.unitName === unit.name && t.residentType === 'Homeowner');
        
        let paymentStatus: 'Paid' | 'Pending' | 'N/A' = 'Pending';
        let paymentAmount: number | undefined;
        let paymentForMonth: string | undefined;

        let isBillable = false;
        let firstBillableMonth: Date | null = null;
        if (unit.handoverDate) {
            const handoverDateSource = unit.handoverDate as any;
            const handoverDate = handoverDateSource && typeof handoverDateSource.toDate === 'function'
                ? handoverDateSource.toDate()
                : parseISO(handoverDateSource);
            
            if (isValid(handoverDate)) {
                const handoverDay = handoverDate.getDate();
                firstBillableMonth = handoverDay <= 10 ? startOfMonth(handoverDate) : startOfMonth(addMonths(handoverDate, 1));
                if (!isAfter(firstBillableMonth, startOfMonth(selectedMonth))) {
                    isBillable = true;
                }
            }
        } else if (unit.handoverStatus === 'Handed Over') {
            isBillable = true;
        }

        if (!isBillable) {
            paymentStatus = 'N/A';
        } else if (tenant) {
            const paymentInSelectedMonth = allPayments
                .filter(p => p.tenantId === tenant.id && (p.type === 'ServiceCharge' || p.type === 'Rent') && p.status === 'Paid')
                .find(p => p.rentForMonth === format(selectedMonth, 'yyyy-MM'));

            if (paymentInSelectedMonth) {
                paymentStatus = 'Paid';
                paymentAmount = paymentInSelectedMonth.amount;
                paymentForMonth = paymentInSelectedMonth.rentForMonth;
            } else {
                 paymentStatus = 'Pending';
            }
        } else {
            // Unit is billable, but no tenant record exists.
            if (firstBillableMonth && isSameMonth(startOfMonth(selectedMonth), firstBillableMonth)) {
                paymentStatus = 'Paid';
            } else {
                paymentStatus = 'Pending';
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
            paymentForMonth,
        };
    });
    setSelfManagedAccounts(clientOccupiedServiceChargeAccounts);

    // --- Managed Vacant Units Logic ---
    const managedVacantUnits: (Unit & { propertyId: string, propertyName: string })[] = [];
    allProperties.forEach(p => {
      (p.units || []).forEach(u => {
        if (u.status === 'vacant' && u.managementStatus === 'Rented for Clients' && u.handoverStatus === 'Handed Over') {
          managedVacantUnits.push({ ...u, propertyId: p.id, propertyName: p.name });
        }
      });
    });
    
    const managedVacantServiceChargeAccounts = managedVacantUnits.map(unit => {
      let owner: { id: string; name: string } | undefined;

      if (unit.landlordId) {
          owner = allLandlords.find(l => l.id === unit.landlordId);
      }
      
      if (!owner) {
          owner = allOwners.find(o => o.assignedUnits?.some(au => au.propertyId === unit.propertyId && au.unitNames.includes(unit.name)));
      }

      const homeownerTenant = allTenants.find(t => t.propertyId === unit.propertyId && t.unitName === unit.name && t.residentType === 'Homeowner');

      let paymentStatus: 'Paid' | 'Pending' | 'N/A' = 'Pending';
      let isBillable = false;
      let firstBillableMonth: Date | null = null;
      if (unit.handoverDate) {
        const handoverDateSource = unit.handoverDate as any;
        const handoverDate = handoverDateSource && typeof handoverDateSource.toDate === 'function'
            ? handoverDateSource.toDate()
            : parseISO(handoverDateSource);
        if (isValid(handoverDate)) {
          const handoverDay = handoverDate.getDate();
          firstBillableMonth = handoverDay <= 10 ? startOfMonth(handoverDate) : startOfMonth(addMonths(handoverDate, 1));
          if (!isAfter(firstBillableMonth, startOfMonth(selectedMonth))) {
            isBillable = true;
          }
        }
      }

      if (!isBillable) {
        paymentStatus = 'N/A';
      } else if (homeownerTenant) {
        const paymentForMonthExists = allPayments.some(p => 
          p.tenantId === homeownerTenant.id &&
          p.rentForMonth === format(selectedMonth, 'yyyy-MM') &&
          p.status === 'Paid' &&
          (p.type === 'ServiceCharge')
        );
        paymentStatus = paymentForMonthExists ? 'Paid' : 'Pending';
      } else {
          if (firstBillableMonth && isSameMonth(startOfMonth(selectedMonth), firstBillableMonth)) {
              paymentStatus = 'Paid';
          } else {
              paymentStatus = 'Pending';
          }
      }

      return {
        propertyId: unit.propertyId,
        propertyName: unit.propertyName,
        unitName: unit.name,
        unitServiceCharge: unit.serviceCharge || 0,
        ownerId: owner?.id,
        ownerName: owner?.name || 'Unassigned',
        tenantId: homeownerTenant?.id,
        tenantName: owner?.name, // Use owner name for display
        paymentStatus,
      };
    });
    setManagedVacantAccounts(managedVacantServiceChargeAccounts);


    // --- Vacant Units in Arrears Logic ---
    const vacantArrears: VacantArrearsAccount[] = [];

    const liableUnits = allProperties.flatMap(p => 
      p.units
        .filter(u => 
            u.status === 'vacant' && 
            u.ownership === 'Landlord' && 
            u.handoverStatus === 'Handed Over' && 
            u.handoverDate &&
            u.managementStatus === 'Rented for Clients'
        )
        .map(u => ({ ...u, property: p }))
    );

    liableUnits.forEach(unit => {
      const owner = allOwners.find(o => o.assignedUnits?.some(au => au.propertyId === unit.property.id && au.unitNames.includes(unit.name)));
      if (!owner) return; 

      const handoverDateSource = unit.handoverDate! as any;
      const handoverDate = handoverDateSource && typeof handoverDateSource.toDate === 'function'
          ? handoverDateSource.toDate()
          : parseISO(handoverDateSource);
      if (!isValid(handoverDate)) return;

      const handoverDay = handoverDate.getDate();
      let firstBillableMonth: Date;

      if (handoverDay <= 10) {
        firstBillableMonth = startOfMonth(handoverDate);
      } else {
        firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
      }
      
      const today = new Date();
      
      if (isAfter(firstBillableMonth, today)) return; 

      const homeownerTenant = allTenants.find(t => t.propertyId === unit.property.id && t.unitName === unit.name && t.residentType === 'Homeowner');
      const paymentsForUnit = homeownerTenant 
        ? allPayments.filter(p => p.tenantId === homeownerTenant.id)
        : [];
      const totalPaid = paymentsForUnit.reduce((sum, p) => sum + p.amount, 0);

      let totalBilled = 0;
      const arrearsDetail: VacantArrearsAccount['arrearsDetail'] = [];
      let loopDate = firstBillableMonth;
      const startOfToday = startOfMonth(today);

      while (startOfMonth(loopDate) <= startOfToday) {
        const chargeForMonth = unit.serviceCharge || 0;
        if (chargeForMonth > 0) {
          totalBilled += chargeForMonth;
          arrearsDetail.push({
            month: format(loopDate, 'MMMM yyyy'),
            amount: chargeForMonth,
            status: 'Pending'
          });
        }
        loopDate = addMonths(loopDate, 1);
      }
      
      let paidAmountTracker = totalPaid;
      for (const detail of arrearsDetail) {
          if (paidAmountTracker >= detail.amount) {
              detail.status = 'Paid';
              paidAmountTracker -= detail.amount;
          } else {
              break; 
          }
      }

      const finalTotalDue = arrearsDetail
        .filter(d => d.status === 'Pending')
        .reduce((sum, d) => sum + d.amount, 0);

      if (finalTotalDue > 0) {
        vacantArrears.push({
          ownerId: owner.id,
          ownerName: owner.name,
          propertyId: unit.property.id,
          propertyName: unit.property.name,
          unitName: unit.name,
          unitHandoverDate: unit.handoverDate!,
          monthsInArrears: arrearsDetail.filter(d => d.status === 'Pending').length,
          totalDue: finalTotalDue,
          arrearsDetail,
          unit,
          owner,
          property: unit.property
        });
      }
    });

    setArrearsAccounts(vacantArrears);

  }, [loading, selectedMonth, allProperties, allOwners, allTenants, allPayments, allLandlords]);

  const handleViewHistory = async (account: ServiceChargeAccount) => {
    startLoading("Fetching resident details...");
    try {
        let tenantToView: Tenant | null = null;
        if (account.tenantId) {
            tenantToView = allTenants.find(t => t.id === account.tenantId) || null;
        }

        if (!tenantToView) {
            const property = allProperties.find(p => p.id === account.propertyId);
            const unit = property?.units.find(u => u.name === account.unitName);
            
            // Look for owner in both `propertyOwners` and `landlords`
            let owner: PropertyOwner | Landlord | undefined = allOwners.find(o => o.id === account.ownerId);
            if (!owner) {
                owner = allLandlords.find(l => l.id === account.ownerId);
            }

            if (property && unit && owner) {
                // `findOrCreateHomeownerTenant` expects a `PropertyOwner`. We can safely cast because the needed fields are present on both.
                const ownerAsPropertyOwner: PropertyOwner = {
                    id: owner.id,
                    name: owner.name,
                    email: owner.email,
                    phone: owner.phone,
                    bankAccount: owner.bankAccount,
                    userId: owner.userId,
                    assignedUnits: (owner as PropertyOwner).assignedUnits || [],
                };

                tenantToView = await findOrCreateHomeownerTenant(ownerAsPropertyOwner, unit, property.id);
                fetchData();
            } else {
                throw new Error("An owner must be assigned to this unit to view its history.");
            }
        }
        
        if (tenantToView) {
            setHistoryTenant(tenantToView);
            setIsHistoryOpen(true);
        } else {
             toast({
                variant: "destructive",
                title: "Error",
                description: "Could not find or create the resident's details.",
            });
        }
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: 'Error',
            description: error.message || "An unexpected error occurred while fetching history.",
        });
    } finally {
        stopLoading();
    }
  };

  const handleOpenOwnerPaymentDialog = async (account: ServiceChargeAccount, source: 'client-occupied' | 'managed-vacant') => {
    if (!account.ownerId) {
        toast({ variant: 'destructive', title: 'Error', description: 'This unit is not assigned to an owner.' });
        return;
    }

    startLoading('Preparing consolidated payment...');
    try {
        const owner = allOwners.find(o => o.id === account.ownerId);
        if (!owner) throw new Error("Owner not found");
        
        const sourceAccounts = source === 'client-occupied' ? selfManagedAccounts : managedVacantAccounts;

        const ownerAccounts = sourceAccounts.filter(acc => acc.ownerId === account.ownerId && acc.paymentStatus === 'Pending');
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

        const tenantPromises = accountsForPayment.map(async (acc) => {
            let tenant = allTenants.find(t => t.propertyId === acc.propertyId && t.unitName === acc.unitName);
            if (tenant) return tenant;

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
                    notes: '',
                    rentForMonth: paymentData.forMonth,
                    status: 'Paid',
                    type: 'ServiceCharge',
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


  const filteredSelfManaged = useMemo(() => {
    let accounts = selfManagedAccounts;
    if (smStatusFilter !== 'all') {
      accounts = accounts.filter(acc => acc.paymentStatus === smStatusFilter);
    }
    if (!searchTerm) return accounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return accounts.filter(acc =>
        acc.propertyName.toLowerCase().includes(lowercasedFilter) ||
        acc.unitName.toLowerCase().includes(lowercasedFilter) ||
        acc.ownerName?.toLowerCase().includes(lowercasedFilter)
    );
  }, [selfManagedAccounts, searchTerm, smStatusFilter]);
  
  const smTotalPages = Math.ceil(filteredSelfManaged.length / smPageSize);
  const paginatedSmAccounts = filteredSelfManaged.slice((smCurrentPage - 1) * smPageSize, smCurrentPage * smPageSize);

  const filteredManagedVacant = useMemo(() => {
    let accounts = managedVacantAccounts;
    if (mvStatusFilter !== 'all') {
        accounts = accounts.filter(acc => acc.paymentStatus === mvStatusFilter);
    }
    if (!searchTerm) return accounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return accounts.filter(acc =>
        acc.propertyName.toLowerCase().includes(lowercasedFilter) ||
        acc.unitName.toLowerCase().includes(lowercasedFilter) ||
        acc.ownerName?.toLowerCase().includes(lowercasedFilter)
    );
  }, [managedVacantAccounts, searchTerm, mvStatusFilter]);

  const mvTotalPages = Math.ceil(filteredManagedVacant.length / mvPageSize);
  const paginatedMvAccounts = filteredManagedVacant.slice((mvCurrentPage - 1) * mvPageSize, mvCurrentPage * mvPageSize);
  
  const filteredArrears = useMemo(() => {
    if (!searchTerm) return arrearsAccounts;
    const lowercasedFilter = searchTerm.toLowerCase();
    return arrearsAccounts.filter(acc =>
        acc.propertyName.toLowerCase().includes(lowercasedFilter) ||
        acc.unitName.toLowerCase().includes(lowercasedFilter) ||
        acc.ownerName?.toLowerCase().includes(lowercasedFilter)
    );
  }, [arrearsAccounts, searchTerm]);

  const arrearsTotalPages = Math.ceil(filteredArrears.length / arrearsPageSize);
  const paginatedArrears = filteredArrears.slice((arrearsCurrentPage - 1) * arrearsPageSize, arrearsCurrentPage * arrearsPageSize);

  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Client Service Charges</h2>
          <p className="text-muted-foreground">Track service charge payments for all client-owned units.</p>
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
              onViewHistory={handleViewHistory}
              statusFilter={smStatusFilter}
              onStatusFilterChange={(status) => { setSmStatusFilter(status as any); setSmCurrentPage(1); }}
              currentPage={smCurrentPage}
              pageSize={smPageSize}
              totalPages={smTotalPages}
              onPageChange={setSmCurrentPage}
              onPageSizeChange={setSmPageSize}
              totalItems={filteredSelfManaged.length}
            />
        </TabsContent>
        <TabsContent value="managed-vacant">
            <ServiceChargeStatusTable
              title="Managed Vacant Unit Service Charges"
              description="Service charge payments for handed-over vacant units managed by Eracov."
              accounts={paginatedMvAccounts}
              onConfirmPayment={(acc) => handleOpenOwnerPaymentDialog(acc, 'managed-vacant')}
              onViewHistory={handleViewHistory}
              statusFilter={mvStatusFilter}
              onStatusFilterChange={(status) => { setMvStatusFilter(status as any); setMvCurrentPage(1); }}
              currentPage={mvCurrentPage}
              pageSize={mvPageSize}
              totalPages={mvTotalPages}
              onPageChange={setMvCurrentPage}
              onPageSizeChange={setMvPageSize}
              totalItems={filteredManagedVacant.length}
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
              totalItems={filteredArrears.length}
            />
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
      <TransactionHistoryDialog
        tenant={historyTenant}
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        onPaymentAdded={fetchData}
        allTenants={allTenants}
        allProperties={allProperties}
       />
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
    accounts: ServiceChargeAccount[];
    onConfirmPayment: (acc: ServiceChargeAccount) => void;
    onViewHistory: (acc: ServiceChargeAccount) => void;
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

    const handleConfirmClick = (acc: ServiceChargeAccount) => {
        if (acc.paymentStatus === 'N/A') {
            toast({
                variant: "destructive",
                title: "Cannot Record Payment",
                description: "This unit is not yet billable for the selected month.",
            });
            return;
        }
        onConfirmPayment(acc);
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
                            <TableHead>Property / Unit</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Service Charge</TableHead>
                            <TableHead>Payment Status</TableHead>
                            <TableHead>Statement</TableHead>
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
                                        acc.paymentStatus === 'N/A' ? 'outline' :
                                        'secondary'
                                    }>
                                        {acc.paymentStatus}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Button
                                        variant="link"
                                        className="h-auto p-0 text-sm"
                                        onClick={() => onViewHistory(acc)}
                                    >
                                        View Statement
                                    </Button>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleConfirmClick(acc)}
                                        disabled={acc.paymentStatus === 'Paid' || acc.paymentStatus === 'N/A'}
                                        className="h-8"
                                    >
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Confirm
                                    </Button>
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




    

    




    
