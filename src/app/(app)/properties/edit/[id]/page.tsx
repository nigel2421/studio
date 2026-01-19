
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getProperty, updateProperty, getLandlords } from '@/lib/data';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Property, ownershipTypes, Unit, unitTypes, unitStatuses, Landlord, managementStatuses, handoverStatuses } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { EditPropertyHeader } from '@/components/layout/edit-property-header';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { DynamicLoader } from '@/components/ui/dynamic-loader';
import { UnitEditDialog } from '@/components/property-unit-edit-dialog';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Edit2, Loader2 } from 'lucide-react';
import { PaginationControls } from '@/components/ui/pagination-controls';

const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    address: z.string().min(1, 'Address is required'),
    type: z.string().min(1, 'Type is required'),
});

export type EditPropertyFormValues = z.infer<typeof formSchema>;

export default function EditPropertyPage() {
    const { id } = useParams();
    const router = useRouter();
    const [property, setProperty] = useState<Property | null>(null);
    const [landlords, setLandlords] = useState<Landlord[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    // Unit list state
    const [units, setUnits] = useState<Unit[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    const form = useForm<EditPropertyFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            address: '',
            type: '',
        },
    });

    useEffect(() => {
        async function fetchData() {
            if (id) {
                try {
                    const propertyData = await getProperty(id as string);
                    let landlordData: Landlord[] = [];
                    try {
                        landlordData = await getLandlords();
                    } catch (error) {
                        console.error("Failed to fetch landlords:", error);
                    }

                    if (propertyData) {
                        setProperty(propertyData);
                        setUnits(propertyData.units || []);
                        form.reset({
                            name: propertyData.name,
                            address: propertyData.address,
                            type: propertyData.type,
                        });
                    }
                    setLandlords(landlordData);
                } catch (error) {
                    console.error("Error fetching property data:", error);
                }
            }
        }
        fetchData();
    }, [id, form]);

    const filteredUnits = useMemo(() => {
        return units.filter(u =>
            u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.unitType.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [units, searchTerm]);

    const paginatedUnits = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredUnits.slice(start, start + pageSize);
    }, [filteredUnits, currentPage, pageSize]);

    const totalPages = Math.ceil(filteredUnits.length / pageSize);

    const handleEditUnit = (unit: Unit) => {
        setSelectedUnit(unit);
        setIsEditDialogOpen(true);
    };

    const handleSaveUnit = async (unitData: any) => {
        if (!property) return;

        // Update local state first
        const updatedUnits = units.map(u =>
            u.name === unitData.name ? { ...u, ...unitData } : u
        );
        setUnits(updatedUnits);

        // Persist to backend
        try {
            await updateProperty(property.id, { units: updatedUnits } as any);
            toast({
                title: "Unit Updated",
                description: `Unit ${unitData.name} has been updated successfully.`,
            });
        } catch (error) {
            console.error("Error updating unit:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to update unit details.",
            });
        }
    };

    const onSubmit: SubmitHandler<EditPropertyFormValues> = async (data) => {
        if (property) {
            setIsSaving(true);
            try {
                // Update top-level property meta only
                await updateProperty(property.id, data as any);
                toast({
                    title: "Success",
                    description: "Property metadata updated successfully.",
                });
                router.push('/properties');
            } catch (error) {
                console.error("Error updating property:", error);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to update property details.",
                });
            } finally {
                setIsSaving(false);
            }
        }
    };

    if (!property) {
        return <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-8 w-8" /></div>;
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <EditPropertyHeader form={form} onSubmit={form.handleSubmit(onSubmit)} isSaving={isSaving} />
                <div className="p-4 sm:p-6 lg:p-8 space-y-8">
                    {/* Units Section */}
                    <div className="space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-bold">Units ({units.length})</h3>
                                <p className="text-sm text-muted-foreground">Manage and edit individual unit details.</p>
                            </div>
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search units..."
                                    className="pl-9"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <Card>
                            <CardContent className="p-0">
                                <div className="rounded-md border-t">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Unit Name</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Ownership</TableHead>
                                                <TableHead>Rent (Ksh)</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {paginatedUnits.map((unit) => (
                                                <TableRow key={unit.name}>
                                                    <TableCell className="font-medium">{unit.name}</TableCell>
                                                    <TableCell>{unit.unitType}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={unit.status === 'vacant' ? 'secondary' : 'default'} className="capitalize">
                                                            {unit.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-sm">{unit.ownership}</span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {unit.rentAmount?.toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            type="button"
                                                            onClick={() => handleEditUnit(unit)}
                                                        >
                                                            <Edit2 className="h-4 w-4 mr-2" />
                                                            Edit
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {paginatedUnits.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center">
                                                        No units found.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                            <div className="p-4 border-t">
                                <PaginationControls
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    pageSize={pageSize}
                                    totalItems={filteredUnits.length}
                                    onPageChange={setCurrentPage}
                                    onPageSizeChange={setPageSize}
                                />
                            </div>
                        </Card>
                    </div>
                </div>
            </form>

            <UnitEditDialog
                unit={selectedUnit}
                landlords={landlords}
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                onSave={handleSaveUnit}
            />
        </Form>
    );
}
