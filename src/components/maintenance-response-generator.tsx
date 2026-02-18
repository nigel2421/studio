
'use client';

import { useState } from 'react';
import type { MaintenanceRequest, Tenant, Property } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader, WandSparkles, Send, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getMaintenanceResponseDraft, performRespondToMaintenanceRequest } from '@/app/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLoading } from '@/hooks/useLoading';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { ScrollArea } from './ui/scroll-area';

interface Props {
  request: MaintenanceRequest;
  tenant: Tenant;
  property: Property;
  onUpdate: () => void;
}

export function MaintenanceResponseGenerator({ request, tenant, property, onUpdate }: Props) {
  const [isDrafting, setIsDrafting] = useState(false);
  const [responseMessage, setResponseMessage] = useState('');
  const { toast } = useToast();
  const { userProfile, user } = useAuth();
  const { startLoading, stopLoading, isLoading: isSubmitting } = useLoading();

  const handleGenerateAI = async () => {
    setIsDrafting(true);
    const input = {
      tenantName: tenant.name,
      propertyAddress: property.address,
      title: request.title,
      description: request.description,
      category: request.category,
      priority: request.priority,
    };

    try {
      const result = await getMaintenanceResponseDraft(input);
      if (result.success && result.data) {
        setResponseMessage(result.data.draftResponse);
        toast({ title: 'AI Draft Ready', description: 'The suggested response has been loaded.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'AI generation failed.' });
    } finally {
      setIsDrafting(false);
    }
  };

  const handlePostResponse = async () => {
    if (!responseMessage.trim()) {
        toast({ variant: 'destructive', title: 'Empty Message', description: 'Please type a response before sending.' });
        return;
    }

    if (!userProfile?.name) {
        toast({ variant: 'destructive', title: 'Profile Error', description: 'Could not identify responder name. Please check your profile.' });
        return;
    }

    startLoading('Posting response...');
    try {
        const result = await performRespondToMaintenanceRequest(
            request,
            responseMessage,
            userProfile.name,
            user?.uid || 'system',
            tenant.email
        );

        if (result.success) {
            toast({ title: 'Response Posted', description: 'Tenant has been notified of the update.' });
            setResponseMessage('');
            onUpdate();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to post update.' });
    } finally {
        stopLoading();
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card>
            <CardHeader className="p-4">
                <CardTitle className="text-base">Request Details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm p-4 pt-0 space-y-2">
                <p><strong>Resident:</strong> {tenant.name}</p>
                <p><strong>Property:</strong> {property.name} (Unit {tenant.unitName})</p>
                <p><strong>Issue:</strong> {request.title}</p>
                <p><strong>Category:</strong> {request.category}</p>
                <p><strong>Priority:</strong> <span className="capitalize font-semibold text-destructive">{request.priority}</span></p>
                <div className="mt-2 p-2 bg-muted rounded border italic">
                    &quot;{request.description}&quot;
                </div>
            </CardContent>
        </Card>

        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label htmlFor="staff-response" className="font-bold">Post Update / Response</Label>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleGenerateAI} 
                    disabled={isDrafting}
                    className="text-primary hover:text-primary hover:bg-primary/5"
                >
                    {isDrafting ? <Loader className="mr-2 h-3 w-3 animate-spin" /> : <WandSparkles className="mr-2 h-3 w-3" />}
                    Draft with AI
                </Button>
            </div>
            <Textarea 
                id="staff-response" 
                placeholder="Type your message to the tenant here..." 
                value={responseMessage} 
                onChange={(e) => setResponseMessage(e.target.value)}
                rows={8} 
            />
            <Button className="w-full" onClick={handlePostResponse} disabled={isSubmitting || !responseMessage.trim()}>
                {isSubmitting ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Post Update & Notify Tenant
            </Button>
        </div>
      </div>

      <div className="flex flex-col h-full border rounded-lg bg-slate-50/50">
        <div className="p-4 border-b bg-white rounded-t-lg">
            <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Response History</h4>
        </div>
        <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
                {request.updates && request.updates.length > 0 ? (
                    request.updates.map((update, index) => (
                        <div key={index} className="bg-white p-3 rounded-lg border shadow-sm space-y-2">
                            <div className="flex justify-between items-start gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                        <User className="h-3 w-3 text-primary" />
                                    </div>
                                    <span className="text-xs font-bold">{update.authorName}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">{format(new Date(update.date), 'MMM d, h:mm a')}</span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">{update.message}</p>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground opacity-50">
                        <MessageSquare className="h-8 w-8 mb-2" />
                        <p className="text-xs">No updates posted yet.</p>
                    </div>
                )}
            </div>
        </ScrollArea>
      </div>
    </div>
  );
}
