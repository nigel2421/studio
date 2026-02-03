
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Property, Unit, Tenant, Payment, Landlord, PropertyOwner } from '@/lib/types';
import { getTenants, getAllPaymentsForReport, getProperties, getLandlords, getTenantPayments, getTenantWaterReadings, getPropertyOwners } from '@/lib/data';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { LandlordDashboardContent } from '@/components/financials/landlord-dashboard-content';
import { ClientLandlordDashboard } from '@/components/financials/client-landlord-dashboard';
import { FinancialSummary, aggregateFinancials, calculateTransactionBreakdown } from '@/lib/financial-utils';
import { Loader2, LogOut, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatementOptionsDialog } from '@/components/financials/statement-options-dialog';
import { generateTenantStatementPDF, generateOwnerServiceChargeStatementPDF, generateLandlordStatementPDF } from '@/lib/pdf-generator';
import { useLoading } from '@/hooks/useLoading';
import { isWithinInterval } from 'date-fns';

export default function UniversalOwnerDashboardPage() {
    const { userProfile, isLoading: authLoading } = useAuth();
    const router = useRouter();
    
    const [dashboardType, setDashboardType] = useState<'landlord' | 'homeowner' | null>(null);
    const [viewData, setViewData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

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
            const [allProperties, allTenants, allPayments, allLandlords, allPropertyOwners] = await Promise.all([
                getProperties(),
                getTenants(),
                getAllPaymentsForReport(),
                getLandlords(),
                getPropertyOwners(),
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
                    if ('assignedUnits' in owner && owner.assignedUnits) { 
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
                const landlordProperties: { property: Property, units: Unit[] }[] = [];
                allProperties.forEach(p => {
                    let unitsForLandlord: Unit[] = [];
                    if (isAdmin && effectiveOwnerId === 'soil_merchants_internal') {
                        unitsForLandlord = p.units.filter(u => u.ownership === 'SM');
                    } else {
                        unitsForLandlord = p.units.filter(u => u.landlordId === effectiveOwnerId);
                    }
                    if (unitsForLandlord.length > 0) {
                        landlordProperties.push({ property: p, units: unitsForLandlord });
                    }
                });

                const ownedUnitIdentifiers = new Set<string>();
                landlordProperties.forEach(p => p.units.forEach(u => ownedUnitIdentifiers.add(`${p.property.id}-${u.name}`)));
                const relevantTenants = allTenants.filter(t => ownedUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`));
                const relevantTenantIds = relevantTenants.map(t => t.id);
                const relevantPayments = allPayments.filter(p => relevantTenantIds.includes(p.tenantId));

                const summary = aggregateFinancials(relevantPayments, relevantTenants, landlordProperties);

                setViewData({
                    owner,
                    properties: landlordProperties,
                    tenants: relevantTenants,
                    payments: relevantPayments,
                    financialSummary: summary,
                });
            } else if (isClient) {
                setDashboardType('homeowner');
                const homeownerTenantProfile = allTenants.find(t => t.userId === userProfile.id || t.email === userProfile.email && t.residentType === 'Homeowner');
                const [paymentData, waterData] = await Promise.all([
                    getTenantPayments(homeownerTenantProfile?.id || ''),
                    getTenantWaterReadings(homeownerTenantProfile?.id || ''),
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
                await generateOwnerServiceChargeStatementPDF(entity, viewData.allProperties, await getTenants(), await getAllPaymentsForReport(), startDate, endDate);
            } else if (dashboardType === 'landlord') {
                const landlordProperties = viewData.properties;
                const allTenants = viewData.tenants;

                const relevantPayments = viewData.payments.filter((p: Payment) => 
                    isWithinInterval(new Date(p.date), { start: startDate, end: endDate })
                );

                const summary = aggregateFinancials(relevantPayments, allTenants, landlordProperties);
                
                const unitMap = new Map<string, Unit>();
                landlordProperties.forEach((p: { property: Property, units: Unit[] }) => {
                    p.units.forEach(u => {
                        unitMap.set(`${p.property.id}-${u.name}`, u);
                    });
                });

                const transactionsForPDF = relevantPayments.map((payment: Payment) => {
                    const tenant = allTenants.find((t: Tenant) => t.id === payment.tenantId);
                    const unit = tenant ? unitMap.get(`${tenant.propertyId}-${tenant.unitName}`) : undefined;
                    const breakdown = calculateTransactionBreakdown(payment, unit, tenant);
                    return {
                        date: new Date(payment.date).toLocaleDateString(),
                        unit: tenant?.unitName || 'N/A',
                        rentForMonth: payment.rentForMonth,
                        gross: breakdown.gross,
                        serviceCharge: breakdown.serviceChargeDeduction,
                        mgmtFee: breakdown.managementFee,
                        net: breakdown.netToLandlord,
                    };
                });

                const unitsForPDF = landlordProperties.flatMap((p: { property: Property, units: Unit[] }) => p.units.map(u => ({
                    property: p.property.name,
                    unitName: u.name,
                    unitType: u.unitType,
                    status: u.status
                })));

                generateLandlordStatementPDF(entity as Landlord, summary, transactionsForPDF, unitsForPDF, startDate, endDate);
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
    
    // --- Render Logic ---
    const headerTitle = dashboardType === 'landlord' ? 'Investor Overview' : 'Homeowner Overview';
    const headerDescription = dashboardType === 'landlord' ? 'Financial overview of your managed property portfolio.' : 'Here is the overview of your service charge account.';

    return (
        <div className="container mx-auto p-4 md:p-8">
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Welcome, {userProfile?.name}</h1>
                    <p className="text-muted-foreground">{headerDescription}</p>
                </div>
                <div className="flex items-center gap-2">
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
            
            {dashboardType === 'homeowner' && viewData && <ClientLandlordDashboard {...viewData} />}
            {dashboardType === 'landlord' && viewData && <LandlordDashboardContent {...viewData} />}
            {!dashboardType && !loading && (
                 <div className="text-center py-10">
                    <h2 className="text-xl font-semibold">No Property Data Found</h2>
                    <p className="text-muted-foreground mt-2">Your account is not currently assigned to any properties. Please contact management.</p>
                </div>
            )}

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
