
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Property } from '@/lib/types';
import { useCallback } from 'react';

interface PropertySelectorProps {
    properties: Property[];
    selectedPropertyId: string | null;
}

export function PropertySelector({ properties, selectedPropertyId }: PropertySelectorProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const createQueryString = useCallback(
        (name: string, value: string) => {
            const params = new URLSearchParams(searchParams?.toString() ?? '');
            params.set(name, value);
            return params.toString();
        },
        [searchParams]
    );

    const handleSelect = (propertyId: string) => {
        router.push(`${pathname}?${createQueryString('propertyId', propertyId)}`);
    };

    return (
        <Select onValueChange={handleSelect} value={selectedPropertyId || ''}>
            <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select a property..." />
            </SelectTrigger>
            <SelectContent>
                {properties.map(property => (
                    <SelectItem key={property.id} value={property.id}>
                        {property.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
