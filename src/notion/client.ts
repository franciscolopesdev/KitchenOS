import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

const notionToken = process.env.NOTION_TOKEN;

if (!notionToken || notionToken === 'your_notion_token_here') {
  console.warn('Warning: NOTION_TOKEN is not set or using default placeholder.');
}

export const notion = new Client({
  auth: notionToken,
});
