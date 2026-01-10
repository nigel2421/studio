
'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getProperty, updateProperty } from '@/lib/data';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Property, ownershipTypes, Unit, unitTypes, OwnershipType, UnitType } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';

const unitSchema = z.object({
  name: z.string(),
  status: z.enum(['vacant', 'rented']),
  ownership: z.enum(ownershipTypes),
  unitType: z.enum(unitTypes),
});

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().min(1, 'Address is required'),
  type: z.string().min(1, 'Type is required'),
  units: z.array(unitSchema),
});

type FormValues = z.infer<typeof formSchema>;

export default function EditPropertyPage() {
  const { id } = useParams();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      address: '',
      type: '',
      units: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'units',
  });

  useEffect(() => {
    if (id) {
      getProperty(id as string).then((propertyData) => {
        if (propertyData) {
          setProperty(propertyData);
          form.reset({
            name: propertyData.name,
            address: propertyData.address,
            type: propertyData.type,
            units: propertyData.units.map(u => ({
              ...u,
              ownership: u.ownership || 'SM', // default value if not present
              unitType: u.unitType || 'Studio' // default value if not present
            })) || [],
          });
        }
      });
    }
  }, [id, form]);

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    if (property) {
      await updateProperty(property.id, data);
      router.push('/properties');
    }
  };

  if (!property) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Property</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                name="address"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                        <Input {...field} />
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
                    <FormLabel>Type</FormLabel>
                    <FormControl>
                        <Input {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            
            <Separator />

            <div>
                <h3 className="text-lg font-medium mb-4">Units</h3>
                <div className="space-y-4">
                {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-4 items-end p-4 border rounded-lg">
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
                    </div>
                ))}
                </div>
            </div>

            <Button type="submit">Save Changes</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
