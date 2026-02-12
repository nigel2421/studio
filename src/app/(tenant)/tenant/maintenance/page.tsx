
'use client';

import { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { addMaintenanceRequest, getTenantMaintenanceRequests } from '@/lib/data';
import type { MaintenanceRequest, MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from '@/lib/types';
import { maintenanceCategories, maintenancePriorities } from '@/lib/types';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  title: z.string().min(5, 'Please provide a short, descriptive title.').max(100, 'Title is too long.'),
  description: z.string().min(10, 'Please provide more details about the issue.'),
  category: z.enum(maintenanceCategories, { required_error: 'Please select a category.' }),
  priority: z.enum(maintenancePriorities, {
    required_error: 'You need to select a priority level.',
  }),
});

type FormValues = z.infer<typeof formSchema>;

export default function MaintenancePage() {
    const { userProfile } = useAuth();
    const { toast } = useToast();
    const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: '',
            description: '',
            category: 'General',
            priority: 'Medium',
        },
    });

    const fetchRequests = async () => {
        if (userProfile?.tenantId) {
        setIsLoadingRequests(true);
        const tenantRequests = await getTenantMaintenanceRequests(userProfile.tenantId);
        setRequests(tenantRequests);
        setIsLoadingRequests(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [userProfile]);

    const onSubmit: SubmitHandler<FormValues> = async (data) => {
        if (!userProfile?.tenantId || !userProfile?.propertyId) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Could not identify tenant or property. Please re-login.',
        });
        return;
        }

        try {
        await addMaintenanceRequest({
            ...data,
            tenantId: userProfile.tenantId,
            propertyId: userProfile.propertyId,
        });
        toast({
            title: 'Request Submitted',
            description: 'Your maintenance request has been sent to the property manager.',
        });
        form.reset();
        fetchRequests(); // Refresh the list
        } catch (error) {
        console.error(error);
        toast({
            variant: 'destructive',
            title: 'Submission Failed',
            description: 'There was an error submitting your request. Please try again.',
        });
        }
    };

    const getStatusVariant = (status: MaintenanceStatus) => {
        switch (status) {
        case 'New': return 'destructive';
        case 'In Progress': return 'secondary';
        case 'Completed': return 'default';
        default: return 'outline';
        }
    };
    
    return (
         <div className="grid gap-8 md:grid-cols-2">
            <Card>
            <CardHeader>
                <CardTitle>New Maintenance Request</CardTitle>
                <CardDescription>Fill out the form below to report an issue.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Issue Title</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g., Leaking Kitchen Sink" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Issue Description</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Describe the issue in detail..." {...field} rows={5} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="category"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Category</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a category" />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {maintenanceCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="priority"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Priority</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select priority level" />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {maintenancePriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit Request
                    </Button>
                </form>
                </Form>
            </CardContent>
            </Card>
            <Card>
            <CardHeader>
                <CardTitle>Your Request History</CardTitle>
                <CardDescription>Status of your past and current requests.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoadingRequests ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
                ) : requests.length > 0 ? (
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Issue</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {requests.map(req => (
                        <TableRow key={req.id}>
                        <TableCell>{new Date(req.date).toLocaleDateString()}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{req.title}</TableCell>
                        <TableCell>
                            <Badge variant={req.priority === 'High' || req.priority === 'Urgent' ? 'destructive' : 'outline'}>
                                {req.priority}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                            <Badge variant={getStatusVariant(req.status)}>{req.status}</Badge>
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                ) : (
                <p className="text-sm text-muted-foreground text-center h-40 flex items-center justify-center">You have not submitted any maintenance requests yet.</p>
                )}
            </CardContent>
            </Card>
      </div>
    )
}
