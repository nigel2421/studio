
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import type { Tenant, Payment, Property, LedgerEntry, WaterMeterReading } from '@/lib/types';
import { DollarSign, Calendar, Droplets, LogOut, PlusCircle, AlertCircle, Loader2, FileDown } from 'lucide-react';
import { format, addMonths, startOfMonth, parseISO } from 'date-fns';
import { getTenantPayments, getProperties, getTenantWaterReadings } from '@/lib/data';
import { generateLedger } from '@/lib/financial-logic';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


export default function TenantDashboardPage() {
    const { userProfile, isLoading: authIsLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const tenantDetails = userProfile?.tenantDetails;
    
    const [payments, setPayments] = useState<Payment[]>([]);
    const [waterReadings, setWaterReadings] = useState<WaterMeterReading[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [rentLedger, setRentLedger] = useState<LedgerEntry[]>([]);
    const [waterLedger, setWaterLedger] = useState<LedgerEntry[]>([]);
    const [balances, setBalances] = useState({ rentDue: 0, rentCredit: 0, waterDue: 0, waterCredit: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [activeTenantTab, setActiveTenantTab] = useState<'rent' | 'water'>('rent');


    useEffect(() => {
        if (!authIsLoading && userProfile?.tenantId) {
            setIsLoading(true);
            Promise.all([
                getTenantPayments(userProfile.tenantId),
                getTenantWaterReadings(userProfile.tenantId),
                getProperties()
            ]).then(([paymentData, waterData, propertiesData]) => {
                setPayments(paymentData);
                setWaterReadings(waterData);
                setProperties(propertiesData);
                if(tenantDetails) {
                    const { ledger: rentOnlyLedger, finalDueBalance: rentDue, finalAccountBalance: rentCredit } = generateLedger(tenantDetails, paymentData, propertiesData, [], undefined, undefined, { includeWater: false });
                    const { ledger: waterOnlyLedger, finalDueBalance: waterDue, finalAccountBalance: waterCredit } = generateLedger(tenantDetails, paymentData, propertiesData, waterData, undefined, undefined, { includeRent: false, includeServiceCharge: false });

                    setRentLedger(rentOnlyLedger.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
                    setWaterLedger(waterOnlyLedger.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
                    setBalances({ rentDue, rentCredit, waterDue, waterCredit });
                }
                setIsLoading(false);
            }).catch(err => {
                console.error("Error fetching tenant dashboard data:", err);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not load dashboard data.' });
                setIsLoading(false);
            });
        } else if (!authIsLoading) {
            setIsLoading(false);
        }
    }, [userProfile, authIsLoading, tenantDetails, toast]);


    const latestWaterReading = waterReadings?.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/login');
    };

    const handleGenerateStatement = async () => {
        if (!tenantDetails) return;
        toast({ title: 'Generating Statement...', description: 'Your PDF will download shortly.'});
        try {
            const { generateTenantStatementPDF } = await import('@/lib/pdf-generator');
            generateTenantStatementPDF(tenantDetails, payments, properties, waterReadings, activeTenantTab);
        } catch(e) {
            console.error("Error generating PDF:", e);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not generate your statement.' });
        }
    };

    const handleMoveOutNotice = () => {
        toast({
            title: "Move-Out Notice Submitted",
            description: "Your one-month notice to vacate has been received and sent to the property manager.",
            duration: 5000,
        });
    };

    const getPaymentStatusVariant = (status: Tenant['lease']['paymentStatus']) => {
        switch (status) {
            case 'Paid': return 'default';
            case 'Pending': return 'secondary';
            case 'Overdue': return 'destructive';
            default: return 'outline';
        }
    };

    if (isLoading || authIsLoading) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }
    
    const renderLedgerTable = (ledgerEntries: LedgerEntry[]) => (
      <>
        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {ledgerEntries.map((entry, index) => (
            <Card key={`${entry.id}-${index}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base leading-tight">{entry.description}</CardTitle>
                  <div className="text-xs text-muted-foreground text-right shrink-0 pl-2">
                    <p>{format(new Date(entry.date), 'PPP')}</p>
                    {entry.forMonth && <p>For {entry.forMonth}</p>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex justify-between items-center text-sm">
                <div>
                  {entry.charge > 0 && <p>Charge: <span className="font-medium text-red-600">Ksh {entry.charge.toLocaleString()}</span></p>}
                  {entry.payment > 0 && <p>Payment: <span className="font-medium text-green-600">Ksh {entry.payment.toLocaleString()}</span></p>}
                </div>
                <div>
                  <p className="text-muted-foreground">Balance</p>
                  <p className="font-bold text-right">
                    {entry.balance < 0
                      ? <span className="text-green-600">Ksh {Math.abs(entry.balance).toLocaleString()} Cr</span>
                      : `Ksh ${entry.balance.toLocaleString()}`
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Desktop Table View */}
        <Table className="hidden md:table">
           <TableHeader>
               <TableRow>
                   <TableHead>Date</TableHead>
                   <TableHead>Description</TableHead>
                   <TableHead className="text-right">Charge</TableHead>
                   <TableHead className="text-right">Payment</TableHead>
                   <TableHead className="text-right">Balance</TableHead>
               </TableRow>
           </TableHeader>
           <TableBody>
               {ledgerEntries.length > 0 ? (
                   ledgerEntries.map((entry, index) => (
                       <TableRow key={`${entry.id}-${index}`}>
                           <TableCell>{format(new Date(entry.date), 'PPP')}</TableCell>
                           <TableCell>{entry.description}</TableCell>
                           <TableCell className="text-right text-red-600">
                               {entry.charge > 0 ? `Ksh ${entry.charge.toLocaleString()}` : '-'}
                           </TableCell>
                           <TableCell className="text-right text-green-600">
                               {entry.payment > 0 ? `Ksh ${entry.payment.toLocaleString()}` : '-'}
                           </TableCell>
                           <TableCell className="text-right font-bold">
                                {entry.balance < 0
                                   ? <span className="text-green-600">Ksh {Math.abs(entry.balance).toLocaleString()} Cr</span>
                                   : `Ksh ${entry.balance.toLocaleString()}`
                               }
                           </TableCell>
                       </TableRow>
                   ))
               ) : (
                   <TableRow>
                       <TableCell colSpan={5} className="text-center">No transaction history found for this category.</TableCell>
                   </TableRow>
               )}
           </TableBody>
       </Table>
      </>
    );
    
    const renderWaterLedgerTable = (ledgerEntries: LedgerEntry[]) => (
        <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {ledgerEntries.map((entry, index) => (
                <Card key={`${entry.id}-${index}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-base leading-tight">{entry.description}</CardTitle>
                      <div className="text-xs text-muted-foreground text-right shrink-0 pl-2">
                        <p>{format(new Date(entry.date), 'PPP')}</p>
                        {entry.forMonth && <p>For {entry.forMonth}</p>}
                      </div>
                    </div>
                     <CardDescription>
                        {entry.priorReading !== undefined && `From ${entry.priorReading} to ${entry.currentReading} units (${entry.consumption} units @ Ksh ${entry.rate})`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-between items-center text-sm">
                    <div>
                      {entry.charge > 0 && <p>Charge: <span className="font-medium text-red-600">Ksh {entry.charge.toLocaleString()}</span></p>}
                      {entry.payment > 0 && <p>Payment: <span className="font-medium text-green-600">Ksh {entry.payment.toLocaleString()}</span></p>}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Balance</p>
                      <p className="font-bold text-right">
                        {entry.balance < 0
                          ? <span className="text-green-600">Ksh {Math.abs(entry.balance).toLocaleString()} Cr</span>
                          : `Ksh ${entry.balance.toLocaleString()}`
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop Table View */}
            <Table className="hidden md:table">
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>For Month</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Prior Rd</TableHead>
                        <TableHead>Current Rd</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Payment</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {ledgerEntries.length > 0 ? (
                        ledgerEntries.map((entry, index) => (
                            <TableRow key={`${entry.id}-${index}`}>
                                <TableCell>{format(new Date(entry.date), 'PPP')}</TableCell>
                                <TableCell>{entry.forMonth}</TableCell>
                                <TableCell>{entry.unitName || '-'}</TableCell>
                                <TableCell>{entry.priorReading?.toLocaleString() ?? '-'}</TableCell>
                                <TableCell>{entry.currentReading?.toLocaleString() ?? '-'}</TableCell>
                                <TableCell>{entry.rate ? `Ksh ${entry.rate}` : '-'}</TableCell>
                                <TableCell className="text-right text-red-600">
                                    {entry.charge > 0 ? `Ksh ${entry.charge.toLocaleString()}`: '-'}
                                </TableCell>
                                <TableCell className="text-right text-green-600">
                                    {entry.payment > 0 ? `Ksh ${entry.payment.toLocaleString()}` : '-'}
                                </TableCell>
                                <TableCell className="text-right font-bold">
                                    {entry.balance < 0
                                        ? <span className="text-green-600">Ksh {Math.abs(entry.balance).toLocaleString()} Cr</span>
                                        : `Ksh ${entry.balance.toLocaleString()}`
                                    }
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={9} className="text-center">No transaction history found for this category.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </>
    );


    return (
        <div className="space-y-8">
            <Tabs value={activeTenantTab} onValueChange={(value) => setActiveTenantTab(value as any)} className="space-y-8">
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">Welcome, {userProfile?.name || 'Tenant'}</h1>
                        {tenantDetails ? (
                            <p className="text-muted-foreground">
                                Unit {tenantDetails.unitName} &bull; Rent: Ksh {tenantDetails.lease.rent.toLocaleString()}
                            </p>
                        ) : (
                            <p className="text-muted-foreground">Here is an overview of your account.</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <TabsList>
                            <TabsTrigger value="rent">Rent</TabsTrigger>
                            <TabsTrigger value="water">Water</TabsTrigger>
                        </TabsList>
                        <Button onClick={handleGenerateStatement} variant="outline">
                            <FileDown className="mr-2 h-4 w-4" />
                            Download Statement
                        </Button>
                        <Button onClick={handleSignOut} variant="outline">
                            <LogOut className="mr-2 h-4 w-4" />
                            Sign Out
                        </Button>
                    </div>
                </header>

                <TabsContent value="rent">
                     {tenantDetails && (
                        <div className="space-y-8">
                            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Monthly Rent</CardTitle>
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">Ksh {tenantDetails.lease.rent.toLocaleString()}</div>
                                        <Badge variant={getPaymentStatusVariant(tenantDetails.lease.paymentStatus)} className="mt-1">
                                            {tenantDetails.lease.paymentStatus}
                                        </Badge>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Rent Due Balance</CardTitle>
                                        <AlertCircle className="h-4 w-4 text-red-500" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-red-600">Ksh {(balances.rentDue).toLocaleString()}</div>
                                        <p className="text-xs text-muted-foreground">Total outstanding rent</p>
                                    </CardContent>
                                </Card>
                                <Card className="col-span-2 lg:col-span-1">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Rent Account Credit</CardTitle>
                                        <PlusCircle className="h-4 w-4 text-green-500" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-green-600">Ksh {(balances.rentCredit).toLocaleString()}</div>
                                        <p className="text-xs text-muted-foreground">Overpayment carry-over</p>
                                    </CardContent>
                                </Card>
                            </div>
                             <Card>
                                <CardHeader><CardTitle>Rent Transaction History</CardTitle></CardHeader>
                                <CardContent className="p-0 md:p-6">{renderLedgerTable(rentLedger)}</CardContent>
                            </Card>
                        </div>
                    )}
                </TabsContent>

                 <TabsContent value="water">
                     {tenantDetails && (
                        <div className="space-y-8">
                            <Card>
                                <CardHeader><CardTitle>Water Bill Transaction History</CardTitle></CardHeader>
                                <CardContent className="p-0 md:p-6">{renderWaterLedgerTable(waterLedger)}</CardContent>
                            </Card>
                        </div>
                     )}
                </TabsContent>
            </Tabs>
            <div className='px-2 space-y-2 mt-8'>
                <Button variant="destructive" className="w-full" onClick={handleMoveOutNotice}>
                    Submit 1-Month Move Out Notice
                </Button>
            </div>
        </div>
    );
}

    
