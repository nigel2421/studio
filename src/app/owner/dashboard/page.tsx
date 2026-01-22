
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Property, Unit, Tenant, Payment, WaterMeterReading } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Home, Users, Wallet, DollarSign, Calendar, Droplets, LogOut, Building } from 'lucide-react';
import { getTenants, getTenantPayments, getAllPayments } from '@/lib/data';
import { format, addMonths, startOfMonth, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { LandlordDashboardContent } from '@/components/financials/landlord-dashboard-content';
import { FinancialSummary, aggregateFinancials } from '@/lib/financial-utils';
import { Loader2 } from 'lucide-react';

// This component is for owners who are also residents, showing their personal bills.
function ResidentOwnerDashboard() {
    const { userProfile } = useAuth();
    const router = useRouter();
    const [payments, setPayments] = useState<Payment[]>([]);

    const tenantDetails = userProfile?.tenantDetails;
    const waterReadingHistory = tenantDetails?.waterReadings || [];
    const latestWaterReading = waterReadingHistory[0];
    
    useEffect(() => {
        if (userProfile?.tenantId) {
            getTenantPayments(userProfile.tenantId).then(setPayments);
        }
    }, [userProfile]);

    const getPaymentStatusVariant = (status?: Tenant['lease']['paymentStatus']) => {
        switch (status) {
            case 'Paid': return 'default';
            case 'Pending': return 'secondary';
            case 'Overdue': return 'destructive';
            default: return 'outline';
        }
    };
    
    const nextDueDate = tenantDetails ? format(startOfMonth(addMonths(new Date(), 1)), 'yyyy-MM-dd') : 'N/A';

    return (
        <div className="space-y-8">
             <div>
                <h1 className="text-3xl font-bold">Welcome, {userProfile?.name || 'Homeowner'}</h1>
                <p className="text-muted-foreground">Here is an overview of your resident account.</p>
            </div>
            
            {tenantDetails && (
                <Card>
                    <CardHeader>
                        <CardTitle>Unit Information</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                             <Building className="h-4 w-4 text-muted-foreground" />
                             <strong>Property:</strong>
                             <span>{userProfile?.propertyOwnerDetails?.properties.find(p => p.property.id === tenantDetails.propertyId)?.property.name || tenantDetails.propertyId}</span>
                        </div>
                         <div className="flex items-center gap-2">
                             <Home className="h-4 w-4 text-muted-foreground" />
                             <strong>Unit:</strong>
                             <span>{tenantDetails.unitName}</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {tenantDetails && (
                <div>
                    <h2 className="text-2xl font-semibold mb-4">Financial Overview</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                                <CardTitle className="text-sm font-medium">Next Due Date</CardTitle>
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{nextDueDate}</div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
             <div className="grid gap-8 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Payments</CardTitle>
                        <CardDescription>Your last 5 successful transactions.</CardDescription>
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
                        <CardDescription>History of monthly meter readings.</CardDescription>
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
                                {waterReadingHistory.length > 0 ? (
                                    waterReadingHistory.map(reading => (
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

// This component is for investor owners, showing portfolio financial summary.
function InvestorDashboard() {
    const { userProfile } = useAuth();
    const [dashboardData, setDashboardData] = useState<{
        properties: { property: Property, units: Unit[] }[],
        tenants: Tenant[],
        payments: Payment[],
        financialSummary: FinancialSummary,
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            if (userProfile?.role === 'homeowner' && userProfile.propertyOwnerDetails) {
                setLoading(true);
                const [allTenants, allPayments] = await Promise.all([
                    getTenants(),
                    getAllPayments(),
                ]);

                const ownerProperties = userProfile.propertyOwnerDetails.properties;
                const ownedUnitIdentifiers = new Set<string>();
                ownerProperties.forEach(p => {
                    p.units.forEach(u => ownedUnitIdentifiers.add(`${p.property.id}-${u.name}`));
                });

                const relevantTenants = allTenants.filter(t => ownedUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`));
                const relevantTenantIds = relevantTenants.map(t => t.id);
                const relevantPayments = allPayments.filter(p => relevantTenantIds.includes(p.tenantId));

                const summary = aggregateFinancials(relevantPayments, relevantTenants, ownerProperties);
                
                setDashboardData({
                    properties: ownerProperties,
                    tenants: relevantTenants,
                    payments: relevantPayments,
                    financialSummary: summary,
                });
                setLoading(false);
            } else if (userProfile) {
                // Not an investor owner or data is missing, stop loading
                setLoading(false);
            }
        }
        fetchData();
    }, [userProfile]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (!dashboardData) {
        return (
            <div>
                <h1 className="text-3xl font-bold">Welcome, {userProfile?.name}</h1>
                <p className="mt-4 text-muted-foreground">You are not currently assigned to any properties as an investor. Please contact management.</p>
            </div>
        );
    }

    return <LandlordDashboardContent {...dashboardData} />;
}

export default function OwnerDashboardPage() {
    const { userProfile, isLoading } = useAuth();
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

    // This is the crucial check. If the user has tenantDetails, they are a resident.
    const isResident = !!userProfile?.tenantDetails;

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
            
            {isResident ? <ResidentOwnerDashboard /> : <InvestorDashboard />}
        </div>
    );
}
