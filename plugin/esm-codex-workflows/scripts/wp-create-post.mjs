import fs from 'node:fs/promises';
import path from 'node:path';
import { wordpressFetch } from './wp-env.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function findTerms(taxonomy, names) {
  const ids = [];
  for (const name of names) {
    const results = await wordpressFetch(`/wp-json/wp/v2/${taxonomy}?search=${encodeURIComponent(name)}&per_page=10`);
    const exact = results.find((term) => term.name.toLowerCase() === name.toLowerCase());
    if (exact) ids.push(exact.id);
  }
  return ids;
}

function textToParagraphBlocks(text) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<!-- wp:paragraph -->\n<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>\n<!-- /wp:paragraph -->`)
    .join('\n\n');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readContent(args) {
  if (args.file) {
    const filePath = path.resolve(process.cwd(), args.file);
    return fs.readFile(filePath, 'utf8');
  }

  if (args.content) return args.content;

  if (args.topic) {
    return textToParagraphBlocks([
      `Draft placeholder for: ${args.topic}`,
      'Replace this with the completed article body before publishing.',
    ].join('\n\n'));
  }

  throw new Error('Provide --file, --content, or --topic.');
}

const args = parseArgs(process.argv.slice(2));
const title = args.title || args.topic;
if (!title) throw new Error('Provide --title or --topic.');

const categoryIds = await findTerms('categories', splitList(args.categories));
const tagIds = await findTerms('tags', splitList(args.tags));
const content = await readContent(args);
const status = args.status || 'draft';

const payload = {
  title,
  content,
  status,
  excerpt: args.excerpt || undefined,
  slug: args.slug || undefined,
  categories: categoryIds.length ? categoryIds : undefined,
  tags: tagIds.length ? tagIds : undefined,
  date: args.date || undefined,
};

const post = await wordpressFetch('/wp-json/wp/v2/posts', {
  method: 'POST',
  body: JSON.stringify(payload),
});

console.log(`Created WordPress ${status}: ${post.title?.rendered || title}`);
console.log(`Post ID: ${post.id}`);
console.log(`Edit link: ${post.link ? `${post.link}?preview=true` : post.guid?.rendered || 'created'}`);
