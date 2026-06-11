import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm']);
const FORMAT_SIZES = {
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
};
const ACTION_WINDOW_MIN_SECONDS = 2.5;
const ACTION_WINDOW_MAX_SECONDS = 4.2;
const CARD_SECONDS = 1.7;

function usage() {
  return `Usage:
  npm run nfl:vs -- --player1 "Player One" --player2 "Player Two" [options]
  node nfl-vs-compilation.mjs --player1 "Player One" --player2 "Player Two" [options]

Options:
  --manifest clips/nfl/puka-jsn-swap/vs-manifest.json  JSON clip manifest.
  --approved-dir approved_clips/nfl/player1-vs-player2  Folder with player subfolders.
  --format 9:16                                       9:16, 4:5, or 16:9.
  --clips-per-player 3                                Number of action clips per player.
  --segment-seconds 3.6                               Default seconds per clip.
  --target-seconds 65                                 Target runtime with +/-5s validation.
  --transition 0.18                                   Cut/blend transition length.
  --date 2026-06-10                                  Date folder for output naming.
  --take "Who are you taking?"                        Closing question.
  --output-dir output                                 Output root.
  --dry-run                                           Write plan without rendering.

Manifest format:
  {
    "player1": "Puka Nacua",
    "player2": "Jaxon Smith-Njigba",
    "take": "Who are you taking?",
    "clips": [
      { "player": "player1", "path": "puka/clip-01.mp4", "title": "Contested catch", "start": 18.5, "duration": 3.8 },
      { "player": "player2", "path": "jsn/clip-01.mp4", "title": "Slot separation", "start": 7, "duration": 3.8 }
    ]
  }

The renderer only accepts local files. URLs are intentionally rejected.`;
}

function parseArgs(argv) {
  const options = {
    player1: '',
    player2: '',
    manifest: null,
    approvedDir: null,
    format: '9:16',
    clipsPerPlayer: 3,
    segmentSeconds: 3.6,
    targetSeconds: 65,
    transition: 0.18,
    date: formatDate(new Date()),
    take: 'Who are you taking?',
    outputDir: path.join(__dirname, 'output'),
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    i += 1;

    if (arg === '--player1') options.player1 = next;
    else if (arg === '--player2') options.player2 = next;
    else if (arg === '--manifest') options.manifest = path.resolve(next);
    else if (arg === '--approved-dir') options.approvedDir = path.resolve(next);
    else if (arg === '--format') options.format = next;
    else if (arg === '--clips-per-player') options.clipsPerPlayer = Number(next);
    else if (arg === '--segment-seconds') options.segmentSeconds = Number(next);
    else if (arg === '--target-seconds') options.targetSeconds = Number(next);
    else if (arg === '--transition') options.transition = Number(next);
    else if (arg === '--date') options.date = next;
    else if (arg === '--season') options.date = next;
    else if (arg === '--take') options.take = next;
    else if (arg === '--output-dir') options.outputDir = path.resolve(next);
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!FORMAT_SIZES[options.format]) throw new Error('--format must be 9:16, 4:5, or 16:9.');
  if (!Number.isFinite(options.clipsPerPlayer) || options.clipsPerPlayer < 1) throw new Error('--clips-per-player must be at least 1.');
  if (!Number.isFinite(options.segmentSeconds) || options.segmentSeconds < ACTION_WINDOW_MIN_SECONDS || options.segmentSeconds > ACTION_WINDOW_MAX_SECONDS) {
    throw new Error(`--segment-seconds must be an action window between ${ACTION_WINDOW_MIN_SECONDS} and ${ACTION_WINDOW_MAX_SECONDS} seconds.`);
  }
  if (!Number.isFinite(options.transition) || options.transition < 0 || options.transition >= options.segmentSeconds) throw new Error('--transition must be shorter than --segment-seconds.');
  if (!Number.isFinite(options.targetSeconds) || options.targetSeconds < 20 || options.targetSeconds > 180) {
    throw new Error('--target-seconds must be between 20 and 180.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) throw new Error('--date must use YYYY-MM-DD.');

  return options;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'nfl-vs';
}

function titleFromPath(filePath) {
  return path.basename(filePath, path.extname(filePath))
    .replace(/^\d+[-_\s]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args, stdio = 'inherit') {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function probeDuration(filePath) {
  let output = '';
  await new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffprobe exited with code ${code}`));
    });
  });
  const duration = Number(output.trim());
  return Number.isFinite(duration) ? duration : 0;
}

async function readManifest(manifestPath, options) {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  const clips = Array.isArray(parsed) ? parsed : parsed.clips;
  if (!Array.isArray(clips)) throw new Error('Manifest must be an array or an object with a clips array.');

  if (!options.player1 && parsed.player1) options.player1 = String(parsed.player1);
  if (!options.player2 && parsed.player2) options.player2 = String(parsed.player2);
  if (parsed.take && options.take === 'Who are you taking?') options.take = String(parsed.take);

  return clips.map((clip, index) => {
    if (!clip || typeof clip !== 'object') throw new Error(`Manifest clip ${index + 1} must be an object.`);
    if (clip.url) throw new Error(`Manifest clip ${index + 1} uses a URL. VS render mode only accepts local approved files.`);
    if (!clip.path) throw new Error(`Manifest clip ${index + 1} needs "path".`);
    const playerKey = normalizePlayerKey(clip.player, options) || inferPlayerKeyFromText(clip.title || clip.path, options);
    if (!playerKey) throw new Error(`Manifest clip ${index + 1} needs player: "player1", "player2", "${options.player1}", or "${options.player2}".`);
    const source = path.resolve(path.dirname(manifestPath), clip.path);
    const hasStart = Number.isFinite(Number(clip.start));
    const hasDuration = Number.isFinite(Number(clip.duration));
    if (!hasStart || !hasDuration) throw new Error(`Manifest clip ${index + 1} must include explicit start and duration action-window values.`);
    return {
      playerKey,
      source,
      title: String(clip.title || titleFromPath(source) || `Clip ${index + 1}`),
      start: Number(clip.start),
      duration: Number(clip.duration),
    };
  });
}

function normalizePlayerKey(value, options) {
  const text = String(value || '').toLowerCase().trim();
  if (['1', 'p1', 'player1', 'player 1'].includes(text)) return 'player1';
  if (['2', 'p2', 'player2', 'player 2'].includes(text)) return 'player2';
  if (options.player1 && text === options.player1.toLowerCase()) return 'player1';
  if (options.player2 && text === options.player2.toLowerCase()) return 'player2';
  return null;
}

function inferPlayerKeyFromText(value, options) {
  const text = String(value || '').toLowerCase();
  if (options.player1 && text.includes(options.player1.toLowerCase())) return 'player1';
  if (options.player2 && text.includes(options.player2.toLowerCase())) return 'player2';
  return null;
}

async function clipsFromPlayerDir(playerKey, playerName, approvedDir, options) {
  const dir = path.join(approvedDir, slugify(playerName));
  if (!(await pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((entry, index) => {
      const source = path.join(dir, entry.name);
      return {
        playerKey,
        source,
        title: titleFromPath(source) || `${playerName} clip ${index + 1}`,
        start: 0,
        duration: options.segmentSeconds,
        fromApprovedDir: true,
      };
    });
}

async function collectClips(options) {
  const manifestClips = options.manifest ? await readManifest(options.manifest, options) : [];
  if (!options.player1 || !options.player2) throw new Error('Pass --player1 and --player2, or include player1/player2 in the manifest.');

  const defaultDir = path.join(__dirname, 'approved_clips', 'nfl', `${slugify(options.player1)}-vs-${slugify(options.player2)}`);
  const approvedDir = options.approvedDir || defaultDir;
  const approvedRoot = path.resolve(__dirname, 'approved_clips');
  const resolvedApprovedDir = path.resolve(approvedDir);
  if (!isInsidePath(resolvedApprovedDir, approvedRoot)) {
    throw new Error(`VS render mode only reads from approved_clips. Move approved sources under ${approvedRoot}.`);
  }
  const dirClips = options.manifest ? [] : [
    ...await clipsFromPlayerDir('player1', options.player1, resolvedApprovedDir, options),
    ...await clipsFromPlayerDir('player2', options.player2, resolvedApprovedDir, options),
  ];
  const clips = [...manifestClips, ...dirClips];
  const existing = [];
  for (const clip of clips) {
    if (!(await pathExists(clip.source))) throw new Error(`Missing approved clip: ${clip.source}`);
    if (!isInsidePath(path.resolve(clip.source), approvedRoot)) {
      throw new Error(`Rejected non-approved source: ${clip.source}. VS mode only uses local files under ${approvedRoot}.`);
    }
    if (!Number.isFinite(clip.start) || clip.start < 0) throw new Error(`Clip "${clip.title}" needs a valid non-negative start time.`);
    if (!Number.isFinite(clip.duration) || clip.duration < ACTION_WINDOW_MIN_SECONDS || clip.duration > ACTION_WINDOW_MAX_SECONDS) {
      throw new Error(`Clip "${clip.title}" has duration ${clip.duration}s. VS action windows must be ${ACTION_WINDOW_MIN_SECONDS}-${ACTION_WINDOW_MAX_SECONDS}s.`);
    }
    if (clip.fromApprovedDir) {
      const sourceDuration = await probeDuration(clip.source);
      if (sourceDuration > ACTION_WINDOW_MAX_SECONDS + 0.5) {
        throw new Error(`Approved-dir clip "${clip.title}" is ${sourceDuration.toFixed(2)}s. Pre-cut folder clips must already be short action windows, or use a manifest with start/duration.`);
      }
    }
    existing.push(clip);
  }
  return existing;
}

function isInsidePath(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function chooseVsOrder(clips, options) {
  const p1 = clips.filter((clip) => clip.playerKey === 'player1').slice(0, options.clipsPerPlayer);
  const p2 = clips.filter((clip) => clip.playerKey === 'player2').slice(0, options.clipsPerPlayer);
  if (p1.length < options.clipsPerPlayer || p2.length < options.clipsPerPlayer) {
    throw new Error(`Need at least ${options.clipsPerPlayer} clips for each player.`);
  }

  const ordered = [];
  for (let i = 0; i < options.clipsPerPlayer; i += 1) {
    ordered.push(p1[i], p2[i]);
  }
  return ordered;
}

function shellEscapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function fitVideoFilterGraph(size, labelText) {
  const { width, height } = size;
  if (width > height) {
    return `[0:v]${[
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      'setsar=1',
      'fps=30',
      `drawbox=x=0:y=0:w=iw:h=132:color=black@0.48:t=fill`,
      `drawtext=text='${shellEscapeDrawtext(labelText)}':x=(w-text_w)/2:y=42:fontsize=46:fontcolor=white:box=0`,
      'format=yuv420p',
    ].join(',')}[v]`;
  }

  return [
    `[0:v]split=2[bg][fg]`,
    `[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=24:8,eq=brightness=-0.18:saturation=0.85[base]`,
    `[fg]scale=${width}:-2:force_original_aspect_ratio=decrease[fit]`,
    `[base][fit]overlay=(W-w)/2:(H-h)/2,drawbox=x=0:y=0:w=iw:h=170:color=black@0.56:t=fill,drawtext=text='${shellEscapeDrawtext(labelText)}':x=(w-text_w)/2:y=62:fontsize=54:fontcolor=white:box=0,setsar=1,fps=30,format=yuv420p[v]`,
  ].join(';');
}

async function renderTitleCard(destPath, text, subtext, seconds, size) {
  const escapedText = shellEscapeDrawtext(text);
  const escapedSubtext = shellEscapeDrawtext(subtext);
  const titleSize = fitFontSize(text, size.width > size.height ? 72 : 68, size.width, 0.86);
  const subtextSize = fitFontSize(subtext, size.width > size.height ? 42 : 44, size.width, 0.82);
  const args = [
    '-hide_banner',
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x101418:s=${size.width}x${size.height}:r=30:d=${seconds}`,
    '-f', 'lavfi',
    '-i', `anullsrc=channel_layout=stereo:sample_rate=48000:d=${seconds}`,
    '-vf',
    [
      `drawtext=text='${escapedText}':x=(w-text_w)/2:y=(h-text_h)/2-80:fontsize=${titleSize}:fontcolor=white`,
      `drawtext=text='${escapedSubtext}':x=(w-text_w)/2:y=(h-text_h)/2+30:fontsize=${subtextSize}:fontcolor=0xE8C15D`,
      'format=yuv420p',
    ].join(','),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-shortest',
    destPath,
  ];
  await run('ffmpeg', args);
}

function fitFontSize(text, preferred, width, widthRatio) {
  const estimated = Math.floor((width * widthRatio) / Math.max(String(text).length * 0.56, 1));
  return Math.max(28, Math.min(preferred, estimated));
}

async function renderClipSegment(clip, destPath, options, size) {
  const label = clip.playerKey === 'player1' ? options.player1 : options.player2;
  const args = ['-hide_banner', '-y'];
  if (clip.start > 0) args.push('-ss', String(clip.start));
  args.push(
    '-i', clip.source,
    '-t', String(clip.duration),
    '-filter_complex', fitVideoFilterGraph(size, label),
    '-map', '[v]',
    '-map', '0:a?',
    '-af', 'aresample=48000,asetpts=PTS-STARTPTS',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    destPath,
  );
  await run('ffmpeg', args);
}

async function concatSegments(segments, outputPath, transition) {
  if (segments.length === 1) {
    await fs.copyFile(segments[0].path, outputPath);
    return;
  }

  const args = ['-hide_banner', '-y'];
  for (const segment of segments) args.push('-i', segment.path);

  const filters = [];
  let videoLabel = '0:v';
  let audioLabel = '0:a';
  let offset = segments[0].duration - transition;

  for (let i = 1; i < segments.length; i += 1) {
    const vOut = `v${i}`;
    const aOut = `a${i}`;
    filters.push(`[${videoLabel}][${i}:v]xfade=transition=fade:duration=${transition}:offset=${offset.toFixed(3)}[${vOut}]`);
    filters.push(`[${audioLabel}][${i}:a]acrossfade=d=${transition}:c1=tri:c2=tri[${aOut}]`);
    videoLabel = vOut;
    audioLabel = aOut;
    if (i < segments.length - 1) offset += segments[i].duration - transition;
  }

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', `[${videoLabel}]`,
    '-map', `[${audioLabel}]`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    outputPath,
  );
  await run('ffmpeg', args);
}

async function writeBrief(outDir, options, orderedClips, expectedDuration) {
  const lines = [
    `# ${options.player1} vs ${options.player2} NFL VS Brief`,
    '',
    `Date: ${options.date}`,
    `Format: ${options.format}`,
    `Expected duration: ${expectedDuration.toFixed(2)}s`,
    `Target duration: ${options.targetSeconds}s`,
    `Clips per player: ${options.clipsPerPlayer}`,
    `Segment length cap: ${options.segmentSeconds}s`,
    '',
    '## Edit Decision List',
    '- 1. Opener card: matchup and debate question.',
    ...orderedClips.map((clip, index) => {
      const name = clip.playerKey === 'player1' ? options.player1 : options.player2;
      return `- ${index + 2}. ${name}: ${clip.title} (${clip.duration || options.segmentSeconds}s from ${clip.start || 0}s)`;
    }),
    `- ${orderedClips.length + 2}. Closing card: ${options.take}`,
    '',
    '## Caption',
    ...captionIdeas(options),
    '',
    '## Pinned Comment',
    pinnedComment(options),
    '',
    'Rights note: render mode only uses local approved clips. Confirm reuse rights before posting NFL, team, broadcast, or social video.',
  ];
  await fs.writeFile(path.join(outDir, 'brief.md'), `${lines.join('\n')}\n`);
}

function buildEditDecisionList(options, orderedClips, expectedDuration) {
  const entries = [
    {
      order: 1,
      type: 'opener_card',
      player: null,
      text: `${options.player1} vs ${options.player2}`,
      duration: CARD_SECONDS,
    },
  ];

  orderedClips.forEach((clip, index) => {
    entries.push({
      order: index + 2,
      type: 'action_window',
      player: clip.playerKey,
      playerName: clip.playerKey === 'player1' ? options.player1 : options.player2,
      title: clip.title,
      source: clip.source,
      start: clip.start,
      duration: clip.duration,
    });
  });

  entries.push({
    order: orderedClips.length + 2,
    type: 'closing_card',
    player: null,
    text: options.take,
    duration: CARD_SECONDS,
  });

  return {
    structure: 'opener, alternating player1/player2 action windows, closing debate card',
    expectedDuration,
    entries,
  };
}

function captionIdeas(options) {
  return [
    `${options.player1} vs. ${options.player2}.`,
    '',
    `Two different styles, one WR debate.`,
    '',
    `Who are you taking?`,
    '',
    `#NFL`,
  ];
}

function pinnedComment(options) {
  return `Drop the name you are building around: ${options.player1} or ${options.player2}?`;
}

async function writeVsDeliverables(outDir, options, orderedClips, expectedDuration, size) {
  const edl = buildEditDecisionList(options, orderedClips, expectedDuration);
  await fs.writeFile(path.join(outDir, 'edit-decision-list.json'), JSON.stringify(edl, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'edit-decision-list.md'), [
    `# ${options.player1} vs ${options.player2} Edit Decision List`,
    '',
    `Expected duration: ${expectedDuration.toFixed(2)}s`,
    '',
    ...edl.entries.map((entry) => {
      if (entry.type === 'action_window') {
        return `${entry.order}. ${entry.playerName}: ${entry.title} | start ${entry.start}s | duration ${entry.duration}s`;
      }
      return `${entry.order}. ${entry.type.replace('_', ' ')}: ${entry.text} | duration ${entry.duration}s`;
    }),
    '',
  ].join('\n'));
  await fs.writeFile(path.join(outDir, 'caption-ideas.md'), [
    '# Caption Ideas',
    '',
    ...captionIdeas(options),
    '',
    '# Pinned Comment',
    '',
    pinnedComment(options),
    '',
  ].join('\n'));
  await fs.writeFile(path.join(outDir, 'metadata.json'), JSON.stringify({
    player1: options.player1,
    player2: options.player2,
    date: options.date,
    format: options.format,
    renderMode: 'nfl_vs_debate_short',
    sourcePolicy: 'local approved_clips only',
    safetyLayout: size.width < size.height ? 'full broadcast frame fit over blurred vertical background' : 'full frame layout',
    render: {
      width: size.width,
      height: size.height,
      clipsPerPlayer: options.clipsPerPlayer,
      segmentSeconds: options.segmentSeconds,
      transition: options.transition,
      targetSeconds: options.targetSeconds,
      expectedDuration,
      actionWindowMinSeconds: ACTION_WINDOW_MIN_SECONDS,
      actionWindowMaxSeconds: ACTION_WINDOW_MAX_SECONDS,
    },
    clips: orderedClips,
    outputs: {
      finalVideo: 'vs-compilation.mp4',
      editDecisionListJson: 'edit-decision-list.json',
      editDecisionListMarkdown: 'edit-decision-list.md',
      captionIdeas: 'caption-ideas.md',
      pinnedComment: pinnedComment(options),
    },
  }, null, 2) + '\n');
}

async function validateRenderedVideo(outputPath, size) {
  let output = '';
  await new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-show_entries', 'stream=width,height',
      '-of', 'json',
      outputPath,
    ]);
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffprobe exited with code ${code}`));
    });
  });
  const parsed = JSON.parse(output);
  const videoStream = (parsed.streams || []).find((stream) => stream.width && stream.height);
  const duration = Number(parsed.format?.duration);
  if (!videoStream || videoStream.width !== size.width || videoStream.height !== size.height) {
    throw new Error(`Rendered dimensions violate VS plan. Expected ${size.width}x${size.height}.`);
  }
  return duration;
}

function durationWindow(options) {
  return {
    min: Math.max(20, options.targetSeconds - 5),
    max: Math.min(180, options.targetSeconds + 5),
    label: `${options.targetSeconds}s target window`,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const clips = await collectClips(options);
  const orderedClips = chooseVsOrder(clips, options);
  const outputSlug = `${slugify(options.player1)}_vs_${slugify(options.player2)}`;
  const outDir = path.join(options.outputDir, options.date, outputSlug);
  const segmentDir = path.join(outDir, 'segments');
  await fs.mkdir(segmentDir, { recursive: true });
  const size = FORMAT_SIZES[options.format];

  const expectedDuration = CARD_SECONDS + orderedClips.reduce((sum, clip) => sum + clip.duration, 0) + CARD_SECONDS - (options.transition * (orderedClips.length + 1));
  const allowedDuration = durationWindow(options);
  if (expectedDuration < allowedDuration.min || expectedDuration > allowedDuration.max) {
    throw new Error(`VS edit violates ${allowedDuration.label}. Current plan is ${expectedDuration.toFixed(2)}s; adjust --clips-per-player or --segment-seconds.`);
  }

  await writeVsDeliverables(outDir, options, orderedClips, expectedDuration, size);
  await writeBrief(outDir, options, orderedClips, expectedDuration);

  if (!options.dryRun) {
    await fs.rm(segmentDir, { recursive: true, force: true });
    await fs.mkdir(segmentDir, { recursive: true });
    const segments = [];
    const opener = path.join(segmentDir, '00-opener.mp4');
    await renderTitleCard(opener, `${options.player1} vs ${options.player2}`, 'Who has the better case?', CARD_SECONDS, size);
    segments.push({ path: opener, duration: await probeDuration(opener) });

    for (let i = 0; i < orderedClips.length; i += 1) {
      const clip = orderedClips[i];
      const name = clip.playerKey === 'player1' ? options.player1 : options.player2;
      const destPath = path.join(segmentDir, `${String(i + 1).padStart(2, '0')}-${slugify(name)}-${slugify(clip.title)}.mp4`);
      console.log(`Rendering ${name} clip ${i + 1}/${orderedClips.length}: ${clip.title}`);
      await renderClipSegment(clip, destPath, options, size);
      segments.push({ path: destPath, duration: await probeDuration(destPath) });
    }

    const closer = path.join(segmentDir, `${String(orderedClips.length + 1).padStart(2, '0')}-closer.mp4`);
    await renderTitleCard(closer, options.take, `${options.player1} or ${options.player2}?`, CARD_SECONDS, size);
    segments.push({ path: closer, duration: await probeDuration(closer) });

    const compilationPath = path.join(outDir, 'vs-compilation.mp4');
    await concatSegments(segments, compilationPath, options.transition);
    const actualDuration = await validateRenderedVideo(compilationPath, size);
    if (actualDuration < allowedDuration.min || actualDuration > allowedDuration.max) {
      throw new Error(`Rendered duration ${actualDuration.toFixed(2)}s violates ${allowedDuration.label}.`);
    }
    console.log(`Duration: ${actualDuration.toFixed(2)}s`);
  }

  console.log(`Output: ${outDir}`);
  console.log(`Caption: ${options.player1} or ${options.player2}? ${options.take}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
