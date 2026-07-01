import { startKitchenTimer } from './services/timer.js';

const minutes = parseFloat(process.argv[2]) || 15;
const label = process.argv[3] || 'Timer de Cozinha';

console.log(`⏱️ Starting KitchenOS Timer for ${minutes} minutes...`);
const timerId = startKitchenTimer(label, minutes);

// Keep the process alive until the timer expires
const totalSeconds = Math.round(minutes * 60);
setTimeout(() => {
  console.log(`⏱️ Process ending naturally as timer #${timerId} expired.`);
}, (totalSeconds + 5) * 1000);
