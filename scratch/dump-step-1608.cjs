const fs = require('fs');
const readline = require('readline');

const logPath = 'C:\\Users\\agent\\.gemini\\antigravity-ide\\brain\\faa85b8c-1a4e-4051-893d-bf3e5f7e63b4\\.system_generated\\logs\\transcript.jsonl';
const outputPath = 'C:\\Users\\agent\\.gemini\\antigravity-ide\\brain\\faa85b8c-1a4e-4051-893d-bf3e5f7e63b4\\scratch\\step-1608.md';

async function dumpStep() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.step_index === 1608) {
        fs.writeFileSync(outputPath, obj.content || obj.text || JSON.stringify(obj), 'utf8');
        console.log("Wrote step 1608 to " + outputPath);
        break;
      }
    } catch (e) {
      // ignore
    }
  }
}

dumpStep();
