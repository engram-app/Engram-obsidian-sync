import type { SyncLogEntry } from "./types";

type Subscriber = () => void;

export class SyncLog {
	private buffer: SyncLogEntry[] = [];
	private capacity: number;
	private subscribers: Set<Subscriber> = new Set();

	constructor(capacity = 500) {
		this.capacity = capacity;
	}

	append(entry: SyncLogEntry): void {
		this.buffer.push(entry);
		if (this.buffer.length > this.capacity) {
			this.buffer.splice(0, this.buffer.length - this.capacity);
		}
		this.notify();
	}

	entries(): SyncLogEntry[] {
		return [...this.buffer];
	}

	errorCount(): number {
		return this.buffer.filter((e) => e.result === "error").length;
	}

	clear(): void {
		this.buffer.length = 0;
		this.notify();
	}

	/** Subscribe to append/clear events. Returns an unsubscribe handle.
	 *  Used by the Sync Center pane to live-render the Activity feed. */
	subscribe(fn: Subscriber): () => void {
		this.subscribers.add(fn);
		return () => {
			this.subscribers.delete(fn);
		};
	}

	private notify(): void {
		for (const fn of this.subscribers) fn();
	}
}
