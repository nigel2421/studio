'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Property, Unit, Tenant, Payment, Landlord, PropertyOwner, WaterMeterReading, FinancialSummary } from '@/lib/types';
import { getTenants, getAllPaymentsForReport, getProperties, getLandlords, getPaymentHistory, getTenantWaterReadings, getPropertyOwners, getAllWaterReadings } from '@/lib/data';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { ClientLandlordDashboard } from '@/components/financials/client-landlord-dashboard';
import { LandlordDashboardContent } from '@/components/financials/landlord-dashboard-content';
import { aggregateFinancials, generateLandlordDisplayTransactions } from '@/lib/financial-utils';
import { Loader2, LogOut, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatementOptionsDialog } from '@/components/financials/statement-options-dialog';
import { useLoading } from '@/hooks/useLoading';
import { startOfYear, endOfDay } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DatePicker } from '@/components/ui/date-picker';

export default function UniversalOwnerDashboardPage() {
    const { userProfile, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const [dashboardType, setDashboardType] = useState<'landlord' | 'homeowner' | null>(null);
    const [viewData, setViewData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeOwnerTab, setActiveOwnerTab] = useState<'service-charge' | 'water'>('service-charge');

    const [isStatementOpen, setIsStatementOpen] = useState(false);
    const { startLoading: startPdfLoading, stopLoading: stopPdfLoading, isLoading: isPdfGenerating } = useLoading();

    const [startDate, setStartDate] = useState<Date | undefined>(startOfYear(new Date()));
    const [endDate, setEndDate] = useState<Date | undefined>(new Date());

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

            const owner: Landlord | PropertyOwner | undefined = allLandlords.find((l: Landlord) => l.id === effectiveOwnerId) || allPropertyOwners.find((o: PropertyOwner) => o.id === effectiveOwnerId);

            if (!owner) {
                setLoading(false);
                setDashboardType(null);
                return;
            }

            const ownedUnits: Unit[] = allProperties.flatMap((p: Property) =>
                (p.units || []).filter((u: Unit) => {
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
                }).map((u: Unit) => ({ ...u, propertyId: p.id, propertyName: p.name }))
            );

            const uniqueOwnedUnits = Array.from(new Map(ownedUnits.map(item => [`${item.propertyId}-${item.name}`, item])).values());

            const isInvestor = uniqueOwnedUnits.some(u => u.managementStatus === 'Rented for Clients' || u.managementStatus === 'Rented for Soil Merchants' || u.managementStatus === 'Airbnb');
            const isClient = uniqueOwnedUnits.some(u => u.managementStatus === 'Client Managed');

            if (isInvestor) {
                setDashboardType('landlord');

                const landlordPropertyMap = new Map<string, Property>();
                allProperties.forEach((p: Property) => {
                    const unitsForProp = uniqueOwnedUnits.filter(u => u.propertyId === p.id);
                    if (unitsForProp.length > 0) {
                        landlordPropertyMap.set(p.id, { ...p, units: unitsForProp });
                    }
                });
                const landlordPropertiesResult = Array.from(landlordPropertyMap.values());


                const ownedUnitIdentifiers = new Set(uniqueOwnedUnits.map(u => `${u.propertyId}-${u.name}`));
                const relevantTenants = allTenants.filter((t: Tenant) => ownedUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`));
                const relevantTenantIds = new Set(relevantTenants.map((t: Tenant) => t.id));
                const relevantPayments = allPayments.filter((p: Payment) => relevantTenantIds.has(p.tenantId));

                setViewData({
                    properties: landlordPropertiesResult,
                    tenants: relevantTenants,
                    payments: relevantPayments,
                    owner,
                    totalUnits: uniqueOwnedUnits.length,
                });

            } else if (isClient) {
                setDashboardType('homeowner');
                const homeownerTenantProfiles = allTenants.filter((t: Tenant) => userProfile && (t.userId === userProfile.id || t.email === userProfile.email) && t.residentType === 'Homeowner');
                const primaryTenantProfile = homeownerTenantProfiles.length > 0 ? homeownerTenantProfiles[0] : null;

                const tenantIds = homeownerTenantProfiles.map((t: Tenant) => t.id);

                let paymentData: Payment[] = [];
                let waterData: WaterMeterReading[] = [];

                if (tenantIds.length > 0) {
                    const paymentPromises = tenantIds.map((id: string) => getPaymentHistory(id));
                    const waterPromises = tenantIds.map((id: string) => getTenantWaterReadings(id));

                    const paymentResults = await Promise.all(paymentPromises);
                    const waterResults = await Promise.all(waterPromises);

                    paymentData = paymentResults.flat();
                    waterData = waterResults.flat();
                }

                setViewData({
                    owner: owner,
                    tenantDetails: primaryTenantProfile,
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

    const filteredDashboardData = useMemo(() => {
        if (!viewData || dashboardType !== 'landlord') return null;

        const transactions = generateLandlordDisplayTransactions(viewData.payments, viewData.tenants, viewData.properties, viewData.owner, startDate, endOfDay(endDate || new Date()));
        const summary = aggregateFinancials(transactions, viewData.properties, viewData.tenants, startDate, endOfDay(endDate || new Date()), viewData.owner);

        return {
            financialSummary: summary,
            displayTransactions: transactions,
        };
    }, [viewData, dashboardType, startDate, endDate]);


    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/login');
    };

    const handleGenerateStatement = async (entity: Landlord | PropertyOwner, pdfStartDate: Date, pdfEndDate: Date) => {
        startPdfLoading('Generating Statement...');
        try {
            if (dashboardType === 'homeowner') {
                const { generateOwnerServiceChargeStatementPDF } = await import('@/lib/pdf-generator');
                const allWaterReadings = await getAllWaterReadings();
                generateOwnerServiceChargeStatementPDF(entity, viewData.allProperties, await getTenants(), await getAllPaymentsForReport(), allWaterReadings, pdfStartDate, pdfEndDate, activeOwnerTab);
            } else if (dashboardType === 'landlord') {
                const { generateLandlordStatementPDF } = await import('@/lib/pdf-generator');

                const displayTransactions = generateLandlordDisplayTransactions(viewData.payments, viewData.tenants, viewData.properties, viewData.owner, pdfStartDate, pdfEndDate);
                const summary = aggregateFinancials(displayTransactions, viewData.properties, viewData.tenants, pdfStartDate, pdfEndDate, viewData.owner);

                const transactionsForPDF = displayTransactions.map(t => ({
                    date: new Date(t.date).toLocaleDateString(),
                    unitName: t.unitName,
                    rentForMonth: t.rentForMonth,
                    forMonthDisplay: t.forMonthDisplay,
                    gross: t.gross,
                    serviceChargeDeduction: t.serviceChargeDeduction,
                    managementFee: t.managementFee,
                    netToLandlord: t.netToLandlord,
                    otherCosts: t.otherCosts,
                    id: t.id,
                    propertyId: t.propertyId,
                    unitType: t.unitType,
                }));

                const unitsForPDF = viewData.properties.flatMap((p: Property) => (p.units || []).map((u: Unit) => ({
                    property: p.name,
                    unitName: u.name,
                    unitType: u.unitType,
                    status: u.status
                })));

                generateLandlordStatementPDF(entity as Landlord, summary, transactionsForPDF, unitsForPDF, pdfStartDate, pdfEndDate);
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
                <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">Welcome, {userProfile?.name}</h1>
                        <p className="text-muted-foreground">{headerDescription}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {dashboardType === 'landlord' && (
                            <>
                                <DatePicker value={startDate} onChange={setStartDate} />
                                <DatePicker value={endDate} onChange={setEndDate} />
                            </>
                        )}
                        {dashboardType === 'homeowner' && (
                            <TabsList>
                                <TabsTrigger value="service-charge">Service Charge</TabsTrigger>
                                <TabsTrigger value="water">Water</TabsTrigger>
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

                {dashboardType === 'landlord' && viewData && filteredDashboardData && (
                    <LandlordDashboardContent
                        properties={viewData.properties}
                        financialSummary={filteredDashboardData.financialSummary}
                        displayTransactions={filteredDashboardData.displayTransactions}
                        totalUnits={viewData.totalUnits}
                    />
                )}

                {dashboardType === 'homeowner' && viewData && <ClientLandlordDashboard {...viewData} activeTab={activeOwnerTab} />}

                {!dashboardType && !loading && (
                    <div className="text-center py-10">
                        <h2 className="text-xl font-semibold">No Property Data Found</h2>
                        <p className="text-muted-foreground">Your account is not currently assigned to any properties. Please contact management.</p>
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
