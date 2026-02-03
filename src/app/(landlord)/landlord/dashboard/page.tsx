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
import { FinancialSummary, aggregateFinancials } from '@/lib/financial-utils';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function UniversalOwnerDashboardPage() {
    const { userProfile, isLoading: authLoading } = useAuth();
    const router = useRouter();
    
    // State for both dashboards
    const [landlordData, setLandlordData] = useState<any>(null);
    const [homeownerData, setHomeownerData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && userProfile) {
            setLoading(true);
            if ((userProfile.role === 'landlord' || userProfile.role === 'admin') && (userProfile.landlordId || userProfile.email === 'nigel2421@gmail.com')) {
                Promise.all([
                    getProperties(),
                    getTenants(),
                    getAllPaymentsForReport(),
                ]).then(async ([properties, tenants, payments]) => {

                    const landlordId = userProfile.landlordId || 'soil_merchants_internal';
                    if (!landlordId) {
                        setLoading(false);
                        return;
                    }

                    const landlordProperties: { property: Property, units: Unit[] }[] = [];
                    properties.forEach(p => {
                        const units = p.units.filter(u => u.landlordId === landlordId);
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
                    
                    setLandlordData({
                        properties: landlordProperties,
                        tenants: relevantTenants,
                        payments: relevantPayments,
                        financialSummary: summary,
                    });
                    
                    setLoading(false);
                });
            } else if (userProfile.role === 'homeowner' && userProfile.tenantId) {
                Promise.all([
                    getTenantPayments(userProfile.tenantId),
                    getTenantWaterReadings(userProfile.tenantId),
                    getProperties()
                ]).then(([paymentData, waterData, propertiesData]) => {
                     const ownerUnits = propertiesData.flatMap(p => 
                        p.units
                         .filter(u => u.landlordId === userProfile.landlordId || u.landlordId === userProfile.propertyOwnerId)
                         .map(u => ({...u, propertyName: p.name}))
                     );
                    setHomeownerData({
                        tenantDetails: userProfile.tenantDetails,
                        payments: paymentData,
                        waterReadings: waterData,
                        allProperties: propertiesData,
                        units: ownerUnits
                    });
                    setLoading(false);
                });
            } else {
                setLoading(false);
            }
        }
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
    
    // Conditional Rendering
    if (userProfile?.role === 'homeowner' && homeownerData) {
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
                <ClientLandlordDashboard {...homeownerData} />
            </div>
        )
    }

    if ((userProfile?.role === 'landlord' || userProfile?.role === 'admin') && landlordData) {
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
                <LandlordDashboardContent {...landlordData} />
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