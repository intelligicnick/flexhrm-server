import { TenderStatus } from '../../database/schemas/tender.schema';

export type GemStageState = 'in progress' | 'completed' | 'pending' | 'not awarded';

function normalizeBidAwardHeader(value: string): boolean {
  const header = value.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    header.includes('bid / ra award') ||
    header.includes('bid/ra award') ||
    header.includes('bid award')
  );
}

export function parseGemStageLines(gemCurrentStage: string): string[] {
  return gemCurrentStage
    .split('→')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseStageLine(line: string): { label: string; state: GemStageState } | null {
  const match = line.match(/^(.+?)\s+\((in progress|completed|pending|not awarded)\)$/i);
  if (!match) return null;
  return { label: match[1].trim(), state: match[2].toLowerCase() as GemStageState };
}

export function stageStateFromLines(
  stageLines: string[],
  keyword: string,
): GemStageState | '' {
  const needle = keyword.toLowerCase();
  for (const line of stageLines) {
    const parsed = parseStageLine(line);
    if (parsed && parsed.label.toLowerCase().includes(needle)) return parsed.state;
  }
  return '';
}

export function extractProcessStatus(cardText: string): string {
  const block = cardText.match(
    /Status\s*:\s*([^\n]+?)(?=\s*Bid\/RA\s*Status|\s*Items|\s*Quantity|$)/i,
  );
  if (block?.[1]) {
    const value = block[1].trim();
    if (value && !/bid\/ra/i.test(value)) return value;
  }

  const multiline = cardText.match(
    /Status\s*:\s*\n\s*(Technical Evaluation|Financial Evaluation|Bid\s*\/?\s*RA\s*Award|Bid Award|Evaluation)/i,
  );
  if (multiline?.[1]) return multiline[1].trim();

  const inline = cardText.match(
    /Status\s+(Technical Evaluation|Financial Evaluation|Bid\s*\/?\s*RA\s*Award|Bid Award|Evaluation)/i,
  );
  return inline?.[1]?.trim() ?? '';
}

function extractTechnicalStatus(cardText: string): string {
  const match = cardText.match(/Technical\s+Status\s*[: ]+\s*([^\n]+)/i);
  return match?.[1]?.trim() ?? '';
}

export function detectSelfBidAward(cardText: string): boolean {
  const text = cardText.toLowerCase();
  if (/not\s+(?:selected|awarded|l1)/i.test(text)) return false;
  if (/unsuccessful|not\s+won|lost\s+bid/i.test(text)) return false;
  if (/\bl1\b/.test(text)) return true;
  if (/single\s+selected/i.test(text)) return true;
  if (/you\s+(?:have\s+been\s+)?(?:awarded|won)/i.test(text)) return true;
  if (/your\s+bid\s+is\s+(?:selected|awarded)/i.test(text)) return true;
  if (/contract\s+awarded\s+to\s+you/i.test(text)) return true;
  if (/won\s+the\s+bid/i.test(text)) return true;
  return false;
}

function bidAwardStatus(
  bidAward: GemStageState | '',
  selfAwarded: boolean,
): TenderStatus {
  if (selfAwarded) return 'won_bid';
  if (bidAward === 'not awarded') return 'bid_not_awarded';
  if (bidAward === 'completed') return 'bid_awarded';
  if (bidAward === 'in progress') return 'qualified';
  return 'qualified';
}

/** Map GeM progress stage lines to FlexHRM tender status. */
export function deriveStatusFromGemProgress(
  processStatus: string,
  technicalStatus: string,
  stageLines: string[],
  participated: boolean,
  cardText = '',
): TenderStatus {
  const techResult = technicalStatus.toLowerCase().trim();
  if (techResult.includes('disqualified')) return 'disqualified';

  const tech = stageStateFromLines(stageLines, 'technical');
  const financial = stageStateFromLines(stageLines, 'financial');
  const bidAward = stageStateFromLines(stageLines, 'bid award');
  const hasFinancialStage = stageLines.some((line) =>
    /financial evaluation/i.test(line),
  );
  const header = processStatus.toLowerCase();
  const atBidAwardStage =
    bidAward === 'completed' ||
    bidAward === 'in progress' ||
    bidAward === 'not awarded' ||
    normalizeBidAwardHeader(header);

  if (atBidAwardStage) {
    return bidAwardStatus(bidAward, detectSelfBidAward(cardText));
  }
  if (financial === 'in progress' || header.includes('financial evaluation')) {
    return 'financial';
  }
  if (
    techResult.includes('qualified') ||
    tech === 'completed' ||
    (financial === 'completed' && hasFinancialStage)
  ) {
    return 'technical_qualified';
  }
  if (tech === 'in progress' || header.includes('technical evaluation')) {
    return 'filed';
  }
  if (participated) return 'filed';
  return 'not_filed';
}

export function deriveOutcomeFromGemProgress(input: {
  processStatus: string;
  technicalStatus: string;
  stageLines: string[];
  participated: boolean;
  cardText: string;
  status: TenderStatus;
}): string {
  const { processStatus, technicalStatus, stageLines, participated, cardText, status } = input;
  const selfAwarded = detectSelfBidAward(cardText);
  const bidAward = stageStateFromLines(stageLines, 'bid award');

  if (technicalStatus.toLowerCase().includes('disqualified')) return 'Disqualified';
  if (status === 'won_bid' || selfAwarded) return 'Won the Bid';
  if (
    bidAward === 'completed' ||
    bidAward === 'in progress' ||
    bidAward === 'not awarded' ||
    normalizeBidAwardHeader(processStatus)
  ) {
    if (selfAwarded) return 'Won the Bid';
    if (bidAward === 'not awarded') return 'Bid Not Awarded';
    if (bidAward === 'completed') return 'Bid Awarded';
    if (bidAward === 'in progress') return 'Bid Award in Progress';
    return 'Qualified';
  }
  if (technicalStatus.toLowerCase().includes('qualified')) return 'Qualified';
  if (status === 'financial') return 'Financial Evaluation';
  return participated ? 'Participated' : '';
}

export function inferTenderStatusFromGemSyncFields(item: {
  gemCurrentStage?: string;
  outcome?: string;
  status?: TenderStatus;
}): TenderStatus | undefined {
  const stageText = String(item.gemCurrentStage || '').trim();
  const outcomeText = String(item.outcome || '').trim();
  const cardText = [outcomeText, stageText].filter(Boolean).join('\n');
  const stageLines = parseGemStageLines(stageText);
  const processStatus = extractProcessStatus(cardText);
  const technicalStatus = extractTechnicalStatus(cardText);
  const participated =
    Boolean(technicalStatus) ||
    /\bparticipated\b/i.test(cardText) ||
    /technical evaluation|financial evaluation/i.test(processStatus.toLowerCase()) ||
    normalizeBidAwardHeader(processStatus) ||
    (item.status !== undefined && item.status !== 'not_filed');

  if (stageLines.length === 0 && !processStatus && !technicalStatus && !outcomeText) {
    return undefined;
  }

  return deriveStatusFromGemProgress(
    processStatus,
    technicalStatus,
    stageLines,
    participated,
    cardText,
  );
}

export function inferTenderOutcomeFromGemSyncFields(item: {
  gemCurrentStage?: string;
  outcome?: string;
  status?: TenderStatus;
}): string | undefined {
  const stageText = String(item.gemCurrentStage || '').trim();
  const outcomeText = String(item.outcome || '').trim();
  const cardText = [outcomeText, stageText].filter(Boolean).join('\n');
  const stageLines = parseGemStageLines(stageText);
  const processStatus = extractProcessStatus(cardText);
  const technicalStatus = extractTechnicalStatus(cardText);
  const participated =
    Boolean(technicalStatus) ||
    /\bparticipated\b/i.test(cardText) ||
    /technical evaluation|financial evaluation/i.test(processStatus.toLowerCase()) ||
    normalizeBidAwardHeader(processStatus) ||
    (item.status !== undefined && item.status !== 'not_filed');
  const status =
    item.status ??
    deriveStatusFromGemProgress(
      processStatus,
      technicalStatus,
      stageLines,
      participated,
      cardText,
    );

  const derived = deriveOutcomeFromGemProgress({
    processStatus,
    technicalStatus,
    stageLines,
    participated,
    cardText,
    status,
  });
  return derived || undefined;
}
