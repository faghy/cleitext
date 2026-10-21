#!/usr/bin/env node
import { main } from './program.js';

// The commands are in program.ts; `--json` prints one JSON object (json.ts).
const code = await main();
if (code !== 0) process.exit(code);
