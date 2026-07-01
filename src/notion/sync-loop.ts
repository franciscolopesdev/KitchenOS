import { syncNotionToSqlite } from './sync.js';

async function run() {
  console.log('--- STARTING BULK SYNC LOOP ---');
  let batchIndex = 1;
  
  while (true) {
    console.log(`\n=== Batch #${batchIndex} ===`);
    try {
      const result = await syncNotionToSqlite(35);
      const syncedCount = result.synced?.length || 0;
      console.log(`Batch #${batchIndex} completed! Synced: ${syncedCount} items.`);
      
      // If we synced absolutely nothing in this batch across all tables, sync is complete!
      if (syncedCount === 0) {
        console.log('🎉 No more items pending sync. Exiting bulk sync loop.');
        break;
      }
    } catch (e: any) {
      console.error(`Error in batch #${batchIndex}:`, e.message);
    }
    
    console.log('Sleeping 5 seconds to prevent rate limits...');
    await new Promise((resolve) => setTimeout(resolve, 5000));
    batchIndex++;
  }
  console.log('--- BULK SYNC LOOP COMPLETED ---');
}

run().catch(console.error);
