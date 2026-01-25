
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getFinancialDocuments } from '@/lib/data';
import { FinancialDocument } from '@/lib/types';
import { DocumentList } from '@/components/financials/document-list';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/hooks/useLoading';
import { FileText, Download } from 'lucide-react';

export default function DocumentsPage() {
    const { user, userProfile, isLoading: authLoading } = useAuth();
    const [documents, setDocuments] = useState<FinancialDocument[]>([]);
    const { toast } = useToast();
    const { startLoading, stopLoading } = useLoading();

    useEffect(() => {
        async function fetchData() {
            if (user && userProfile) {
                // startLoading('Fetching your financial records...');
                try {
                    const docs = await getFinancialDocuments(user.uid, userProfile.role);
                    setDocuments(docs);
                } catch (error) {
                    console.error("Failed to fetch documents:", error);
                    toast({ variant: 'destructive', title: 'Error', description: 'Failed to load your documents.' });
                } finally {
                    // stopLoading();
                }
            }
        }

        if (!authLoading) {
            fetchData();
        }
    }, [user, userProfile, authLoading]);

    const handleDownload = async (doc: FinancialDocument) => {
        try {
            const { generateDocumentPDF } = await import('@/lib/pdf-generator');
            generateDocumentPDF(doc);
            toast({
                title: 'Download Complete',
                description: `Successfully downloaded ${doc.title}.`
            });
        } catch (error) {
            console.error("PDF Generation Error", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to generate PDF.' });
        }
    };

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">My Documents</h2>
                    <p className="text-muted-foreground">
                        Access and download your invoices, receipts, and statements.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100">
                    <FileText className="h-4 w-4" />
                    <span>{documents.length} Records Available</span>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-1 md:p-6 min-h-[60vh]">
                <DocumentList documents={documents} onDownload={handleDownload} />
            </div>
        </div>
    );
}

    