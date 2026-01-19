
import { initializeApp, getApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import {
    Property, Unit, WaterMeterReading, Payment, Tenant,
    ArchivedTenant, MaintenanceRequest, UserProfile, Log, Landlord,
    UserRole, UnitStatus, PropertyOwner, FinancialDocument, ServiceChargeStatement, Communication
} from '@/lib/types';
import { db, firebaseConfig, sendPaymentReceipt } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, setDoc, serverTimestamp, arrayUnion, writeBatch, orderBy, deleteDoc, limit } from 'firebase/firestore';
import propertiesData from '../../backend.json';
import { auth } from './firebase';

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
    return Promise.resolve(propertiesData.properties as Property[]);
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
    const property = propertiesData.properties.find(p => p.id === id);
    return Promise.resolve(property as Property || null);
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

export async function addTenant({
    name,
    email,
    phone,
    idNumber,
    propertyId,
    unitName,
    agent,
    rent,
    securityDeposit
}: Omit<Tenant, 'id' | 'status' | 'lease'> & { rent: number; securityDeposit: number }): Promise<void> {

    const newTenantData = {
        name,
        email,
        phone,
        idNumber,
        propertyId,
        unitName,
        agent,
        status: 'active' as const,
        lease: {
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
            rent: rent || 0,
            paymentStatus: 'Pending' as const
        },
        securityDeposit: securityDeposit || 0,
    };
    const tenantDocRef = await addDoc(collection(db, 'tenants'), newTenantData);

    await logActivity(`Created tenant: ${name} (${email})`);

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

        // Determine role based on residentType (default to tenant)
        const role: UserRole = (newTenantData as any).residentType === 'Homeowner' ? 'homeowner' : 'tenant';

        await createUserProfile(user.uid, user.email || email, role, {
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
    console.log("Adding properties is not fully supported when using local JSON data.");
}

export async function updateProperty(propertyId: string, data: Partial<Property>): Promise<void> {
    const propertyIndex = propertiesData.properties.findIndex(p => p.id === propertyId);

    if (propertyIndex !== -1) {
        const propertyToUpdate = propertiesData.properties[propertyIndex] as unknown as Property;

        // Update top-level fields
        if (data.name) propertyToUpdate.name = data.name;
        if (data.address) propertyToUpdate.address = data.address;
        if (data.type) propertyToUpdate.type = data.type;

        // Update units
        if (data.units) {
            propertyToUpdate.units = data.units.map(updatedUnit => {
                const existingUnit = propertyToUpdate.units.find(u => u.name === updatedUnit.name);
                const finalUnit = { ...existingUnit, ...updatedUnit };

                if (finalUnit.landlordId === 'none') {
                    delete finalUnit.landlordId;
                }

                return finalUnit;
            }) as Unit[];
        }

        propertiesData.properties[propertyIndex] = propertyToUpdate;

        await logActivity(`Updated property: ${data.name || propertyToUpdate.name}`);
    } else {
        console.error("Could not find property to update with ID:", propertyId);
    }
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

        await logActivity(`Archived tenant: ${tenant.name}`);
        console.log(`Unit ${tenant.unitName} in property ${tenant.propertyId} should be marked as vacant.`);
    }
}

export async function updateTenant(tenantId: string, tenantData: Partial<Tenant>): Promise<void> {
    const oldTenant = await getTenant(tenantId);
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, tenantData);

    await logActivity(`Updated tenant: ${tenantData.name || oldTenant?.name}`);

    if (oldTenant && (oldTenant.propertyId !== tenantData.propertyId || oldTenant.unitName !== tenantData.unitName)) {
        console.log(`Unit ${oldTenant.unitName} in property ${oldTenant.propertyId} should be marked as vacant.`);
        if (tenantData.propertyId && tenantData.unitName) {
            console.log(`Unit ${tenantData.unitName} in property ${tenantData.propertyId} should be marked as rented.`);
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
            const landlord = await getLandlord(userProfile.landlordId);
            if (landlord) {
                const landlordProperties: { property: Property, units: Unit[] }[] = [];
                allProperties.forEach(p => {
                    const units = p.units.filter(u => u.landlordId === landlord.id);
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
        date: new Date().toISOString().split('T')[0],
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

export async function addPayment(paymentData: Omit<Payment, 'id' | 'createdAt'>) {
    const tenantRef = doc(db, 'tenants', paymentData.tenantId);
    const tenantSnap = await getDoc(tenantRef);

    if (!tenantSnap.exists()) {
        throw new Error("Tenant not found");
    }

    const tenant = tenantSnap.data() as Tenant;

    const payment = {
        ...paymentData,
        createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, 'payments'), payment);
    await logActivity(`Added payment of ${paymentData.amount} for tenant ${tenant.name}`);

    // Update lease payment status
    let newLeaseData = {};
    if (tenant.lease && payment.amount >= tenant.lease.rent) {
        newLeaseData = {
            'lease.paymentStatus': 'Paid',
            'lease.lastPaymentDate': paymentData.date,
        };
    }
    await updateDoc(tenantRef, newLeaseData);

    // Send receipt email
    const property = await getProperty(tenant.propertyId);
    try {
        const result = await sendPaymentReceipt({
            tenantEmail: tenant.email,
            tenantName: tenant.name,
            amount: paymentData.amount,
            date: paymentData.date,
            propertyName: property?.name || 'N/A',
            unitName: tenant.unitName,
            notes: paymentData.notes,
        });

        // Log on successful call
        await logActivity(`Sent payment receipt to ${tenant.name} (${tenant.email})`);

    } catch (error) {
        console.error("Failed to send receipt email via cloud function:", error);
        // We don't throw here because the payment was still successful.
        // We should log this to a more robust monitoring service in a real app.
    }


    const updatedTenantSnap = await getDoc(tenantRef);
    const updatedTenant = updatedTenantSnap.data() as Tenant;
    if (updatedTenant.lease && updatedTenant.lease.lastPaymentDate) {
        const lastPayment = new Date(updatedTenant.lease.lastPaymentDate);
        const today = new Date();

        if (lastPayment.getMonth() !== today.getMonth() || lastPayment.getFullYear() !== today.getFullYear()) {
            const newStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
            const newEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);

            if (updatedTenant.lease.paymentStatus === 'Paid') {
                await updateDoc(tenantRef, {
                    'lease.paymentStatus': 'Pending',
                    'lease.startDate': newStartDate.toISOString().split('T')[0],
                    'lease.endDate': newEndDate.toISOString().split('T')[0],
                });
            }
        }
    }
}

export async function updateUnitTypesFromCSV(data: { PropertyName: string; UnitName: string; UnitType: string }[]): Promise<number> {
    console.log("Updating from CSV is not fully supported when using local JSON data.");
    return 0;
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
                // In a real app we'd query properties where landlordId matches. 
                // For now, we'll scan properties for units assigned to this landlord.
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

export async function updateLandlord(
    landlordId: string,
    data: Partial<Landlord>,
    propertyId: string,
    assignedUnits: string[]
): Promise<void> {
    const landlordRef = doc(db, 'landlords', landlordId);
    let userId = data.userId;

    // Create auth user if email and phone are provided and user doesn't exist
    if (data.email && data.phone && !userId) {
        const appName = 'landlord-creation-app-' + data.email;
        let secondaryApp;
        try {
            secondaryApp = getApp(appName);
        } catch (e) {
            secondaryApp = initializeApp(firebaseConfig, appName);
        }

        const secondaryAuth = getAuth(secondaryApp);
        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.phone);
            userId = userCredential.user.uid;

            await createUserProfile(userId, data.email, 'landlord', { name: data.name, landlordId: landlordId });
            await logActivity(`Created landlord user: ${data.email}`);
        } catch (error: any) {
            console.error("Error creating landlord auth user:", error);
            if (error.code !== 'auth/email-already-in-use') {
                throw new Error("Failed to create landlord login credentials.");
            }
            // If email is in use, we should try to find the user and link them if they are not already.
            // This part is complex and is omitted for now for simplicity.
        } finally {
            if (secondaryApp) {
                await deleteApp(secondaryApp);
            }
        }
    }

    const finalData = { ...data };
    if (userId) {
        finalData.userId = userId;
    }

    await setDoc(landlordRef, finalData, { merge: true });

    // Update the in-memory property data to reflect unit assignments.
    const propertyIndex = propertiesData.properties.findIndex(p => p.id === propertyId);
    if (propertyIndex !== -1) {
        const propertyToUpdate = propertiesData.properties[propertyIndex] as unknown as Property;

        propertyToUpdate.units.forEach((unit: any) => {
            // If the unit is now selected for this landlord, assign it.
            if (assignedUnits.includes(unit.name)) {
                unit.landlordId = landlordId;
            }
            // If the unit was previously assigned to this landlord but is no longer selected, un-assign it.
            else if (unit.landlordId === landlordId) {
                delete (unit as Partial<Unit>).landlordId;
            }
        });

        propertiesData.properties[propertyIndex] = propertyToUpdate;
    } else {
        console.error(`Could not find property with ID ${propertyId} to assign units.`);
    }

    await logActivity(`Updated landlord details for: ${data.name || 'ID ' + landlordId}`);
}

export async function addLandlordsFromCSV(data: { name: string; email: string; phone: string; bankAccount: string }[]): Promise<{ added: number; skipped: number }> {
    const landlordsRef = collection(db, 'landlords');
    const batch = writeBatch(db);
    let added = 0;
    let skipped = 0;

    // Get all existing emails to avoid querying in a loop
    const existingLandlordsSnap = await getDocs(query(landlordsRef));
    const existingEmails = new Set(existingLandlordsSnap.docs.map(doc => doc.data().email));

    for (const landlordData of data) {
        if (!landlordData.email || existingEmails.has(landlordData.email)) {
            // Skip existing landlords or rows without an email to prevent duplicates/errors
            skipped++;
            continue;
        }

        const newLandlordRef = doc(landlordsRef); // Auto-generates an ID
        const landlordWithId = {
            ...landlordData,
            id: newLandlordRef.id,
        };

        batch.set(newLandlordRef, landlordWithId);
        existingEmails.add(landlordData.email); // Add to set to handle duplicates within the same CSV
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
        // Logic: Find units that have this landlordId
        // If property has landlordId, include all units unless they have a different landlordId (which is rare but possible)
        // Or if unit specifically has this landlordId

        const units = p.units.filter(u => u.landlordId === landlordId || (p.landlordId === landlordId));

        if (units.length > 0) {
            result.push({
                property: p,
                units: units
            });
        }
    });

    return result;
}

export async function getAllPayments(): Promise<Payment[]> {
    return getCollection<Payment>('payments');
}
