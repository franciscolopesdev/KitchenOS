const fs = require('fs');
const readline = require('readline');

const logPath = 'C:\\Users\\agent\\.gemini\\antigravity-ide\\brain\\faa85b8c-1a4e-4051-893d-bf3e5f7e63b4\\.system_generated\\logs\\transcript.jsonl';
const outputPath = 'C:\\Users\\agent\\.gemini\\antigravity-ide\\brain\\faa85b8c-1a4e-4051-893d-bf3e5f7e63b4\\scratch\\user-request-step-1.md';

async function findOriginalRequest() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let stepCount = 0;
  for await (const line of rl) {
    stepCount++;
    if (line.includes('KitchenOS Vision 2030')) {
      try {
        const obj = JSON.parse(line);
        console.log(`Step ${obj.step_index} (${obj.type}) contains 'KitchenOS Vision 2030'. Length: ${line.length}`);
        
        // Let's dump the content if it's the first step or user input
        if (obj.step_index < 10) {
          console.log(`Writing Step ${obj.step_index} content...`);
          fs.writeFileSync(outputPath, obj.content || obj.text || JSON.stringify(obj), 'utf8');
          console.log("Wrote original content to " + outputPath);
        }
      } catch (e) {
        console.error("Error parsing line at step count " + stepCount, e);
      }
    }
  }
}

findOriginalRequest();
