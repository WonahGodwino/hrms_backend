// Keyed per company — a single global lock would mean one company's sync
// running blocks every other company's "Check Replies" with a false
// "already running" 409, now that each company polls its own mailbox.
const activeControllers = new Map<string, AbortController>();

export function beginOfferLetterPoll(companyId: string) {
	if (activeControllers.has(companyId)) return null;
	const controller = new AbortController();
	activeControllers.set(companyId, controller);
	return controller.signal;
}

export function stopOfferLetterPoll(companyId: string) {
	const controller = activeControllers.get(companyId);
	if (!controller) return false;
	controller.abort();
	return true;
}

export function endOfferLetterPoll(companyId: string) {
	activeControllers.delete(companyId);
}
