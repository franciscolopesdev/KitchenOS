export interface AppEventRule {
  id: string;
  name: string;
  description: string;
  priority: 'Critical' | 'Important' | 'Suggestion' | 'Silent';
  condition: () => boolean | Promise<boolean>;
  action: () => void | Promise<void>;
  cooldownSeconds: number;
  lastExecutedAt?: number;
}

export interface AppNotification {
  id: string;
  message: string;
  timestamp: string;
  priority: string;
  read: boolean;
  ruleName?: string;
}

export let activeNotifications: AppNotification[] = [];

/**
 * Pushes a notification to the active queue. Keeps only the last 20 notifications.
 */
export function pushNotification(message: string, priority = 'Info', ruleName?: string): void {
  activeNotifications.push({
    id: Math.random().toString(36).substring(2, 9).toUpperCase(),
    message,
    timestamp: new Date().toISOString(),
    priority,
    read: false,
    ruleName
  });
  
  if (activeNotifications.length > 20) {
    activeNotifications.shift();
  }
}

class EventEngine {
  get activeNotifications(): AppNotification[] {
    return activeNotifications;
  }
  set activeNotifications(val: AppNotification[]) {
    activeNotifications = val;
  }

  private rules: Map<string, AppEventRule> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  /**
   * Registers a proactive background rule.
   */
  registerRule(rule: AppEventRule): void {
    this.rules.set(rule.id, rule);
    console.log(`[EventEngine] Registered rule: "${rule.name}" (Priority: ${rule.priority}, Cooldown: ${rule.cooldownSeconds}s)`);
  }

  /**
   * Unregisters a rule by ID.
   */
  unregisterRule(id: string): void {
    this.rules.delete(id);
  }

  /**
   * Iterates and evaluates all registered rules, executing those whose conditions are met.
   */
  async evaluateRules(): Promise<void> {
    const now = Date.now();
    for (const rule of this.rules.values()) {
      // Check cooldown
      if (rule.lastExecutedAt && (now - rule.lastExecutedAt) < rule.cooldownSeconds * 1000) {
        continue;
      }

      try {
        const isTriggered = await rule.condition();
        if (isTriggered) {
          console.log(`[EventEngine] Rule triggered: "${rule.name}" (ID: ${rule.id})`);
          rule.lastExecutedAt = now;
          await rule.action();
        }
      } catch (err: any) {
        console.error(`[EventEngine] Error evaluating rule "${rule.name}":`, err.message);
      }
    }
  }

  /**
   * Starts the evaluation loop.
   */
  start(intervalMs = 30000): void {
    if (this.checkInterval) return;
    console.log(`[EventEngine] Starting Event Engine evaluation loop (Interval: ${intervalMs}ms)`);
    
    // Initial evaluation after 5 seconds to let system settle
    setTimeout(() => this.evaluateRules(), 5000);

    this.checkInterval = setInterval(() => this.evaluateRules(), intervalMs);
  }

  /**
   * Stops the evaluation loop.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[EventEngine] Stopped Event Engine loop');
    }
  }
}

export const eventEngine = new EventEngine();
export default eventEngine;
