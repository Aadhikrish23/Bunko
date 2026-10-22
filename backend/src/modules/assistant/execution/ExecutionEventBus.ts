import { ExecutionEvent } from "./ExecutionEvent";

export type ExecutionEventListener = (event: ExecutionEvent, payload: unknown) => void | Promise<void>;

export class ExecutionEventBus {
  private readonly listeners: ExecutionEventListener[] = [];

  /**
   * Subscribes a listener to execution events. Returns an unsubscribe function.
   */
  subscribe(listener: ExecutionEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  /**
   * Publishes an event to all subscribers.
   */
  async publish(event: ExecutionEvent, payload: unknown): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(event, payload);
      } catch (err) {
        // Suppress listener faults to keep pipeline running stably
      }
    }
  }
}

export default new ExecutionEventBus();
