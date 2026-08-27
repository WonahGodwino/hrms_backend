// src/app/lib/crypto/mailSecret.ts
//
// AES-256-GCM helper for storing per-company mailbox passwords at rest
// (backend/prisma/schema.prisma: OfferLetterMailConfig.smtpPasswordEncrypted
// / imapPasswordEncrypted). Nothing else in this codebase encrypts secrets
// at rest, so this is deliberately self-contained rather than a generic
// "secrets" abstraction — offer-letter mail config is the only consumer.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended nonce length for GCM

function getKey(): Buffer {
	const raw = process.env.OFFER_LETTER_MAIL_CONFIG_KEY;
	if (!raw) {
		throw new Error('OFFER_LETTER_MAIL_CONFIG_KEY is not configured — cannot encrypt/decrypt mailbox credentials.');
	}
	const key = Buffer.from(raw, 'base64');
	if (key.length !== 32) {
		throw new Error('OFFER_LETTER_MAIL_CONFIG_KEY must decode to exactly 32 bytes (base64-encoded AES-256 key).');
	}
	return key;
}

// Stored format: "<iv>:<authTag>:<ciphertext>", each segment base64.
export function encryptMailSecret(plain: string): string {
	const key = getKey();
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptMailSecret(stored: string): string {
	const key = getKey();
	const [ivB64, authTagB64, ciphertextB64] = stored.split(':');
	if (!ivB64 || !authTagB64 || !ciphertextB64) {
		throw new Error('Stored mailbox secret is malformed.');
	}
	const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
	decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
	const plain = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
	return plain.toString('utf8');
}
