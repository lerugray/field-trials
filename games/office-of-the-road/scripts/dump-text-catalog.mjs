#!/usr/bin/env node
// Dump the complete player-visible text catalog as JSON (Pickett dump-m10-text pattern).

import { buildTextCatalog } from '../src/text-catalog.js';

const catalog = buildTextCatalog();
process.stdout.write(JSON.stringify(catalog) + '\n');
