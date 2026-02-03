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
import { FinancialSummary, aggregateFinancials } from '@/lib/financial-utils';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function UniversalOwnerDashboardPage() {
    const { userProfile, isLoading: authLoading } = useAuth();
    const router = useRouter();
    
    const [dashboardType, setDashboardType] = useState<'landlord' | 'homeowner' | null>(null);
    const [viewData, setViewData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

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

            const ownedUnits: Unit[] = allProperties.flatMap(p =>
                (p.units || []).filter(u => {
                    if (isAdmin && effectiveOwnerId === 'soil_merchants_internal') {
                        return u.ownership === 'SM';
                    }
                    if (owner && 'assignedUnits' in owner) { 
                        return (owner as PropertyOwner).assignedUnits.some(au => au.propertyId === p.id && au.unitNames.includes(u.name));
                    }
                    if (owner && 'phone' in owner) { 
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
                    properties: landlordProperties,
                    tenants: relevantTenants,
                    payments: relevantPayments,
                    financialSummary: summary,
                });
            } else if (isClient) {
                setDashboardType('homeowner');
                const homeownerTenantProfile = allTenants.find(t => t.userId === userProfile.id || t.id === userProfile.tenantId);
                const [paymentData, waterData] = await Promise.all([
                    getTenantPayments(homeownerTenantProfile?.id || ''),
                    getTenantWaterReadings(homeownerTenantProfile?.id || ''),
                ]);
                setViewData({
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

    if (authLoading || loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    // --- Render Logic ---
    if (dashboardType === 'homeowner' && viewData) {
        return (
             <div className="container mx-auto p-4 md:p-8">
                <header className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Welcome, {userProfile?.name}</h1>
                        <p className="text-muted-foreground">Here is the overview of your service charge account.</p>
                    </div>
                    <Button onClick={handleSignOut} variant="outline">
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                    </Button>
                </header>
                <ClientLandlordDashboard {...viewData} />
            </div>
        )
    }

    if (dashboardType === 'landlord' && viewData) {
         return (
            <div className="container mx-auto p-4 md:p-8">
                <header className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Welcome, {userProfile?.name}</h1>
                        <p className="text-muted-foreground">Here is the investor overview of your property portfolio.</p>
                    </div>
                    <Button onClick={handleSignOut} variant="outline">
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                    </Button>
                </header>
                <LandlordDashboardContent {...viewData} />
            </div>
        );
    }
    
    // Fallback for when data isn't loaded or role is wrong
    return (
        <div className="container mx-auto p-4 md:p-8">
             <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Welcome, {userProfile?.name}</h1>
                </div>
                <Button onClick={handleSignOut} variant="outline">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                </Button>
            </header>
            <div className="text-center py-10">
                <h2 className="text-xl font-semibold">No Property Data Found</h2>
                <p className="text-muted-foreground mt-2">Your account is not currently assigned to any properties. Please contact management.</p>
            </div>
        </div>
    );
}
