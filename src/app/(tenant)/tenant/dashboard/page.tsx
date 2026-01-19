
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import type { Tenant, Payment } from '@/lib/types';
import { DollarSign, Calendar, Droplets, LogOut, PlusCircle, AlertCircle } from 'lucide-react';
import { format, addMonths, startOfMonth, parseISO } from 'date-fns';
import { getTenantPayments } from '@/lib/data';
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

export default function TenantDashboardPage() {
    const { userProfile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const tenantDetails = userProfile?.tenantDetails;
    const latestWaterReading = tenantDetails?.waterReadings?.[0];
    const [payments, setPayments] = useState<Payment[]>([]);

    useEffect(() => {
        if (userProfile?.tenantId) {
            getTenantPayments(userProfile.tenantId).then(setPayments);
        }
    }, [userProfile]);

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/login');
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

    return (
        <div className="space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Welcome, {userProfile?.name || 'Tenant'}</h1>
                    <p className="text-muted-foreground">Here is an overview of your account.</p>
                </div>
                <Button onClick={handleSignOut} variant="outline">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                </Button>
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
                                <CardTitle className="text-sm font-medium">Rent Start Date</CardTitle>
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{format(parseISO(tenantDetails.lease.startDate), 'yyyy-MM-dd')}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Due Balance</CardTitle>
                                <AlertCircle className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">Ksh {(tenantDetails.dueBalance || 0).toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground">Total outstanding amount</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Excess Credit</CardTitle>
                                <PlusCircle className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">Ksh {(tenantDetails.accountBalance || 0).toLocaleString()}</div>
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
                    <CardTitle>Payment History</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Notes</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payments.length > 0 ? (
                                payments.map(payment => (
                                    <TableRow key={payment.id}>
                                        <TableCell>{format(new Date(payment.date), 'PPP')}</TableCell>
                                        <TableCell>Ksh {payment.amount.toLocaleString()}</TableCell>
                                        <TableCell>{payment.notes}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center">No payment history found.</TableCell>
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
