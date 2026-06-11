import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm']);
const MIN_SECONDS = 65;
const MAX_SECONDS = 150;

function usage() {
  return `Usage:
  npm run nfl -- "Player Name" [options]
  node nfl-compilation.mjs "Player Name" [options]

Options:
  --source-dir clips/nfl/player-name    Folder of licensed/local source clips.
  --manifest clips.json                 JSON manifest with clip paths or direct mp4 URLs.
  --clips 10                            Number of clips in the compilation.
  --clip-seconds 7                      Seconds to use from each source clip.
  --transition 0.55                     Blend transition length in seconds.
  --season 2026                         Season label for output naming.
  --take "angle"                        Optional tweet angle or player note.
  --output-dir out/nfl                  Output folder.
  --dry-run                             Write metadata/tweet without rendering.

Manifest format:
  [
    { "path": "licensed-clips/jayden-daniels/clip-01.mp4", "title": "Red-zone keeper", "start": 2 },
    { "url": "https://example.com/approved-source.mp4", "title": "Deep shot" }
  ]
`;
}

function parseArgs(argv) {
  const args = [...argv];
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }

  const playerParts = [];
  const options = {
    sourceDir: null,
    manifest: null,
    clips: 10,
    clipSeconds: 7,
    transition: 0.55,
    season: String(new Date().getFullYear()),
    take: '',
    outputDir: path.join(__dirname, '..', 'out', 'nfl'),
    dryRun: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      playerParts.push(arg);
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    const next = args[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    i += 1;

    if (arg === '--source-dir') options.sourceDir = path.resolve(next);
    else if (arg === '--manifest') options.manifest = path.resolve(next);
    else if (arg === '--clips') options.clips = Number(next);
    else if (arg === '--clip-seconds') options.clipSeconds = Number(next);
    else if (arg === '--transition') options.transition = Number(next);
    else if (arg === '--season') options.season = next;
    else if (arg === '--take') options.take = next;
    else if (arg === '--output-dir') options.outputDir = path.resolve(next);
    else throw new Error(`Unknown option: ${arg}`);
  }

  const playerName = playerParts.join(' ').trim();
  if (!playerName) throw new Error('Give me a player name.');
  const vsPlayers = detectVsRequest(playerName);
  if (vsPlayers) {
    throw new Error(`VS battle detected: ${vsPlayers.player1} vs ${vsPlayers.player2}. Use the dedicated VS renderer: npm run nfl:vs -- --player1 "${vsPlayers.player1}" --player2 "${vsPlayers.player2}". VS mode only uses local approved_clips files and renders a vertical debate edit.`);
  }
  if (!Number.isFinite(options.clips) || options.clips < 1) throw new Error('--clips must be at least 1.');
  if (!Number.isFinite(options.clipSeconds) || options.clipSeconds <= 1) throw new Error('--clip-seconds must be greater than 1.');
  if (!Number.isFinite(options.transition) || options.transition <= 0) throw new Error('--transition must be greater than 0.');
  if (options.transition >= options.clipSeconds) throw new Error('--transition must be shorter than --clip-seconds.');

  if (!options.sourceDir && !options.manifest) {
    options.sourceDir = path.join(__dirname, 'clips', 'nfl', slugify(playerName));
  }

  return { playerName, options };
}

function detectVsRequest(text) {
  const match = String(text).match(/^\s*(.+?)\s+(?:vs\.?|versus|v\.)\s+(.+?)\s*$/i);
  if (!match) return null;
  return {
    player1: match[1].trim(),
    player2: match[2].trim(),
  };
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'nfl-compilation';
}

function titleFromPath(filePath) {
  return path.basename(filePath, path.extname(filePath))
    .replace(/^\d+[-_\s]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(manifestPath) {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Manifest must be a JSON array.');

  return parsed.map((clip, index) => {
    if (!clip || typeof clip !== 'object') throw new Error(`Manifest clip ${index + 1} must be an object.`);
    const source = clip.url || clip.path;
    if (!source) throw new Error(`Manifest clip ${index + 1} needs "path" or "url".`);
    const resolvedSource = clip.url || path.resolve(path.dirname(manifestPath), clip.path);
    return {
      source: resolvedSource,
      title: String(clip.title || titleFromPath(source) || `Clip ${index + 1}`),
      start: Number.isFinite(Number(clip.start)) ? Number(clip.start) : 0,
      duration: Number.isFinite(Number(clip.duration)) ? Number(clip.duration) : null,
      note: clip.note || '',
    };
  });
}

async function readSourceDir(sourceDir) {
  if (!(await pathExists(sourceDir))) {
    throw new Error(`No source clips found. Add licensed clips to ${sourceDir} or pass --source-dir/--manifest.`);
  }

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((entry, index) => {
      const source = path.join(sourceDir, entry.name);
      return {
        source,
        title: titleFromPath(source) || `Clip ${index + 1}`,
        start: 0,
        duration: null,
        note: '',
      };
    });
}

async function collectClips(options) {
  const fromManifest = options.manifest ? await readManifest(options.manifest) : [];
  const fromDir = options.sourceDir ? await readSourceDir(options.sourceDir) : [];
  const clips = [...fromManifest, ...fromDir];
  const seen = new Set();
  const deduped = [];

  for (const clip of clips) {
    const key = `${clip.source}|${clip.start}|${clip.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(clip);
  }

  if (deduped.length === 0) throw new Error('No video clips were found.');
  return deduped.slice(0, options.clips);
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
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

async function renderClip(clip, destPath, clipSeconds) {
  const duration = clip.duration || clipSeconds;
  const args = ['-hide_banner', '-y'];
  if (clip.start > 0) args.push('-ss', String(clip.start));
  args.push(
    '-i', clip.source,
    '-t', String(duration),
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,format=yuv420p',
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

async function renderCompilation(clipPaths, outputPath, clipDurations, transition) {
  if (clipPaths.length === 1) {
    await fs.copyFile(clipPaths[0], outputPath);
    return;
  }

  const args = ['-hide_banner', '-y'];
  for (const clipPath of clipPaths) args.push('-i', clipPath);

  const filters = [];
  let videoLabel = '0:v';
  let audioLabel = '0:a';

  for (let i = 1; i < clipPaths.length; i += 1) {
    const vOut = `v${i}`;
    const aOut = `a${i}`;
    const offset = clipDurations.slice(0, i).reduce((sum, duration) => sum + duration, 0) - (transition * i);
    filters.push(`[${videoLabel}][${i}:v]xfade=transition=fade:duration=${transition}:offset=${offset.toFixed(3)}[${vOut}]`);
    filters.push(`[${audioLabel}][${i}:a]acrossfade=d=${transition}:c1=tri:c2=tri[${aOut}]`);
    videoLabel = vOut;
    audioLabel = aOut;
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

function makeTweet(playerName, clips, take) {
  const titles = clips.map((clip) => clip.title).filter(Boolean).slice(0, 3);
  const clipBit = titles.length ? `The reel says it fast: ${titles.join(', ')}.` : 'The reel says it fast.';
  const takeBit = take ? `${take}.` : 'Explosive reps, clean pacing, and enough pop to make the timeline stop scrolling.';
  const tweet = `${playerName} compilation is built for the feed. ${clipBit} ${takeBit}`.replace(/\s+/g, ' ').trim();
  if (tweet.length <= 280) return tweet;
  return `${playerName} compilation is built for the feed. ${takeBit}`.slice(0, 277).trimEnd() + '...';
}

async function writeBrief(outDir, playerName, options, clips, tweet) {
  const lines = [
    `# ${playerName} NFL Compilation Brief`,
    '',
    `Season label: ${options.season}`,
    `Clip count: ${clips.length}`,
    `Clip length: ${options.clipSeconds}s`,
    `Transition: ${options.transition}s blend`,
    `Target runtime: minimum ${MIN_SECONDS}s, under ${MAX_SECONDS}s`,
    '',
    '## Selected Clips',
    ...clips.map((clip, index) => `- ${index + 1}. ${clip.title}: ${clip.source}${clip.start ? ` (start ${clip.start}s)` : ''}`),
    '',
    '## Tweet',
    tweet,
    '',
    'Rights note: only post NFL, team, broadcast, or social video when you have the required reuse rights or permission.',
  ];
  await fs.writeFile(path.join(outDir, 'brief.md'), `${lines.join('\n')}\n`);
}

async function main() {
  const { playerName, options } = parseArgs(process.argv.slice(2));
  const outputSlug = `${slugify(playerName)}-${options.season}`;
  const outDir = path.join(options.outputDir, outputSlug);
  const clipDir = path.join(outDir, 'clips');
  await fs.mkdir(clipDir, { recursive: true });

  const selectedClips = await collectClips(options);
  const tweet = makeTweet(playerName, selectedClips, options.take);
  const expectedDuration = selectedClips.reduce((sum, clip) => sum + (clip.duration || options.clipSeconds), 0) - (options.transition * Math.max(0, selectedClips.length - 1));
  if (expectedDuration < MIN_SECONDS || expectedDuration >= MAX_SECONDS) {
    throw new Error(`NFL compilation plan is ${expectedDuration.toFixed(2)}s. Videos must be at least ${MIN_SECONDS}s and under ${MAX_SECONDS}s. Adjust --clips, --clip-seconds, or manifest durations.`);
  }

  await fs.writeFile(path.join(outDir, 'metadata.json'), JSON.stringify({
    playerName,
    season: options.season,
    settings: {
      clips: options.clips,
      clipSeconds: options.clipSeconds,
      transition: options.transition,
      sourceDir: options.sourceDir,
      manifest: options.manifest,
      take: options.take,
      minSeconds: MIN_SECONDS,
      maxSeconds: MAX_SECONDS,
      expectedDuration,
    },
    clips: selectedClips,
  }, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'tweet.txt'), `${tweet}\n`);
  await writeBrief(outDir, playerName, options, selectedClips, tweet);

  if (!options.dryRun) {
    const renderedClipPaths = [];
    const renderedClipDurations = [];
    for (let i = 0; i < selectedClips.length; i += 1) {
      const clip = selectedClips[i];
      const destPath = path.join(clipDir, `${String(i + 1).padStart(2, '0')}-${slugify(clip.title)}.mp4`);
      console.log(`Rendering clip ${i + 1}/${selectedClips.length}: ${clip.title}`);
      await renderClip(clip, destPath, options.clipSeconds);
      renderedClipPaths.push(destPath);
      renderedClipDurations.push(clip.duration || options.clipSeconds);
    }

    console.log('Building compilation with blend transitions...');
    const compilationPath = path.join(outDir, 'compilation.mp4');
    await renderCompilation(renderedClipPaths, compilationPath, renderedClipDurations, options.transition);
    const actualDuration = await probeDuration(compilationPath);
    if (actualDuration < MIN_SECONDS || actualDuration >= MAX_SECONDS) {
      throw new Error(`Rendered duration ${actualDuration.toFixed(2)}s violates the ${MIN_SECONDS}-${MAX_SECONDS}s workflow rule.`);
    }
    console.log(`Duration: ${actualDuration.toFixed(2)}s`);
  }

  console.log(`Output: ${outDir}`);
  console.log(`Tweet: ${tweet}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
