
'use client';

import { useState, useEffect } from 'react';
import { getTenants, getProperties, archiveTenant } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle, Edit, Trash, FileArchive, Search } from "lucide-react";
import { Tenant, Property } from '@/lib/types';
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

export default function TenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');

    const fetchTenants = () => {
        getTenants().then(setTenants);
    }

    useEffect(() => {
        fetchTenants();
        getProperties().then(setProperties);
    }, []);

    const handleArchive = async (tenantId: string) => {
        await archiveTenant(tenantId);
        fetchTenants();
        toast({
            title: "Tenant Archived",
            description: "The tenant has been moved to the archived list.",
        });
    };

    const getPropertyName = (propertyId: string) => {
        const property = properties.find(p => p.id === propertyId);
        return property ? property.name : 'N/A';
    };

    const getPaymentStatusVariant = (status: Tenant['lease']['paymentStatus']) => {
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

    return (
        <div>
            <div className="flex items-center justify-between w-full mb-6">
                <h2 className="text-2xl font-semibold">Tenants</h2>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search tenants..."
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
                            Add Tenant
                        </Link>
                    </Button>
                </div>
            </div>

            {tenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16 border-dashed border-2 rounded-lg">
                    <h2 className="text-2xl font-semibold">No Active Tenants Found</h2>
                    <p className="mt-2 text-muted-foreground">
                        Get started by adding your first tenant.
                    </p>
                </div>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tenant</TableHead>
                                    <TableHead>Property</TableHead>
                                    <TableHead>Lease Dates</TableHead>
                                    <TableHead>Rent</TableHead>
                                    <TableHead>Payment Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTenants.map(tenant => (
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
                                            {tenant.lease.startDate} - {tenant.lease.endDate}
                                        </TableCell>
                                        <TableCell>
                                            ${tenant.lease.rent.toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getPaymentStatusVariant(tenant.lease.paymentStatus)}>
                                                {tenant.lease.paymentStatus}
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
                                                                        This action will archive the tenant and mark their unit as vacant. You can view archived tenants later.
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
            )}
        </div>
    );
}
