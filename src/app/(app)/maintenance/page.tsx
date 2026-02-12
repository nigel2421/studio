
'use client';

import { useEffect, useState, useMemo } from 'react';
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
import type { MaintenanceRequest, Tenant, Property, MaintenanceStatus, MaintenancePriority, MaintenanceCategory } from '@/lib/types';
import { maintenanceStatuses, maintenancePriorities, maintenanceCategories } from '@/lib/types';
import { MaintenanceResponseGenerator } from '@/components/maintenance-response-generator';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Wrench, ChevronDown, Edit } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';


export default function MaintenancePage() {
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<MaintenancePriority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<MaintenanceCategory | 'all'>('all');
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

  const getStatusVariant = (status: MaintenanceStatus) => {
    switch (status) {
      case 'New': return 'destructive';
      case 'In Progress': return 'secondary';
      case 'Completed': return 'default';
      case 'Cancelled': return 'outline';
      default: return 'outline';
    }
  };

  const handleStatusChange = async (requestId: string, status: MaintenanceStatus) => {
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

  const filteredRequests = useMemo(() => {
    return maintenanceRequests.filter(req => {
      const tenant = getTenant(req.tenantId);
      const property = getProperty(req.propertyId);
      const searchString = `${tenant?.name} ${property?.name} ${req.title} ${req.description} ${req.status} ${req.category} ${req.priority}`.toLowerCase();
      
      const searchMatch = searchString.includes(searchTerm.toLowerCase());
      const statusMatch = statusFilter === 'all' || req.status === statusFilter;
      const priorityMatch = priorityFilter === 'all' || req.priority === priorityFilter;
      const categoryMatch = categoryFilter === 'all' || req.category === categoryFilter;

      return searchMatch && statusMatch && priorityMatch && categoryMatch;
    });
  }, [maintenanceRequests, searchTerm, statusFilter, priorityFilter, categoryFilter, tenants, properties]);

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
                <CardTitle>All Requests</CardTitle>
                <CardDescription>Browse all submitted requests from tenants.</CardDescription>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-4">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search requests..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                      <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {maintenanceStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                     <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
                      <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priorities</SelectItem>
                        {maintenancePriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                     <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
                      <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {maintenanceCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                  <TableHeader>
                  <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Issue / Category</TableHead>
                      <TableHead>Priority</TableHead>
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
                          <TableCell>{new Date(request.date).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div>{tenant?.name}</div>
                            <div className="text-xs text-muted-foreground">{property?.name}</div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="font-medium truncate">{request.title}</div>
                            <div className="text-xs text-muted-foreground">{request.category}</div>
                          </TableCell>
                          <TableCell>
                             <Badge variant={request.priority === 'High' || request.priority === 'Urgent' ? 'destructive' : 'outline'}>{request.priority}</Badge>
                          </TableCell>
                          <TableCell>
                             <DropdownMenu>
                                 <DropdownMenuTrigger asChild>
                                     <Button variant="ghost" size="sm" className="capitalize flex gap-1">
                                          <Badge variant={getStatusVariant(request.status)}>{request.status}</Badge>
                                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                     </Button>
                                 </DropdownMenuTrigger>
                                 <DropdownMenuContent>
                                     {maintenanceStatuses.map(status => (
                                         <DropdownMenuItem key={status} onClick={() => handleStatusChange(request.id, status)}>{status}</DropdownMenuItem>
                                     ))}
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
                   {paginatedRequests.length === 0 && (
                      <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                              No maintenance requests match your filters.
                          </TableCell>
                      </TableRow>
                  )}
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
