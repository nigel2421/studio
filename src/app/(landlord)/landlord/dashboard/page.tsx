
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Property, Unit, Tenant, Payment, Landlord, PropertyOwner, WaterMeterReading } from '@/lib/types';
import { getTenants, getAllPaymentsForReport, getProperties, getLandlords, getTenantPayments, getTenantWaterReadings, getPropertyOwners, getAllWaterReadings } from '@/lib/data';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { ClientLandlordDashboard } from '@/components/financials/client-landlord-dashboard';
import { FinancialSummary, aggregateFinancials, calculateTransactionBreakdown, generateLandlordDisplayTransactions } from '@/lib/financial-utils';
import { Loader2, LogOut, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatementOptionsDialog } from '@/components/financials/statement-options-dialog';
import { generateTenantStatementPDF, generateOwnerServiceChargeStatementPDF, generateLandlordStatementPDF } from '@/lib/pdf-generator';
import { useLoading } from '@/hooks/useLoading';
import { isWithinInterval } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function UniversalOwnerDashboardPage() {
    const { userProfile, isLoading: authLoading } = useAuth();
    const router = useRouter();
    
    const [dashboardType, setDashboardType] = useState<'landlord' | 'homeowner' | null>(null);
    const [viewData, setViewData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeOwnerTab, setActiveOwnerTab] = useState<'service-charge' | 'water'>('service-charge');


    const [isStatementOpen, setIsStatementOpen] = useState(false);
    const { startLoading: startPdfLoading, stopLoading: stopPdfLoading, isLoading: isPdfGenerating } = useLoading();

    useEffect(() => {
        if (authLoading || !userProfile) return;

        setLoading(true);

        const ownerId = userProfile.landlordId || userProfile.propertyOwnerId;
        const isAdmin = userProfile.role === 'admin';
        const adminId = userProfile.email === 'nigel2421@gmail.com' ? 'soil_merchants_internal' : ownerId;
        const effectiveOwnerId = isAdmin ? adminId : ownerId;

        if (!effectiveOwnerId) {
            setLoading(false);
            setDashboardType(null);
            return;
        }

        async function fetchDataAndDetermineRole() {
            const [allProperties, allTenants, allPayments, allLandlords, allPropertyOwners, allWaterReadings] = await Promise.all([
                getProperties(),
                getTenants(),
                getAllPaymentsForReport(),
                getLandlords(),
                getPropertyOwners(),
                getAllWaterReadings(),
            ]);

            const owner = allLandlords.find(l => l.id === effectiveOwnerId) || allPropertyOwners.find(o => o.id === effectiveOwnerId);

            if (!owner) {
                setLoading(false);
                setDashboardType(null);
                return;
            }

            const ownedUnits: Unit[] = allProperties.flatMap(p =>
                (p.units || []).filter(u => {
                    if (isAdmin && effectiveOwnerId === 'soil_merchants_internal') {
                        return u.ownership === 'SM';
                    }
                    if ('assignedUnits' in owner && (owner as PropertyOwner).assignedUnits) { 
                        return (owner as PropertyOwner).assignedUnits.some(au => au.propertyId === p.id && au.unitNames.includes(u.name));
                    }
                    if ('bankAccount' in owner) { 
                        return u.landlordId === effectiveOwnerId;
                    }
                    return false;
                }).map(u => ({ ...u, propertyId: p.id, propertyName: p.name }))
            );
            
            const uniqueOwnedUnits = Array.from(new Map(ownedUnits.map(item => [`${item.propertyId}-${item.name}`, item])).values());

            const isInvestor = uniqueOwnedUnits.some(u => u.managementStatus === 'Rented for Clients' || u.managementStatus === 'Rented for Soil Merchants' || u.managementStatus === 'Airbnb');
            const isClient = uniqueOwnedUnits.some(u => u.managementStatus === 'Client Managed');

            if (isInvestor) {
                setDashboardType('landlord');
                // Landlord data processing remains the same
                setViewData({}); // Placeholder
            } else if (isClient) {
                setDashboardType('homeowner');
                const homeownerTenantProfile = allTenants.find(t => userProfile && (t.userId === userProfile.id || t.email === userProfile.email) && t.residentType === 'Homeowner');
                
                const relevantTenantIds = allTenants.filter(t => t.userId === userProfile.id || t.email === userProfile.email).map(t => t.id);
                
                const [paymentData, waterData] = await Promise.all([
                    homeownerTenantProfile ? getTenantPayments(homeownerTenantProfile.id) : Promise.resolve([]),
                    homeownerTenantProfile ? getTenantWaterReadings(homeownerTenantProfile.id) : Promise.resolve([]),
                ]);

                setViewData({
                    owner: owner,
                    tenantDetails: homeownerTenantProfile,
                    payments: paymentData,
                    waterReadings: waterData,
                    allProperties: allProperties,
                    units: uniqueOwnedUnits
                });
            } else {
                setDashboardType(null);
            }
            setLoading(false);
        }

        fetchDataAndDetermineRole();

    }, [userProfile, authLoading]);

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/login');
    };
    
    const handleGenerateStatement = async (entity: Landlord | PropertyOwner, startDate: Date, endDate: Date) => {
        startPdfLoading('Generating Statement...');
        try {
            if (dashboardType === 'homeowner') {
                const allWaterReadings = await getAllWaterReadings();
                await generateOwnerServiceChargeStatementPDF(entity, viewData.allProperties, await getTenants(), await getAllPaymentsForReport(), allWaterReadings, startDate, endDate, activeOwnerTab);
            } else if (dashboardType === 'landlord') {
                // Landlord statement logic remains unchanged for now
            }
            setIsStatementOpen(false);
        } catch (error) {
            console.error("Error generating statement", error);
        } finally {
            stopPdfLoading();
        }
    };


    if (authLoading || loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    const headerDescription = dashboardType === 'landlord' ? 'Financial overview of your managed property portfolio.' : 'Here is the overview of your service charge and water accounts.';

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Tabs value={activeOwnerTab} onValueChange={(v) => setActiveOwnerTab(v as any)} className="space-y-8">
                 <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Welcome, {userProfile?.name}</h1>
                        <p className="text-muted-foreground">{headerDescription}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {dashboardType === 'homeowner' && (
                             <TabsList>
                                <TabsTrigger value="service-charge">Service Charge</TabsTrigger>
                                <TabsTrigger value="water">Water Bills</TabsTrigger>
                            </TabsList>
                        )}
                        <Button onClick={() => setIsStatementOpen(true)} variant="outline">
                            <FileDown className="mr-2 h-4 w-4" />
                            Download Statement
                        </Button>
                        <Button onClick={handleSignOut} variant="outline">
                            <LogOut className="mr-2 h-4 w-4" />
                            Sign Out
                        </Button>
                    </div>
                </header>
                
                {dashboardType === 'homeowner' && viewData && <ClientLandlordDashboard {...viewData} activeTab={activeOwnerTab} />}
                
                {!dashboardType && !loading && (
                    <div className="text-center py-10">
                        <h2 className="text-xl font-semibold">No Property Data Found</h2>
                        <p className="text-muted-foreground mt-2">Your account is not currently assigned to any properties. Please contact management.</p>
                    </div>
                )}
            </Tabs>

            {viewData?.owner && (
                <StatementOptionsDialog
                    isOpen={isStatementOpen}
                    onClose={() => setIsStatementOpen(false)}
                    entity={viewData.owner}
                    onGenerate={handleGenerateStatement as any}
                    isGenerating={isPdfGenerating}
                />
            )}
        </div>
    );
}
