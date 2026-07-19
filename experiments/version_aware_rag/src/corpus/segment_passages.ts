import { ParsedPage } from './parse_markdown_pages';

export interface SegmentedPassage {
  text: string;
  char_start: number;
  char_end: number;
}

interface Block {
  text: string;
  char_start: number;
  char_end: number;
  isHeading: boolean;
}

const MIN_WORDS = 60;
const MAX_WORDS = 300;
const OVERLAP_WORDS_TARGET = 50;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  // Regex that captures sentence punctuation boundaries but preserves the punctuation
  const sentenceRegex = /[^.!?]+(?:[.!?]+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = sentenceRegex.exec(text)) !== null) {
    const s = match[0].trim();
    if (s) {
      sentences.push(s);
    }
  }
  return sentences;
}

/**
 * Splits a single block of text that exceeds MAX_WORDS into multiple overlapping passages.
 */
function splitLongBlock(block: Block): SegmentedPassage[] {
  const sentences = splitIntoSentences(block.text);
  if (sentences.length <= 1) {
    // Cannot split further
    return [{ text: block.text, char_start: block.char_start, char_end: block.char_end }];
  }

  const subChunks: SegmentedPassage[] = [];
  let startIdx = 0;

  while (startIdx < sentences.length) {
    let currentText = '';
    let endIdx = startIdx;

    while (endIdx < sentences.length) {
      const nextText = currentText ? currentText + ' ' + sentences[endIdx] : sentences[endIdx];
      if (wordCount(nextText) > MAX_WORDS && currentText !== '') {
        break;
      }
      currentText = nextText;
      endIdx++;
    }

    // Find the exact start and end offset of currentText within the block text
    const indexInBlock = block.text.indexOf(currentText);
    const charStart = block.char_start + (indexInBlock >= 0 ? indexInBlock : 0);
    const charEnd = charStart + currentText.length;

    subChunks.push({
      text: currentText,
      char_start: charStart,
      char_end: charEnd,
    });

    if (endIdx >= sentences.length) {
      break;
    }

    // Calculate start index for next chunk to maintain overlap
    let overlapWords = 0;
    let nextStartIdx = endIdx - 1;
    while (nextStartIdx > startIdx) {
      const testOverlapText = sentences.slice(nextStartIdx, endIdx).join(' ');
      if (wordCount(testOverlapText) >= OVERLAP_WORDS_TARGET) {
        break;
      }
      nextStartIdx--;
    }

    // Always advance by at least 1 sentence to prevent infinite loop
    startIdx = Math.max(nextStartIdx, startIdx + 1);
  }

  return subChunks;
}

/**
 * Identifies block-level chunks separated by empty lines on a page.
 */
function findInitialBlocks(text: string, pageCharStart: number): Block[] {
  const blocks: Block[] = [];
  // Match groups of consecutive non-empty lines
  const regex = /[^\n]+(?:\n[^\n]+)*/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const blockTextRaw = match[0];
    const blockText = blockTextRaw.trim();
    if (!blockText) continue;

    const trimStartOffset = blockTextRaw.indexOf(blockText);
    const blockStart = pageCharStart + match.index + (trimStartOffset >= 0 ? trimStartOffset : 0);
    const blockEnd = blockStart + blockText.length;
    const isHeading = blockText.startsWith('#');

    blocks.push({
      text: blockText,
      char_start: blockStart,
      char_end: blockEnd,
      isHeading
    });
  }

  return blocks;
}

/**
 * Segments a parsed page into passage-level segments.
 * Groups headings and short paragraphs together, and splits long blocks.
 */
export function segmentPage(page: ParsedPage): SegmentedPassage[] {
  const blocks = findInitialBlocks(page.text, page.char_start);
  if (blocks.length === 0) return [];

  const passages: SegmentedPassage[] = [];
  let currentText = '';
  let currentStart = -1;
  let currentEnd = -1;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (currentStart === -1) {
      currentText = block.text;
      currentStart = block.char_start;
      currentEnd = block.char_end;
    } else {
      currentText += '\n\n' + block.text;
      currentEnd = block.char_end;
    }

    const currentWords = wordCount(currentText);
    const nextBlock = blocks[i + 1];
    let shouldEmit = false;

    if (!nextBlock) {
      shouldEmit = true;
    } else {
      const combinedWords = wordCount(currentText + '\n\n' + nextBlock.text);
      if (nextBlock.isHeading && currentWords >= MIN_WORDS) {
        shouldEmit = true;
      } else if (combinedWords > MAX_WORDS && currentWords >= MIN_WORDS) {
        shouldEmit = true;
      }
    }

    if (shouldEmit) {
      if (currentWords > MAX_WORDS) {
        const splits = splitLongBlock({
          text: currentText,
          char_start: currentStart,
          char_end: currentEnd,
          isHeading: false
        });
        passages.push(...splits);
      } else {
        passages.push({
          text: currentText,
          char_start: currentStart,
          char_end: currentEnd
        });
      }
      currentStart = -1; // reset accumulator
    }
  }

  return passages;
}
