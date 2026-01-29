import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FinancialDocument, WaterMeterReading, Payment, ServiceChargeStatement, Landlord, Unit, Property, PropertyOwner, Tenant } from '@/lib/types';
import { FinancialSummary } from '@/lib/financial-utils';
import { format, startOfMonth, addMonths, addDays, isWithinInterval, isBefore, isAfter } from 'date-fns';

// Helper to add company header
const addHeader = (doc: jsPDF, title: string) => {
    doc.setTextColor(40);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Eracov Properties', 14, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Mombasa Road, Nairobi', 14, 26);
    doc.text('Phone: +254 700 000 000', 14, 30);
    doc.text('Email: management@eracov.com', 14, 34);

    // Document Title
    doc.setFontSize(16);
    doc.setTextColor(0, 51, 102); // Dark blue
    doc.text(title.toUpperCase(), 196, 20, { align: 'right' });

    // Line separator
    doc.setDrawColor(200);
    doc.line(14, 40, 196, 40);
};

// Helper for currency formatting
const formatCurrency = (amount: number) => `KSh ${amount.toLocaleString()}`;

export const generateDocumentPDF = (document: FinancialDocument) => {
    const doc = new jsPDF();

    if (document.type === 'Rent Receipt') {
        generateRentReceipt(doc, document);
    } else if (document.type === 'Water Bill') {
        generateWaterBill(doc, document);
    } else if (document.type === 'Service Charge') {
        generateServiceCharge(doc, document);
    }

    // Save the PDF
    doc.save(`${document.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
};

const generateRentReceipt = (doc: jsPDF, document: FinancialDocument) => {
    addHeader(doc, 'Rent Receipt');

    const payment = document.sourceData as Payment;
    const dateStr = new Date(payment.date).toLocaleDateString();

    doc.setFontSize(10);
    doc.setTextColor(0);

    doc.text(`Receipt No: #${payment.id.substring(0, 8).toUpperCase()}`, 14, 50);
    doc.text(`Date: ${dateStr}`, 14, 56);
    doc.text(`Status: ${document.status}`, 14, 62);

    autoTable(doc, {
        startY: 70,
        head: [['Description', 'Amount']],
        body: [
            ['Rent Payment', formatCurrency(payment.amount)],
        ],
        theme: 'striped',
        headStyles: { fillColor: [22, 163, 74] }, // Green
        foot: [['TOTAL PAID', formatCurrency(payment.amount)]],
        footStyles: { fillColor: [240, 253, 244], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.text('Thank you for your payment.', 14, (doc as any).lastAutoTable.finalY + 20);
};

const generateWaterBill = (doc: jsPDF, document: FinancialDocument) => {
    addHeader(doc, 'Water Bill');

    const reading = document.sourceData as WaterMeterReading;
    const dateStr = new Date(reading.date).toLocaleDateString();

    doc.text(`Bill No: #${reading.id.substring(0, 8).toUpperCase()}`, 14, 50);
    doc.text(`Date: ${dateStr}`, 14, 56);
    doc.text(`Unit: ${reading.unitName}`, 14, 62);

    autoTable(doc, {
        startY: 70,
        head: [['Item', 'Usage / Rate', 'Amount']],
        body: [
            ['Previous Reading', `${reading.priorReading} units`, '-'],
            ['Current Reading', `${reading.currentReading} units`, '-'],
            ['Consumption', `${reading.consumption} units`, '-'],
            ['Rate per Unit', formatCurrency(reading.rate), '-'],
            ['Total Cost', '', formatCurrency(reading.amount)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] }, // Blue
        foot: [['TOTAL PAYABLE', '', formatCurrency(reading.amount)]],
        footStyles: { fillColor: [239, 246, 255], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.text('Please pay by M-Pesa or Bank Transfer.', 14, (doc as any).lastAutoTable.finalY + 20);
};

const generateServiceCharge = (doc: jsPDF, document: FinancialDocument) => {
    addHeader(doc, 'Service Charge Statement');

    const stmt = document.sourceData as ServiceChargeStatement;
    const dateStr = new Date(stmt.date).toLocaleDateString();

    doc.text(`Ref No: #${stmt.id.substring(0, 8).toUpperCase()}`, 14, 50);
    doc.text(`Date: ${dateStr}`, 14, 56);
    doc.text(`Period: ${stmt.period}`, 14, 62);

    const tableBody = stmt.items.map(item => [item.description, formatCurrency(item.amount)]);

    autoTable(doc, {
        startY: 70,
        head: [['Description', 'Amount']],
        body: tableBody,
        theme: 'plain',
        headStyles: { fillColor: [217, 119, 6] }, // Amber
        foot: [['TOTAL', formatCurrency(stmt.amount)]],
        footStyles: { fillColor: [255, 251, 235], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'right' },
        columnStyles: { 1: { halign: 'right' } }
    });

    doc.text('This statement is for your records.', 14, (doc as any).lastAutoTable.finalY + 20);
};

export const generateOwnerServiceChargeStatementPDF = (
    owner: PropertyOwner,
    allProperties: Property[],
    allTenants: Tenant[],
    allPayments: Payment[],
    startDate: Date,
    endDate: Date,
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    addHeader(doc, 'Service Charge Statement');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(owner.name, 196, 48, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(owner.email, 196, 54, { align: 'right' });
    doc.text(`Date Issued: ${dateStr}`, 196, 60, { align: 'right' });
    const periodStr = `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
    doc.text(`Period: ${periodStr}`, 196, 66, { align: 'right' });

    const ownerUnits = allProperties.flatMap(p => 
        p.units
         .filter(u => owner.assignedUnits.some(au => au.propertyId === p.id && au.unitNames.includes(u.name)))
         .map(u => ({...u, propertyId: p.id, propertyName: p.name}))
    );

    const ownerUnitIdentifiers = new Set(ownerUnits.map(u => `${u.propertyId}-${u.name}`));
    const relevantTenants = allTenants.filter(t => ownerUnitIdentifiers.has(`${t.propertyId}-${t.unitName}`));
    const relevantTenantIds = relevantTenants.map(t => t.id);

    const serviceChargePayments = allPayments.filter(p =>
        relevantTenantIds.includes(p.tenantId) && 
        (p.type === 'ServiceCharge' || p.type === 'Rent')
    );

    const generatedCharges: { date: Date, description: string, amount: number }[] = [];
    relevantTenants.forEach(tenant => {
        const unit = ownerUnits.find(u => u.propertyId === tenant.propertyId && u.name === tenant.unitName);
        if (!unit) return;

        const monthlyCharge = unit.serviceCharge || 0;
        if (monthlyCharge <= 0) return;

        let loopDate = startOfMonth(new Date(tenant.lease.startDate));
        if (unit.handoverDate) {
            loopDate = startOfMonth(new Date(unit.handoverDate));
        }
        
        const today = new Date();
        while (loopDate <= today) {
            generatedCharges.push({
                date: loopDate,
                description: `Service Charge for Unit ${unit.name}`,
                amount: monthlyCharge
            });
            loopDate = addMonths(loopDate, 1);
        }
    });

    const combined = [
         ...serviceChargePayments.map(p => ({
            date: new Date(p.date),
            transactionType: 'Payment Received',
            details: p.notes || `Payment for ${p.rentForMonth ? format(new Date(p.rentForMonth + '-02'), 'MMM yyyy') : p.type}`,
            charge: 0,
            payment: p.amount,
        })),
        ...generatedCharges.map(c => ({
            date: c.date,
            transactionType: 'Invoice',
            details: c.description,
            charge: c.amount,
            payment: 0,
        }))
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let openingDueBalance = 0;
    let openingCreditBalance = 0;

    combined.forEach(item => {
        if (isBefore(item.date, startDate)) {
            let charge = item.charge;
            if (openingCreditBalance > 0) {
                if (openingCreditBalance >= charge) {
                    openingCreditBalance -= charge;
                    charge = 0;
                } else {
                    charge -= openingCreditBalance;
                    openingCreditBalance = 0;
                }
            }
            openingDueBalance += charge;
            
            let payment = item.payment;
            if (openingDueBalance > 0) {
                 if (openingDueBalance >= payment) {
                    openingDueBalance -= payment;
                    payment = 0;
                } else {
                    payment -= openingDueBalance;
                    openingDueBalance = 0;
                }
            }
            openingCreditBalance += payment;
        }
    });

    let yPos = 75;
    const tableBody: (string | number)[][] = [];

    let dueBalance = openingDueBalance;
    let creditBalance = openingCreditBalance;
    let totalChargesInPeriod = 0;
    let totalPaymentsInPeriod = 0;

    combined.forEach(item => {
        if (isBefore(item.date, startDate) || isAfter(item.date, endDate)) return;

        let charge = item.charge;
        totalChargesInPeriod += charge;
        if (creditBalance > 0) {
            if (creditBalance >= charge) {
                creditBalance -= charge;
                charge = 0;
            } else {
                charge -= creditBalance;
                creditBalance = 0;
            }
        }
        dueBalance += charge;

        let payment = item.payment;
        totalPaymentsInPeriod += payment;
        if (dueBalance > 0) {
            if (dueBalance >= payment) {
                dueBalance -= payment;
                payment = 0;
            } else {
                payment -= dueBalance;
                dueBalance = 0;
            }
        }
        creditBalance += payment;
        
        tableBody.push([
            format(item.date, 'dd MMM yyyy'),
            item.transactionType,
            item.details,
            item.charge > 0 ? formatCurrency(item.charge) : '',
            item.payment > 0 ? formatCurrency(item.payment) : '',
            formatCurrency(dueBalance),
        ]);
    });
    
    autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Transactions', 'Details', 'Charge', 'Payments', 'Balance']],
        body: tableBody,
        foot: [
             [
                { content: 'Totals', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
                { content: formatCurrency(totalChargesInPeriod), styles: { fontStyle: 'bold', halign: 'right' } },
                { content: formatCurrency(totalPaymentsInPeriod), styles: { fontStyle: 'bold', halign: 'right' } },
                { content: '' }
            ]
        ],
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
        columnStyles: {
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
        },
    });
    
    doc.save(`service_charge_statement_${owner.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};


export const generateLandlordStatementPDF = (
    landlord: Landlord,
    summary: FinancialSummary,
    transactions: { date: string; unit: string; gross: number; serviceCharge: number; mgmtFee: number; net: number, rentForMonth?: string }[],
    units: { property: string; unitName: string; unitType: string; status: string }[],
    startDate?: Date,
    endDate?: Date
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    // Header
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Eracov Properties', 14, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Landlord Statement', 14, 26);

    // Landlord Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(landlord.name, 196, 20, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date Issued: ${dateStr}`, 196, 26, { align: 'right' });
    
    if (startDate && endDate) {
        const periodStr = `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
        doc.text(`Period: ${periodStr}`, 196, 31, { align: 'right' });
    }

    doc.setDrawColor(200);
    doc.line(14, 35, 196, 35);

    // Summary Section
    let yPos = 45;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary', 14, yPos);
    yPos += 8;

    const summaryData = [
        ['Total Revenue (from Occupied Units)', formatCurrency(summary.totalRevenue)],
        ['Service Charges (from Occupied Units)', `-${formatCurrency(summary.totalServiceCharges)}`],
        ['Management Fees (5%)', `-${formatCurrency(summary.totalManagementFees)}`],
    ];

    if (summary.vacantUnitServiceChargeDeduction && summary.vacantUnitServiceChargeDeduction > 0) {
      summaryData.push(['Service Charges (from Vacant Units)', `-${formatCurrency(summary.vacantUnitServiceChargeDeduction)}`])
    }

    summaryData.push(['Net Rent Payout', formatCurrency(summary.totalNetRemittance)]);

    autoTable(doc, {
        startY: yPos,
        body: summaryData,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: { top: 3, bottom: 3 } },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Transaction History
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Transaction History', 14, yPos);
    yPos += 8;
    
    const totals = transactions.reduce((acc, t) => {
        acc.gross += t.gross;
        acc.serviceCharge += t.serviceCharge;
        acc.mgmtFee += t.mgmtFee;
        acc.net += t.net;
        return acc;
    }, { gross: 0, serviceCharge: 0, mgmtFee: 0, net: 0 });

    autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Unit', 'For Month', 'Gross', 'S. Charge', 'Mgmt Fee', 'Net']],
        body: transactions.map(t => [
            t.date,
            t.unit,
            t.rentForMonth ? format(new Date(t.rentForMonth + '-02'), 'MMM yyyy') : 'N/A',
            formatCurrency(t.gross),
            `-${formatCurrency(t.serviceCharge)}`,
            `-${formatCurrency(t.mgmtFee)}`,
            formatCurrency(t.net),
        ]),
        foot: [[
            { content: 'Totals', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(totals.gross), styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `-${formatCurrency(totals.serviceCharge)}`, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `-${formatCurrency(totals.mgmtFee)}`, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(totals.net), styles: { fontStyle: 'bold', halign: 'right' } }
        ]],
        footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0] },
        theme: 'striped',
        headStyles: { fillColor: [41, 102, 182] },
        columnStyles: {
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right' },
        },
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;
    
    // Units Overview
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Unit Portfolio', 14, yPos);
    yPos += 8;

    autoTable(doc, {
        startY: yPos,
        head: [['Property', 'Unit Name', 'Unit Type', 'Status']],
        body: units.map(u => [u.property, u.unitName, u.unitType, u.status]),
        theme: 'grid',
        headStyles: { fillColor: [41, 102, 182] },
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    if (summary.vacantUnitServiceChargeDeduction && summary.vacantUnitServiceChargeDeduction > 0) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100);
        doc.text(
            `Note: A deduction of ${formatCurrency(summary.vacantUnitServiceChargeDeduction)} has been made for service charges on your vacant units.`,
            14,
            yPos
        );
        yPos += 10;
    }


    doc.save(`landlord_statement_${landlord.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateTenantStatementPDF = (tenant: Tenant, payments: Payment[], properties: Property[]) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const statementTitle = tenant.residentType === 'Homeowner' ? 'Service Charge Statement' : 'Tenant Statement';
    addHeader(doc, statementTitle);

    const property = properties.find(p => p.id === tenant.propertyId);
    const unit = property?.units.find(u => u.name === tenant.unitName);
    const monthlyCharge = tenant.residentType === 'Homeowner' 
        ? (unit?.serviceCharge || tenant.lease.serviceCharge || 0) 
        : (tenant.lease.rent || 0);
    const chargeLabel = tenant.residentType === 'Homeowner' ? 'Monthly Service Charge' : 'Monthly Rent';
    
    // Add tenant details to the left
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`STATEMENT FOR:`, 14, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(tenant.name, 14, 54);
    doc.text(`Unit: ${tenant.unitName} (${unit?.unitType || 'N/A'})`, 14, 60);
    doc.text(`${chargeLabel}: ${formatCurrency(monthlyCharge)}`, 14, 66);
    
    // Right-aligned info
    doc.setFontSize(10);
    doc.text(`Date Issued: ${dateStr}`, 196, 48, { align: 'right' });


    // --- GENERATE ALL CHARGES ---
    const allCharges: { date: Date, description: string, charge: number, payment: number, id: string }[] = [];
    const leaseStartDate = new Date(tenant.lease.startDate);

    // 1. Initial deposits
    if (tenant.securityDeposit && tenant.securityDeposit > 0) {
        allCharges.push({
            id: 'charge-security-deposit',
            date: leaseStartDate,
            description: 'Security Deposit',
            charge: tenant.securityDeposit,
            payment: 0,
        });
    }
    if (tenant.waterDeposit && tenant.waterDeposit > 0) {
         allCharges.push({
            id: 'charge-water-deposit',
            date: leaseStartDate,
            description: 'Water Deposit',
            charge: tenant.waterDeposit,
            payment: 0,
        });
    }
    
    // 2. Generate monthly charges
    if (monthlyCharge > 0) {
        const handoverDate = unit?.handoverDate ? new Date(unit.handoverDate) : null;
        
        const billingStartDate = tenant.residentType === 'Homeowner' && handoverDate
            ? startOfMonth(handoverDate)
            : startOfMonth(leaseStartDate);

        let loopDate = billingStartDate;
        const today = new Date();
        while (loopDate <= today) {
            allCharges.push({
                id: `charge-${format(loopDate, 'yyyy-MM')}`,
                date: loopDate,
                description: `${tenant.residentType === 'Homeowner' ? 'Service Charge' : 'Rent'} for ${format(loopDate, 'MMMM yyyy')}`,
                charge: monthlyCharge,
                payment: 0,
            });
            loopDate = addMonths(loopDate, 1);
        }
    }

    // --- COMBINE WITH PAYMENTS ---
    const allPayments = payments.map(p => {
        const isAdjustment = p.type === 'Adjustment';
        return {
            id: p.id,
            date: new Date(p.date),
            description: p.notes || `Payment - ${p.rentForMonth ? format(new Date(p.rentForMonth + '-02'), 'MMM yyyy') : p.type}`,
            charge: isAdjustment && p.amount > 0 ? p.amount : 0, // Debits are charges
            payment: !isAdjustment ? p.amount : (isAdjustment && p.amount < 0 ? Math.abs(p.amount) : 0), // Credits are payments
        };
    });

    const combined = [...allCharges, ...allPayments].sort((a, b) => {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) return dateDiff;
        // If on the same day, charges come before payments
        if (a.charge > 0 && b.payment > 0) return -1;
        if (a.payment > 0 && b.charge > 0) return 1;
        return 0;
    });

    // --- CALCULATE RUNNING BALANCE ---
    let dueBalance = 0;
    let accountBalance = 0;

    const finalLedger = combined.map(item => {
        dueBalance += item.charge;
        
        if (accountBalance > 0) {
            if (accountBalance >= dueBalance) {
                accountBalance -= dueBalance;
                dueBalance = 0;
            } else {
                dueBalance -= accountBalance;
                accountBalance = 0;
            }
        }
        
        let paymentAmount = item.payment;
        if (paymentAmount > 0) {
            if (paymentAmount >= dueBalance) {
                paymentAmount -= dueBalance;
                dueBalance = 0;
                accountBalance += paymentAmount;
            } else {
                dueBalance -= paymentAmount;
            }
        }

        return { ...item, balance: dueBalance };
    });

    const tableBodyData = finalLedger.map(t => [
        format(t.date, 'P'),
        t.description,
        t.charge > 0 ? formatCurrency(t.charge) : '',
        t.payment > 0 ? formatCurrency(t.payment) : '',
        formatCurrency(t.balance)
    ]);

    const totalCharges = finalLedger.reduce((sum, item) => sum + item.charge, 0);
    const totalPayments = finalLedger.reduce((sum, item) => sum + item.payment, 0);
    
    const chargeColumnTitle = tenant.residentType === 'Homeowner' ? 'S.Charge' : 'Charge';

    autoTable(doc, {
        startY: 75,
        head: [['Date', 'Description', chargeColumnTitle, 'Payment', 'Balance']],
        body: tableBodyData,
        foot: [[
            { content: 'Totals', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(totalCharges), styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(totalPayments), styles: { fontStyle: 'bold', halign: 'right' } },
            '' // Empty cell for balance column in footer
        ]],
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
        footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
        columnStyles: {
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' }
        }
    });
    
    doc.save(`statement_${tenant.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};


export const generateDashboardReportPDF = (
    stats: { title: string; value: string | number }[],
    financialData: { name: string; amount: number }[],
    rentBreakdownData: { unitType: string, smRent?: number, landlordRent?: number }[],
    maintenanceBreakdown: { status: string; count: number }[],
    orientationBreakdown: { name: string; value: number }[]
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    addHeader(doc, 'Dashboard Summary Report');
    doc.setFontSize(10);
    doc.text(`Date Issued: ${dateStr}`, 196, 31, { align: 'right' });
    
    let yPos = 50;
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Performance Indicators', 14, yPos);
    yPos += 10;
    
    const statRows: (string | number)[][] = [];
    for (let i = 0; i < stats.length; i += 2) {
        const row = [
            stats[i].title, 
            String(stats[i].value), 
            stats[i+1] ? stats[i+1].title : '',
            stats[i+1] ? String(stats[i+1].value) : ''
        ];
        statRows.push(row);
    }

    autoTable(doc, {
        startY: yPos,
        body: statRows,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: { top: 3, bottom: 3 } },
        columnStyles: { 
            0: { fontStyle: 'normal' },
            1: { fontStyle: 'bold', fontSize: 12 },
            2: { fontStyle: 'normal' },
            3: { fontStyle: 'bold', fontSize: 12 }
        },
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Financial Overview
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Overview', 14, yPos);
    yPos += 10;

    autoTable(doc, {
        startY: yPos,
        head: [['Metric', 'Amount']],
        body: financialData.map(d => [d.name, `Ksh ${d.amount.toLocaleString()}`]),
        theme: 'striped',
        headStyles: { fillColor: [41, 102, 182] },
        foot: [[
            { content: 'Total', styles: { fontStyle: 'bold' } },
            { content: `Ksh ${financialData.reduce((sum, d) => sum + d.amount, 0).toLocaleString()}`, styles: { fontStyle: 'bold' } }
        ]],
        footStyles: { halign: 'right' }
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Rent Revenue Breakdown
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Rent Revenue by Ownership', 14, yPos);
    yPos += 10;

    autoTable(doc, {
        startY: yPos,
        head: [['Unit Type', 'SM Unit Rent', 'Landlord Unit Rent']],
        body: rentBreakdownData.map(d => [d.unitType, formatCurrency(d.smRent || 0), formatCurrency(d.landlordRent || 0)]),
        theme: 'striped',
        headStyles: { fillColor: [41, 102, 182] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }},
        foot: [[
            { content: 'Totals', styles: { fontStyle: 'bold', halign: 'right' } },
            formatCurrency(rentBreakdownData.reduce((sum, d) => sum + (d.smRent || 0), 0)),
            formatCurrency(rentBreakdownData.reduce((sum, d) => sum + (d.landlordRent || 0), 0))
        ]],
        footStyles: { halign: 'right', fontStyle: 'bold' }
    });
    yPos = (doc as any).lastAutoTable.finalY;

    if (yPos > 240) { // Check if there's enough space for next tables
        doc.addPage();
        yPos = 20;
    } else {
        yPos += 15;
    }

    // Maintenance Breakdown
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Maintenance Request Status', 14, yPos);
    yPos += 10;

    autoTable(doc, {
        startY: yPos,
        head: [['Status', 'Count']],
        body: maintenanceBreakdown.map(d => [d.status, d.count]),
        theme: 'striped',
        headStyles: { fillColor: [217, 119, 6] }, // Amber
        foot: [[
            { content: 'Total Requests', styles: { fontStyle: 'bold' } },
            { content: `${maintenanceBreakdown.reduce((sum, d) => sum + d.count, 0)}`, styles: { fontStyle: 'bold' } }
        ]],
        footStyles: { halign: 'right' },
        columnStyles: { 1: { halign: 'right' } },
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Orientation Breakdown
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Unit Orientation Breakdown', 14, yPos);
    yPos += 10;

    autoTable(doc, {
        startY: yPos,
        head: [['Orientation', 'Unit Count']],
        body: orientationBreakdown.map(d => [d.name, d.value]),
        theme: 'striped',
        headStyles: { fillColor: [22, 163, 74] }, // Green
        foot: [[
            { content: 'Total Units with Orientation', styles: { fontStyle: 'bold' } },
            { content: `${orientationBreakdown.reduce((sum, d) => sum + d.value, 0)}`, styles: { fontStyle: 'bold' } }
        ]],
        footStyles: { halign: 'right' },
        columnStyles: { 1: { halign: 'right' } },
    });

    doc.save(`dashboard_report_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateVacantServiceChargeInvoicePDF = (
    owner: PropertyOwner,
    unit: Unit,
    property: Property,
    arrearsDetail: { month: string; amount: number; status: 'Paid' | 'Pending' }[],
    totalDue: number
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    addHeader(doc, 'Service Charge Invoice');
    
    // Owner Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(owner.name, 196, 48, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(owner.email, 196, 54, { align: 'right' });
    doc.text(`Invoice Date: ${dateStr}`, 196, 60, { align: 'right' });
    
    // Property and Unit Details
    let yPos = 70;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice For:', 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`Property: ${property.name}`, 14, yPos + 6);
    doc.text(`Unit: ${unit.name}`, 14, yPos + 11);
    doc.text(`Handover Date: ${unit.handoverDate ? new Date(unit.handoverDate).toLocaleDateString() : 'N/A'}`, 14, yPos + 16);
    yPos += 25;

    autoTable(doc, {
        startY: yPos,
        head: [['Month', 'Description', 'Status', 'Amount']],
        body: arrearsDetail.map(item => [item.month, `Service Charge for Vacant Unit`, item.status, formatCurrency(item.amount)]),
        theme: 'striped',
        headStyles: { fillColor: [217, 119, 6] }, // Amber
        foot: [[{ content: 'TOTAL DUE', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } }, formatCurrency(totalDue)]],
        footStyles: { fillColor: [255, 251, 235], textColor: [0, 0, 0], fontStyle: 'bold' },
        columnStyles: {
            3: { halign: 'right' }
        },
        didDrawCell: (data) => {
            if (data.section === 'body' && data.column.index === 2) {
                const status = data.cell.raw as string;
                doc.setFont(doc.getFont().fontName, 'bold');
                if (status === 'Paid') {
                    doc.setTextColor(15, 118, 110); // tailwind teal-700
                } else if (status === 'Pending') {
                    doc.setTextColor(199, 24, 24); // tailwind red-600
                }
            }
        },
        willDrawCell: (data) => {
            if (!(data.section === 'body' && data.column.index === 2)) {
                doc.setFont(doc.getFont().fontName, 'normal');
                doc.setTextColor(40, 40, 40);
            }
        },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
    doc.setTextColor(40);
    doc.setFont('helvetica', 'normal');
    doc.text('Please remit payment at your earliest convenience to avoid further penalties.', 14, yPos);

    doc.save(`invoice_vacant_sc_${owner.name.replace(/ /g, '_')}_${unit.name}_${new Date().toISOString().split('T')[0]}.pdf`);
};

  

    