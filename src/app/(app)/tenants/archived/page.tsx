
'use client';

import { useState, useEffect } from 'react';
import { getArchivedTenants, getProperties } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ArchivedTenant, Property } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function ArchivedTenantsPage() {
    const [tenants, setTenants] = useState<ArchivedTenant[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');


    useEffect(() => {
        getArchivedTenants().then(setTenants);
        getProperties().then(setProperties);
    }, []);

    const getPropertyName = (propertyId: string) => {
        const property = properties.find(p => p.id === propertyId);
        return property ? property.name : 'N/A';
    };

    const filteredTenants = tenants.filter(tenant =>
        tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredTenants.length / pageSize);
    const paginatedTenants = filteredTenants.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );


    return (
        <div>
            <div className="flex items-center justify-between w-full mb-6">
                <div>
                    <h2 className="text-2xl font-semibold">Archived Tenants</h2>
                    <p className="text-muted-foreground">List of former tenants and homeowners.</p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/tenants">Back to Active Tenants</Link>
                </Button>
            </div>

            {tenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <h2 className="text-2xl font-semibold">No Archived Tenants Found</h2>
                    <p className="mt-2 text-muted-foreground">
                        When tenants are archived, they will appear here.
                    </p>
                </div>
            ) : (
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                             <CardTitle>Archived Records</CardTitle>
                             <div className="relative w-full sm:w-[300px]">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name or email..."
                                    className="pl-9"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Property</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead>Archived At</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedTenants.map(tenant => (
                                    <TableRow key={tenant.id}>
                                        <TableCell>{tenant.name}</TableCell>
                                        <TableCell>{getPropertyName(tenant.propertyId)}</TableCell>
                                        <TableCell>{tenant.unitName}</TableCell>
                                        <TableCell>{tenant.email}</TableCell>
                                        <TableCell>{tenant.phone}</TableCell>
                                        <TableCell>{new Date(tenant.archivedAt).toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
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
            )}
        </div>
    );
}
