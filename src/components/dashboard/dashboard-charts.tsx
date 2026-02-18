
'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { Payment, Tenant, Property, MaintenanceRequest } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

const FinancialOverviewChart = dynamic(() => import('./financial-overview-chart').then(mod => mod.FinancialOverviewChart), {
    loading: () => <Skeleton className="h-[300px]" />,
    ssr: false,
});

const OccupancyOverviewChart = dynamic(() => import('./occupancy-overview-chart').then(mod => mod.OccupancyOverviewChart), {
    loading: () => <Skeleton className="h-[300px]" />,
    ssr: false,
});

const MaintenanceOverviewChart = dynamic(() => import('./maintenance-overview-chart').then(mod => mod.MaintenanceOverviewChart), {
    loading: () => <Skeleton className="h-[300px]" />,
    ssr: false,
});

const OrientationOverviewChart = dynamic(() => import('./orientation-overview-chart').then(mod => mod.OrientationOverviewChart), {
    loading: () => <Skeleton className="h-[300px]" />,
    ssr: false,
});

interface DashboardChartsProps {
    payments: Payment[];
    tenants: Tenant[];
    selectedProperty: Property;
    maintenanceRequests: MaintenanceRequest[];
}

export function DashboardCharts({ payments, tenants, selectedProperty, maintenanceRequests }: DashboardChartsProps) {
    const { userProfile } = useAuth();
    const isInvestmentConsultant = userProfile?.role === 'investment-consultant';

    return (
        <>
            <div className="grid gap-8 md:grid-cols-2">
                {!isInvestmentConsultant && <FinancialOverviewChart payments={payments} tenants={tenants} />}
                <OccupancyOverviewChart properties={[selectedProperty]} tenants={tenants} />
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <MaintenanceOverviewChart maintenanceRequests={maintenanceRequests} />
                <OrientationOverviewChart properties={[selectedProperty]} />
            </div>
        </>
    );
}
