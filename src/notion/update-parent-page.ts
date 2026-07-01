import { notion } from './client.js';
import dotenv from 'dotenv';

dotenv.config();

const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

if (!parentPageId) {
  console.error('NOTION_PARENT_PAGE_ID is not configured in .env');
  process.exit(1);
}

// Format UUID if it doesn't contain hyphens
const formattedPageId = parentPageId.includes('-')
  ? parentPageId
  : `${parentPageId.substring(0, 8)}-${parentPageId.substring(8, 12)}-${parentPageId.substring(12, 16)}-${parentPageId.substring(16, 20)}-${parentPageId.substring(20)}`;

async function updateParentPage() {
  console.log(`🎨 Updating parent page "${formattedPageId}" with premium visual banner and icon...`);
  
  try {
    const response = await notion.pages.update({
      page_id: formattedPageId,
      icon: {
        type: 'emoji',
        emoji: '👨‍🍳',
      },
      cover: {
        type: 'external',
        external: {
          url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?q=80&w=2000', // A beautiful, warm kitchen cooking workspace photo
        },
      },
    });
    
    console.log('✔ Parent page successfully updated with banner and icon!');
    console.log(`Page URL: ${(response as any).url}`);
  } catch (error: any) {
    console.error('❌ Failed to update parent page:', error.message);
  }
}

updateParentPage();
