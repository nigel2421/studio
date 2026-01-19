'use client';

import { cn } from "@/lib/utils";

interface DynamicLoaderProps {
    isLoading: boolean;
    className?: string;
}

export function DynamicLoader({ isLoading, className }: DynamicLoaderProps) {
    if (!isLoading) return <div className="h-0.5 w-full" />;

    return (
        <div className={cn("h-0.5 w-full bg-blue-100 overflow-hidden relative rounded-full", className)}>
            <div className="absolute inset-0 bg-blue-600 animate-progress-indeterminate" />
        </div>
    );
}
