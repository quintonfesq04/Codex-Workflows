import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MLB_BASE = 'https://statsapi.mlb.com';
const SAVANT_CSV = 'https://baseballsavant.mlb.com/statcast_search/csv';
const FANGRAPHS_SEARCH = 'https://www.fangraphs.com/players.aspx';
const MIN_VIDEO_SECONDS = 45;
const MAX_VIDEO_SECONDS = 180;
const MIN_CLIP_SECONDS = 4;
const MAX_CLIP_SECONDS = 14;
const DEFAULT_TARGET_CLIP_SECONDS = 12;
const SAVANT_ACTION_START_SECONDS = 2;

function usage() {
  return `Usage:
  npm run mlb -- "Player Name" [options]
  node mlb-compilation.mjs "Player Name" [options]

Options:
  --season 2026          Season to search. Defaults to the current year.
  --clips 10            Number of clips in the compilation. Use "all" for every usable Savant clip.
  --clip-seconds 12     Target seconds per source clip.
  --transition 0.55     Blend transition length in seconds.
  --days-back 30        Baseball Savant research window.
  --start-date 2026-05-01
                         Start date for Savant research and clip search.
  --end-date 2026-06-09 End date for Savant research and clip search.
  --last-games 7        Limit clips to the player's most recent N games played.
  --situation risp      Build around a Baseball Savant situation filter.
  --mix-results         For pitchers, include both highlights and lowlights.
  --output-dir out/mlb  Output folder.
  --dry-run             Find clips and write metadata without rendering.
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
    season: String(new Date().getFullYear()),
    clips: 10,
    clipSeconds: DEFAULT_TARGET_CLIP_SECONDS,
    transition: 0.55,
    daysBack: 30,
    startDate: null,
    endDate: null,
    lastGames: null,
    situation: null,
    mixResults: false,
    outputDir: path.join(__dirname, '..', 'out', 'mlb'),
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
    if (arg === '--mix-results') {
      options.mixResults = true;
      continue;
    }

    const next = args[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    i += 1;

    if (arg === '--season') options.season = next;
    else if (arg === '--clips') options.clips = next.toLowerCase() === 'all' ? Infinity : Number(next);
    else if (arg === '--clip-seconds') options.clipSeconds = Number(next);
    else if (arg === '--transition') options.transition = Number(next);
    else if (arg === '--days-back') options.daysBack = Number(next);
    else if (arg === '--start-date') options.startDate = next;
    else if (arg === '--end-date') options.endDate = next;
    else if (arg === '--last-games') options.lastGames = Number(next);
    else if (arg === '--situation') options.situation = next.toLowerCase();
    else if (arg === '--output-dir') options.outputDir = path.resolve(next);
    else throw new Error(`Unknown option: ${arg}`);
  }

  const playerName = playerParts.join(' ').trim();
  if (!playerName) throw new Error('Give me a player name.');
  if ((options.clips !== Infinity && !Number.isFinite(options.clips)) || options.clips < 1) throw new Error('--clips must be at least 1, or "all".');
  if (!Number.isFinite(options.clipSeconds) || options.clipSeconds <= 1) throw new Error('--clip-seconds must be greater than 1.');
  if (!Number.isFinite(options.transition) || options.transition <= 0) throw new Error('--transition must be greater than 0.');
  if (!Number.isFinite(options.daysBack) || options.daysBack < 1) throw new Error('--days-back must be at least 1.');
  for (const [key, value] of [['--start-date', options.startDate], ['--end-date', options.endDate]]) {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${key} must use YYYY-MM-DD.`);
  }
  if (options.lastGames !== null && (!Number.isInteger(options.lastGames) || options.lastGames < 1)) throw new Error('--last-games must be a positive integer.');
  if (options.transition >= options.clipSeconds) throw new Error('--transition must be shorter than --clip-seconds.');
  if (options.situation && !['risp'].includes(options.situation)) throw new Error('--situation currently supports: risp.');

  return { playerName, options };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB request failed: ${res.status} ${res.statusText} ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/csv,text/plain,*/*',
    },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText} ${url}`);
  return res.text();
}

async function fetchPlayer(playerName) {
  const url = new URL('/api/v1/people/search', MLB_BASE);
  url.searchParams.set('names', playerName);
  url.searchParams.set('sportId', '1');
  const data = await fetchJson(url);
  const people = data.people || [];
  if (people.length === 0) throw new Error(`No MLB player found for "${playerName}".`);

  const exact = people.find((p) => p.fullName.toLowerCase() === playerName.toLowerCase());
  const player = exact || people[0];
  const detail = await fetchJson(`${MLB_BASE}/api/v1/people/${player.id}?hydrate=currentTeam`);
  return detail.people?.[0] || player;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateWindow(daysBack) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack);
  return { start: isoDate(start), end: isoDate(end) };
}

function resolveDateWindow(options) {
  const window = dateWindow(options.daysBack);
  if (options.startDate) window.start = options.startDate;
  if (options.endDate) window.end = options.endDate;
  if (window.start > window.end) throw new Error('--start-date must be on or before --end-date.');
  return window;
}

function playerKind(player) {
  return player.primaryPosition?.abbreviation === 'P' ? 'pitcher' : 'batter';
}

function savantUrl(player, start, end, csv = true) {
  const url = new URL(csv ? SAVANT_CSV : 'https://baseballsavant.mlb.com/statcast_search');
  const kind = playerKind(player);
  const params = {
    all: 'true',
    hfGT: 'R|',
    player_type: kind,
    game_date_gt: start,
    game_date_lt: end,
    min_pitches: '0',
    min_results: '0',
    group_by: 'name',
    sort_col: 'pitches',
    player_event_sort: 'api_p_release_speed',
    sort_order: 'desc',
    min_pas: '0',
    type: 'details',
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.append(kind === 'pitcher' ? 'pitchers_lookup[]' : 'batters_lookup[]', String(player.id));
  return url.toString();
}

function fangraphsUrl(player) {
  const url = new URL(FANGRAPHS_SEARCH);
  url.searchParams.set('lastname', player.fullName);
  return url.toString();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

async function fetchSavantRows(player, start, end) {
  try {
    const text = await fetchText(savantUrl(player, start, end, true));
    if (!text.trim() || text.trimStart().startsWith('<')) return [];
    return parseCsv(text);
  } catch {
    return [];
  }
}

function numberValue(row, key) {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : null;
}

function pct(num, den) {
  return den ? Math.round((num / den) * 1000) / 10 : 0;
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function summarizeSavant(player, rows) {
  if (rows.length === 0) return { rows: 0, summary: 'No Baseball Savant rows returned for this window.' };

  if (playerKind(player) === 'pitcher') {
    const swings = rows.filter((row) => ['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play'].includes(row.description));
    const whiffs = rows.filter((row) => ['swinging_strike', 'swinging_strike_blocked', 'foul_tip'].includes(row.description));
    const strikeouts = rows.filter((row) => row.events === 'strikeout');
    const avgVelocity = average(rows.map((row) => numberValue(row, 'release_speed')));
    return {
      rows: rows.length,
      strikeouts: strikeouts.length,
      whiffRate: pct(whiffs.length, swings.length),
      avgVelocity: avgVelocity ? Math.round(avgVelocity * 10) / 10 : null,
      summary: `${strikeouts.length} K, ${pct(whiffs.length, swings.length)}% whiff rate in the recent Savant window`,
    };
  }

  const ballsInPlay = rows.filter((row) => row.type === 'X' && numberValue(row, 'launch_speed') !== null);
  const hardHit = ballsInPlay.filter((row) => numberValue(row, 'launch_speed') >= 95);
  const barrels = ballsInPlay.filter((row) => row.launch_speed_angle === '6');
  const homers = rows.filter((row) => row.events === 'home_run');
  const extraBaseHits = rows.filter((row) => ['double', 'triple', 'home_run'].includes(row.events));
  return {
    rows: rows.length,
    homeRuns: homers.length,
    extraBaseHits: extraBaseHits.length,
    hardHitRate: pct(hardHit.length, ballsInPlay.length),
    barrels: barrels.length,
    summary: `${homers.length} HR, ${extraBaseHits.length} XBH, ${pct(hardHit.length, ballsInPlay.length)}% hard-hit rate in the recent Savant window`,
  };
}

function filterSituationRows(rows, situation) {
  if (situation === 'risp') {
    return rows.filter((row) => (row.on_2b || row.on_3b) && row.events);
  }
  return rows;
}

function eventIsAtBat(event) {
  return ![
    'walk',
    'intent_walk',
    'hit_by_pitch',
    'sac_fly',
    'sac_bunt',
    'catcher_interf',
  ].includes(event);
}

function eventIsHit(event) {
  return ['single', 'double', 'triple', 'home_run'].includes(event);
}

function eventTotalBases(event) {
  return { single: 1, double: 2, triple: 3, home_run: 4 }[event] || 0;
}

function summarizeSituationHitting(rows, situation) {
  if (!situation) return null;
  const paRows = filterSituationRows(rows, situation);
  const totals = paRows.reduce((sum, row) => {
    const event = row.events;
    if (eventIsAtBat(event)) sum.ab += 1;
    if (eventIsHit(event)) sum.h += 1;
    if (event === 'walk' || event === 'intent_walk') sum.bb += 1;
    if (event === 'hit_by_pitch') sum.hbp += 1;
    if (event === 'sac_fly') sum.sf += 1;
    sum.tb += eventTotalBases(event);
    if (event === 'home_run') sum.hr += 1;
    sum.rbi += Number(row.post_bat_score || 0) - Number(row.bat_score || 0);
    return sum;
  }, { pa: paRows.length, ab: 0, h: 0, bb: 0, hbp: 0, sf: 0, tb: 0, hr: 0, rbi: 0 });
  const avg = totals.ab ? totals.h / totals.ab : 0;
  const obpDen = totals.ab + totals.bb + totals.hbp + totals.sf;
  const obp = obpDen ? (totals.h + totals.bb + totals.hbp) / obpDen : 0;
  const slg = totals.ab ? totals.tb / totals.ab : 0;
  return {
    situation,
    label: situation === 'risp' ? 'with RISP' : situation,
    ...totals,
    avg,
    obp,
    slg,
    ops: obp + slg,
    slash: `${formatRate(avg)}/${formatRate(obp)}/${formatRate(slg)}`,
  };
}

async function fetchSeasonStats(playerId, season) {
  const url = new URL(`/api/v1/people/${playerId}/stats`, MLB_BASE);
  url.searchParams.set('stats', 'season');
  url.searchParams.set('group', 'hitting');
  url.searchParams.set('season', season);
  url.searchParams.set('gameType', 'R');
  const data = await fetchJson(url);
  return data.stats?.[0]?.splits?.[0]?.stat || null;
}

async function fetchGameLog(playerId, season, group) {
  const url = new URL(`/api/v1/people/${playerId}/stats`, MLB_BASE);
  url.searchParams.set('stats', 'gameLog');
  url.searchParams.set('group', group);
  url.searchParams.set('season', season);
  url.searchParams.set('gameType', 'R');
  const data = await fetchJson(url);
  return data.stats?.[0]?.splits || [];
}

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}

function keywordValues(item) {
  return [
    ...(item.keywordsAll || []),
    ...(item.keywordsDisplay || []),
  ].map((keyword) => String(keyword.value || keyword.displayName || '').toLowerCase());
}

function bestPlayback(item) {
  const playbacks = item.playbacks || [];
  return (
    playbacks.find((p) => p.name === 'highBit' && String(p.url || '').endsWith('.mp4')) ||
    playbacks.find((p) => p.name === 'mp4Avc' && String(p.url || '').endsWith('.mp4')) ||
    playbacks.find((p) => String(p.url || '').endsWith('.mp4')) ||
    playbacks.find((p) => String(p.url || '').includes('.m3u8'))
  );
}

async function fetchGameClips(gamePk, player) {
  const url = new URL(`/api/v1/game/${gamePk}/content`, MLB_BASE);
  const content = await fetchJson(url);
  const playerToken = `playerid-${player.id}`;
  const playerName = player.fullName.toLowerCase();
  const seen = new Set();
  const clips = [];

  walk(content, (item) => {
    if (!item.playbacks || !item.headline) return;
    const keywords = keywordValues(item);
    const text = `${item.headline || ''} ${item.blurb || ''} ${item.title || ''}`.toLowerCase();
    if (isNonActionClip(text)) return;
    const isPlayerClip = keywords.includes(playerToken) || text.includes(playerName);
    if (!isPlayerClip) return;

    const playback = bestPlayback(item);
    if (!playback?.url || seen.has(playback.url)) return;
    seen.add(playback.url);

    clips.push({
      id: item.id || item.guid || path.basename(playback.url),
      gamePk,
      headline: item.headline,
      blurb: item.blurb || '',
      description: item.description || '',
      date: item.date || '',
      url: playback.url,
      playback: playback.name,
    });
  });

  return clips;
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function isPositiveSavantResult(row, kind) {
  const result = normalizeText(row.result || row.events || row.description);
  const description = normalizeText(row.description);
  if (kind === 'pitcher') {
    return [
      'strikeout',
      'groundout',
      'flyout',
      'lineout',
      'pop out',
      'forceout',
      'field out',
      'caught stealing',
      'double play',
    ].some((needle) => result.includes(needle)) || description.includes('in play out');
  }

  return [
    'single',
    'double',
    'triple',
    'home run',
    'walk',
    'hit by pitch',
    'sac fly',
  ].some((needle) => result.includes(needle));
}

async function fetchSavantVideo(playId, feedType) {
  const url = new URL('https://baseballsavant.mlb.com/sporty-videos');
  url.searchParams.set('playId', playId);
  if (feedType) url.searchParams.set('videoType', feedType);
  const html = await fetchText(url);
  const sourceUrl = html.match(/<source\s+src="([^"]+\.mp4)"/s)?.[1];
  if (!sourceUrl) return null;
  const title = decodeHtml(html.match(/<h3>(.*?)<\/h3>/s)?.[1]?.trim() || '');
  return { url: sourceUrl, title };
}

async function fetchSavantGameClips(gamePk, player, options = {}) {
  const data = await fetchJson(`https://baseballsavant.mlb.com/gf?game_pk=${gamePk}`);
  const kind = playerKind(player);
  const rows = [...(data.team_home || []), ...(data.team_away || [])]
    .filter((row) => String(kind === 'pitcher' ? row.pitcher : row.batter) === String(player.id))
    .filter((row) => row.play_id && row.des);

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.game_pk || gamePk}-${row.ab_number}-${row.des}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  const clips = [];
  const seen = new Set();
  for (const group of groups.values()) {
    group.sort((a, b) => Number(a.pitch_number || 0) - Number(b.pitch_number || 0));
    const finalRow = group[group.length - 1];
    if (!options.mixResults && !isPositiveSavantResult(finalRow, kind)) continue;

    const teamId = kind === 'pitcher' ? finalRow.team_fielding_id : finalRow.team_batting_id;
    const feedType = String(teamId) === String(data.team_home_id) ? 'HOME' : 'AWAY';
    const video = await fetchSavantVideo(finalRow.play_id, feedType).catch(() => null);
    if (!video?.url || seen.has(video.url)) continue;
    seen.add(video.url);

    clips.push({
      id: `savant-${finalRow.play_id}`,
      source: 'baseball-savant',
      gamePk,
      playId: finalRow.play_id,
      headline: video.title || decodeHtml(finalRow.des),
      blurb: decodeHtml(finalRow.des),
      description: decodeHtml(finalRow.des),
      date: data.game_date || '',
      url: video.url,
      playback: `savant-${feedType.toLowerCase()}`,
      inning: finalRow.inning,
      halfInning: finalRow.half_inning,
      atBatNumber: finalRow.ab_number,
      pitchNumber: finalRow.pitch_number,
      result: finalRow.result,
      event: finalRow.events,
      pitchDescription: finalRow.description,
      runsScored: Number(finalRow.post_bat_score || 0) - Number(finalRow.bat_score || 0),
    });
  }

  return clips;
}

function isNonActionClip(text) {
  return [
    'press conference',
    'postgame',
    'interview',
    'talks',
    'discusses',
    'on walk-off',
    'on his',
    'on her',
  ].some((needle) => text.includes(needle));
}

function scoreClip(clip) {
  const text = `${clip.headline} ${clip.blurb}`.toLowerCase();
  const timestamp = Date.parse(clip.date || 0);
  let score = Number.isFinite(timestamp) ? timestamp / (24 * 60 * 60 * 1000 * 1000) : 0;
  if (clip.source === 'baseball-savant') score += 90;
  for (const [needle, boost] of [
    ['home run', 120],
    ['homer', 120],
    ['grand slam', 150],
    ['walk-off', 150],
    ['two-run', 70],
    ['three-run', 80],
    ['rbi', 50],
    ['double', 35],
    ['triple', 45],
    ['stolen base', 35],
    ['strikeout', 45],
    ['dominant', 40],
  ]) {
    if (text.includes(needle)) score += boost;
  }
  return score;
}

function isPitcherLowlightClip(clip) {
  const text = clipText(clip);
  const result = normalizeText(clip.result || clip.event);
  return [
    'home run',
    'double',
    'triple',
    'single',
    'walk',
    'hit by pitch',
    'sac fly',
  ].some((needle) => text.includes(needle) || result.includes(needle)) ||
    Number(clip.runsScored || 0) > 0;
}

function isPitcherHighlightClip(clip) {
  const text = clipText(clip);
  const result = normalizeText(clip.result || clip.event);
  return [
    'strikeout',
    'grounds into a double play',
    'ground into a double play',
    'double play',
    'called out on strikes',
    'strikes out',
    'grounds out',
    'flies out',
    'pops out',
    'lines out',
  ].some((needle) => text.includes(needle) || result.includes(needle));
}

function scorePitcherLowlight(clip) {
  const text = clipText(clip);
  let score = scoreClip(clip);
  for (const [needle, boost] of [
    ['home run', 240],
    ['homer', 240],
    ['scores', 120],
    ['rbi', 120],
    ['double', 100],
    ['triple', 130],
    ['single', 45],
    ['walk', 35],
    ['hit by pitch', 25],
  ]) {
    if (text.includes(needle)) score += boost;
  }
  score += Number(clip.runsScored || 0) * 80;
  return score;
}

function interleaveClips(groups) {
  const result = [];
  let index = 0;
  while (groups.some((group) => index < group.length)) {
    for (const group of groups) {
      if (index < group.length) result.push(group[index]);
    }
    index += 1;
  }
  return result;
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clipText(clip) {
  return normalizeText(`${clip.headline || ''} ${clip.blurb || ''} ${clip.description || ''}`);
}

function situationEventText(event) {
  return {
    single: ['single'],
    double: ['double'],
    triple: ['triple'],
    home_run: ['home run', 'homer'],
    sac_fly: ['sacrifice fly', 'sac fly'],
    walk: ['walk'],
    fielders_choice: ['fielder s choice', 'fielders choice'],
    field_out: ['groundout', 'grounds out', 'lineout', 'lines out', 'flyout', 'flies out'],
  }[event] || [event.replace(/_/g, ' ')];
}

function scoreSituationClip(clip, situationRows) {
  const text = clipText(clip);
  const rowsForGame = situationRows.filter((row) => String(row.game_pk) === String(clip.gamePk));
  if (rowsForGame.length === 0) return -1000;
  let score = Date.parse(clip.date || 0) / (24 * 60 * 60 * 1000 * 1000) || 0;

  if (text.includes('home run') || text.includes('homer')) score -= 80;
  if (text.includes('statcast') || text.includes('breaking down') || text.includes('animated')) score -= 60;
  if (text.includes('throws out')) score -= 50;

  for (const row of rowsForGame) {
    const rowText = normalizeText(row.des);
    for (const label of situationEventText(row.events)) {
      if (text.includes(label)) score += 120;
    }
    if (text.includes('rbi') && /scores|score/.test(rowText)) score += 70;
    if (eventIsHit(row.events)) score += 40;
    if (row.events === 'sac_fly') score += 35;
    if (Number(row.launch_speed || 0) >= 95) score += 15;
    if (rowText.includes('scores') && text.includes('scores')) score += 20;
  }

  return score;
}

function selectClips(found, options, situationRows) {
  const unique = [...new Map(found.map((clip) => [clip.url, clip])).values()];
  if (options.mixResults) {
    const highlights = unique
      .filter(isPitcherHighlightClip)
      .sort((a, b) => scoreClip(b) - scoreClip(a));
    const lowlights = unique
      .filter(isPitcherLowlightClip)
      .sort((a, b) => scorePitcherLowlight(b) - scorePitcherLowlight(a));
    const other = unique
      .filter((clip) => !isPitcherHighlightClip(clip) && !isPitcherLowlightClip(clip))
      .sort((a, b) => scoreClip(b) - scoreClip(a));
    const mixed = interleaveClips([lowlights, highlights]);
    const sorted = options.clips === Infinity ? mixed : [...mixed, ...other];
    return options.clips === Infinity ? sorted : sorted.slice(0, options.clips);
  }
  const sorted = options.situation
    ? unique.sort((a, b) => scoreSituationClip(b, situationRows) - scoreSituationClip(a, situationRows))
    : unique.sort((a, b) => scoreClip(b) - scoreClip(a));
  return options.clips === Infinity ? sorted : sorted.slice(0, options.clips);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'mlb-compilation';
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function runCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
  });
}

function estimatedDuration(clipCount, clipSeconds, transition) {
  if (clipCount <= 0) return 0;
  return (clipCount * clipSeconds) - ((clipCount - 1) * transition);
}

async function probeDuration(filePath) {
  const stdout = await runCapture('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return Number(stdout.trim());
}

async function probeSourceDuration(url) {
  try {
    const duration = await probeDuration(url);
    return Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  }
}

function plannedDuration(plans, transition) {
  if (plans.length === 0) return 0;
  return plans.reduce((sum, plan) => sum + plan.trimSeconds, 0) - ((plans.length - 1) * transition);
}

function roundTenths(value) {
  return Math.round(value * 10) / 10;
}

function actionWindow(clip, knownDuration, options) {
  if (!knownDuration) {
    return {
      startSeconds: 0,
      trimSeconds: Math.min(options.clipSeconds, MAX_CLIP_SECONDS),
    };
  }

  if (knownDuration < MIN_CLIP_SECONDS) return null;

  if (clip.source !== 'baseball-savant') {
    return {
      startSeconds: 0,
      trimSeconds: Math.min(
        options.clipSeconds,
        MAX_CLIP_SECONDS,
        Math.max(MIN_CLIP_SECONDS, knownDuration - 0.2),
      ),
    };
  }

  if (knownDuration <= options.clipSeconds + 0.2) {
    return {
      startSeconds: 0,
      trimSeconds: Math.max(MIN_CLIP_SECONDS, knownDuration - 0.2),
    };
  }

  const headroom = knownDuration - options.clipSeconds;
  const startSeconds = headroom >= SAVANT_ACTION_START_SECONDS + 0.2
    ? SAVANT_ACTION_START_SECONDS
    : Math.max(0, Math.min(1, knownDuration - MIN_CLIP_SECONDS - 0.2));
  const availableAfterStart = knownDuration - startSeconds - 0.2;

  return {
    startSeconds,
    trimSeconds: Math.min(options.clipSeconds, MAX_CLIP_SECONDS, Math.max(MIN_CLIP_SECONDS, availableAfterStart)),
  };
}

async function planClips(clips, options) {
  const plans = [];
  for (const clip of clips) {
    const sourceDuration = await probeSourceDuration(clip.url);
    const knownDuration = sourceDuration && sourceDuration > 0 ? sourceDuration : null;
    const window = actionWindow(clip, knownDuration, options);
    if (!window) {
      console.log(`Skipping short clip (${knownDuration.toFixed(2)}s): ${clip.headline}`);
      continue;
    }
    plans.push({
      ...clip,
      sourceDuration,
      startSeconds: roundTenths(window.startSeconds),
      trimSeconds: roundTenths(window.trimSeconds),
    });
    if (plannedDuration(plans, options.transition) >= MAX_VIDEO_SECONDS) {
      plans.pop();
      break;
    }
  }

  const total = plannedDuration(plans, options.transition);
  if (total < MIN_VIDEO_SECONDS) {
    throw new Error(`Only ${plans.length} usable clips found for ${total.toFixed(2)}s total. Need more clips, not longer clips, to satisfy the ${MIN_VIDEO_SECONDS}s minimum.`);
  }
  if (total > MAX_VIDEO_SECONDS) {
    throw new Error(`Planned video duration ${total.toFixed(2)}s exceeds the ${MAX_VIDEO_SECONDS}s maximum.`);
  }
  return plans;
}

async function renderClip(url, destPath, clipSeconds, startSeconds = 0) {
  const args = [
    '-hide_banner',
    '-y',
  ];
  if (startSeconds > 0) args.push('-ss', String(startSeconds));
  args.push(
    '-i', url,
    '-t', String(clipSeconds),
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

async function renderCompilation(renderedClips, outputPath, transition) {
  if (renderedClips.length === 1) {
    await fs.copyFile(renderedClips[0].path, outputPath);
    return;
  }

  const args = ['-hide_banner', '-y'];
  for (const clip of renderedClips) args.push('-i', clip.path);

  const filters = [];
  let videoLabel = '0:v';
  let audioLabel = '0:a';
  let offset = renderedClips[0].duration - transition;

  for (let i = 1; i < renderedClips.length; i += 1) {
    const vOut = `v${i}`;
    const aOut = `a${i}`;
    filters.push(`[${videoLabel}][${i}:v]xfade=transition=fade:duration=${transition}:offset=${offset.toFixed(3)}[${vOut}]`);
    filters.push(`[${audioLabel}][${i}:a]acrossfade=d=${transition}:c1=tri:c2=tri[${aOut}]`);
    videoLabel = vOut;
    audioLabel = aOut;
    if (i < renderedClips.length - 1) {
      offset += renderedClips[i].duration - transition;
    }
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

function statNumber(stat, key) {
  const value = Number(stat?.[key] || 0);
  return Number.isFinite(value) ? value : 0;
}

function newestSplits(splits) {
  return [...splits].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function formatRate(value) {
  if (!Number.isFinite(value)) return '.---';
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(3).replace(/^0/, '');
}

function formatInnings(outs) {
  const innings = Math.floor(outs / 3);
  const remainder = outs % 3;
  return remainder ? `${innings}.${remainder}` : `${innings}.0`;
}

function parseInnings(value) {
  const text = String(value || '0');
  const [whole, part = '0'] = text.split('.');
  return Number(whole || 0) * 3 + Number(part || 0);
}

function battingLine(splits, games = 7) {
  const recent = newestSplits(splits).slice(0, games);
  const totals = recent.reduce((sum, split) => {
    const stat = split.stat || {};
    sum.ab += statNumber(stat, 'atBats');
    sum.h += statNumber(stat, 'hits');
    sum.bb += statNumber(stat, 'baseOnBalls');
    sum.hbp += statNumber(stat, 'hitByPitch');
    sum.sf += statNumber(stat, 'sacFlies');
    sum.tb += statNumber(stat, 'totalBases');
    sum.hr += statNumber(stat, 'homeRuns');
    sum.rbi += statNumber(stat, 'rbi');
    sum.pa += statNumber(stat, 'plateAppearances');
    return sum;
  }, { ab: 0, h: 0, bb: 0, hbp: 0, sf: 0, tb: 0, hr: 0, rbi: 0, pa: 0 });

  const avg = totals.ab ? totals.h / totals.ab : 0;
  const obpDen = totals.ab + totals.bb + totals.hbp + totals.sf;
  const obp = obpDen ? (totals.h + totals.bb + totals.hbp) / obpDen : 0;
  const slg = totals.ab ? totals.tb / totals.ab : 0;
  return {
    games: recent.length,
    ...totals,
    avg,
    obp,
    slg,
    ops: obp + slg,
    slash: `${formatRate(avg)}/${formatRate(obp)}/${formatRate(slg)}`,
  };
}

function pitchingLine(splits) {
  const sorted = newestSplits(splits);
  const starts = sorted.filter((split) => statNumber(split.stat, 'gamesStarted') > 0);
  const recent = (starts.length >= 2 ? starts.slice(0, 3) : sorted.slice(0, 10));
  const label = starts.length >= 2 ? `last ${recent.length} starts` : `last ${recent.length} games`;
  const totals = recent.reduce((sum, split) => {
    const stat = split.stat || {};
    sum.outs += parseInnings(stat.inningsPitched);
    sum.h += statNumber(stat, 'hits');
    sum.er += statNumber(stat, 'earnedRuns');
    sum.bb += statNumber(stat, 'baseOnBalls');
    sum.k += statNumber(stat, 'strikeOuts');
    sum.pitches += statNumber(stat, 'numberOfPitches');
    return sum;
  }, { outs: 0, h: 0, er: 0, bb: 0, k: 0, pitches: 0 });
  const ip = totals.outs / 3;
  return {
    ...totals,
    label,
    ipText: formatInnings(totals.outs),
    era: ip ? (totals.er * 9) / ip : 0,
    whip: ip ? (totals.h + totals.bb) / ip : 0,
  };
}

function teamTags(player) {
  const teamName = player.currentTeam?.name || '';
  if (teamName === 'New York Mets') return '#Mets #LGM #LFGM';
  return `#${teamName.replace(/[^A-Za-z0-9]/g, '') || 'MLB'}`;
}

function makeTweet(player, stats, clips, savantSummary, hittingLog, pitchingLog, situationSummary) {
  const tags = teamTags(player);
  if (situationSummary?.situation === 'risp') {
    return `${player.fullName} has been CLUTCH for the ${tags.includes('#Mets') ? '#Mets' : player.currentTeam?.name || 'club'} with RISP 🔥\n\n` +
      `With runners in scoring position this season:\n` +
      `🔹${situationSummary.slash} | ${formatRate(situationSummary.ops)} OPS | ${situationSummary.hr} HR | ${situationSummary.rbi} RBI\n` +
      `🔹${situationSummary.h} hits in ${situationSummary.pa} PA\n\n` +
      `That is the kind of situational hitting that changes innings 👀\n\n` +
      tags;
  }

  if (playerKind(player) === 'pitcher') {
    const line = pitchingLine(pitchingLog);
    return `${player.fullName} over his ${line.label}:\n\n` +
      `${line.ipText} IP\n` +
      `${line.era.toFixed(2)} ERA\n` +
      `${line.k} K\n` +
      `${line.bb} BB\n` +
      `${line.whip.toFixed(2)} WHIP\n\n` +
      `Absolute DOMINANCE on the mound 🔥\n\n` +
      tags;
  }

  const line = battingLine(hittingLog, 7);
  const hardHit = savantSummary?.hardHitRate ? `\n🔹${savantSummary.hardHitRate}% Hard-Hit in this stretch` : '';
  const lead = line.ops >= 1
    ? `${player.fullName} has been on a HEATER 🔥`
    : `${player.fullName} has quietly been giving the ${tags.includes('#Mets') ? '#Mets' : player.currentTeam?.name || 'club'} real production`;
  const punch = line.ops >= 1
    ? 'That is LOUD production from the bat 👀'
    : 'That is real value when the bottom of the order starts doing damage 👀';

  return `${lead}\n\n` +
    `Over his last ${line.games} games:\n` +
    `🔹${line.slash} | ${formatRate(line.ops)} OPS | ${line.hr} HR | ${line.rbi} RBI${hardHit}\n\n` +
    `${punch}\n\n` +
    tags;
}

async function writeBrief(outDir, player, season, links, savantSummary, clips, tweet) {
  const lines = [
    `# ${player.fullName} MLB Compilation Brief`,
    '',
    `Season: ${season}`,
    `Team/position: ${player.currentTeam?.name || 'Unknown team'}, ${player.primaryPosition?.abbreviation || 'Unknown'}`,
    '',
    '## Research Links',
    `- FanGraphs: ${links.fangraphs}`,
    `- Baseball Savant: ${links.baseballSavant}`,
    `- MLB player page: ${links.mlbPeople}`,
    '',
    '## Baseball Savant Read',
    savantSummary.summary,
    '',
    '## Selected Clips',
    ...clips.map((clip, index) => {
      const segment = clip.startSeconds ? ` [starts at ${clip.startSeconds}s]` : '';
      return `- ${index + 1}. ${clip.headline}${segment}: ${clip.url}`;
    }),
    '',
    '## Tweet',
    tweet,
    '',
    'Rights note: confirm reuse rights before posting official MLB, team, broadcast, or social video.',
  ];
  await fs.writeFile(path.join(outDir, 'brief.md'), `${lines.join('\n')}\n`);
}

async function main() {
  const { playerName, options } = parseArgs(process.argv.slice(2));
  const player = await fetchPlayer(playerName);
  const outDir = path.join(options.outputDir, `${slugify(player.fullName)}-${options.season}`);
  const clipDir = path.join(outDir, 'clips');
  await fs.mkdir(clipDir, { recursive: true });

  console.log(`Resolved player: ${player.fullName} (${player.id})`);
  const window = resolveDateWindow(options);

  const [hittingLog, pitchingLog, stats, savantRows] = await Promise.all([
    fetchGameLog(player.id, options.season, 'hitting'),
    fetchGameLog(player.id, options.season, 'pitching').catch(() => []),
    fetchSeasonStats(player.id, options.season).catch(() => null),
    fetchSavantRows(player, window.start, window.end),
  ]);
  const savantSummary = summarizeSavant(player, savantRows);
  const situationRows = filterSituationRows(savantRows, options.situation);
  const situationSummary = summarizeSituationHitting(savantRows, options.situation);
  const links = {
    fangraphs: fangraphsUrl(player),
    baseballSavant: savantUrl(player, window.start, window.end, false),
    mlbPeople: `${MLB_BASE}/api/v1/people/${player.id}`,
  };

  const gameLog = [...hittingLog, ...pitchingLog]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const windowGameLog = gameLog
    .filter((split) => split.date >= window.start && split.date <= window.end);
  const lastGamePks = options.lastGames
    ? gameLog
      .map((split) => split.game?.gamePk)
      .filter(Boolean)
      .slice(0, options.lastGames)
    : null;

  const recentGamePks = lastGamePks || (options.situation
    ? situationRows
      .sort((a, b) => String(b.game_date).localeCompare(String(a.game_date)))
      .map((row) => row.game_pk)
      .filter(Boolean)
    : windowGameLog
      .map((split) => split.game?.gamePk)
      .filter(Boolean));
  const uniqueGamePks = [...new Set(recentGamePks)].slice(0, 30);
  if (uniqueGamePks.length === 0) throw new Error(`No ${options.season} regular-season game log found for ${player.fullName}.`);

  const found = [];
  for (const gamePk of uniqueGamePks) {
    const savantClips = await fetchSavantGameClips(gamePk, player, options).catch(() => []);
    found.push(...savantClips);
    if (savantClips.length === 0) {
      const gameClips = await fetchGameClips(gamePk, player);
      found.push(...gameClips);
    }
  }

  const deduped = selectClips(found, options, situationRows);

  if (deduped.length === 0) {
    throw new Error(`No downloadable MLB clips tagged to ${player.fullName} were found in recent ${options.season} games.`);
  }

  const clipPlans = await planClips(deduped, options);
  const expectedDuration = plannedDuration(clipPlans, options.transition);
  console.log(`Planned ${clipPlans.length} clips for ${expectedDuration.toFixed(2)}s total.`);

  const tweet = makeTweet(player, stats, clipPlans, savantSummary, hittingLog, pitchingLog, situationSummary);
  await fs.writeFile(path.join(outDir, 'metadata.json'), JSON.stringify({
    player,
    stats,
    research: {
      dateWindow: window,
      lastGames: options.lastGames
        ? gameLog.slice(0, options.lastGames).map((split) => ({
          date: split.date,
          gamePk: split.game?.gamePk,
          opponent: split.opponent?.name,
        }))
        : null,
      links,
      baseballSavant: savantSummary,
      situation: situationSummary,
    },
    render: {
      width: 1920,
      height: 1080,
      targetClipSeconds: options.clipSeconds,
      minClipSeconds: MIN_CLIP_SECONDS,
      maxClipSeconds: MAX_CLIP_SECONDS,
      transition: options.transition,
      expectedDuration,
      minDuration: MIN_VIDEO_SECONDS,
      maxDuration: MAX_VIDEO_SECONDS,
    },
    clips: clipPlans,
  }, null, 2) + '\n');
  await writeBrief(outDir, player, options.season, links, savantSummary, clipPlans, tweet);

  if (!options.dryRun) {
    await fs.rm(clipDir, { recursive: true, force: true });
    await fs.mkdir(clipDir, { recursive: true });
    const renderedClips = [];
    for (let i = 0; i < clipPlans.length; i += 1) {
      const plan = clipPlans[i];
      const destPath = path.join(clipDir, `${String(i + 1).padStart(2, '0')}-${slugify(plan.headline)}.mp4`);
      const startLabel = plan.startSeconds ? ` from ${plan.startSeconds}s` : '';
      console.log(`Rendering clip ${i + 1}/${clipPlans.length} (${plan.trimSeconds}s${startLabel}): ${plan.headline}`);
      await renderClip(plan.url, destPath, plan.trimSeconds, plan.startSeconds);
      const renderedDuration = await probeDuration(destPath);
      renderedClips.push({ path: destPath, duration: renderedDuration });
    }

    console.log('Building compilation with blend transitions...');
    const compilationPath = path.join(outDir, 'compilation.mp4');
    await renderCompilation(renderedClips, compilationPath, options.transition);
    const actualDuration = await probeDuration(compilationPath);
    if (actualDuration < MIN_VIDEO_SECONDS || actualDuration > MAX_VIDEO_SECONDS) {
      throw new Error(`Rendered video duration ${actualDuration.toFixed(2)}s violates the ${MIN_VIDEO_SECONDS}-${MAX_VIDEO_SECONDS}s rule.`);
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
