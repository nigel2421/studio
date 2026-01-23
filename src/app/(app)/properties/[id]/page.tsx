
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getProperty, updateProperty, getLandlords } from '@/lib/data';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Property, ownershipTypes, Unit, unitTypes, unitStatuses, Landlord } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { UnitEditDialog } from '@/components/property-unit-edit-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Edit2, Loader2, Filter, X, Save, ArrowLeft } from 'lucide-react';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkUnitUpdateDialog } from '@/components/bulk-unit-update-dialog';
import { UnitBulkUpdateDialog } from '@/components/unit-bulk-update-dialog';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';

const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    address: z.string().min(1, 'Address is required'),
    type: z.string().min(1, 'Type is required'),
});

export type EditPropertyFormValues = z.infer<typeof formSchema>;

export default function PropertyManagementPage() {
    const { id } = useParams();
    const router = useRouter();
    const [property, setProperty] = useState<Property | null>(null);
    const [landlords, setLandlords] = useState<Landlord[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();
    const { userProfile } = useAuth();
    const isReadOnly = userProfile?.role === 'investment-consultant';

    // Unit list state
    const [units, setUnits] = useState<Unit[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedUnitNames, setSelectedUnitNames] = useState<string[]>([]);
    const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
    const [filters, setFilters] = useState({
        status: 'all',
        ownership: 'all',
        unitType: 'all',
    });

    const form = useForm<EditPropertyFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { name: '', address: '', type: '' },
    });
    
    const fetchData = useCallback(() => {
        if (id) {
            Promise.all([
                getProperty(id as string),
                getLandlords().catch(() => [])
            ]).then(([propertyData, landlordData]) => {
                if (propertyData) {
                    setProperty(propertyData);
                    setUnits(propertyData.units || []);
                }
                setLandlords(landlordData);
            }).catch(error => {
                console.error("Error fetching property data:", error);
            });
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    useEffect(() => {
        if (property) {
            form.reset({
                name: property.name,
                address: property.address,
                type: property.type,
            });
        }
    }, [property, form.reset]);

    const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [filterName]: value }));
        setCurrentPage(1); // Reset to first page on filter change
    };
    
    useEffect(() => {
        setSelectedUnitNames([]);
    }, [filters, searchTerm]);


    const filteredUnits = useMemo(() => {
        return units.filter(u => {
            const searchMatch = u.name.toLowerCase().includes(searchTerm.toLowerCase());
            const statusMatch = filters.status === 'all' || u.status === filters.status;
            const ownershipMatch = filters.ownership === 'all' || u.ownership === filters.ownership;
            const typeMatch = filters.unitType === 'all' || u.unitType === filters.unitType;
            return searchMatch && statusMatch && ownershipMatch && typeMatch;
        });
    }, [units, searchTerm, filters]);

    const paginatedUnits = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredUnits.slice(start, start + pageSize);
    }, [filteredUnits, currentPage, pageSize]);

    const totalPages = Math.ceil(filteredUnits.length / pageSize);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedUnitNames(paginatedUnits.map(u => u.name));
        } else {
            setSelectedUnitNames([]);
        }
    };

    const handleSelectUnit = (unitName: string, checked: boolean) => {
        setSelectedUnitNames(prev => checked ? [...prev, unitName] : prev.filter(name => name !== unitName));
    };
    
    const handleEditUnit = (unit: Unit) => {
        setSelectedUnit(unit);
        setIsEditDialogOpen(true);
    };

    const handleSaveUnit = async (unitData: Unit) => {
        if (!property) return;
    
        const updatedUnits = units.map(u => {
            if (u.name === unitData.name) {
                const updatedUnit: { [key: string]: any } = { ...u, ...unitData };
    
                if (updatedUnit.landlordId === 'none' || updatedUnit.landlordId === '') {
                    delete updatedUnit.landlordId;
                }
    
                Object.keys(updatedUnit).forEach(key => {
                    if (updatedUnit[key] === undefined) {
                        delete updatedUnit[key];
                    }
                });
    
                return updatedUnit as Unit;
            }
            return u;
        });
    
        setUnits(updatedUnits);
    
        try {
            await updateProperty(property.id, { units: updatedUnits });
            toast({ title: "Unit Updated", description: `Unit ${unitData.name} has been updated successfully.` });
            fetchData(); 
        } catch (error) {
            console.error("Firestore update error:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to update unit details in the database." });
            fetchData(); 
        }
    };
    
    const handleBulkSave = async (updateData: Partial<Omit<Unit, 'name'>>) => {
        if (!property || selectedUnitNames.length === 0) return;

        const updatedUnits = units.map(unit => {
            if (selectedUnitNames.includes(unit.name)) {
                const originalStatus = unit.handoverStatus;
                const newUnit = { ...unit, ...updateData };
                if (newUnit.handoverStatus === 'Handed Over' && originalStatus !== 'Handed Over' && !newUnit.handoverDate) {
                    newUnit.handoverDate = new Date().toISOString().split('T')[0];
                }
                return newUnit;
            }
            return unit;
        });
        setUnits(updatedUnits);

        try {
            await updateProperty(property.id, { units: updatedUnits } as Partial<Property>);
            toast({
                title: "Bulk Update Successful",
                description: `${selectedUnitNames.length} units updated successfully.`,
            });
            setSelectedUnitNames([]);
            setIsBulkDialogOpen(false);
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Failed to perform bulk update." });
        }
    };

    const onSubmit: SubmitHandler<EditPropertyFormValues> = async (data) => {
        if (property) {
            setIsSaving(true);
            try {
                await updateProperty(property.id, data as any);
                toast({ title: "Success", description: "Property metadata updated successfully." });
                // No need to redirect, we are on the page.
            } catch (error) {
                toast({ variant: "destructive", title: "Error", description: "Failed to update property details." });
            } finally {
                setIsSaving(false);
            }
        }
    };

    if (!property) {
        return <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-8 w-8" /></div>;
    }
    
    const isFiltered = filters.status !== 'all' || filters.ownership !== 'all' || filters.unitType !== 'all';

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                 <header className="sticky top-0 z-10 flex h-auto items-center justify-between gap-4 border-b bg-background/80 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
                    <div className="flex flex-1 items-center gap-4">
                        <SidebarTrigger className="md:hidden" />
                        <div className="flex-1">
                          <Button asChild variant="ghost" className="mb-2 -ml-4">
                              <Link href="/properties">
                                  <ArrowLeft className="mr-2 h-4 w-4" />
                                  Back to Properties
                              </Link>
                          </Button>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2 items-start">
                            <FormField
                              control={form.control}
                              name="name"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs text-muted-foreground">Name</FormLabel>
                                  <FormControl>
                                    <Input {...field} className="h-9" disabled={isReadOnly} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="address"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs text-muted-foreground">Address</FormLabel>
                                  <FormControl>
                                    <Input {...field} className="h-9" disabled={isReadOnly} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="type"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs text-muted-foreground">Type</FormLabel>
                                  <FormControl>
                                    <Input {...field} className="h-9" disabled={isReadOnly} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                    </div>
                    {!isReadOnly && (
                        <div className="flex items-center gap-4 pl-4">
                            <Button type="submit" size="sm" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {isSaving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    )}
                </header>

                <div className="p-4 sm:p-6 lg:p-8 space-y-8">
                    <div className="space-y-4">
                         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-bold">Units ({units.length})</h3>
                                <p className="text-sm text-muted-foreground">Manage and edit individual unit details.</p>
                            </div>
                             <div className="flex items-center gap-2">
                               {!isReadOnly && selectedUnitNames.length > 0 && (
                                 <Button size="sm" onClick={() => setIsBulkDialogOpen(true)}>
                                   Bulk Edit ({selectedUnitNames.length})
                                 </Button>
                               )}
                               {!isReadOnly && <UnitBulkUpdateDialog onUploadComplete={fetchData} />}
                                <div className="relative w-full md:w-48">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Search units..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                </div>
                            </div>
                        </div>

                         <Card className="border-dashed">
                           <CardHeader className="p-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-2 text-sm font-semibold">
                                        <Filter className="h-4 w-4" /> Filters:
                                    </div>
                                    <Select value={filters.unitType} onValueChange={(v) => handleFilterChange('unitType', v)}>
                                        <SelectTrigger className="w-auto h-8 text-xs gap-1"><SelectValue placeholder="Unit Type" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Types</SelectItem>
                                            {unitTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                     <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                                        <SelectTrigger className="w-auto h-8 text-xs gap-1"><SelectValue placeholder="Status" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Statuses</SelectItem>
                                            {unitStatuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={filters.ownership} onValueChange={(v) => handleFilterChange('ownership', v)}>
                                        <SelectTrigger className="w-auto h-8 text-xs gap-1"><SelectValue placeholder="Ownership" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Owners</SelectItem>
                                            {ownershipTypes.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    {isFiltered && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilters({status: 'all', ownership: 'all', unitType: 'all'})}><X className="mr-1 h-3 w-3" />Clear</Button>}
                                </div>
                            </CardHeader>
                        </Card>


                        <Card>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {!isReadOnly && (
                                                <TableHead className="w-12 text-center">
                                                    <Checkbox
                                                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                                        checked={selectedUnitNames.length > 0 && selectedUnitNames.length === paginatedUnits.length}
                                                        aria-label="Select all units on this page"
                                                    />
                                                </TableHead>
                                            )}
                                            <TableHead>Unit Name</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Ownership</TableHead>
                                            <TableHead>Management Status</TableHead>
                                            <TableHead>Rent (Ksh)</TableHead>
                                            {!isReadOnly && <TableHead className="text-right">Actions</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedUnits.map((unit) => (
                                            <TableRow key={unit.name} data-state={selectedUnitNames.includes(unit.name) && "selected"}>
                                                {!isReadOnly && (
                                                    <TableCell className="text-center">
                                                        <Checkbox
                                                            onCheckedChange={(checked) => handleSelectUnit(unit.name, !!checked)}
                                                            checked={selectedUnitNames.includes(unit.name)}
                                                            aria-label={`Select unit ${unit.name}`}
                                                        />
                                                    </TableCell>
                                                )}
                                                <TableCell className="font-medium">{unit.name}</TableCell>
                                                <TableCell>{unit.unitType}</TableCell>
                                                <TableCell><Badge variant={unit.status === 'vacant' ? 'secondary' : 'default'} className="capitalize">{unit.status}</Badge></TableCell>
                                                <TableCell><span className="text-sm">{unit.ownership}</span></TableCell>
                                                <TableCell><span className="text-xs">{unit.managementStatus || 'N/A'}</span></TableCell>
                                                <TableCell>{unit.rentAmount?.toLocaleString()}</TableCell>
                                                {!isReadOnly && (
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="sm" type="button" onClick={() => handleEditUnit(unit)}><Edit2 className="h-4 w-4 mr-2" />Edit</Button>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        ))}
                                        {paginatedUnits.length === 0 && (
                                            <TableRow><TableCell colSpan={isReadOnly ? 6 : 7} className="h-24 text-center">No units found.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                            <div className="p-4 border-t">
                                <PaginationControls currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredUnits.length} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
                            </div>
                        </Card>
                    </div>
                </div>
            </form>
            <UnitEditDialog unit={selectedUnit} landlords={landlords} open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} onSave={handleSaveUnit} />
            <BulkUnitUpdateDialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen} unitCount={selectedUnitNames.length} onSave={handleBulkSave} />
        </Form>
    );
}
