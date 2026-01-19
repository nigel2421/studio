
'use client';

import { useEffect, useState } from 'react';
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

const unitSchema = z.object({
    name: z.string(),
    status: z.enum(unitStatuses),
    ownership: z.enum(ownershipTypes),
    unitType: z.enum(unitTypes),
    landlordId: z.string().optional(),
    managementStatus: z.enum(managementStatuses).optional(),
    handoverStatus: z.enum(handoverStatuses).optional(),
    rentAmount: z.coerce.number().optional(),
    serviceCharge: z.coerce.number().optional(),
});

const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    address: z.string().min(1, 'Address is required'),
    type: z.string().min(1, 'Type is required'),
    units: z.array(unitSchema),
});

export type EditPropertyFormValues = z.infer<typeof formSchema>;

export default function EditPropertyPage() {
    const { id } = useParams();
    const router = useRouter();
    const [property, setProperty] = useState<Property | null>(null);
    const [landlords, setLandlords] = useState<Landlord[]>([]);

    const form = useForm<EditPropertyFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            address: '',
            type: '',
            units: [],
        },
    });

    const { fields } = useFieldArray({
        control: form.control,
        name: 'units',
    });

    const watchUnits = form.watch('units');

    useEffect(() => {
        async function fetchData() {
            if (id) {
                try {
                    // Fetch property first as it is critical
                    const propertyData = await getProperty(id as string);

                    // Fetch landlords separately to handle failures gracefully
                    let landlordData: Landlord[] = [];
                    try {
                        landlordData = await getLandlords();
                    } catch (error) {
                        console.error("Failed to fetch landlords:", error);
                        // Continue without landlords if this fails
                    }

                    if (propertyData) {
                        setProperty(propertyData);
                        form.reset({
                            name: propertyData.name,
                            address: propertyData.address,
                            type: propertyData.type,
                            units: propertyData.units.map(u => ({
                                ...u,
                                ownership: u.ownership || 'SM',
                                unitType: u.unitType || 'Studio',
                                status: u.status || 'vacant',
                                landlordId: u.landlordId || '',
                                managementStatus: u.managementStatus,
                                handoverStatus: u.handoverStatus,
                                rentAmount: u.rentAmount ?? (u.unitType === 'Studio' ? 25000 : u.unitType === 'One Bedroom' ? 40000 : u.unitType === 'Two Bedroom' ? 50000 : 0),
                                serviceCharge: u.serviceCharge ?? (u.unitType === 'Studio' ? 2000 : u.unitType === 'One Bedroom' ? 3000 : u.unitType === 'Two Bedroom' ? 4000 : 0),
                            })) || [],
                        });
                    }
                    setLandlords(landlordData);
                } catch (error) {
                    console.error("Error fetching property data:", error);
                }
            }
        }
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const onSubmit: SubmitHandler<EditPropertyFormValues> = async (data) => {
        if (property) {
            await updateProperty(property.id, data);
            router.push('/properties');
        }
    };

    if (!property) {
        return <div>Loading...</div>;
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <EditPropertyHeader form={form} onSubmit={form.handleSubmit(onSubmit)} />
                <div className="p-4 sm:p-6 lg:p-8 space-y-6">
                    <div>
                        <h3 className="text-lg font-medium mb-4">Units</h3>
                        <div className="space-y-4">
                            {fields.map((field, index) => (
                                <div key={field.id} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end p-4 border rounded-lg">
                                    <FormField
                                        control={form.control}
                                        name={`units.${index}.name`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Unit Name</FormLabel>
                                                <FormControl>
                                                    <Input {...field} readOnly className="bg-muted" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name={`units.${index}.status`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Rental Status</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select status" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {unitStatuses.map((status) => (
                                                            <SelectItem key={status} value={status} className="capitalize">
                                                                {status}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name={`units.${index}.unitType`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Unit Type</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select type" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {unitTypes.map((type) => (
                                                            <SelectItem key={type} value={type}>
                                                                {type}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name={`units.${index}.ownership`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Ownership</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select type" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {ownershipTypes.map((type) => (
                                                            <SelectItem key={type} value={type}>
                                                                {type}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {watchUnits[index]?.ownership === 'Landlord' && (
                                        <FormField
                                            control={form.control}
                                            name={`units.${index}.landlordId`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Landlord</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value || ''}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Assign Landlord" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="none">None</SelectItem>
                                                            {landlords.map((landlord) => (
                                                                <SelectItem key={landlord.id} value={landlord.id}>
                                                                    {landlord.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                    <FormField
                                        control={form.control}
                                        name={`units.${index}.managementStatus`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Management Status</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select status" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {managementStatuses.map((status) => (
                                                            <SelectItem key={status} value={status} className="capitalize">
                                                                {status}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name={`units.${index}.rentAmount`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Rent Amount</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        {...field}
                                                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                                    />
                                                </FormControl>
                                                {watchUnits[index]?.rentAmount === undefined && watchUnits[index]?.unitType && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Default: {
                                                            watchUnits[index].unitType === 'Studio' ? 25000 :
                                                                watchUnits[index].unitType === 'One Bedroom' ? 40000 :
                                                                    watchUnits[index].unitType === 'Two Bedroom' ? 50000 : 0
                                                        }
                                                    </p>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name={`units.${index}.serviceCharge`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Service Charge</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        {...field}
                                                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                                    />
                                                </FormControl>
                                                {watchUnits[index]?.serviceCharge === undefined && watchUnits[index]?.unitType && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Default: {
                                                            watchUnits[index].unitType === 'Studio' ? 2000 :
                                                                watchUnits[index].unitType === 'One Bedroom' ? 3000 :
                                                                    watchUnits[index].unitType === 'Two Bedroom' ? 4000 : 0
                                                        }
                                                    </p>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name={`units.${index}.handoverStatus`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Handover Status</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select status" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {handoverStatuses.map((status) => (
                                                            <SelectItem key={status} value={status} className="capitalize">
                                                                {status}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </form>
        </Form>
    );
}
