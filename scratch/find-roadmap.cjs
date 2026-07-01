const fs = require('fs');
const readline = require('readline');

const logPath = 'C:\\Users\\agent\\.gemini\\antigravity-ide\\brain\\faa85b8c-1a4e-4051-893d-bf3e5f7e63b4\\.system_generated\\logs\\transcript.jsonl';
const outputPath = 'C:\\Users\\agent\\.gemini\\antigravity-ide\\brain\\faa85b8c-1a4e-4051-893d-bf3e5f7e63b4\\scratch\\user-request-full.md';

async function findUserRequest() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('KitchenOS Vision 2030')) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'USER_INPUT' || obj.source === 'USER_EXPLICIT' || line.includes('"type":"USER_INPUT"')) {
          console.log("=== FOUND USER INPUT ===");
          fs.writeFileSync(outputPath, obj.content || obj.text || JSON.stringify(obj), 'utf8');
          console.log("Wrote full content to " + outputPath);
          break;
        }
      } catch (e) {
        console.error("Error parsing line:", e);
      }
    }
  }
}

findUserRequest();
