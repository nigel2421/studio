'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Property, Tenant, Payment } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Calendar, Droplets, LogOut, PlusCircle, AlertCircle, Loader2 } from 'lucide-react';
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


function HomeownerDashboard() {
    const { userProfile, isLoading: authIsLoading } = useAuth();
    const { toast } = useToast();
    const tenantDetails = userProfile?.tenantDetails;
    
    const [payments, setPayments] = useState<Payment[]>([]);
    const [waterReadings, setWaterReadings] = useState<any[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [ledger, setLedger] = useState<{ finalDueBalance: number, finalAccountBalance: number } | null>(null);
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
                    const { finalDueBalance, finalAccountBalance } = generateLedger(tenantDetails, paymentData, propertiesData);
                    setLedger({ finalDueBalance, finalAccountBalance });
                }
                setIsLoading(false);
            }).catch(err => {
                console.error("Error fetching homeowner dashboard data:", err);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not load dashboard data.' });
                setIsLoading(false);
            });
        } else if (!authIsLoading) {
            setIsLoading(false);
        }
    }, [userProfile, authIsLoading, tenantDetails, toast]);


    const latestWaterReading = waterReadings?.[0];

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
             <div>
                <h1 className="text-3xl font-bold">Welcome, {userProfile?.name || 'Homeowner'}</h1>
                <p className="text-muted-foreground">Here is an overview of your resident account.</p>
            </div>
            
            {tenantDetails ? (
                <div>
                    <h2 className="text-2xl font-semibold mb-4">Financial Overview</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Monthly Service Charge</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">Ksh {(tenantDetails.lease.rent || tenantDetails.lease.serviceCharge || 0).toLocaleString()}</div>
                                <Badge variant={getPaymentStatusVariant(tenantDetails.lease.paymentStatus)} className="mt-1">
                                    {tenantDetails.lease.paymentStatus}
                                </Badge>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Latest Water Bill</CardTitle>
                                <Droplets className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                {latestWaterReading ? (
                                    <>
                                        <div className="text-2xl font-bold">Ksh {latestWaterReading.amount.toLocaleString()}</div>
                                        <p className="text-xs text-muted-foreground">
                                            Consumption: {latestWaterReading.consumption} units
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
                                <div className="text-2xl font-bold text-red-600">Ksh {(ledger?.finalDueBalance || 0).toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground">Total outstanding amount</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Excess Credit</CardTitle>
                                <PlusCircle className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">Ksh {(ledger?.finalAccountBalance || 0).toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground">Overpayment carry-over</p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            ) : (
                <div className="text-center py-10 border rounded-lg">
                    <h2 className="text-xl font-semibold">No Property Information Found</h2>
                    <p className="text-muted-foreground mt-2">Your account is not yet linked to a specific unit. Please contact management.</p>
                </div>
            )}
             <div className="grid gap-8 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Payment History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.length > 0 ? (
                                    payments.slice(0, 5).map(payment => (
                                        <TableRow key={payment.id}>
                                            <TableCell>{format(new Date(payment.date), 'PPP')}</TableCell>
                                            <TableCell>Ksh {payment.amount.toLocaleString()}</TableCell>
                                            <TableCell>{payment.type || 'Service Charge'}</TableCell>
                                            <TableCell>{payment.notes}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center">No payment history found.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Water Usage Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Consumption</TableHead>
                                    <TableHead>Bill Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {waterReadings.length > 0 ? (
                                    waterReadings.map(reading => (
                                        <TableRow key={reading.id}>
                                            <TableCell>{format(new Date(reading.date), 'PPP')}</TableCell>
                                            <TableCell>{reading.consumption} units</TableCell>
                                            <TableCell>Ksh {reading.amount.toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center">No water reading history.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function OwnerDashboardPage() {
    const { isLoading } = useAuth();
    const router = useRouter();
    
    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/login');
    };
    
    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                 <div>
                    {/* Title is rendered inside the child components */}
                </div>
                <Button onClick={handleSignOut} variant="outline">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                </Button>
            </header>
            
            <HomeownerDashboard />
        </div>
    );
}
