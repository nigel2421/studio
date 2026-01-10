
import type { Property, Tenant, MaintenanceRequest, Unit, ArchivedTenant, UserProfile } from '@/lib/types';
import { db } from './firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, setDoc, serverTimestamp, orderBy } from 'firebase/firestore';

async function getCollection<T>(collectionName: string): Promise<T[]> {
  const querySnapshot = await getDocs(collection(db, collectionName));
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
  return getCollection<Property>('properties');
}

export async function getTenants(): Promise<Tenant[]> {
    const q = query(collection(db, "tenants"), where("status", "!=", "archived"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tenant));
}

export async function getArchivedTenants(): Promise<ArchivedTenant[]> {
    const q = query(collection(db, "tenants"), where("status", "==", "archived"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ArchivedTenant));
}

export async function getMaintenanceRequests(): Promise<MaintenanceRequest[]> {
    return getCollection<MaintenanceRequest>('maintenanceRequests');
}

export async function getProperty(id: string): Promise<Property | null> {
    return getDocument<Property>('properties', id);
}

export async function getTenant(id: string): Promise<Tenant | null> {
    return getDocument<Tenant>('tenants', id);
}

export async function addTenant(tenant: Omit<Tenant, 'id' | 'lease' | 'status'>): Promise<void> {
    const newTenantData = {
        ...tenant,
        status: 'active' as const,
        lease: {
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
            rent: tenant.rent || 0,
            paymentStatus: 'Pending' as const
        }
    };
    await addDoc(collection(db, 'tenants'), newTenantData);
    const property = await getProperty(tenant.propertyId);
    if (property && property.units) {
        const updatedUnits = property.units.map(unit => 
            unit.name === tenant.unitName ? { ...unit, status: 'rented' } : unit
        );
        const propertyRef = doc(db, 'properties', tenant.propertyId);
        await updateDoc(propertyRef, { units: updatedUnits });
    }
}

export async function addProperty(property: Omit<Property, 'id' | 'units' | 'imageId'> & { units: string }): Promise<void> {
    const { units, ...propertyData } = property;
    const unitArray = units.split(',')
        .map(name => name.trim())
        .filter(name => name)
        .map(name => ({ name, status: 'vacant' as const, managementType: 'owner' as const }));
    const imageId = Math.floor(Math.random() * 3 + 1).toString();
    await addDoc(collection(db, 'properties'), { ...propertyData, units: unitArray, imageId: `property-${imageId}` });
}

export async function updateProperty(propertyId: string, propertyData: Partial<Property>): Promise<void> {
    const propertyRef = doc(db, 'properties', propertyId);
    await updateDoc(propertyRef, propertyData);
}

export async function archiveTenant(tenantId: string): Promise<void> {
    const tenant = await getTenant(tenantId);
    if (tenant) {
        const tenantRef = doc(db, 'tenants', tenantId);
        await updateDoc(tenantRef, { 
            status: 'archived',
            archivedAt: new Date().toISOString()
        });

        const property = await getProperty(tenant.propertyId);
        if (property && property.units) {
            const updatedUnits = property.units.map(unit =>
                unit.name === tenant.unitName ? { ...unit, status: 'vacant' } : unit
            );
            const propertyRef = doc(db, 'properties', tenant.propertyId);
            await updateDoc(propertyRef, { units: updatedUnits });
        }
    }
}

export async function updateTenant(tenantId: string, tenantData: Partial<Tenant>): Promise<void> {
    const oldTenant = await getTenant(tenantId);
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, tenantData);

    if (oldTenant && (oldTenant.propertyId !== tenantData.propertyId || oldTenant.unitName !== tenantData.unitName)) {
        const oldProperty = await getProperty(oldTenant.propertyId);
        if (oldProperty && oldProperty.units) {
            const updatedOldUnits = oldProperty.units.map(unit =>
                unit.name === oldTenant.unitName ? { ...unit, status: 'vacant' } : unit
            );
            const oldPropertyRef = doc(db, 'properties', oldTenant.propertyId);
            await updateDoc(oldPropertyRef, { units: updatedOldUnits });
        }

        if (tenantData.propertyId && tenantData.unitName) {
            const newProperty = await getProperty(tenantData.propertyId);
            if (newProperty && newProperty.units) {
                const updatedNewUnits = newProperty.units.map(unit =>
                    unit.name === tenantData.unitName ? { ...unit, status: 'rented' } : unit
                );
                const newPropertyRef = doc(db, 'properties', tenantData.propertyId);
                await updateDoc(newPropertyRef, { units: updatedNewUnits });
            }
        }
    }
}

export async function createUserProfile(userId: string, email: string, role: UserProfile['role'] = 'viewer', tenantId?: string, propertyId?: string, name?: string) {
    const userProfileRef = doc(db, 'users', userId);
    await setDoc(userProfileRef, {
        email,
        role,
        tenantId,
        propertyId,
        name
    });
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    const userProfileRef = doc(db, 'users', userId);
    const docSnap = await getDoc(userProfileRef);
    if (docSnap.exists()) {
        const userProfile = { id: docSnap.id, ...docSnap.data() } as UserProfile;
        if (userProfile.role === 'tenant' && userProfile.tenantId) {
            const tenantData = await getTenant(userProfile.tenantId);
            if (tenantData) {
                userProfile.tenantDetails = tenantData;
            }
        }
        return userProfile;
    }
    return null;
}

export async function addMaintenanceRequest(request: Omit<MaintenanceRequest, 'id' | 'date' | 'status'>) {
    await addDoc(collection(db, 'maintenanceRequests'), {
        ...request,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
        status: 'New',
    });
}

export async function getTenantMaintenanceRequests(tenantId: string): Promise<MaintenanceRequest[]> {
    const q = query(
        collection(db, "maintenanceRequests"), 
        where("tenantId", "==", tenantId),
        orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRequest));
}
