'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Property } from '@/lib/types';
import { parseFloorFromUnitName } from '@/lib/parseFloorFromUnitName';

export function useUnitFilter(properties: Property[]) {
  const [selectedProperty, setSelectedProperty] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');

  const floors = useMemo(() => {
    if (!selectedProperty) return [];
    const property = properties.find(p => p.id === selectedProperty);
    if (!property || !property.units) return [];

    const floorSet = new Set<string>();
    property.units.forEach(unit => {
      const floor = parseFloorFromUnitName(unit.name);
      if (floor) {
        floorSet.add(floor);
      }
    });
    
    return Array.from(floorSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [selectedProperty, properties]);

  const unitsOnFloor = useMemo(() => {
    if (!selectedFloor) return [];
    const property = properties.find(p => p.id === selectedProperty);
    if (!property || !property.units) return [];

    return property.units.filter(unit => {
      const floor = parseFloorFromUnitName(unit.name);
      return floor === selectedFloor;
    });
  }, [selectedFloor, selectedProperty, properties]);

  // Reset floor and unit when property or properties list changes
  useEffect(() => {
    setSelectedFloor('');
    setSelectedUnit('');
  }, [selectedProperty, properties]);

  // Reset unit when floor or floor list changes
  useEffect(() => {
    setSelectedUnit('');
  }, [selectedFloor, floors]);

  return {
    selectedProperty,
    setSelectedProperty,
    selectedFloor,
    setSelectedFloor,
    selectedUnit,
    setSelectedUnit,
    floors,
    unitsOnFloor,
  };
}
