import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { formatLessonNumber, getRawLesson } from '../src/data/get-lesson';
import { splitFeedbackPromptText } from '../src/lib/parse-transcript';
import { joinText } from '../src/lib/text-utils';
import type { RawLesson, RawLessonTurn, SpeechSegment } from '../src/types/lesson';

const execFile = promisify(execFileCallback);
const DEFAULT_PDF_PATH = path.join(
  os.homedir(),
  'Downloads',
  'Complete+Spanish+transcript+-+2019+final.pdf'
);
const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const ROW_TOP_TOLERANCE = 2;
const LESSONS_TO_SKIP = new Set([1, 2, 25]);

type ParsedNode = {
  pageNumber: number;
  top: number;
  left: number;
  text: string;
  rawContent: string;
};

type Row = {
  pageNumber: number;
  top: number;
  nodes: ParsedNode[];
};

type ParsedTurn = {
  speaker: 'tutor' | 'student';
  pieces: SpeechSegment[];
};

type ParsedTrack = {
  lessonNumber: number;
  turns: ParsedTurn[];
};

function decodeXmlText(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, '');
}

function normalizeInlineWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

// joinText is imported from src/lib/text-utils.ts

function classifyLang(rawContent: string): SpeechSegment['lang'] {
  if (/<i>/i.test(rawContent)) {
    return 'en';
  }

  if (/<b>/i.test(rawContent)) {
    return 'es';
  }

  return 'en';
}

function parseTextNodes(xml: string): Row[] {
  const pageRegex = /<page\b([^>]*)number="(\d+)"[^>]*>([\s\S]*?)<\/page>/g;
  const rows: Row[] = [];

  for (const pageMatch of xml.matchAll(pageRegex)) {
    const pageNumber = Number(pageMatch[2]);
    const pageContent = pageMatch[3];
    const nodes: ParsedNode[] = [];
    const textRegex = /<text\b([^>]*)top="(\d+)"[^>]*left="(\d+)"[^>]*font="(\d+)"[^>]*>([\s\S]*?)<\/text>/g;

    for (const textMatch of pageContent.matchAll(textRegex)) {
      const top = Number(textMatch[2]);
      const left = Number(textMatch[3]);
      const rawContent = textMatch[5];
      const text = decodeXmlText(stripTags(rawContent));

      if (!text.trim()) {
        continue;
      }

      nodes.push({
        pageNumber,
        top,
        left,
        text,
        rawContent
      });
    }

    nodes.sort((a, b) => (a.top - b.top) || (a.left - b.left));

    let currentRow: Row | null = null;
    for (const node of nodes) {
      if (!currentRow || Math.abs(node.top - currentRow.top) > ROW_TOP_TOLERANCE) {
        currentRow = {
          pageNumber,
          top: node.top,
          nodes: [node]
        };
        rows.push(currentRow);
        continue;
      }

      currentRow.nodes.push(node);
    }
  }

  return rows;
}

function rowText(row: Row) {
  return normalizeInlineWhitespace(
    row.nodes.reduce((combined, node) => joinText(combined, node.text), '')
  );
}

function getTrackNumber(row: Row) {
  const match = rowText(row).match(/^Track\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function extractSpeaker(row: Row) {
  const firstNodeIndex = row.nodes.findIndex((node) => node.text.trim().length > 0);
  if (firstNodeIndex === -1) return null;

  const firstNode = row.nodes[firstNodeIndex];
  const match = firstNode.text.match(/^\s*(Teacher|Student|T|S):\s*/i);
  if (!match) return null;

  const speaker = /^(Teacher|T)$/i.test(match[1]) ? 'tutor' as const : 'student' as const;
  const trimmedNodes = row.nodes
    .slice(firstNodeIndex)
    .map((node, index) => {
      if (index > 0) return node;

      const nextText = node.text.replace(match[0], '');
      const nextRawContent = node.rawContent.replace(match[0], '');
      return {
        ...node,
        text: nextText,
        rawContent: nextRawContent
      };
    })
    .filter((node) => node.text.trim().length > 0);

  return {
    speaker,
    nodes: trimmedNodes
  };
}

function mergeSegments(segments: SpeechSegment[]) {
  const merged: SpeechSegment[] = [];

  for (const segment of segments) {
    const normalizedText = normalizeInlineWhitespace(segment.text);
    if (!normalizedText) continue;

    const previous = merged[merged.length - 1];
    if (previous && previous.lang === segment.lang) {
      previous.text = joinText(previous.text, normalizedText);
      continue;
    }

    merged.push({
      lang: segment.lang,
      text: normalizedText
    });
  }

  return merged;
}

function rowsToSegments(nodes: ParsedNode[]) {
  return mergeSegments(
    nodes.map((node) => ({
      text: node.text,
      lang: classifyLang(node.rawContent)
    }))
  );
}

function finalizeTurn(track: ParsedTrack | null, turn: ParsedTurn | null) {
  if (!track || !turn) return null;

  const normalizedPieces = mergeSegments(turn.pieces);
  if (normalizedPieces.length === 0) {
    return null;
  }

  track.turns.push({
    speaker: turn.speaker,
    pieces: normalizedPieces
  });
  return null;
}

function buildTracks(rows: Row[]) {
  const tracks = new Map<number, ParsedTrack>();
  let currentTrack: ParsedTrack | null = null;
  let currentTurn: ParsedTurn | null = null;

  for (const row of rows) {
    const trackNumber = getTrackNumber(row);
    if (trackNumber !== null) {
      currentTurn = finalizeTurn(currentTrack, currentTurn);

      if (LESSONS_TO_SKIP.has(trackNumber)) {
        currentTrack = null;
        continue;
      }

      currentTrack = tracks.get(trackNumber) ?? { lessonNumber: trackNumber, turns: [] };
      tracks.set(trackNumber, currentTrack);
      continue;
    }

    if (!currentTrack) {
      continue;
    }

    const speakerRow = extractSpeaker(row);
    if (speakerRow) {
      currentTurn = finalizeTurn(currentTrack, currentTurn);
      currentTurn = {
        speaker: speakerRow.speaker,
        pieces: rowsToSegments(speakerRow.nodes)
      };
      continue;
    }

    if (!currentTurn) {
      continue;
    }

    currentTurn.pieces.push(...rowsToSegments(row.nodes));
  }

  finalizeTurn(currentTrack, currentTurn);
  return tracks;
}

function flattenTurnText(pieces: SpeechSegment[]) {
  return pieces.reduce((combined, piece) => joinText(combined, piece.text), '');
}

function buildExpectedAnswers(turn: ParsedTurn) {
  const spanishText = flattenTurnText(turn.pieces.filter((piece) => piece.lang === 'es'));
  const fallbackText = flattenTurnText(turn.pieces);
  const candidate = normalizeInlineWhitespace(spanishText || fallbackText);
  return candidate ? [candidate] : [];
}

function convertTrackToLesson(track: ParsedTrack) {
  const turns: RawLessonTurn[] = track.turns.map((turn) => {
    if (turn.speaker === 'student') {
      return {
        speaker: 'student',
        expected_answers: buildExpectedAnswers(turn)
      };
    }

    return {
      speaker: 'tutor',
      text: flattenTurnText(turn.pieces)
    };
  });

  turns.forEach((turn, index) => {
    if (turn.speaker !== 'tutor') return;

    const previousTurn = turns[index - 1];
    const nextTurn = turns[index + 1];
    turn.is_feedback = previousTurn?.speaker === 'student';
    turn.is_prompt = nextTurn?.speaker === 'student';
  });

  return turns;
}

function splitSegmentsAtOffset(
  pieces: SpeechSegment[],
  splitIndex: number
): { revealSegments: SpeechSegment[]; promptSegments: SpeechSegment[] } {
  if (splitIndex <= 0) {
    return { revealSegments: [], promptSegments: mergeSegments(pieces) };
  }

  // Build flat text incrementally (same as flattenTurnText) to find each piece's position
  const piecePositions: Array<{ start: number; trimmedLen: number }> = [];
  let flat = '';
  for (const piece of pieces) {
    flat = joinText(flat, piece.text);
    const trimmedLen = piece.text.trim().length;
    piecePositions.push({ start: flat.length - trimmedLen, trimmedLen });
  }

  if (splitIndex >= flat.length) {
    return { revealSegments: mergeSegments(pieces), promptSegments: [] };
  }

  const revealSegments: SpeechSegment[] = [];
  const promptSegments: SpeechSegment[] = [];

  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    const pos = piecePositions[i];
    const pieceEnd = pos.start + pos.trimmedLen;

    if (pieceEnd <= splitIndex) {
      revealSegments.push(piece);
      continue;
    }

    if (pos.start >= splitIndex) {
      promptSegments.push(piece);
      continue;
    }

    // Split falls within this piece's text
    const trimmed = piece.text.trim();
    const offsetInTrimmed = splitIndex - pos.start;
    const revealText = trimmed.slice(0, offsetInTrimmed).trim();
    const promptText = trimmed.slice(offsetInTrimmed).trim();

    if (revealText) {
      revealSegments.push({ lang: piece.lang, text: revealText });
    }
    if (promptText) {
      promptSegments.push({ lang: piece.lang, text: promptText });
    }
  }

  return {
    revealSegments: mergeSegments(revealSegments),
    promptSegments: mergeSegments(promptSegments)
  };
}

function buildSegmentMap(track: ParsedTrack, rawTurns: RawLessonTurn[]) {
  const entries: Record<string, SpeechSegment[]> = {};

  track.turns.forEach((turn, index) => {
    if (turn.speaker !== 'tutor') return;

    const rawTurn = rawTurns[index];
    const keyBase = `turn-${index + 1}`;

    if (rawTurn?.is_feedback && rawTurn?.is_prompt) {
      const { splitIndex } = splitFeedbackPromptText(rawTurn.text ?? '');
      const { revealSegments, promptSegments } = splitSegmentsAtOffset(
        mergeSegments(turn.pieces),
        splitIndex
      );

      if (revealSegments.length > 0) {
        entries[`${keyBase}-reveal`] = revealSegments;
      }
      if (promptSegments.length > 0) {
        entries[`${keyBase}-prompt`] = promptSegments;
      }
    } else {
      entries[`${keyBase}-full`] = mergeSegments(turn.pieces);
    }
  });

  return entries;
}

function parseArgs(args: string[]) {
  const lessons = new Set<number>();
  let all = false;
  let force = false;
  let pdfPath = DEFAULT_PDF_PATH;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--all') {
      all = true;
      continue;
    }

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--lesson') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value)) {
        throw new Error(`Invalid lesson number: ${args[index + 1] ?? '(missing)'}`);
      }

      lessons.add(value);
      index += 1;
      continue;
    }

    if (arg === '--pdf') {
      pdfPath = path.resolve(args[index + 1]);
      index += 1;
    }
  }

  if (!all && lessons.size === 0) {
    throw new Error('Use --lesson N or --all.');
  }

  return {
    all,
    force,
    pdfPath,
    lessonNumbers: [...lessons].sort((a, b) => a - b)
  };
}

async function renderPdfToXml(pdfPath: string) {
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'voiceai-pdf-'));
  const xmlPath = path.join(tempDir, 'transcript.xml');

  try {
    await execFile('pdftohtml', ['-xml', pdfPath, xmlPath]);
    return {
      xml: readFileSync(xmlPath, 'utf8'),
      cleanup: () => rm(tempDir, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function getOutputPaths(lessonNumber: number) {
  const suffix = formatLessonNumber(lessonNumber);
  return {
    lessonPath: path.join(DATA_DIR, `lesson-${suffix}.json`),
    segmentsPath: path.join(DATA_DIR, `lesson-${suffix}-segments.json`)
  };
}

function readExistingLesson(lessonNumber: number) {
  try {
    return getRawLesson(lessonNumber);
  } catch {
    return null;
  }
}

async function writeLessonFiles(
  lessonNumber: number,
  rawLesson: RawLesson,
  segments: Record<string, SpeechSegment[]>
) {
  const { lessonPath, segmentsPath } = getOutputPaths(lessonNumber);
  await writeFile(lessonPath, `${JSON.stringify(rawLesson, null, 2)}\n`, 'utf8');
  await writeFile(segmentsPath, `${JSON.stringify(segments, null, 2)}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { xml, cleanup } = await renderPdfToXml(args.pdfPath);

  try {
    const tracks = buildTracks(parseTextNodes(xml));
    const lessonNumbers = args.all
      ? [...tracks.keys()].filter((lessonNumber) => !LESSONS_TO_SKIP.has(lessonNumber)).sort((a, b) => a - b)
      : args.lessonNumbers;

    for (const lessonNumber of lessonNumbers) {
      if (LESSONS_TO_SKIP.has(lessonNumber)) {
        console.warn(`Skipping lesson ${lessonNumber}: configured skip.`);
        continue;
      }

      const track = tracks.get(lessonNumber);
      if (!track) {
        console.warn(`Skipping lesson ${lessonNumber}: no track found in PDF.`);
        continue;
      }

      const existingLesson = readExistingLesson(lessonNumber);
      const { lessonPath, segmentsPath } = getOutputPaths(lessonNumber);
      const shouldSkipExisting = !args.force && (existsSync(lessonPath) || existsSync(segmentsPath));
      if (shouldSkipExisting) {
        console.log(`Skipping lesson ${lessonNumber}: files already exist. Re-run with --force to overwrite.`);
        continue;
      }

      const rawLesson: RawLesson = {
        lesson_number: lessonNumber,
        title: existingLesson?.title ?? `Lesson ${formatLessonNumber(lessonNumber)}`,
        description: existingLesson?.description ?? '',
        turns: convertTrackToLesson(track),
        outro: existingLesson?.outro
      };

      await writeLessonFiles(lessonNumber, rawLesson, buildSegmentMap(track, rawLesson.turns));
      console.log(`Wrote lesson ${lessonNumber}: ${lessonPath}`);
    }
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
