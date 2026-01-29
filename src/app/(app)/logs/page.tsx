
'use client';

import { useEffect, useState } from 'react';
import { getLogs } from '@/lib/data';
import type { Log } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { downloadCSV } from '@/lib/utils';

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { user, userProfile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const isAdmin = userProfile?.role === 'admin' || user?.email === 'nigel2421@gmail.com';
    if (!isLoading && !isAdmin) {
      router.push('/dashboard');
    }
  }, [userProfile, user, isLoading, router]);

  useEffect(() => {
    const isAdmin = userProfile?.role === 'admin' || user?.email === 'nigel2421@gmail.com';
    if (isAdmin) {
      async function fetchData() {
        const logData = await getLogs();
        setLogs(logData);
      }
      fetchData();
    }
  }, [userProfile, user]);

  const getUserNameOrEmail = (log: Log) => {
    return log.userEmail || log.userId;
  };

  const handleDownloadCSV = () => {
    const dataToExport = logs.map(log => ({
      Date: new Date(log.timestamp).toLocaleString(),
      User: getUserNameOrEmail(log),
      Action: log.action,
    }));
    downloadCSV(dataToExport, 'activity_logs.csv');
  };

  const totalPages = Math.ceil(logs.length / pageSize);
  const paginatedLogs = logs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  
  const isAdmin = userProfile?.role === 'admin' || user?.email === 'nigel2421@gmail.com';
  if (isLoading || !isAdmin) {
    return <div>Loading...</div>; // Or a more sophisticated loading/access denied component
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Activity Logs</h2>
        <Button onClick={handleDownloadCSV} disabled={logs.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Download CSV
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>System Activity</CardTitle>
          <CardDescription>A record of all significant actions performed in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                  <TableCell>{getUserNameOrEmail(log)}</TableCell>
                  <TableCell>{log.action}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <div className="p-4 border-t">
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={logs.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </Card>
    </div>
  );
}
