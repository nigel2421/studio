// This is a new file.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getNoticesToVacate, getProperties, getTenants } from '@/lib/data';
import { NoticeToVacate, Property, Tenant } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2, Play } from 'lucide-react';
import { AddNoticeDialog } from '@/components/add-notice-dialog';
import { performProcessMoveOuts } from '@/app/actions';
import { format, parseISO } from 'date-fns';

export default function NoticeToVacatePage() {
    const [notices, setNotices] = useState<NoticeToVacate[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    
    const { startLoading, stopLoading, isLoading } = useLoading();
    const { userProfile } = useAuth();
    const { toast } = useToast();

    const fetchData = useCallback(async () => {
        startLoading('Loading notices...');
        try {
            const [noticeData, propertiesData, tenantsData] = await Promise.all([
                getNoticesToVacate(),
                getProperties(),
                getTenants()
            ]);
            setNotices(noticeData.filter(n => n.status === 'Active'));
            setProperties(propertiesData);
            setTenants(tenantsData);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to load data.' });
        } finally {
            stopLoading();
        }
    }, [startLoading, stopLoading, toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleNoticeAdded = () => {
        fetchData();
    };

    const handleProcessMoveOuts = async () => {
        if (!userProfile) return;
        startLoading('Processing overdue move-outs...');
        try {
            const result = await performProcessMoveOuts(userProfile.id);
            if (result.success) {
                toast({ title: 'Automation Complete', description: (result.data as any)?.message || 'Processing finished.' });
                fetchData(); // Refresh the list
            } else {
                toast({ variant: 'destructive', title: 'Automation Failed', description: result.error });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
        } finally {
            stopLoading();
        }
    };

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Notice to Vacate</h2>
                        <p className="text-muted-foreground">Manage and track all tenant move-out notices.</p>
                    </div>
                    <div className="flex items-center gap-2">
                         <Button onClick={handleProcessMoveOuts} variant="outline" disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                            Process Move-Outs
                        </Button>
                        <Button onClick={() => setIsDialogOpen(true)} disabled={isLoading}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Notice
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Active Notices</CardTitle>
                        <CardDescription>A list of all tenants who have submitted a notice to vacate.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tenant</TableHead>
                                    <TableHead>Property</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead>Submission Date</TableHead>
                                    <TableHead>Move-Out Due Date</TableHead>
                                    <TableHead>Submitted By</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : notices.length > 0 ? (
                                    notices.map(notice => (
                                        <TableRow key={notice.id}>
                                            <TableCell className="font-medium">{notice.tenantName}</TableCell>
                                            <TableCell>{notice.propertyName}</TableCell>
                                            <TableCell>{notice.unitName}</TableCell>
                                            <TableCell>{format(parseISO(notice.noticeSubmissionDate), 'PPP')}</TableCell>
                                            <TableCell>{format(parseISO(notice.scheduledMoveOutDate), 'PPP')}</TableCell>
                                            <TableCell>{notice.submittedBy} ({notice.submittedByName})</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            No active notices to vacate found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
            <AddNoticeDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                properties={properties}
                tenants={tenants}
                onNoticeAdded={handleNoticeAdded}
            />
        </>
    );
}
