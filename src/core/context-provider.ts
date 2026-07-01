import { eventBus } from './event-bus.js';

export interface UserContext {
  status: 'working' | 'gaming' | 'cooking' | 'shopping' | 'sleeping' | 'idle';
  location: string; // e.g. "home", "supermarket", "office"
  activeSessionId?: number; // active cooking session ID if status === 'cooking'
  weatherSummary?: string; // temperature and condition
}

class ContextProvider {
  private context: UserContext = {
    status: 'idle',
    location: 'home',
  };

  /**
   * Returns current user context.
   */
  getContext(): UserContext {
    return this.context;
  }

  /**
   * Update fields in current context and emit 'context_changed' event.
   */
  updateContext(updates: Partial<UserContext>): void {
    this.context = { ...this.context, ...updates };
    console.log('[ContextProvider] Context updated:', this.context);
    
    // Publish context change event asynchronously
    eventBus.publish('context_changed', this.context).catch(err => {
      console.error('[ContextProvider] Error publishing context change event:', err.message);
    });
  }
}

export const contextProvider = new ContextProvider();
export default contextProvider;
