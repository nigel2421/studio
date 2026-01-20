
'use client';

import { useState, useEffect } from 'react';
import { getTenants, getProperties, archiveTenant } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle, Edit, Trash, FileArchive, Search, FileDown } from "lucide-react";
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

export default function TenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const { startLoading, stopLoading } = useLoading();
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const fetchTenants = () => {
        getTenants().then(setTenants);
    }

    useEffect(() => {
        fetchTenants();
        getProperties().then(setProperties);
    }, []);

    const handleArchive = async (tenantId: string) => {
        startLoading('Archiving resident...');
        try {
            await archiveTenant(tenantId);
            fetchTenants();
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

    const filteredTenants = tenants.filter(tenant =>
        tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalPages = Math.ceil(filteredTenants.length / pageSize);
    const paginatedTenants = filteredTenants.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    return (
        <div>
            <div className="flex items-center justify-between w-full mb-6">
                <h2 className="text-2xl font-semibold">Tenants & Homeowners</h2>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name or email..."
                            className="pl-10"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button asChild variant="outline">
                        <Link href="/tenants/archived">
                            <FileArchive className="mr-2 h-4 w-4" />
                            View Archived
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/tenants/add">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Tenant/Homeowner
                        </Link>
                    </Button>
                </div>
            </div>

            {tenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16 border-dashed border-2 rounded-lg">
                    <h2 className="text-2xl font-semibold">No Active Tenants or Homeowners Found</h2>
                    <p className="mt-2 text-muted-foreground">
                        Get started by adding your first occupant.
                    </p>
                </div>
            ) : (
                <>
                    <div className="flex justify-end mb-4">
                        <Button variant="outline" size="sm" onClick={() => downloadCSV(filteredTenants, 'tenants_and_homeowners_export.csv')}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Export CSV
                        </Button>
                    </div>

                    {/* Desktop View */}
                    <Card className="hidden md:block mb-4">
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Property</TableHead>
                                        <TableHead>Billing Amount</TableHead>
                                        <TableHead>Payment Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedTenants.map(tenant => (
                                        <TableRow key={tenant.id}>
                                            <TableCell>
                                                <div className="font-medium">{tenant.name}</div>
                                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                                    {tenant.email}
                                                    {tenant.residentType === 'Homeowner' && (
                                                        <Badge variant="outline" className="text-[10px] py-0 px-1 font-normal">Homeowner</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div>{getPropertyName(tenant.propertyId)}</div>
                                                <div className="text-sm text-muted-foreground">Unit: {tenant.unitName}</div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">
                                                        Ksh {(tenant.lease?.serviceCharge || tenant.lease?.rent || 0).toLocaleString()}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground uppercase">
                                                        {tenant.residentType === 'Homeowner' ? 'Service Charge' : 'Rent'}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={getPaymentStatusVariant(tenant.lease?.paymentStatus)}>
                                                    {tenant.lease?.paymentStatus || 'N/A'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <TenantActions tenant={tenant} />
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
                                                                        <AlertDialogAction onClick={() => handleArchive(tenant.id)}>Continue</AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Mobile View */}
                    <div className="grid gap-4 md:hidden mb-4">
                        {paginatedTenants.map(tenant => (
                            <Card key={tenant.id} className="overflow-hidden">
                                <CardHeader className="p-4 bg-muted/40 pb-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-semibold text-base">{tenant.name}</h3>
                                            <p className="text-xs text-muted-foreground">{tenant.email}</p>
                                        </div>
                                        <Badge variant={getPaymentStatusVariant(tenant.lease?.paymentStatus)} className="text-[10px]">
                                            {tenant.lease?.paymentStatus || 'N/A'}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-2 grid gap-2 text-sm">
                                    <div className="flex justify-between border-b pb-2">
                                        <span className="text-muted-foreground">Property</span>
                                        <span className="font-medium">{getPropertyName(tenant.propertyId)}</span>
                                    </div>
                                    <div className="flex justify-between border-b pb-2">
                                        <span className="text-muted-foreground">Unit</span>
                                        <span className="font-medium">{tenant.unitName}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-muted-foreground">
                                            {tenant.residentType === 'Homeowner' ? 'Service Charge' : 'Rent'}
                                        </span>
                                        <span className="font-bold text-base text-primary">
                                            Ksh {(tenant.lease?.serviceCharge || tenant.lease?.rent || 0).toLocaleString()}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t">
                                        <TenantActions tenant={tenant} />
                                        <Button size="sm" variant="outline" asChild className="h-8">
                                            <Link href={`/tenants/edit/${tenant.id}`}>
                                                <Edit className="h-3.5 w-3.5" />
                                            </Link>
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button size="sm" variant="destructive" className="h-8 px-2">
                                                    <Trash className="h-3.5 w-3.5" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Archive Occupant?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This action will archive the occupant.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleArchive(tenant.id)}>Archive</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        totalItems={filteredTenants.length}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                    />
                </>
            )}
        </div>
    );
}
