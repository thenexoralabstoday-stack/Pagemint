// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Tool registry. Each tool: { id, name, desc, icon (svg), color, category, accepts: 'pdf'|'image'|'any', multi, pro, feature, mount(ctx) }
import { pageTools } from './pages.js';
import { convertTools } from './convert.js';
import { stampTools } from './stamp.js';
import { editorTool } from './editor.js';
import { aiTools } from './ai.js';

export const CATEGORIES = [
  { id: 'edit', name: 'Edit & sign' },
  { id: 'organize', name: 'Organize' },
  { id: 'convert', name: 'Convert & optimise' },
  { id: 'stamp', name: 'Stamp & protect' },
  { id: 'ai', name: 'AI tools' },
];

export const TOOLS = [editorTool, ...pageTools, ...convertTools, ...stampTools, ...aiTools];
