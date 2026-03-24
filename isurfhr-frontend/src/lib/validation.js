/**
 * Validates the leave application form data
 * @param {Object} formData - The form state object
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.requireMedicalForSick=false] - Whether medical cert is required for sick leave
 * @returns {{ isValid: boolean, errors: Object, firstErrorField?: string }}
 */
export const validateLeaveApplication = (formData, options = {}) => {
	const errors = {};
	let firstErrorField = null;

	const addError = (field, message) => {
		if (!errors[field]) {
			errors[field] = message;
			if (!firstErrorField) firstErrorField = field;
		}
	};

	// ───────────────────────────────────────
	// Required fields
	// ───────────────────────────────────────
	if (!formData.leaveTypeId?.trim()) {
		addError('leaveTypeId', 'Leave type is required');
	}

	if (!formData.startDate) {
		addError('startDate', 'Start date is required');
	}

	if (!formData.endDate) {
		addError('endDate', 'End date is required');
	}

	if (formData.startDate && formData.endDate) {
		const start = new Date(formData.startDate);
		const end = new Date(formData.endDate);

		if (end < start) {
			addError('endDate', 'End date cannot be before start date');
		}

		// Optional: prevent same-day full-day leave (depending on policy)
		// if (end.toDateString() === start.toDateString() && !formData.isHalfDay) {
		//   addError('endDate', 'For same-day leave, please use half-day option');
		// }
	}

	if (!formData.reason?.trim()) {
		addError('reason', 'Reason is required');
	} else if (formData.reason.trim().length < 10) {
		addError('reason', 'Reason must be at least 10 characters');
	} else if (formData.reason.trim().length > 500) {
		addError('reason', 'Reason cannot exceed 500 characters');
	}

	// ───────────────────────────────────────
	// Conditional / Optional fields
	// ───────────────────────────────────────
	if (formData.isHalfDay) {
		if (!formData.halfDayPart) {
			addError('halfDayPart', 'Please select which half of the day');
		}
		// If half-day → start and end should be same day (optional strict check)
		if (formData.startDate && formData.endDate) {
			const start = new Date(formData.startDate);
			const end = new Date(formData.endDate);
			if (start.toDateString() !== end.toDateString()) {
				addError('endDate', 'Half-day leave must start and end on the same day');
			}
		}
	}

	// Emergency contact – optional but if provided, phone should look valid
	if (formData.emergencyContact?.trim() && !formData.contactPhone?.trim()) {
		addError('contactPhone', 'Contact phone is required when emergency contact is provided');
	}

	if (formData.contactPhone?.trim()) {
		const phone = formData.contactPhone.trim();
		// Very basic phone validation (can be improved with lib like libphonenumber-js)
		if (!/^\+?\d{7,15}$/.test(phone.replace(/\s/g, ''))) {
			addError('contactPhone', 'Please enter a valid phone number');
		}
	}

	// Handover – optional but consistent
	if (formData.handoverTo?.trim() && !formData.handoverNotes?.trim()) {
		addError('handoverNotes', 'Handover notes are recommended when handing over to someone');
	}

	// ───────────────────────────────────────
	// Medical Certificate – conditional logic
	// ───────────────────────────────────────
	const isSickLeave = formData.leaveTypeId === 'sick';

	if (isSickLeave && options.requireMedicalForSick) {
		if (!formData.medicalCertificateNumber?.trim()) {
			addError('medicalCertificateNumber', 'Medical certificate number is required for sick leave');
		}
		if (!formData.medicalCertificateDate) {
			addError('medicalCertificateDate', 'Issue date is required for medical certificate');
		}
		if (!formData.medicalCertificateIssuer?.trim()) {
			addError('medicalCertificateIssuer', 'Issuer is required for medical certificate');
		}
	}

	// If any medical field is filled → all should be filled (consistency)
	const hasAnyMedical = formData.medicalCertificateNumber?.trim() || formData.medicalCertificateDate || formData.medicalCertificateIssuer?.trim();

	if (hasAnyMedical) {
		if (!formData.medicalCertificateNumber?.trim()) {
			addError('medicalCertificateNumber', 'Certificate number is required');
		}
		if (!formData.medicalCertificateDate) {
			addError('medicalCertificateDate', 'Issue date is required');
		}
		if (!formData.medicalCertificateIssuer?.trim()) {
			addError('medicalCertificateIssuer', 'Issuer is required');
		}
	}

	const isValid = Object.keys(errors).length === 0;

	return {
		isValid,
		errors,
		firstErrorField, // useful for focusing the first invalid field
	};
};
