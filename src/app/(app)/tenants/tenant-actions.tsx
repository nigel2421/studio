
'use client';

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Tenant } from "@/lib/types";
import { Bell } from "lucide-react";

export function TenantActions({ tenant }: { tenant: Tenant }) {
  const { toast } = useToast();

  const handleSendReminder = (tenantName: string) => {
    toast({
      title: 'Reminder Sent',
      description: `Payment reminder sent to ${tenantName}.`,
    });
  };

  return null;
}
