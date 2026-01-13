
'use client';

import { UseFormReturn } from 'react-hook-form';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { EditPropertyFormValues } from '@/app/(app)/properties/edit/[id]/page';
import { Save } from 'lucide-react';

interface EditPropertyHeaderProps {
  form: UseFormReturn<EditPropertyFormValues>;
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
}

export function EditPropertyHeader({ form, onSubmit }: EditPropertyHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-auto items-center justify-between gap-4 border-b bg-background/80 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="flex flex-1 items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div className="flex-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2 items-start">
             <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Name</FormLabel>
                    <FormControl>
                        <Input {...field} className="h-9" />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Address</FormLabel>
                    <FormControl>
                        <Input {...field} className="h-9" />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Type</FormLabel>
                    <FormControl>
                        <Input {...field} className="h-9" />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
          </div>
        </div>
      </div>
       <div className="flex items-center gap-4 pl-4">
        <Button onClick={onSubmit} size="sm">
            <Save className="mr-2 h-4 w-4"/>
            Save Property
        </Button>
      </div>
    </header>
  );
}
