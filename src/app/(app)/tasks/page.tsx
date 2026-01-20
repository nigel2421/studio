

'use client';

import { useEffect, useState, useMemo } from 'react';
import { listenToTasks, getTenants, getProperties } from '@/lib/data';
import { Task, Tenant, Property } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Clock, AlertCircle, Loader2, Edit } from 'lucide-react';
import { AddPaymentDialog } from '@/components/financials/add-payment-dialog';
import { Button } from '@/components/ui/button';

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);

    const selectedTenant = useMemo(() => {
        if (!selectedTask || !selectedTask.tenantId) return null;
        return tenants.find(t => t.id === selectedTask.tenantId) || null;
    }, [selectedTask, tenants]);

    useEffect(() => {
        setLoading(true);
        
        const unsubTasks = listenToTasks(setTasks);

        Promise.all([getTenants(), getProperties()]).then(([tenantsData, propertiesData]) => {
            setTenants(tenantsData);
            setProperties(propertiesData);
            setLoading(false);
        }).catch(error => {
            console.error("Failed to fetch tenants/properties:", error);
            setLoading(false);
        });

        return () => {
            unsubTasks();
        };
    }, []);

    const handleRecordPayment = (task: Task) => {
        setSelectedTask(task);
        setIsPaymentDialogOpen(true);
    };

    const handlePaymentAdded = () => {
        setIsPaymentDialogOpen(false);
        // Listener will auto-refresh tasks
    };

    const getStatusVariant = (status: Task['status']) => {
        switch (status) {
            case 'Completed': return 'default';
            case 'In Progress': return 'secondary';
            case 'Pending': return 'outline';
            default: return 'outline';
        }
    };

    const getPriorityVariant = (priority: Task['priority']) => {
        switch (priority) {
            case 'High': return 'destructive';
            case 'Medium': return 'default';
            case 'Low': return 'secondary';
            default: return 'secondary';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const pendingTasks = tasks.filter(t => t.status === 'Pending').length;
    const inProgressTasks = tasks.filter(t => t.status === 'In Progress').length;
    const completedTasks = tasks.filter(t => t.status === 'Completed').length;

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Tasks</h1>
                    <p className="text-muted-foreground">Manage property tasks and tenant onboarding workflows.</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pendingTasks}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{inProgressTasks}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Completed</CardTitle>
                        <CheckSquare className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{completedTasks}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Tasks</CardTitle>
                    <CardDescription>A list of all onboarding and administrative tasks.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Task</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Unit / Property</TableHead>
                                <TableHead>Due Date</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tasks.length > 0 ? (
                                tasks.map((task) => (
                                    <TableRow key={task.id}>
                                        <TableCell className="font-medium">
                                            <div>
                                                {task.title}
                                                <p className="text-xs text-muted-foreground font-normal">{task.description}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>{task.category}</TableCell>
                                        <TableCell>
                                            {task.unitName ? `${task.unitName}` : 'N/A'}
                                        </TableCell>
                                        <TableCell>{new Date(task.dueDate).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <Badge variant={getPriorityVariant(task.priority)}>{task.priority}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getStatusVariant(task.status)}>{task.status}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {task.category === 'Financial' && task.tenantId && task.status === 'Pending' && (
                                                <Button variant="outline" size="sm" onClick={() => handleRecordPayment(task)}>
                                                    <Edit className="mr-2 h-4 w-4" />
                                                    Resolve
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                        No tasks found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <AddPaymentDialog
                properties={properties}
                tenants={tenants}
                onPaymentAdded={handlePaymentAdded}
                open={isPaymentDialogOpen}
                onOpenChange={setIsPaymentDialogOpen}
                tenant={selectedTenant}
                taskId={selectedTask?.id}
            />
        </div>
    );
}
