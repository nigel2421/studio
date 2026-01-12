
'use client';

import { useEffect, useState } from 'react';
import { getLogs, getUserProfile } from '@/lib/data';
import type { Log, UserProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const { userProfile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && userProfile?.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [userProfile, isLoading, router]);

  useEffect(() => {
    if (userProfile?.role === 'admin') {
      async function fetchData() {
        const logData = await getLogs();
        setLogs(logData);

        const userIds = [...new Set(logData.map(log => log.userId))];
        const userPromises = userIds.map(id => getUserProfile(id));
        const userResults = await Promise.all(userPromises);
        
        const userMap = new Map<string, UserProfile>();
        userResults.forEach(user => {
            if (user) {
                userMap.set(user.id, user);
            }
        });
        setUsers(userMap);
      }
      fetchData();
    }
  }, [userProfile]);

  const getUserEmail = (userId: string) => {
    return users.get(userId)?.email || 'Unknown';
  };

  if (isLoading || userProfile?.role !== 'admin') {
    return <div>Loading...</div>; // Or a more sophisticated loading/access denied component
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Activity Logs</h2>
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
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                  <TableCell>{getUserEmail(log.userId)}</TableCell>
                  <TableCell>{log.action}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
