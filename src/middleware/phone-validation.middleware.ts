import { config } from '../config/env.config';

export function validatePhoneNumber(phoneNumber: string): boolean {
  // Validate phone number format (should be numeric and reasonable length)
  if (!/^\d{10,15}$/.test(phoneNumber)) {
    return false;
  }
  
  // Check if phone number matches DEFAULT_PHONE_NUMBER
  const normalizedPhone = phoneNumber.replace(/[+\s-]/g, '');
  const normalizedDefault = config.defaultPhoneNumber.replace(/[+\s-]/g, '');
  
  return normalizedPhone === normalizedDefault;
}

export function normalizePhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/[+\s-]/g, '');
}
