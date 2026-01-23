
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Property, Unit, Tenant, Payment, Landlord } from '@/lib/types';
import { getTenants, getAllPayments } from '@/lib/data';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { LandlordDashboardContent } from '@/components/financials/landlord-dashboard-content';
import { FinancialSummary, aggregateFinancials, calculateTransactionBreakdown } from '@/lib/financial-utils';
import { Loader2, LogOut, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLoading } from '@/hooks/useLoading';
import { StatementOptionsDialog } from '@/components/financials/statement-options-dialog';
import { isWithinInterval } from 'date-fns';
import { generateLandlordStatementPDF } from '@/lib/pdf-generator';

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
    const { startLoading, stopLoading, isLoading: isGenerating } = useLoading();
    const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);

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

    const landlordForStatement: Landlord | null = userProfile?.landlordId ? {
        id: userProfile.landlordId,
        name: userProfile.name || 'Landlord',
        email: userProfile.email || '',
        phone: '', // This info is not available on userProfile directly
        bankAccount: '' // This info is not available on userProfile directly
    } : null;

    const handleGenerateStatement = async (landlord: Landlord, startDate: Date, endDate: Date) => {
        if (!dashboardData) return;
        startLoading('Generating Statement...');
        try {
          const { properties, tenants, payments } = dashboardData;
    
          const ownedUnitIdentifiers = new Set<string>();
          properties.forEach(p => {
            p.units.forEach(u => ownedUnitIdentifiers.add(`${p.property.id}-${u.name}`));
          });
    
          const relevantTenants = tenants.filter(t => ownedUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`));
          
          const relevantPayments = payments.filter(p => 
              p.type === 'Rent' &&
              isWithinInterval(new Date(p.date), { start: startDate, end: endDate })
          );
    
          const summary = aggregateFinancials(relevantPayments, relevantTenants, properties);
          
          const unitMap = new Map<string, Unit>();
            properties.forEach(p => {
                p.units.forEach(u => {
                    unitMap.set(`${p.property.id}-${u.name}`, u);
                });
            });
    
          const transactionsForPDF = relevantPayments.map(payment => {
            const tenant = relevantTenants.find(t => t.id === payment.tenantId);
            const unit = tenant ? unitMap.get(`${tenant.propertyId}-${tenant.unitName}`) : undefined;
            const rentAmount = unit?.rentAmount || tenant?.lease?.rent || 0;
            const serviceCharge = unit?.serviceCharge || tenant?.lease?.serviceCharge || 0;
            const breakdown = calculateTransactionBreakdown(rentAmount, serviceCharge);
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
    
          const unitsForPDF = properties.flatMap(p => p.units.map(u => ({
            property: p.property.name,
            unitName: u.name,
            unitType: u.unitType,
            status: u.status
          })));
          
          generateLandlordStatementPDF(landlord, summary, transactionsForPDF, unitsForPDF, startDate, endDate);
          setIsStatementDialogOpen(false); 
    
        } catch (error) {
          console.error("Error generating statement:", error);
        } finally {
          stopLoading();
        }
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
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setIsStatementDialogOpen(true)}>
                        <FileDown className="mr-2 h-4 w-4" />
                        Generate Statement
                    </Button>
                    <Button onClick={handleSignOut} variant="outline">
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                    </Button>
                </div>
            </header>
            <LandlordDashboardContent {...dashboardData} />
            <StatementOptionsDialog
                isOpen={isStatementDialogOpen}
                onClose={() => setIsStatementDialogOpen(false)}
                landlord={landlordForStatement}
                onGenerate={handleGenerateStatement}
                isGenerating={isGenerating}
            />
        </div>
    );
}
