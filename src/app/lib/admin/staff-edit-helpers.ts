// Helpers for app/api/admin/staff/edit/[id]/route.ts (CODE-004: moved out of the route file).
import validator from 'validator'

export function isOptionalZero(value: unknown): boolean {
	return value === 0 || value === '0';
}

export function sanitizeEmail(email: string): string {
	// Normalize email, remove invalid characters, and escape
	const normalized =
		validator.normalizeEmail(email, {
			gmail_remove_dots: false,
			gmail_remove_subaddress: false,
			outlookdotcom_remove_subaddress: false,
			yahoo_remove_subaddress: false,
			icloud_remove_subaddress: false,
		}) || email;

	return validator.escape(validator.stripLow(normalized.trim()));
}

export function sanitizeBankAccount(account: string | null): string | null {
	if (!account) return null;
	// Remove all non-numeric characters
	const cleaned = account.replace(/\D/g, '');
	// Basic validation for account numbers (usually 10-20 digits)
	if (cleaned.length < 8 || cleaned.length > 20) {
		return null;
	}
	return cleaned;
}

export function sanitizeBVN(bvn: string | null): string | null {
	if (!bvn) return null;
	// Remove all non-numeric characters
	const cleaned = bvn.replace(/\D/g, '');
	// BVN should be 11 digits
	if (cleaned.length !== 11) {
		return null;
	}
	return cleaned;
}

export function sanitizeEncodedId(encodedId: string | null): string | null {
	if (!encodedId) return null;
	// Allow alphanumeric and some special characters, but escape HTML
	const cleaned = encodedId.replace(/[^a-zA-Z0-9\-_]/g, '');
	return validator.escape(cleaned.trim());
}
