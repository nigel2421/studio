
'use client';

import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getMaintenanceRequests, getTenants, getProperties, updateMaintenanceRequestStatus } from '@/lib/data';
import type { MaintenanceRequest, Tenant, Property } from '@/lib/types';
import { MaintenanceResponseGenerator } from '@/components/maintenance-response-generator';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Wrench, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';


export default function MaintenancePage() {
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const fetchData = async () => {
    const [requests, tenantData, propertyData] = await Promise.all([
      getMaintenanceRequests(),
      getTenants(),
      getProperties(),
    ]);
    setMaintenanceRequests(requests);
    setTenants(tenantData);
    setProperties(propertyData);
  };
  
  useEffect(() => {
    fetchData();
  }, []);

  const getTenant = (tenantId: string) => tenants.find((t) => t.id === tenantId);
  const getProperty = (propertyId: string) => properties.find((p) => p.id === propertyId);

  const getStatusVariant = (status: MaintenanceRequest['status']) => {
    switch (status) {
      case 'New':
        return 'destructive';
      case 'In Progress':
        return 'secondary';
      case 'Completed':
        return 'default';
      default:
        return 'outline';
    }
  };

  const handleStatusChange = async (requestId: string, status: MaintenanceRequest['status']) => {
    try {
        await updateMaintenanceRequestStatus(requestId, status);
        toast({
            title: "Status Updated",
            description: `Request status changed to "${status}".`
        });
        fetchData(); // Refresh data
    } catch(e: any) {
        toast({
            variant: "destructive",
            title: "Error",
            description: e.message || "Failed to update status."
        })
    }
  }

  const filteredRequests = maintenanceRequests.filter(req => {
    const tenant = getTenant(req.tenantId);
    const property = getProperty(req.propertyId);
    const searchString = `${tenant?.name} ${property?.name} ${req.details} ${req.status}`.toLowerCase();
    return searchString.includes(searchTerm.toLowerCase());
  })

  const totalPages = Math.ceil(filteredRequests.length / pageSize);
  const paginatedRequests = filteredRequests.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
  );

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
            <h2 className="text-3xl font-bold tracking-tight">Maintenance Requests</h2>
            <p className="text-muted-foreground">Track and manage all maintenance issues.</p>
            </div>
            <div className="p-3 bg-primary/10 rounded-full">
            <Wrench className="h-6 w-6 text-primary" />
            </div>
        </div>
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>All Requests</CardTitle>
                        <CardDescription>Browse all submitted requests from tenants.</CardDescription>
                    </div>
                    <div className="relative w-full sm:w-[300px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by tenant, property, issue..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Property</TableHead>
                        <TableHead>Issue</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {paginatedRequests.map((request) => {
                        const tenant = getTenant(request.tenantId);
                        const property = getProperty(request.propertyId);
                        return (
                        <TableRow key={request.id}>
                            <TableCell>{request.date}</TableCell>
                            <TableCell>{tenant?.name}</TableCell>
                            <TableCell>{property?.name}</TableCell>
                            <TableCell>{request.details}</TableCell>
                            <TableCell>
                               <DropdownMenu>
                                   <DropdownMenuTrigger asChild>
                                       <Button variant="ghost" size="sm" className="capitalize flex gap-1">
                                            <Badge variant={getStatusVariant(request.status)}>{request.status}</Badge>
                                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                       </Button>
                                   </DropdownMenuTrigger>
                                   <DropdownMenuContent>
                                       <DropdownMenuItem onClick={() => handleStatusChange(request.id, 'New')}>New</DropdownMenuItem>
                                       <DropdownMenuItem onClick={() => handleStatusChange(request.id, 'In Progress')}>In Progress</DropdownMenuItem>
                                       <DropdownMenuItem onClick={() => handleStatusChange(request.id, 'Completed')}>Completed</DropdownMenuItem>
                                   </DropdownMenuContent>
                               </DropdownMenu>
                            </TableCell>
                            <TableCell className="text-right">
                            {tenant && property && (
                                <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                    Draft Response
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl">
                                    <DialogHeader>
                                        <DialogTitle>Automated Response Draft</DialogTitle>
                                        <DialogDescription>
                                            AI-generated response draft for the maintenance request. Review and edit as needed.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <MaintenanceResponseGenerator
                                    request={request}
                                    tenant={tenant}
                                    property={property}
                                    />
                                </DialogContent>
                                </Dialog>
                            )}
                            </TableCell>
                        </TableRow>
                        );
                    })}
                    </TableBody>
                </Table>
            </CardContent>
             <div className="p-4 border-t">
                <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={filteredRequests.length}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            </div>
        </Card>
    </div>
  );
}
