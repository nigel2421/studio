
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Property, Unit, Tenant, Payment } from '@/lib/types';
import { getTenants, getAllPayments } from '@/lib/data';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { LandlordDashboardContent } from '@/components/financials/landlord-dashboard-content';
import { FinancialSummary, aggregateFinancials } from '@/lib/financial-utils';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LandlordDashboardPage() {
    const { userProfile, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const [dashboardData, setDashboardData] = useState<{
        properties: { property: Property, units: Unit[] }[],
        tenants: Tenant[],
        payments: Payment[],
        financialSummary: FinancialSummary,
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            if (userProfile?.role === 'landlord' && userProfile.landlordDetails) {
                setLoading(true);
                const [allTenants, allPayments] = await Promise.all([
                    getTenants(),
                    getAllPayments(),
                ]);

                const landlordProperties = userProfile.landlordDetails.properties;
                const ownedUnitIdentifiers = new Set<string>();
                landlordProperties.forEach(p => {
                    p.units.forEach(u => ownedUnitIdentifiers.add(`${p.property.id}-${u.name}`));
                });

                const relevantTenants = allTenants.filter(t => ownedUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`));
                const relevantTenantIds = relevantTenants.map(t => t.id);
                const relevantPayments = allPayments.filter(p => relevantTenantIds.includes(p.tenantId));

                const summary = aggregateFinancials(relevantPayments, relevantTenants, landlordProperties);
                
                setDashboardData({
                    properties: landlordProperties,
                    tenants: relevantTenants,
                    payments: relevantPayments,
                    financialSummary: summary,
                });
                setLoading(false);
            } else if (userProfile) {
                // Not a landlord or data is missing, stop loading
                setLoading(false);
            }
        }
        if (!authLoading) {
            fetchData();
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
    
    if (!dashboardData) {
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
                <Button onClick={handleSignOut} variant="outline">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                </Button>
            </header>
            <LandlordDashboardContent {...dashboardData} />
        </div>
    );
}
