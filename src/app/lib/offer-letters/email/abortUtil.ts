// src/app/lib/offer-letters/email/abortUtil.ts
//
// ImapFlow's client.connect() has no built-in cancellation — it just runs
// until it succeeds or hits its own connectionTimeout/greetingTimeout
// (~15-20s each). Without this wrapper, clicking "Stop" during the
// SUPER_ADMIN cross-company scan (pollAllOfferLetterMailboxes) has no
// effect until whichever connect() is currently in flight finishes on its
// own — and that scan opens up to 3 connections per company (Sent-folder
// resolve + INBOX + SENT), so a single unreachable/slow mailbox can make
// "Stop" look completely broken for a minute or more. Racing the connect
// against the AbortSignal makes a stop request take effect within
// milliseconds instead of waiting out the connection timeout.
export function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) return Promise.reject(new AbortedError());

	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new AbortedError());
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(err) => {
				signal.removeEventListener('abort', onAbort);
				reject(err);
			}
		);
	});
}

export class AbortedError extends Error {
	constructor() {
		super('Stopped by user');
		this.name = 'AbortedError';
	}
}

export function isAbortedError(err: unknown): boolean {
	return err instanceof AbortedError;
}
