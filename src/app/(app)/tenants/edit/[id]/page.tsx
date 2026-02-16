
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

const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(1, 'Phone number is required'),
    idNumber: z.string().min(1, 'ID number is required'),
    propertyId: z.string().min(1, 'Property is required'),
    unitName: z.string().min(1, 'Unit is required'),
    agent: z.enum([...agents]),
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
        },
    });

    useEffect(() => {
        if (id) {
            getTenant(id as string).then(tenantData => {
                if (tenantData) {
                    setTenant(tenantData);
                    form.reset({
                        ...tenantData,
                        agent: tenantData.agent,
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
            await updateTenant(tenant.id, {
                ...data,
                agent: data.agent as Agent,
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
                        <Button type="submit">Save Changes</Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
