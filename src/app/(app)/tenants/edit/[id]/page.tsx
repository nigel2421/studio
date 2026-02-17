
'use client';

import { useEffect, useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getTenant, updateTenant, getProperties } from '@/lib/data';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tenant, Property, agents, Agent } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { DatePicker } from '@/components/ui/date-picker';
import { format, parseISO } from 'date-fns';

const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(1, 'Phone number is required'),
    idNumber: z.string().min(1, 'ID number is required'),
    propertyId: z.string().min(1, 'Property is required'),
    unitName: z.string().min(1, 'Unit is required'),
    agent: z.enum([...agents]),
    lease: z.object({
        startDate: z.date({ required_error: "Lease start date is required."}),
        rent: z.coerce.number().min(0, "Rent must be a positive number."),
    }),
    securityDeposit: z.coerce.number().min(0, "Security deposit must be a positive number."),
});

type FormValues = z.infer<typeof formSchema>;

export default function EditTenantPage() {
    const params = useParams();
    const id = params?.id;
    const router = useRouter();
    const { toast } = useToast();
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [properties, setProperties] = useState<Property[]>([]);
    const [units, setUnits] = useState<string[]>([]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            email: '',
            phone: '',
            idNumber: '',
            propertyId: '',
            unitName: '',
            lease: {
                startDate: new Date(),
                rent: 0,
            },
            securityDeposit: 0,
        },
    });

    useEffect(() => {
        if (id) {
            getTenant(id as string).then(tenantData => {
                if (tenantData) {
                    setTenant(tenantData);
                    form.reset({
                        name: tenantData.name,
                        email: tenantData.email,
                        phone: tenantData.phone,
                        idNumber: tenantData.idNumber,
                        propertyId: tenantData.propertyId,
                        unitName: tenantData.unitName,
                        agent: tenantData.agent,
                        lease: {
                            startDate: tenantData.lease?.startDate ? parseISO(tenantData.lease.startDate) : new Date(),
                            rent: tenantData.lease?.rent || 0,
                        },
                        securityDeposit: tenantData.securityDeposit || 0
                    });
                }
            });
        }
        getProperties().then(setProperties);
    }, [id, form]);

    const selectedPropertyId = form.watch('propertyId');

    useEffect(() => {
        const selectedProperty = properties.find(p => p.id === selectedPropertyId);
        
        if (selectedProperty) {
            const vacantUnits = selectedProperty.units
                .filter(u => u.status === 'vacant' && u.name)
                .map(u => u.name);
            
            let availableUnits = [...vacantUnits];
            
            if (tenant && selectedPropertyId === tenant.propertyId && tenant.unitName && !availableUnits.includes(tenant.unitName)) {
                availableUnits.push(tenant.unitName);
            }
            
            setUnits(availableUnits);
        } else {
            setUnits([]);
        }

    }, [selectedPropertyId, properties, tenant]);

    const onSubmit: SubmitHandler<FormValues> = async (data) => {
        if (tenant) {
            const updatedLeaseData = {
                ...tenant.lease,
                startDate: format(data.lease.startDate, 'yyyy-MM-dd'),
                rent: data.lease.rent,
            };

            await updateTenant(tenant.id, {
                name: data.name,
                email: data.email,
                phone: data.phone,
                idNumber: data.idNumber,
                propertyId: data.propertyId,
                unitName: data.unitName,
                agent: data.agent as Agent,
                lease: updatedLeaseData,
                securityDeposit: data.securityDeposit,
            });
            toast({
                title: "Tenant Updated",
                description: "The tenant's details have been successfully updated.",
            });
            router.push('/tenants');
        }
    };

    if (!tenant) {
        return <div>Loading...</div>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Edit Tenant</CardTitle>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Name</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Phone</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="idNumber"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>ID Number</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="propertyId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Property</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a property" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {properties.map(property => (
                                                    <SelectItem key={property.id} value={property.id}>
                                                        {property.name}
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
                                name="unitName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Unit</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a unit" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {units.map(unit => (
                                                    <SelectItem key={unit} value={unit}>
                                                        {unit}
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
                                name="agent"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Agent</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select an agent" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {agents.map(agent => (
                                                    <SelectItem key={agent} value={agent}>
                                                        {agent}
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
                                name="lease.rent"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Monthly Rent (Ksh)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="securityDeposit"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Security Deposit (Ksh)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="lease.startDate"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Lease Start Date</FormLabel>
                                        <FormControl>
                                            <DatePicker value={field.value} onChange={field.onChange} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <Button type="submit">Save Changes</Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
