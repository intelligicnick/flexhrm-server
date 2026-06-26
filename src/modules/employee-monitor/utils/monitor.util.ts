export const WEBSITE_CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  social: [/facebook\.com/i, /instagram\.com/i, /twitter\.com/i, /x\.com/i, /linkedin\.com/i, /tiktok\.com/i],
  entertainment: [/youtube\.com/i, /netflix\.com/i, /spotify\.com/i, /twitch\.tv/i],
  shopping: [/amazon\./i, /flipkart\.com/i, /ebay\.com/i, /myntra\.com/i],
  ai_tools: [/chatgpt\.com/i, /openai\.com/i, /claude\.ai/i, /gemini\.google/i, /copilot\.microsoft/i],
  news: [/news\./i, /bbc\.com/i, /cnn\.com/i, /timesofindia/i],
  education: [/coursera\.org/i, /udemy\.com/i, /khanacademy/i, /edx\.org/i],
  work: [/github\.com/i, /gitlab\.com/i, /jira\./i, /confluence\./i, /office\.com/i, /google\.com\/docs/i],
};

export function categorizeWebsite(domain: string, url: string): string {
  const haystack = `${domain} ${url}`;
  for (const [category, patterns] of Object.entries(WEBSITE_CATEGORY_PATTERNS)) {
    if (patterns.some((p) => p.test(haystack))) return category;
  }
  if (/google\.com\/search/i.test(url)) return 'work';
  return 'unknown';
}

export function classifyApp(
  appName: string,
  classification: { productive: string[]; neutral: string[]; unproductive: string[] },
): 'productive' | 'neutral' | 'unproductive' | 'unknown' {
  const name = appName.toLowerCase();
  if (classification.productive.some((p) => name.includes(p.toLowerCase()))) return 'productive';
  if (classification.unproductive.some((p) => name.includes(p.toLowerCase()))) return 'unproductive';
  if (classification.neutral.some((p) => name.includes(p.toLowerCase()))) return 'neutral';
  return 'unknown';
}

export function computeProductivityScore(
  productiveSeconds: number,
  neutralSeconds: number,
  unproductiveSeconds: number,
): number {
  const total = productiveSeconds + neutralSeconds + unproductiveSeconds;
  if (total <= 0) return 0;
  const weighted = productiveSeconds * 1 + neutralSeconds * 0.5 + unproductiveSeconds * 0;
  return Math.round((weighted / total) * 100);
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.split('/')[0]?.replace(/^www\./, '') ?? '';
  }
}

export function toDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export type MonitorPeriod = 'daily' | 'weekly' | 'monthly';

export function resolveDateRange(
  referenceDate: string,
  period: MonitorPeriod = 'daily',
): { startDate: string; endDate: string; dates: string[] } {
  const ref = new Date(`${referenceDate}T12:00:00`);
  if (Number.isNaN(ref.getTime())) {
    const today = toDateKey();
    return { startDate: today, endDate: today, dates: [today] };
  }

  if (period === 'daily') {
    return { startDate: referenceDate, endDate: referenceDate, dates: [referenceDate] };
  }

  if (period === 'weekly') {
    const day = ref.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const start = new Date(ref);
    start.setDate(ref.getDate() - diff);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(toDateKey(d));
    }
    return { startDate: dates[0], endDate: dates[dates.length - 1], dates };
  }

  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(toDateKey(d));
  }
  return { startDate: dates[0], endDate: dates[dates.length - 1], dates };
}

const APP_DISPLAY_NAMES: Record<string, string> = {
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  firefox: 'Mozilla Firefox',
  safari: 'Safari',
  winword: 'Microsoft Word',
  word: 'Microsoft Word',
  excel: 'Microsoft Excel',
  powerpnt: 'Microsoft PowerPoint',
  outlook: 'Microsoft Outlook',
  teams: 'Microsoft Teams',
  zoom: 'Zoom',
  code: 'Visual Studio Code',
  devenv: 'Visual Studio',
  notepad: 'Notepad',
  explorer: 'File Explorer',
  slack: 'Slack',
  discord: 'Discord',
  spotify: 'Spotify',
  winrar: 'WinRAR',
  acrobat: 'Adobe Acrobat',
  photoshop: 'Adobe Photoshop',
};

export function formatAppName(processName: string, windowTitle?: string): string {
  const raw = (processName || windowTitle || 'Unknown').trim();
  const key = raw.toLowerCase().replace(/\.exe$/i, '');
  if (APP_DISPLAY_NAMES[key]) return APP_DISPLAY_NAMES[key];
  if (/^chrome$/i.test(key)) return 'Google Chrome';
  if (/^msedge$/i.test(key)) return 'Microsoft Edge';
  const cleaned = raw.replace(/\.exe$/i, '');
  if (!cleaned) return 'Unknown';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export interface WorkingHoursConfig {
  startTime: string;
  endTime: string;
  workDays: number[];
  timezone?: string;
}

export function parseTimeOnDate(dateKey: string, time: string): Date {
  const [h, m] = time.split(':').map((v) => parseInt(v, 10) || 0);
  const d = new Date(`${dateKey}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

export function getExpectedWorkSeconds(dateKey: string, config: WorkingHoursConfig): number {
  const day = new Date(`${dateKey}T12:00:00`).getDay();
  if (!config.workDays.includes(day)) return 0;
  const start = parseTimeOnDate(dateKey, config.startTime);
  const end = parseTimeOnDate(dateKey, config.endTime);
  const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
  return seconds > 0 ? seconds : 0;
}

export function planFeatures(plan: 'starter' | 'professional' | 'enterprise') {
  if (plan === 'enterprise') {
    return {
      activityMonitoring: true,
      screenshots: true,
      websiteTracking: true,
      appTracking: true,
      productivityScore: true,
      usbMonitoring: true,
      printMonitoring: true,
      fileActivity: true,
      meetingDetection: true,
      keyboardMouseMetrics: true,
    };
  }
  if (plan === 'professional') {
    return {
      activityMonitoring: true,
      screenshots: true,
      websiteTracking: true,
      appTracking: true,
      productivityScore: true,
      usbMonitoring: false,
      printMonitoring: false,
      fileActivity: false,
      meetingDetection: true,
      keyboardMouseMetrics: true,
    };
  }
  return {
    activityMonitoring: true,
    screenshots: false,
    websiteTracking: false,
    appTracking: true,
    productivityScore: false,
    usbMonitoring: false,
    printMonitoring: false,
    fileActivity: false,
    meetingDetection: false,
    keyboardMouseMetrics: true,
  };
}
