
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getTenants, getProperties, archiveTenant, getPaymentHistory, getTenantWaterReadings } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle, Edit, Trash, FileArchive, Search, FileDown, Users, Home, Percent, Loader2, DollarSign, Building } from "lucide-react";
import { Tenant, Property } from '@/lib/types';
import { PaginationControls } from "@/components/ui/pagination-controls";
import { downloadCSV } from "@/lib/utils";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from '@/hooks/use-toast';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TenantActions } from './tenant-actions';
import { Input } from '@/components/ui/input';
import { useLoading } from '@/hooks/useLoading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';

export default function TenantsPage() {
    const [allResidents, setAllResidents] = useState<Tenant[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const { startLoading, stopLoading } = useLoading();
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
    const { userProfile } = useAuth();
    const isInvestmentConsultant = userProfile?.role === 'investment-consultant';
    const [generatingPdfFor, setGeneratingPdfFor] = useState<string | null>(null);

    const fetchResidents = () => {
        getTenants().then(setAllResidents);
    }

    useEffect(() => {
        fetchResidents();
        getProperties().then(setProperties);
    }, []);

    const tenants = useMemo(() => allResidents.filter(r => r.residentType === 'Tenant'), [allResidents]);
    const homeowners = useMemo(() => allResidents.filter(r => r.residentType === 'Homeowner'), [allResidents]);
    
    const totalUnits = useMemo(() => properties.reduce((sum, p) => sum + (p.units?.length || 0), 0), [properties]);
    const occupiedUnits = allResidents.length;
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    const handleArchive = async (tenantId: string) => {
        startLoading('Archiving resident...');
        try {
            await archiveTenant(tenantId);
            fetchResidents();
            toast({
                title: "Resident Archived",
                description: "The occupant has been moved to the archived list.",
            });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to archive resident.' });
        } finally {
            stopLoading();
        }
    };

    const getPropertyName = (propertyId: string) => {
        const property = properties.find(p => p.id === propertyId);
        return property ? property.name : 'N/A';
    };

    const getPaymentStatusVariant = (status?: Tenant['lease']['paymentStatus']) => {
        switch (status) {
            case 'Paid': return 'default';
            case 'Pending': return 'secondary';
            case 'Overdue': return 'destructive';
            default: return 'outline';
        }
    }

    const filteredTenants = useMemo(() => {
        return tenants.filter(tenant => {
             const propertyMatch = selectedPropertyId === 'all' || tenant.propertyId === selectedPropertyId;
             const searchMatch = tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                tenant.email.toLowerCase().includes(searchQuery.toLowerCase());
            return propertyMatch && searchMatch;
        });
    }, [tenants, searchQuery, selectedPropertyId]);


    const totalPages = Math.ceil(filteredTenants.length / pageSize);
    const paginatedTenants = filteredTenants.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );
    
    const handleExportStatement = async (tenant: Tenant) => {
        if (!tenant) return;
        setGeneratingPdfFor(tenant.id);
        startLoading('Generating Statement...');
        try {
            const { generateTenantStatementPDF } = await import('@/lib/pdf-generator');
            const tenantPayments = await getPaymentHistory(tenant.id);
            const tenantWaterReadings = await getTenantWaterReadings(tenant.id);
            generateTenantStatementPDF(tenant, tenantPayments, properties, tenantWaterReadings);
            toast({ title: 'Statement Generated', description: `Statement for ${tenant.name} downloaded.` });
        } catch (error) {
            console.error("Error generating statement", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not generate statement.' });
        } finally {
            stopLoading();
            setGeneratingPdfFor(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Residents</h2>
                    <p className="text-muted-foreground">Manage tenants and homeowners across your portfolio.</p>
                </div>
                {!isInvestmentConsultant && (
                    <div className="flex items-center gap-2">
                        <Button asChild variant="outline">
                            <Link href="/tenants/archived">
                                <FileArchive className="mr-2 h-4 w-4" />
                                View Archived
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/tenants/add">
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Add Tenant
                            </Link>
                        </Button>
                    </div>
                )}
            </div>
            
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{tenants.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Homeowners</CardTitle>
                        <Home className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{homeowners.length}</div>
                    </CardContent>
                </Card>
                 <Card className="col-span-2 md:col-span-1">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Portfolio Occupancy</CardTitle>
                        <Percent className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{occupancyRate.toFixed(1)}%</div>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                 <CardHeader>
                    <CardTitle>Tenant Directory</CardTitle>
                    <CardDescription>A list of all active tenants in your properties.</CardDescription>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4 gap-4">
                        <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name or email..."
                                    className="pl-10"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                             <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                                <SelectTrigger className="w-full sm:w-[200px]">
                                    <SelectValue placeholder="Filter by property..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Properties</SelectItem>
                                    {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => downloadCSV(filteredTenants, 'tenants_export.csv')}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Export CSV
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0 md:p-6">
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-4 p-4">
                        {paginatedTenants.map(tenant => (
                            <Card key={tenant.id}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle>{tenant.name}</CardTitle>
                                            <CardDescription>{tenant.email}</CardDescription>
                                        </div>
                                        <TenantActions tenant={tenant} onArchive={() => handleArchive(tenant.id)} isConsultant={isInvestmentConsultant} onExport={() => handleExportStatement(tenant)} />
                                    </div>
                                </CardHeader>
                                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-muted-foreground">Property</p>
                                        <p className="font-medium">{getPropertyName(tenant.propertyId)} / {tenant.unitName}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Rent</p>
                                        <p className="font-medium">Ksh {(tenant.lease?.rent || 0).toLocaleString()}</p>
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Badge variant={getPaymentStatusVariant(tenant.lease?.paymentStatus)}>
                                        {tenant.lease?.paymentStatus || 'N/A'}
                                    </Badge>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>

                    {/* Desktop Table View */}
                    <Table className="hidden md:table">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Property</TableHead>
                                <TableHead>Rent Amount</TableHead>
                                <TableHead>Payment Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedTenants.map(tenant => (
                                <TableRow key={tenant.id}>
                                    <TableCell>
                                        <div className="font-medium">{tenant.name}</div>
                                        <div className="text-sm text-muted-foreground">{tenant.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div>{getPropertyName(tenant.propertyId)}</div>
                                        <div className="text-sm text-muted-foreground">Unit: {tenant.unitName}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">Ksh {(tenant.lease?.rent || 0).toLocaleString()}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={getPaymentStatusVariant(tenant.lease?.paymentStatus)}>
                                            {tenant.lease?.paymentStatus || 'N/A'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <TenantActions tenant={tenant} onArchive={() => handleArchive(tenant.id)} isConsultant={isInvestmentConsultant} onExport={() => handleExportStatement(tenant)} />
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filteredTenants.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        No tenants found for the selected criteria.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                 <div className="p-4 border-t">
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        totalItems={filteredTenants.length}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>
            </Card>
        </div>
    );
}

// Refactored TenantActions to pass down archive handler
const TenantActions = ({ tenant, onArchive, isConsultant, onExport }: { tenant: Tenant, onArchive: () => void, isConsultant: boolean, onExport: () => void }) => {
    
    if (isConsultant) {
        return (
             <Button variant="outline" size="sm" onClick={onExport}>
                <FileDown className="mr-2 h-4 w-4" />
                Export Statement
            </Button>
        )
    }
    
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                    <Link href={`/tenants/edit/${tenant.id}`}>
                        <Edit className="mr-2 h-4 w-4" /> Edit
                    </Link>
                </DropdownMenuItem>
                 <DropdownMenuItem onClick={onExport}>
                    <FileDown className="mr-2 h-4 w-4" /> Export Statement
                </DropdownMenuItem>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <Trash className="mr-2 h-4 w-4" /> Archive
                        </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action will archive the occupant and mark their unit as vacant. You can view archived records later.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={onArchive}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
