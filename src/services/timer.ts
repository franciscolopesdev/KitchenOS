export interface TimerHandle {
  id: string;
  label: string;
  durationMinutes: number;
  remainingSeconds: number;
  intervalId: NodeJS.Timeout;
}

const activeTimers: Map<string, TimerHandle> = new Map();

/**
 * Starts a kitchen timer that logs status to the console and beeps when done.
 * @param label Description of what is cooking
 * @param minutes Duration in minutes
 */
export function startKitchenTimer(label: string, minutes: number): string {
  const timerId = Math.random().toString(36).substring(2, 9).toUpperCase();
  const totalSeconds = Math.round(minutes * 60);
  let remainingSeconds = totalSeconds;

  console.log(`\n⏱️  [Kitchen Timer] Timer "${label}" set for ${minutes} minute(s) (${totalSeconds}s) [ID: ${timerId}].`);

  const intervalId = setInterval(() => {
    remainingSeconds--;
    
    const timerObj = activeTimers.get(timerId);
    if (timerObj) {
      timerObj.remainingSeconds = remainingSeconds;
    }
    
    // Log progress every 30 seconds, or every 5 seconds if less than 30 seconds remain
    if (remainingSeconds > 0) {
      if (remainingSeconds % 30 === 0 || remainingSeconds <= 10) {
        console.log(`⏱️  [Timer ${timerId} - "${label}"]: ${remainingSeconds}s remaining...`);
      }
    } else {
      clearInterval(intervalId);
      activeTimers.delete(timerId);
      triggerTimerAlert(label, timerId);
    }
  }, 1000);

  activeTimers.set(timerId, {
    id: timerId,
    label,
    durationMinutes: minutes,
    remainingSeconds,
    intervalId,
  });

  return timerId;
}

/**
 * Triggers the alarm: terminal visual alert and system beep sound.
 */
function triggerTimerAlert(label: string, timerId: string) {
  console.log('\n' + '='.repeat(50));
  console.log(`🚨🚨🚨 KITCHEN TIMER EXPIRED! 🚨🚨🚨`);
  console.log(`🍳 Label: "${label}" (ID: ${timerId})`);
  console.log('='.repeat(50) + '\n');

  // Trigger system terminal sound (beep) 5 times
  let beepCount = 0;
  const beepInterval = setInterval(() => {
    process.stdout.write('\x07'); // System Bell / Beep
    beepCount++;
    if (beepCount >= 5) {
      clearInterval(beepInterval);
    }
  }, 600);
}

/**
 * Cancels an active timer.
 */
export function cancelKitchenTimer(timerId: string): boolean {
  const timer = activeTimers.get(timerId);
  if (timer) {
    clearInterval(timer.intervalId);
    activeTimers.delete(timerId);
    console.log(`🛑 [Kitchen Timer] Timer "${timer.label}" (ID: ${timerId}) cancelled.`);
    return true;
  }
  return false;
}

/**
 * Lists all active timers.
 */
export function listActiveTimers() {
  return Array.from(activeTimers.values()).map(t => ({
    id: t.id,
    label: t.label,
    durationMinutes: t.durationMinutes,
    remainingSeconds: t.remainingSeconds,
  }));
}
