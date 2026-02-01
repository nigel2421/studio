'use client';

import { useState } from 'react';
import { FinancialDocument, DocumentType } from "@/lib/types";
import { DocumentCard } from "./document-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, ArrowDownWideNarrow, FileDown } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { downloadCSV } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DocumentListProps {
    documents: FinancialDocument[];
    onDownload: (doc: FinancialDocument) => void;
}

export function DocumentList({ documents, onDownload }: DocumentListProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<DocumentType | 'All'>('All');
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(12); // Grid 3x4 or 4x3

    const filteredDocs = documents
        .filter(doc => {
            const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesType = typeFilter === 'All' || doc.type === typeFilter;
            return matchesSearch && matchesType;
        })
        .sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        });

    const totalAmount = filteredDocs.reduce((sum, doc) => sum + doc.amount, 0);

    const totalPages = Math.ceil(filteredDocs.length / pageSize);
    const paginatedDocs = filteredDocs.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    const handleExportCSV = () => {
        const data = filteredDocs.map(d => ({
            Title: d.title,
            Type: d.type,
            Date: new Date(d.date).toLocaleDateString(),
            Amount: d.amount,
            Status: d.status
        }));
        downloadCSV(data, 'financial_documents.csv');
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-muted/20 p-4 rounded-xl border">
                <div className="relative w-full sm:w-[300px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search documents..."
                        className="pl-9 bg-background"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Select value={typeFilter} onValueChange={(val) => setTypeFilter(val as DocumentType | 'All')}>
                        <SelectTrigger className="w-[140px] bg-background">
                            <Filter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                            <SelectValue placeholder="Filter Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Types</SelectItem>
                            <SelectItem value="Rent Receipt">Rent Receipts</SelectItem>
                            <SelectItem value="Water Bill">Water Bills</SelectItem>
                            <SelectItem value="Service Charge">Service Charge</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={sortOrder} onValueChange={(val) => setSortOrder(val as 'newest' | 'oldest')}>
                        <SelectTrigger className="w-[140px] bg-background">
                            <ArrowDownWideNarrow className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                            <SelectValue placeholder="Sort" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="newest">Newest First</SelectItem>
                            <SelectItem value="oldest">Oldest First</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex justify-between items-center px-2">
                <p className="text-sm text-muted-foreground font-medium">
                    Showing {filteredDocs.length} documents
                </p>
                <p className="text-sm font-bold text-primary flex items-center gap-4">
                    <span>Total: <span className="font-mono text-foreground">KSh {totalAmount.toLocaleString()}</span></span>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportCSV}>
                        <FileDown className="mr-2 h-3 w-3" /> Export CSV
                    </Button>
                </p>
            </div>

            {filteredDocs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {paginatedDocs.map(doc => (
                        <DocumentCard key={doc.id} document={doc} onDownload={onDownload} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 bg-muted/10 rounded-xl border border-dashed">
                    <div className="mx-auto bg-muted/30 rounded-full h-12 w-12 flex items-center justify-center mb-4">
                        <Filter className="h-6 w-6 text-muted-foreground opacity-50" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">No documents found</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                        Try adjusting your search or filters to find what you're looking for.
                    </p>
                </div>
            )}

            <div className="pt-4 border-t">
                <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={filteredDocs.length}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            </div>
        </div>
    );
}
