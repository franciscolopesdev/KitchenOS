type EventHandler<T = any> = (data: T) => void | Promise<void>;

class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  subscribe<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.unsubscribe(event, handler);
  }

  /**
   * Unsubscribe a handler from an event.
   */
  unsubscribe<T = any>(event: string, handler: EventHandler<T>): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /**
   * Publish an event. Runs all handlers concurrently and awaits any promise results.
   */
  async publish<T = any>(event: string, data: T): Promise<void> {
    const set = this.handlers.get(event);
    if (!set) return;

    const promises: Promise<void>[] = [];
    for (const handler of set) {
      try {
        const result = handler(data);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (err: any) {
        console.error(`[EventBus] Error in handler for event "${event}":`, err.message);
      }
    }

    await Promise.all(promises);
  }
}

export const eventBus = new EventBus();
export default eventBus;
