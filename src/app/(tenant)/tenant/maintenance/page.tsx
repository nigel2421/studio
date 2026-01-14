
'use client';

import { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { addMaintenanceRequest, getTenantMaintenanceRequests } from '@/lib/data';
import type { MaintenanceRequest } from '@/lib/types';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  details: z.string().min(10, 'Please provide more details about the issue.'),
  urgency: z.enum(['low', 'medium', 'high'], {
    required_error: 'You need to select an urgency level.',
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
        details: '',
        urgency: 'medium',
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

    const getStatusVariant = (status: MaintenanceRequest['status']) => {
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
                    name="details"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Issue Details</FormLabel>
                        <FormControl>
                            <Textarea placeholder="Describe the issue in detail..." {...field} rows={5} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="urgency"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Urgency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select urgency level" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
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
                        <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {requests.map(req => (
                        <TableRow key={req.id}>
                        <TableCell>{new Date(req.date).toLocaleDateString()}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{req.details}</TableCell>
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
