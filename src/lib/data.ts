

import { initializeApp, getApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import {
    Property, Unit, WaterMeterReading, Payment, Tenant,
    ArchivedTenant, MaintenanceRequest, UserProfile, Log, Landlord,
    UserRole, UnitStatus, PropertyOwner, FinancialDocument, ServiceChargeStatement, Communication, Task, UnitType,
    unitStatuses, ownershipTypes, unitTypes, managementStatuses, handoverStatuses
} from '@/lib/types';
import { db, firebaseConfig, sendPaymentReceipt } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, setDoc, serverTimestamp, arrayUnion, writeBatch, orderBy, deleteDoc, limit, onSnapshot } from 'firebase/firestore';
import { auth } from './firebase';
import { reconcileMonthlyBilling, processPayment, calculateTargetDue } from './financial-logic';
import { format } from "date-fns";

const WATER_RATE = 150; // Ksh per unit

export async function logActivity(action: string) {
    const user = auth.currentUser;
    if (!user) return; // Don't log if user isn't authenticated

    try {
        await addDoc(collection(db, 'logs'), {
            userId: user.uid,
            action,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Error logging activity:", error);
    }
}

export async function logCommunication(data: Omit<Communication, 'id'>) {
    try {
        await addDoc(collection(db, 'communications'), {
            ...data,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Error logging communication:", error);
    }
}

export async function getUsers(): Promise<UserProfile[]> {
    return getCollection<UserProfile>('users');
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { role });
    await logActivity(`Updated role for user ${userId} to ${role}`);
}

export async function getLogs(): Promise<Log[]> {
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Log));
}

async function getCollection<T>(collectionName: string): Promise<T[]> {
    const q = query(collection(db, collectionName));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
}

async function getDocument<T>(collectionName: string, id: string): Promise<T | null> {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as T;
    } else {
        return null;
    }
}

export async function getProperties(): Promise<Property[]> {
    const propertiesCol = collection(db, 'properties');
    const propertiesSnapshot = await getDocs(propertiesCol);
    return propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
}

export async function getTenants(): Promise<Tenant[]> {
    return getCollection<Tenant>('tenants');
}

export async function getArchivedTenants(): Promise<ArchivedTenant[]> {
    return getCollection<ArchivedTenant>('archived_tenants');
}

export async function getMaintenanceRequests(): Promise<MaintenanceRequest[]> {
    const q = query(collection(db, 'maintenanceRequests'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
}

export async function getProperty(id: string): Promise<Property | null> {
    const docRef = doc(db, 'properties', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Property;
    }
    return null;
}

export async function getTenant(id: string): Promise<Tenant | null> {
    const tenant = await getDocument<Tenant>('tenants', id);
    if (tenant) {
        const readingsQuery = query(
            collection(db, 'waterReadings'),
            where('tenantId', '==', id),
            orderBy('createdAt', 'desc'),
            limit(12)
        );
        const readingsSnapshot = await getDocs(readingsQuery);
        const readings = readingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterMeterReading));
        tenant.waterReadings = readings;
    }
    return tenant;
}

export async function addTenant(data: Omit<Tenant, 'id' | 'status' | 'lease'> & { rent: number; securityDeposit: number; waterDeposit?: number; residentType: 'Tenant', leaseStartDate: string }): Promise<void> {

    const { name, email, phone, idNumber, propertyId, unitName, agent, rent, securityDeposit, waterDeposit, leaseStartDate } = data;

    const property = await getProperty(propertyId);
    if (!property) {
        throw new Error("Cannot add tenant: selected property not found.");
    }
    const unit = property.units.find(u => u.name === unitName);
    if (!unit) {
        throw new Error("Cannot add tenant: selected unit not found in property.");
    }
    
    const serviceCharge = unit.serviceCharge || 0;

    const initialDue = rent + securityDeposit + (waterDeposit || 0);

    const newTenantData = {
        name,
        email,
        phone,
        idNumber,
        propertyId,
        unitName,
        agent,
        status: 'active' as const,
        residentType: 'Tenant' as const,
        lease: {
            startDate: leaseStartDate,
            endDate: new Date(new Date(leaseStartDate).setFullYear(new Date(leaseStartDate).getFullYear() + 1)).toISOString().split('T')[0],
            rent: rent,
            serviceCharge: serviceCharge,
            paymentStatus: 'Pending' as const,
            lastBilledPeriod: format(new Date(leaseStartDate), 'yyyy-MM'),
        },
        securityDeposit: securityDeposit || 0,
        waterDeposit: waterDeposit || 0,
        dueBalance: initialDue,
        accountBalance: 0,
    };
    const tenantDocRef = await addDoc(collection(db, 'tenants'), newTenantData);

    // Create onboarding task
    await addTask({
        title: `Onboard: ${name}`,
        description: `Complete onboarding for ${name} in ${unitName}. Initial billing of Ksh ${initialDue} (Rent: ${rent}, Sec. Deposit: ${securityDeposit}, Water Deposit: ${waterDeposit || 0}) is pending.`,
        status: 'Pending',
        priority: 'High',
        category: 'Financial',
        tenantId: tenantDocRef.id,
        propertyId,
        unitName,
        dueDate: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0],
    });

    await logActivity(`Created tenant: ${name} (${email})`);

    // Update unit status to 'rented'
    const updatedUnits = property.units.map(u =>
        u.name === unitName ? { ...u, status: 'rented' as UnitStatus } : u
    );
    await updateProperty(propertyId, { units: updatedUnits });
    await logActivity(`Updated unit ${unitName} in property ${property.name} to 'rented'`);


    const appName = 'tenant-creation-app-' + newTenantData.email;
    let secondaryApp;
    try {
        secondaryApp = getApp(appName);
    } catch (e) {
        secondaryApp = initializeApp(firebaseConfig, appName);
    }

    const secondaryAuth = getAuth(secondaryApp);
    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, phone);
        const user = userCredential.user;

        await createUserProfile(user.uid, user.email || email, 'tenant', {
            name: name,
            tenantId: tenantDocRef.id,
            propertyId: propertyId
        });

    } catch (error) {
        console.error("Error creating tenant auth user:", error);
        throw new Error("Failed to create tenant login credentials.");
    } finally {
        if (secondaryApp) {
            await deleteApp(secondaryApp);
        }
    }
}

export async function addProperty(property: Omit<Property, 'id' | 'imageId'>): Promise<void> {
    const newDocRef = doc(collection(db, "properties"));
    const newPropertyData: Property = {
        id: newDocRef.id,
        imageId: `property-${Math.floor(Math.random() * 3) + 1}`,
        ...property,
    };
    await setDoc(newDocRef, newPropertyData);
    await logActivity(`Added new property: ${property.name}`);
}

export async function updateProperty(propertyId: string, data: Partial<Property>): Promise<void> {
    const propertyRef = doc(db, 'properties', propertyId);
    await updateDoc(propertyRef, data);
    await logActivity(`Updated property: ID ${propertyId}`);
}

export async function archiveTenant(tenantId: string): Promise<void> {
    const tenant = await getTenant(tenantId);
    if (tenant) {
        const tenantRef = doc(db, 'tenants', tenantId);
        const archivedTenantRef = doc(db, 'archived_tenants', tenantId);

        const batch = writeBatch(db);
        batch.set(archivedTenantRef, { ...tenant, archivedAt: new Date().toISOString(), status: 'archived' });
        batch.delete(tenantRef);
        await batch.commit();

        const property = await getProperty(tenant.propertyId);
        if (property) {
            const updatedUnits = property.units.map(u =>
                u.name === tenant.unitName ? { ...u, status: 'vacant' as const } : u
            );
            await updateProperty(property.id, { units: updatedUnits });
        }

        await logActivity(`Archived resident: ${tenant.name}`);
    }
}

export async function updateTenant(tenantId: string, tenantData: Partial<Tenant>): Promise<void> {
    const oldTenant = await getTenant(tenantId);
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, tenantData);

    await logActivity(`Updated tenant: ${tenantData.name || oldTenant?.name}`);

    if (oldTenant && (oldTenant.propertyId !== tenantData.propertyId || oldTenant.unitName !== tenantData.unitName)) {
        // Mark old unit as vacant
        const oldProperty = await getProperty(oldTenant.propertyId);
        if (oldProperty) {
            const oldUnits = oldProperty.units.map(u => u.name === oldTenant.unitName ? { ...u, status: 'vacant' as const } : u);
            await updateProperty(oldProperty.id, { units: oldUnits });
        }

        // Mark new unit as rented
        if (tenantData.propertyId && tenantData.unitName) {
            const newProperty = await getProperty(tenantData.propertyId);
            if (newProperty) {
                const newUnits = newProperty.units.map(u => u.name === tenantData.unitName ? { ...u, status: 'rented' as const } : u);
                await updateProperty(newProperty.id, { units: newUnits });
            }
        }
    }
}

export async function createUserProfile(userId: string, email: string, role: UserProfile['role'], details: Partial<UserProfile> = {}) {
    const userProfileRef = doc(db, 'users', userId);
    await setDoc(userProfileRef, {
        email,
        role,
        ...details,
    }, { merge: true });
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    const userProfileRef = doc(db, 'users', userId);
    const docSnap = await getDoc(userProfileRef);
    if (docSnap.exists()) {
        const userProfile = { id: docSnap.id, ...docSnap.data() } as UserProfile;

        if ((userProfile.role === 'tenant' || userProfile.role === 'homeowner') && userProfile.tenantId) {
            const tenantData = await getTenant(userProfile.tenantId);
            if (tenantData) {
                userProfile.tenantDetails = tenantData;
            }
        }

        if (userProfile.role === 'landlord' && userProfile.landlordId) {
            const allProperties = await getProperties();
            if (userProfile.landlordId) {
                 const landlordProperties: { property: Property, units: Unit[] }[] = [];
                 allProperties.forEach(p => {
                    const units = p.units.filter(u => u.landlordId === userProfile.landlordId);
                    if (units.length > 0) {
                        landlordProperties.push({ property: p, units });
                    }
                });
                userProfile.landlordDetails = { properties: landlordProperties };
            }
        }

        if (userProfile.role === 'homeowner' && userProfile.propertyOwnerId) {
            const allProperties = await getProperties();
            const owner = await getPropertyOwner(userProfile.propertyOwnerId);
            if (owner) {
                const ownerProperties: { property: Property, units: Unit[] }[] = [];
                owner.assignedUnits.forEach(assigned => {
                    const property = allProperties.find(p => p.id === assigned.propertyId);
                    if (property) {
                        const units = property.units.filter(u => assigned.unitNames.includes(u.name));
                        ownerProperties.push({ property, units });
                    }
                });
                userProfile.propertyOwnerDetails = { properties: ownerProperties };
            }
        }
        return userProfile;
    }
    return null;
}

export async function addMaintenanceRequest(request: Omit<MaintenanceRequest, 'id' | 'date' | 'status' | 'createdAt'>) {
    await addDoc(collection(db, 'maintenanceRequests'), {
        ...request,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
        status: 'New',
    });
    await logActivity(`Submitted maintenance request`);
}

export async function updateMaintenanceRequestStatus(requestId: string, status: MaintenanceRequest['status']) {
    const requestRef = doc(db, 'maintenanceRequests', requestId);
    await updateDoc(requestRef, { status });
    await logActivity(`Updated maintenance request ${requestId} to ${status}`);
}

export async function getTenantMaintenanceRequests(tenantId: string): Promise<MaintenanceRequest[]> {
    const q = query(
        collection(db, "maintenanceRequests"),
        where("tenantId", "==", tenantId),
        orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const requests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));

    return requests;
}

export async function addWaterMeterReading(data: {
    propertyId: string;
    unitName: string;
    priorReading: number;
    currentReading: number;
    date: string;
}) {
    const tenantsSnapshot = await getDocs(query(collection(db, 'tenants'), where('propertyId', '==', data.propertyId), where('unitName', '==', data.unitName)));
    if (tenantsSnapshot.empty) {
        throw new Error("Tenant not found for the selected unit.");
    }
    const tenantDoc = tenantsSnapshot.docs[0];
    const tenantId = tenantDoc.id;

    const consumption = data.currentReading - data.priorReading;
    const amount = consumption * WATER_RATE;

    const readingData = {
        ...data,
        tenantId,
        consumption,
        rate: WATER_RATE,
        amount,
        createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, 'waterReadings'), readingData);
    await logActivity(`Added water reading for unit ${data.unitName}`);
}

export async function getTenantPayments(tenantId: string): Promise<Payment[]> {
    const q = query(
        collection(db, "payments"),
        where("tenantId", "==", tenantId),
        orderBy('date', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
}

export async function getPropertyWaterReadings(propertyId: string): Promise<WaterMeterReading[]> {
    const q = query(
        collection(db, 'waterReadings'),
        where('propertyId', '==', propertyId),
        orderBy('date', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterMeterReading));
}

export async function getPropertyMaintenanceRequests(propertyId: string): Promise<MaintenanceRequest[]> {
    const q = query(
        collection(db, 'maintenanceRequests'),
        where('propertyId', '==', propertyId),
        orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
}

export async function addPayment(paymentData: Omit<Payment, 'id' | 'createdAt'>, taskId?: string): Promise<void> {
    const tenantRef = doc(db, 'tenants', paymentData.tenantId);
    const tenantSnap = await getDoc(tenantRef);

    if (!tenantSnap.exists()) {
        throw new Error("Tenant not found");
    }

    const tenant = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant;

    // 1. Record the payment in Firestore
    const paymentsRef = collection(db, 'payments');
    await addDoc(paymentsRef, {
        ...paymentData,
        createdAt: serverTimestamp(),
    });

    // 2. Process balances using logic
    const updates = processPayment(tenant, paymentData.amount);

    // 3. Update tenant in Firestore
    await updateDoc(tenantRef, updates);
    
    // 4. If a taskId is provided, update the task status
    if (taskId) {
        try {
            const taskRef = doc(db, 'tasks', taskId);
            await updateDoc(taskRef, { status: 'Completed' });
            await logActivity(`Completed task ${taskId} via payment for ${tenant.name}.`);
        } catch (error) {
            console.error("Failed to update task status:", error);
            // We don't throw here because the payment itself was successful.
        }
    }


    // 5. Send receipt email
    const property = await getProperty(tenant.propertyId);
    try {
        await sendPaymentReceipt({
            tenantEmail: tenant.email,
            tenantName: tenant.name,
            amount: paymentData.amount,
            date: paymentData.date,
            propertyName: property?.name || 'N/A',
            unitName: tenant.unitName,
            notes: paymentData.notes,
        });
        await logActivity(`Sent payment receipt to ${tenant.name} (${tenant.email})`);
    } catch (error) {
        console.error("Failed to send receipt email:", error);
    }
}

export async function runMonthlyReconciliation(): Promise<void> {
    const tenantsRef = collection(db, 'tenants');
    const tenantsSnap = await getDocs(tenantsRef);
    const today = new Date();

    const batch = writeBatch(db);

    for (const tenantDoc of tenantsSnap.docs) {
        const tenant = { id: tenantDoc.id, ...tenantDoc.data() } as Tenant;
        const updates = reconcileMonthlyBilling(tenant, today);

        if (updates && Object.keys(updates).length > 0) {
            batch.update(tenantDoc.ref, updates);
        }
    }

    await batch.commit();
    await logActivity(`Monthly reconciliation completed for ${tenantsSnap.size} tenants.`);
}

export async function bulkUpdateUnitsFromCSV(data: Record<string, string>[]): Promise<{ updatedCount: number; errors: string[] }> {
    const errors: string[] = [];

    // 1. Fetch all properties and create a map of all units.
    const propertiesSnapshot = await getDocs(collection(db, 'properties'));
    const properties: Record<string, Property> = {}; // propertyId -> Property
    const unitMap: Record<string, { unit: Unit, propertyId: string }> = {}; // unitName -> {unit, propertyId}
    const duplicateUnitNames = new Set<string>();

    propertiesSnapshot.forEach(doc => {
        const prop = { id: doc.id, ...doc.data() } as Property;
        properties[prop.id] = prop;
        if (prop.units) {
            for (const unit of prop.units) {
                if (unitMap[unit.name]) {
                    // This unit name is already present, so it's a duplicate.
                    duplicateUnitNames.add(unit.name);
                } else {
                    unitMap[unit.name] = { unit, propertyId: prop.id };
                }
            }
        }
    });

    // Invalidate all duplicate unit names found.
    for (const unitName of duplicateUnitNames) {
        delete unitMap[unitName];
    }
    
    let totalUnitsUpdated = 0;
    const propertyUpdates: Record<string, Unit[]> = {}; // propertyId -> updated units array

    for (const [index, row] of data.entries()) {
        const {
            UnitName,
            Status,
            Ownership,
            UnitType,
            ManagementStatus,
            HandoverStatus,
            RentAmount,
            ServiceCharge,
        } = row;

        if (!UnitName) {
            errors.push(`Row ${index + 2}: Missing required column 'UnitName'.`);
            continue;
        }

        if (duplicateUnitNames.has(UnitName)) {
            errors.push(`Row ${index + 2}: Unit name "${UnitName}" is not unique across properties and cannot be updated automatically. Please update it manually.`);
            continue;
        }

        const unitInfo = unitMap[UnitName];

        if (!unitInfo) {
            errors.push(`Row ${index + 2}: Unit "${UnitName}" not found or is not unique.`);
            continue;
        }

        const { propertyId } = unitInfo;
        
        // Lazily copy the original units for a property only when we need to modify it.
        if (!propertyUpdates[propertyId]) {
            propertyUpdates[propertyId] = JSON.parse(JSON.stringify(properties[propertyId].units));
        }

        const unitsForProperty = propertyUpdates[propertyId];
        const unitIndex = unitsForProperty.findIndex((u:any) => u.name === UnitName);
        
        // This should always be found because of the map, but for safety:
        if (unitIndex === -1) {
            errors.push(`Row ${index + 2}: Internal error. Could not find unit "${UnitName}" in property ID "${propertyId}".`);
            continue;
        }

        const unitToUpdate = unitsForProperty[unitIndex];
        let unitWasUpdated = false;

        // Apply updates from CSV row...
        if (Status !== undefined && unitToUpdate.status !== Status) {
            if (!unitStatuses.includes(Status as any)) {
                errors.push(`Row ${index + 2}: Invalid Status "${Status}". Valid: ${unitStatuses.join(', ')}`);
            } else {
                unitToUpdate.status = Status as UnitStatus;
                unitWasUpdated = true;
            }
        }
        if (Ownership !== undefined && unitToUpdate.ownership !== Ownership) {
            if (!ownershipTypes.includes(Ownership as any)) {
                errors.push(`Row ${index + 2}: Invalid Ownership "${Ownership}". Valid: ${ownershipTypes.join(', ')}`);
            } else {
                unitToUpdate.ownership = Ownership as OwnershipType;
                unitWasUpdated = true;
            }
        }
        if (UnitType !== undefined && unitToUpdate.unitType !== UnitType) {
            if (!unitTypes.includes(UnitType as any)) {
                errors.push(`Row ${index + 2}: Invalid UnitType "${UnitType}". Valid: ${unitTypes.join(', ')}`);
            } else {
                unitToUpdate.unitType = UnitType as UnitType;
                unitWasUpdated = true;
            }
        }
        if (ManagementStatus !== undefined && unitToUpdate.managementStatus !== ManagementStatus) {
            if (!managementStatuses.includes(ManagementStatus as any)) {
                 errors.push(`Row ${index + 2}: Invalid ManagementStatus "${ManagementStatus}". Valid: ${managementStatuses.join(', ')}`);
            } else {
                unitToUpdate.managementStatus = ManagementStatus as ManagementStatus;
                unitWasUpdated = true;
            }
        }
        if (HandoverStatus !== undefined && unitToUpdate.handoverStatus !== HandoverStatus) {
            if (!handoverStatuses.includes(HandoverStatus as any)) {
                 errors.push(`Row ${index + 2}: Invalid HandoverStatus "${HandoverStatus}". Valid: ${handoverStatuses.join(', ')}`);
            } else {
                unitToUpdate.handoverStatus = HandoverStatus as HandoverStatus;
                unitWasUpdated = true;
            }
        }
        if (RentAmount !== undefined && String(unitToUpdate.rentAmount || '') !== RentAmount) {
            const rent = Number(RentAmount);
            if (isNaN(rent) || rent < 0) {
                errors.push(`Row ${index + 2}: Invalid RentAmount "${RentAmount}". Must be a non-negative number.`);
            } else {
                unitToUpdate.rentAmount = rent;
                unitWasUpdated = true;
            }
        }
        if (ServiceCharge !== undefined && String(unitToUpdate.serviceCharge || '') !== ServiceCharge) {
            const charge = Number(ServiceCharge);
            if (isNaN(charge) || charge < 0) {
                errors.push(`Row ${index + 2}: Invalid ServiceCharge "${ServiceCharge}". Must be a non-negative number.`);
            } else {
                unitToUpdate.serviceCharge = charge;
                unitWasUpdated = true;
            }
        }
        
        if (unitWasUpdated) {
            // Because we only copy when a property has an update, and only update if a field changes,
            // we can just increment a counter for each row that triggers an update.
            totalUnitsUpdated++;
        }
    }

    // A unit might be processed multiple times if it appears in multiple rows. 
    // To get a count of unique units updated, we can do this:
    const uniqueUpdatedUnitsCount = Object.values(propertyUpdates).reduce((acc, units) => {
        const originalUnits = properties[units[0].propertyId!].units;
        const updated = units.filter((u: Unit) => {
            const original = originalUnits.find(ou => ou.name === u.name);
            return JSON.stringify(u) !== JSON.stringify(original);
        });
        return acc + updated.length;
    }, 0);


    if (errors.length > 0) {
        return { updatedCount: 0, errors };
    }

    if (Object.keys(propertyUpdates).length > 0) {
        const batch = writeBatch(db);
        for (const propId in propertyUpdates) {
            const propertyRef = doc(db, 'properties', propId);
            batch.update(propertyRef, { units: propertyUpdates[propId] });
        }
        await batch.commit();
        await logActivity(`Bulk updated units via CSV.`);
    }

    return { updatedCount: Object.keys(propertyUpdates).length, errors: [] };
}



// Landlord Functions

export async function getCommunications(): Promise<Communication[]> {
    return getCollection<Communication>('communications');
}

export async function getFinancialDocuments(userId: string, role: UserRole): Promise<FinancialDocument[]> {
    let documents: FinancialDocument[] = [];

    // Logic for Landlords and Property Owners (View documents for all their units)
    if (role === 'landlord' || role === 'homeowner') {
        let associatedUnitNames: string[] = [];
        let associatedPropertyIds: string[] = [];

        if (role === 'landlord') {
            // Find landlord record linked to this user
            const allLandlords = await getLandlords();
            const landlord = allLandlords.find(l => l.email === userId || l.userId === userId); // Basic matching
            if (landlord) {
                const allProps = await getProperties();
                allProps.forEach(p => {
                    p.units.forEach(u => {
                        if (u.landlordId === landlord.id) {
                            associatedUnitNames.push(u.name);
                            if (!associatedPropertyIds.includes(p.id)) associatedPropertyIds.push(p.id);

                            // Logic: If unit is vacant and handed over, Landlord pays service charge
                            if (u.status === 'vacant' && u.handoverStatus === 'Handed Over') {
                                const scAmount = u.serviceCharge ?? (u.unitType === 'Studio' ? 2000 : u.unitType === 'One Bedroom' ? 3000 : u.unitType === 'Two Bedroom' ? 4000 : 0);
                                if (scAmount > 0) {
                                    const today = new Date();
                                    const currentPeriod = today.toLocaleDateString('default', { month: 'long', year: 'numeric' });

                                    // Generate a service charge document
                                    documents.push({
                                        id: `sc-landlord-${u.name}-${currentPeriod.replace(' ', '-')}`,
                                        type: 'Service Charge',
                                        date: today.toISOString(),
                                        amount: scAmount,
                                        title: `Service Charge (Vacant) - ${u.name}`,
                                        status: 'Pending',
                                        sourceData: {
                                            id: `sc-stmt-${u.name}-${Date.now()}`,
                                            tenantId: 'vacant',
                                            propertyId: p.id,
                                            unitName: u.name,
                                            period: currentPeriod,
                                            amount: scAmount,
                                            items: [{ description: 'Vacant Unit Service Charge', amount: scAmount }],
                                            date: today.toISOString(),
                                            status: 'Pending',
                                            createdAt: today
                                        } as ServiceChargeStatement
                                    });
                                }
                            }
                        }
                    });
                });
            }
        } else if (role === 'homeowner') {
            // Find property owner record
            const allOwners = await getPropertyOwners();
            const owner = allOwners.find(o => o.email === userId);
            if (owner) {
                owner.assignedUnits.forEach(au => {
                    au.unitNames.forEach(name => {
                        associatedUnitNames.push(name);
                        if (!associatedPropertyIds.includes(au.propertyId)) associatedPropertyIds.push(au.propertyId);
                    });
                });
            }
        }

        if (associatedUnitNames.length > 0) {
            // Fetch Tenants in these units to get their payments/bills
            const allTenants = await getTenants();
            const keyTenants = allTenants.filter(t =>
                associatedPropertyIds.includes(t.propertyId) && associatedUnitNames.includes(t.unitName)
            );
            const keyTenantIds = keyTenants.map(t => t.id);

            if (keyTenantIds.length > 0) {
                // Fetch Payments
                const paymentsSnapshot = await getDocs(query(collection(db, 'payments'), where('tenantId', 'in', keyTenantIds.slice(0, 30)))); // Limit 30 for 'in' query constraint
                const payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));

                documents.push(...payments.map(p => {
                    const t = keyTenants.find(kt => kt.id === p.tenantId);
                    return {
                        id: p.id,
                        type: 'Rent Receipt' as const,
                        date: p.date,
                        amount: p.amount,
                        title: `Rent Paid - ${t?.unitName} (${t?.name})`,
                        status: 'Paid' as const,
                        sourceData: p
                    };
                }));

                // Fetch Water Bills
                const waterSnapshot = await getDocs(query(collection(db, 'waterReadings'), where('tenantId', 'in', keyTenantIds.slice(0, 30))));
                const readings = waterSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterMeterReading));

                documents.push(...readings.map(r => {
                    const t = keyTenants.find(kt => kt.id === r.tenantId);
                    return {
                        id: r.id,
                        type: 'Water Bill' as const,
                        date: r.date,
                        amount: r.amount,
                        title: `Water Bill - ${t?.unitName}`,
                        status: 'Paid' as const,
                        sourceData: r
                    };
                }));
            }
        }
    }

    // Logic for Tenants (View their own documents)
    if (role === 'tenant') {
        const tenant = await getTenant(userId) || (await getTenants()).find(t => t.email === userId);

        if (tenant) {
            // 1. Fetch Payments (Rent Receipts)
            const paymentsQuery = query(collection(db, 'payments'), where('tenantId', '==', tenant.id));
            const paymentsSnapshot = await getDocs(paymentsQuery);
            const payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));

            documents.push(...payments.map(p => ({
                id: p.id,
                type: 'Rent Receipt' as const,
                date: p.date,
                amount: p.amount,
                title: `Rent Payment - ${new Date(p.date).toLocaleDateString('default', { month: 'short', year: 'numeric' })}`,
                status: 'Paid' as const,
                sourceData: p
            })));

            // 2. Fetch Water Meter Readings (Water Bills)
            const waterQuery = query(collection(db, 'waterReadings'), where('tenantId', '==', tenant.id));
            const waterSnapshot = await getDocs(waterQuery);
            const readings = waterSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WaterMeterReading));

            documents.push(...readings.map(r => ({
                id: r.id,
                type: 'Water Bill' as const,
                date: r.date,
                amount: r.amount,
                title: `Water Bill - ${new Date(r.date).toLocaleDateString('default', { month: 'short', year: 'numeric' })}`,
                status: 'Paid' as const,
                sourceData: r
            })));

            // 3. Mock Service Charge Statements
            if (tenant.lease.serviceCharge && tenant.lease.serviceCharge > 0) {
                for (let i = 0; i < 3; i++) {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    const period = d.toLocaleDateString('default', { month: 'long', year: 'numeric' });

                    const stmt: ServiceChargeStatement = {
                        id: `sc-${tenant.id}-${i}`,
                        tenantId: tenant.id,
                        propertyId: tenant.propertyId,
                        unitName: tenant.unitName,
                        period: period,
                        amount: tenant.lease.serviceCharge,
                        items: [{ description: 'General Maintenance', amount: tenant.lease.serviceCharge * 0.7 }, { description: 'Security', amount: tenant.lease.serviceCharge * 0.3 }],
                        date: d.toISOString(),
                        status: 'Paid',
                        createdAt: d
                    };

                    documents.push({
                        id: stmt.id,
                        type: 'Service Charge' as const,
                        date: stmt.date,
                        amount: stmt.amount,
                        title: `Service Charge - ${period}`,
                        status: 'Paid',
                        sourceData: stmt
                    });
                }
            }
        }
    }

    return documents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getLandlords(): Promise<Landlord[]> {
    return getCollection<Landlord>('landlords');
}

export async function getLandlord(landlordId: string): Promise<Landlord | null> {
    return getDocument<Landlord>('landlords', landlordId);
}

export async function addOrUpdateLandlord(landlord: Landlord, assignedUnitNames: string[]): Promise<void> {
    const landlordRef = doc(db, 'landlords', landlord.id);
    const batch = writeBatch(db);

    let finalLandlordData = { ...landlord };

    // --- Auth User & Profile Linking ---
    if (landlord.email && landlord.phone && !landlord.userId) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where("email", "==", landlord.email), limit(1));
        const userSnap = await getDocs(q);

        if (!userSnap.empty) {
            // User with this email already exists, link them.
            const existingUser = userSnap.docs[0];
            finalLandlordData.userId = existingUser.id;
            await setDoc(existingUser.ref, { role: 'landlord', landlordId: landlord.id }, { merge: true });
        } else {
            // No user exists, create a new one.
            const appName = 'landlord-creation-app-' + Date.now();
            let secondaryApp;
            try {
                secondaryApp = initializeApp(firebaseConfig, appName);
                const secondaryAuth = getAuth(secondaryApp);
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, landlord.email, landlord.phone);
                const userId = userCredential.user.uid;
                finalLandlordData.userId = userId;

                await createUserProfile(userId, landlord.email, 'landlord', { name: landlord.name, landlordId: landlord.id });
                await logActivity(`Created landlord user: ${landlord.email}`);
            } catch (error: any) {
                console.error("Error creating landlord auth user:", error);
                if (error.code !== 'auth/email-already-in-use') {
                    throw new Error("Failed to create landlord login credentials.");
                }
            } finally {
                if (secondaryApp) await deleteApp(secondaryApp);
            }
        }
    }
    // --- End Auth Logic ---

    // Set/update the landlord document itself
    batch.set(landlordRef, finalLandlordData, { merge: true });

    const properties = await getProperties();
    for (const prop of properties) {
        let needsUpdate = false;
        const newUnits = prop.units.map(unit => {
            let newUnit = { ...unit };
            // Case 1: This unit is in the new list of assignments for the current landlord
            if (assignedUnitNames.includes(unit.name)) {
                if (unit.landlordId !== landlord.id) {
                    needsUpdate = true;
                    newUnit.landlordId = landlord.id;
                }
            }
            // Case 2: This unit is NOT in the new list, but IS currently assigned to this landlord
            else if (unit.landlordId === landlord.id) {
                needsUpdate = true;
                delete (newUnit as Partial<Unit>).landlordId;
            }
            return newUnit;
        });

        if (needsUpdate) {
            const propRef = doc(db, 'properties', prop.id);
            batch.update(propRef, { units: newUnits });
        }
    }

    await batch.commit();
    await logActivity(`Updated landlord and assignments for: ${landlord.name}`);
}


export async function addLandlordsFromCSV(data: { name: string; email: string; phone: string; bankAccount: string }[]): Promise<{ added: number; skipped: number }> {
    const landlordsRef = collection(db, 'landlords');
    const batch = writeBatch(db);
    let added = 0;
    let skipped = 0;

    const existingLandlordsSnap = await getDocs(query(landlordsRef));
    const existingEmails = new Set(existingLandlordsSnap.docs.map(doc => doc.data().email));

    for (const landlordData of data) {
        if (!landlordData.email || existingEmails.has(landlordData.email)) {
            skipped++;
            continue;
        }

        const newLandlordRef = doc(landlordsRef);
        const landlordWithId = {
            ...landlordData,
            id: newLandlordRef.id,
        };

        batch.set(newLandlordRef, landlordWithId);
        existingEmails.add(landlordData.email);
        added++;
    }

    await batch.commit();
    if (added > 0) {
        await logActivity(`Bulk added ${added} landlords via CSV.`);
    }
    return { added, skipped };
}

// Property Owner (Client) Functions
export async function getPropertyOwners(): Promise<PropertyOwner[]> {
    return getCollection<PropertyOwner>('propertyOwners');
}

export async function getPropertyOwner(ownerId: string): Promise<PropertyOwner | null> {
    return getDocument<PropertyOwner>('propertyOwners', ownerId);
}

export async function updatePropertyOwner(
    ownerId: string,
    data: Partial<PropertyOwner> & { email: string; phone: string; name: string }
): Promise<void> {
    const ownerRef = doc(db, 'propertyOwners', ownerId);
    let userId = data.userId;

    if (data.email && data.phone && !userId) {
        const appName = 'owner-creation-app-' + Date.now();
        let secondaryApp;
        try {
            secondaryApp = initializeApp(firebaseConfig, appName);
        } catch (e) {
            secondaryApp = getApp(appName);
        }

        const secondaryAuth = getAuth(secondaryApp);
        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.phone);
            userId = userCredential.user.uid;

            await createUserProfile(userId, data.email, 'homeowner', {
                name: data.name,
                propertyOwnerId: ownerId,
            });
            await logActivity(`Created property owner user: ${data.email}`);
        } catch (error: any) {
            if (error.code !== 'auth/email-already-in-use') {
                console.error("Error creating property owner auth user:", error);
                throw new Error("Failed to create property owner login credentials.");
            } else {
                console.log("Email for property owner already in use, skipping auth creation.");
            }
        } finally {
            if (secondaryApp) {
                await deleteApp(secondaryApp);
            }
        }
    }

    const finalData = { ...data, userId: userId || data.userId };

    await setDoc(ownerRef, finalData, { merge: true });
    await logActivity(`Updated property owner details: ${data.name || ownerId}`);
}

export async function getLandlordPropertiesAndUnits(landlordId: string): Promise<{ property: Property, units: Unit[] }[]> {
    const allProperties = await getProperties();
    const result: { property: Property, units: Unit[] }[] = [];

    allProperties.forEach(p => {
        const units = p.units.filter(u => u.landlordId === landlordId || (p.landlordId === landlordId));
        if (units.length > 0) {
            result.push({ property: p, units: units });
        }
    });

    return result;
}

export async function getAllPayments(): Promise<Payment[]> {
    return getCollection<Payment>('payments');
}

export async function addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<void> {
    await addDoc(collection(db, 'tasks'), {
        ...task,
        createdAt: serverTimestamp(),
    });
    await logActivity(`Created task: ${task.title}`);
}

export async function getTasks(): Promise<Task[]> {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'asc')); // FIFO
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        const createdAt = data.createdAt;
        return {
            id: doc.id,
            ...data,
            createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : createdAt
        } as Task;
    });
}

// Real-time listener functions
export function listenToProperties(callback: (properties: Property[]) => void): () => void {
    const q = query(collection(db, 'properties'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const properties = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
        callback(properties);
    }, (error) => {
        console.error("Error listening to properties:", error);
    });
    return unsubscribe;
}

export function listenToTenants(callback: (tenants: Tenant[]) => void): () => void {
    const q = query(collection(db, 'tenants'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const tenants = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tenant));
        callback(tenants);
    }, (error) => {
        console.error("Error listening to tenants:", error);
    });
    return unsubscribe;
}

export function listenToMaintenanceRequests(callback: (requests: MaintenanceRequest[]) => void): () => void {
    const q = query(collection(db, 'maintenanceRequests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const requests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
        callback(requests);
    }, (error) => {
        console.error("Error listening to maintenance requests:", error);
    });
    return unsubscribe;
}

export function listenToPayments(callback: (payments: Payment[]) => void): () => void {
    const q = query(collection(db, 'payments'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const payments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
        callback(payments);
    }, (error) => {
        console.error("Error listening to payments:", error);
    });
    return unsubscribe;
}

export function listenToTasks(callback: (tasks: Task[]) => void): () => void {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const tasks = querySnapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt;
            return { 
                id: doc.id, 
                ...data,
                createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : createdAt
            } as Task;
        });
        callback(tasks);
    }, (error) => {
        console.error("Error listening to tasks:", error);
    });
    return unsubscribe;
}




    








