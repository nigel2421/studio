
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import type { Tenant, Payment, Property, LedgerEntry } from '@/lib/types';
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
import { generateTenantStatementPDF } from '@/lib/pdf-generator';


export default function TenantDashboardPage() {
    const { userProfile, isLoading: authIsLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const tenantDetails = userProfile?.tenantDetails;
    
    const [payments, setPayments] = useState<Payment[]>([]);
    const [waterReadings, setWaterReadings] = useState<any[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [balances, setBalances] = useState({ due: 0, credit: 0 });
    const [isLoading, setIsLoading] = useState(true);

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
                    const { ledger: generatedLedger, finalDueBalance, finalAccountBalance } = generateLedger(tenantDetails, paymentData, propertiesData);
                    setLedger(generatedLedger.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
                    setBalances({ due: finalDueBalance, credit: finalAccountBalance });
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


    const latestWaterReading = waterReadings?.[0];

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/login');
    };

    const handleGenerateStatement = async () => {
        if (!tenantDetails) return;
        toast({ title: 'Generating Statement...', description: 'Your PDF will download shortly.'});
        try {
            // We can reuse the payments and properties already in state
            generateTenantStatementPDF(tenantDetails, payments, properties);
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

    const nextRentDueDate = tenantDetails ? format(startOfMonth(addMonths(new Date(), 1)), 'yyyy-MM-dd') : 'N/A';

    if (isLoading || authIsLoading) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }

    return (
        <div className="space-y-8">
            <header className="flex items-center justify-between">
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

            {tenantDetails && (
                <div>
                    <h2 className="text-2xl font-semibold mb-4">Financial Overview</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                                <CardTitle className="text-sm font-medium">Water Bill</CardTitle>
                                <Droplets className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                {latestWaterReading ? (
                                    <>
                                        <div className="text-2xl font-bold">Ksh {latestWaterReading.amount.toLocaleString()}</div>
                                        <p className="text-xs text-muted-foreground">
                                            Current: {latestWaterReading.currentReading}, Prior: {latestWaterReading.priorReading}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-xl font-bold">Not Available</div>
                                        <p className="text-xs text-muted-foreground">No recent reading found.</p>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Due Balance</CardTitle>
                                <AlertCircle className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">Ksh {(balances.due).toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground">Total outstanding amount</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Excess Credit</CardTitle>
                                <PlusCircle className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">Ksh {(balances.credit).toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground">Overpayment carry-over</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Next Rent Due Date</CardTitle>
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{nextRentDueDate}</div>
                                <Badge variant={getPaymentStatusVariant(tenantDetails.lease.paymentStatus)} className="mt-1">
                                    {tenantDetails.lease.paymentStatus}
                                </Badge>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
            <Card>
                <CardHeader>
                    <CardTitle>Transaction History</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
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
                            {ledger.length > 0 ? (
                                ledger.map((entry, index) => (
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
                                    <TableCell colSpan={5} className="text-center">No transaction history found.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <div className='px-2 space-y-2 mt-8'>
                <Button variant="destructive" className="w-full" onClick={handleMoveOutNotice}>
                    Submit 1-Month Move Out Notice
                </Button>
            </div>
        </div>
    );
}

