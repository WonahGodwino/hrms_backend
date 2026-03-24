import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

export const TEMPLATE_LABEL_MAP = {
	ISURF_STANDARD: 'ISURF_STANDARD',
	BLUERIDGE: 'BLUERIDGE',
};
