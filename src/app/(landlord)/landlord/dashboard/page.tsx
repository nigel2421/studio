
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Property, Unit, Tenant, Payment, Landlord, UserProfile } from '@/lib/types';
import { getTenants, getAllPaymentsForReport, getProperties, getLandlords, getTenantPayments, getTenantWaterReadings } from '@/lib/data';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { LandlordDashboardContent } from '@/components/financials/landlord-dashboard-content';
import { ClientLandlordDashboard } from '@/components/financials/client-landlord-dashboard';
import { FinancialSummary, aggregateFinancials, calculateTransactionBreakdown } from '@/lib/financial-utils';
import { Loader2, LogOut, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLoading } from '@/hooks/useLoading';
import { StatementOptionsDialog } from '@/components/financials/statement-options-dialog';
import { isWithinInterval } from 'date-fns';
import { generateLandlordStatementPDF, generateTenantStatementPDF } from '@/lib/pdf-generator';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

enum LandlordType {
  Investor,
  Client,
  Loading,
  None
}

export default function LandlordDashboardPage() {
    const { userProfile, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const { startLoading, stopLoading, isLoading: isGenerating } = useLoading();
    
    // Data states
    const [allProperties, setAllProperties] = useState<Property[]>([]);
    const [allTenants, setAllTenants] = useState<Tenant[]>([]);
    const [allPayments, setAllPayments] = useState<Payment[]>([]);
    const [allLandlords, setAllLandlords] = useState<Landlord[]>([]);
    
    // Derived state
    const [landlordType, setLandlordType] = useState<LandlordType>(LandlordType.Loading);
    const [investorData, setInvestorData] = useState<any>(null);
    const [clientData, setClientData] = useState<{
        tenantDetails: Tenant | null;
        payments: Payment[];
        waterReadings: any[];
        units: (Unit & { propertyName: string })[];
    } | null>(null);

    useEffect(() => {
        if (!authLoading && userProfile) {
            startLoading('Loading your dashboard...');
            Promise.all([
                getProperties(),
                getTenants(),
                getAllPaymentsForReport(),
                getLandlords(),
            ]).then(async ([properties, tenants, payments, landlords]) => {
                setAllProperties(properties);
                setAllTenants(tenants);
                setAllPayments(payments);
                setAllLandlords(landlords);

                const currentLandlord = landlords.find(l => l.id === userProfile.landlordId);
                if (!currentLandlord) {
                    setLandlordType(LandlordType.None);
                    stopLoading();
                    return;
                }

                // Determine landlord type
                const landlordUnits = properties.flatMap(p => p.units.filter(u => u.landlordId === currentLandlord.id).map(unit => ({...unit, propertyName: p.name})));
                const isClientType = landlordUnits.length > 0 && landlordUnits.every(u => u.managementStatus === 'Client Managed');

                if (isClientType) {
                    setLandlordType(LandlordType.Client);
                    const homeownerTenant = tenants.find(t => t.residentType === 'Homeowner' && t.userId === userProfile.id);
                    
                    if (homeownerTenant) {
                        const [tenantPayments, tenantWaterReadings] = await Promise.all([
                            getTenantPayments(homeownerTenant.id),
                            getTenantWaterReadings(homeownerTenant.id)
                        ]);
                        setClientData({
                            tenantDetails: homeownerTenant,
                            payments: tenantPayments,
                            waterReadings: tenantWaterReadings,
                            units: landlordUnits,
                        });
                    } else {
                         setClientData({
                            tenantDetails: null,
                            payments: [],
                            waterReadings: [],
                            units: landlordUnits,
                        });
                    }
                } else {
                    setLandlordType(LandlordType.Investor);
                    // Prepare data for investor dashboard
                    const landlordProperties: { property: Property, units: Unit[] }[] = [];
                    properties.forEach(p => {
                        const units = p.units.filter(u => u.landlordId === currentLandlord.id);
                        if (units.length > 0) {
                            landlordProperties.push({ property: p, units });
                        }
                    });

                    const ownedUnitIdentifiers = new Set<string>();
                    landlordProperties.forEach(p => p.units.forEach(u => ownedUnitIdentifiers.add(`${p.property.id}-${u.name}`)));
                    const relevantTenants = tenants.filter(t => ownedUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`));
                    const relevantTenantIds = relevantTenants.map(t => t.id);
                    const relevantPayments = payments.filter(p => relevantTenantIds.includes(p.tenantId));
                    const summary = aggregateFinancials(relevantPayments, relevantTenants, landlordProperties);
                    
                    setInvestorData({
                        properties: landlordProperties,
                        tenants: relevantTenants,
                        payments: relevantPayments,
                        financialSummary: summary,
                    });
                }
                stopLoading();
            });
        }
    }, [userProfile, authLoading]);

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/login');
    };

    const landlordForStatement: Landlord | null = userProfile?.landlordId 
        ? allLandlords.find(l => l.id === userProfile.landlordId) || null
        : null;

    if (authLoading || landlordType === LandlordType.Loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    if (landlordType === LandlordType.None) {
        // Render a message for landlords not assigned to any units yet
        return (
            <div className="container mx-auto p-4 md:p-8">
                 <header className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Welcome, {userProfile?.name}</h1>
                        <p className="mt-4 text-muted-foreground">You are not currently assigned to any properties. Please contact management.</p>
                    </div>
                    <Button onClick={handleSignOut} variant="outline">
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                    </Button>
                </header>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 md:p-8">
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Welcome, {userProfile?.name}</h1>
                    <p className="text-muted-foreground">Here is an overview of your property portfolio.</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* The statement generation logic needs to be inside the specific dashboard */}
                    <Button onClick={handleSignOut} variant="outline">
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                    </Button>
                </div>
            </header>
            
            {clientData && clientData.units.length > 0 && (
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle>Your Units</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Property</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead className="text-right">Monthly Service Charge</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {clientData.units.map(unit => (
                                    <TableRow key={unit.name}>
                                        <TableCell>{unit.propertyName}</TableCell>
                                        <TableCell>{unit.name}</TableCell>
                                        <TableCell className="text-right">Ksh {(unit.serviceCharge || 0).toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {landlordType === LandlordType.Client && clientData ? (
                <ClientLandlordDashboard 
                    tenantDetails={clientData.tenantDetails} 
                    payments={clientData.payments} 
                    waterReadings={clientData.waterReadings}
                    allProperties={allProperties}
                    units={clientData.units}
                />
            ) : investorData ? (
                <LandlordDashboardContent {...investorData} />
            ) : null}
        </div>
    );
}
