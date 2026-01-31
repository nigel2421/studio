'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Property } from '@/lib/types';

const parseFloorFromUnitName = (unitName: string): string | null => {
  // Regex to extract floor number from formats like A101, B1201, C-905, etc.
  // Assumes the floor number is the digit(s) before the last two digits of the number part.
  const match = unitName.match(/(\d+)/); // Find the first number sequence
  if (match && match[1]) {
    const numberPart = match[1];
    if (numberPart.length > 2) {
      // Assumes last two digits are unit number, the rest is floor.
      return numberPart.slice(0, numberPart.length - 2);
    }
    // If number is 1-2 digits, assume it's the floor number itself (e.g. from 'A-9')
    if (numberPart.length > 0) {
      return numberPart;
    }
  }
  return null;
};


export function useUnitFilter(properties: Property[]) {
  const [selectedProperty, setSelectedProperty] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');

  const floors = useMemo(() => {
    if (!selectedProperty) return [];
    const property = properties.find(p => p.id === selectedProperty);
    if (!property) return [];

    const floorSet = new Set<string>();
    property.units.forEach(unit => {
      const floor = parseFloorFromUnitName(unit.name);
      if (floor) {
        floorSet.add(floor);
      }
    });
    
    return Array.from(floorSet).sort((a, b) => parseInt(a) - parseInt(b));
  }, [selectedProperty, properties]);

  const unitsOnFloor = useMemo(() => {
    if (!selectedFloor) return [];
    const property = properties.find(p => p.id === selectedProperty);
    if (!property) return [];

    return property.units.filter(unit => {
      const floor = parseFloorFromUnitName(unit.name);
      return floor === selectedFloor;
    });
  }, [selectedFloor, selectedProperty, properties]);

  // Reset floor and unit when property changes
  useEffect(() => {
    setSelectedFloor('');
    setSelectedUnit('');
  }, [selectedProperty]);

  // Reset unit when floor changes
  useEffect(() => {
    setSelectedUnit('');
  }, [selectedFloor]);

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
