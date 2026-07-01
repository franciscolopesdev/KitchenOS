const fs = require('fs');
const readline = require('readline');

const logPath = 'C:\\Users\\agent\\.gemini\\antigravity-ide\\brain\\faa85b8c-1a4e-4051-893d-bf3e5f7e63b4\\.system_generated\\logs\\transcript.jsonl';
const outputPath = 'C:\\Users\\agent\\.gemini\\antigravity-ide\\brain\\faa85b8c-1a4e-4051-893d-bf3e5f7e63b4\\scratch\\roadmap-fases.txt';

async function extractPhases() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let output = '';

  for await (const line of rl) {
    // Check if the line has model response content that contains "Fase" and mentions 2030 or roadmap
    if (line.includes('Vision 2030') || line.includes('Fase 14') || line.includes('Fase 15') || line.includes('Fase 16') || line.includes('Fase 17') || line.includes('Fase 18')) {
      try {
        const obj = JSON.parse(line);
        if (obj.content && obj.content.includes('Fase')) {
          output += `=== STEP ${obj.step_index} ===\n${obj.content}\n\n`;
        }
      } catch (e) {
        // Not JSON or other error
      }
    }
  }

  fs.writeFileSync(outputPath, output, 'utf8');
  console.log("Wrote matching phases to " + outputPath);
}

extractPhases();
