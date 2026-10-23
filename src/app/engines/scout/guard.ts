import type { ApprovalRecord, IntentDefinition, RiskAssessment, RiskLevel, UserRef } from './types';

const INJECTION_PATTERNS: { kind: string; pattern: RegExp; strictOnly?: boolean }[] = [
  {
    kind: 'instruction-override',
    pattern:
      /\b(ignore|disregard|forget)\b.{0,50}\b(previous|prior|above|all)\b.{0,40}\b(instructions?|rules?|prompts?)\b/i,
  },
  { kind: 'instruction-override', pattern: /\bdisregard\s+the\s+(rules|instructions|user)\b/i },
  {
    kind: 'role-confusion',
    pattern:
      /\b(you\s+are\s+now|from\s+now\s+on)\b.{0,50}\b(unrestricted|admin|root|system|developer)\b/i,
  },
  { kind: 'role-confusion', pattern: /\b(unrestricted|developer|god)\s+mode\b/i },
  { kind: 'role-confusion', pattern: /<\s*\/?\s*(system|user|assistant)\s*>/i },
  { kind: 'role-confusion', pattern: /\[\s*\/?\s*(INST|SYS)\s*\]/i },
  { kind: 'role-confusion', pattern: /\b(pretend|act)\b.{0,40}\b(system|admin|root)\b/i },
  {
    kind: 'secret-exfiltration',
    pattern:
      /\b(reveal|show|print|list|leak|expose)\b.{0,50}\b(api[- ]?keys?|credentials?|secrets?|passwords?)\b/i,
  },
  {
    kind: 'destructive-tool',
    pattern: /\b(drop|truncate|delete)\b.{0,30}\b(table|database|schema)\b/i,
  },
  {
    kind: 'out-of-band-tool',
    pattern: /\b(internal_admin_panel|grant\s+me\s+admin|grant\s+admin|elevate\s+privileges)\b/i,
  },
  { kind: 'control-bytes', pattern: /[\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/ },
  { kind: 'soft-injection', pattern: /#\s*(IMPORTANT|SYSTEM|INSTRUCTION)\b/i, strictOnly: true },
];

const DESTRUCTIVE = /\b(delete|remove|clear|wipe|destroy|send|drop|revoke|transfer)\b/i;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;

const CAPITALIZED_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'compare',
  'complete',
  'create',
  'delete',
  'do',
  'draft',
  'email',
  'find',
  'for',
  'forget',
  'from',
  'give',
  'handle',
  'hello',
  'how',
  'ignore',
  'in',
  'list',
  'mark',
  'move',
  'my',
  'new',
  'of',
  'on',
  'plan',
  'please',
  'pull',
  'put',
  'remember',
  'remove',
  'rename',
  'research',
  'schedule',
  'send',
  'show',
  'summarize',
  'the',
  'this',
  'to',
  'translate',
  'what',
  'when',
  'where',
  'which',
  'who',
  'write',
  'you',
  'your',
]);

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
};

function parseAmount(raw: string, suffix?: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  const unit = (suffix ?? '').toLowerCase();
  if (unit === 'k') return value * 1_000;
  if (unit === 'm') return value * 1_000_000;
  return value;
}

function extractAccount(prompt: string): string | undefined {
  const matches = [...prompt.matchAll(/\b([A-Z][A-Za-z0-9&.-]{1,})\b/g)];
  for (const match of matches) {
    const value = match[1];
    const normalized = value.toLowerCase();
    if (CAPITALIZED_STOPWORDS.has(normalized)) continue;
    if (normalized === 'q2' || normalized === 'q1' || normalized === 'q3' || normalized === 'q4')
      continue;
    if (/^\d+$/.test(value)) continue;
    return value;
  }
  return undefined;
}

function extractSubjects(prompt: string): string[] {
  const match = prompt.match(/\b(?:compare|research)\b(.*)$/i);
  if (!match) return [];
  return match[1]
    .split(/,|\band\b/gi)
    .map((item) =>
      item
        .trim()
        .replace(/^the\s+/i, '')
        .replace(/\.$/, ''),
    )
    .filter((item) => item.length > 1 && !/^(top|vector databases?|and)$/i.test(item));
}

function extractTitle(prompt: string): string | undefined {
  let value = prompt.trim();
  value = value.replace(
    /^(please\s+)?(add|create|new)\b(\s+(a|an|the))?\s*(task|to-?do)?\s*(to\s+)?/i,
    '',
  );
  value = value.replace(/^remind\s+me\s+to\s+/i, '');
  value = value.replace(/^new\s+task\s*[:\-]\s*/i, '');
  value = value.replace(/^[:\-]\s*/, '').trim();
  return value.length > 0 ? value : undefined;
}

export function extractParameters(
  intent: IntentDefinition,
  prompt: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const id = intent.id;

  if (id === 'deal.recover') {
    const digit =
      prompt.match(/\b(?:top|first|last)\s*(\d{1,2})\b/i) ??
      prompt.match(/\b(\d{1,2})\s+(?:stuck|at-risk|deals?|renewals?)\b/i);
    const word = prompt.match(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s+(?:stuck|at-risk|deals?|renewals?)\b/i,
    );
    params['count'] = digit ? Number(digit[1]) : word ? NUMBER_WORDS[word[1].toLowerCase()] : 1;
    if (/\bemail/i.test(prompt)) params['channel'] = 'email';
    else if (/\bcall\b/i.test(prompt)) params['channel'] = 'call';
    else if (/\bslack\b/i.test(prompt)) params['channel'] = 'slack';
    const stage = prompt.match(
      /\b(negotiation|proposal|discovery|closed[- ]won|closed[- ]lost)\b/i,
    );
    if (stage) params['stage'] = stage[1].toLowerCase().replace(/\s+/g, '-');
  }

  if (id === 'deal.query') {
    const account = extractAccount(prompt);
    if (account) params['account'] = account;
    const stage = prompt.match(
      /\b(negotiation|proposal|discovery|closed[- ]won|closed[- ]lost)\b/i,
    );
    if (stage) params['stage'] = stage[1].toLowerCase().replace(/\s+/g, '-');
    const min = prompt.match(/\bover\s+\$?(\d+(?:\.\d+)?)\s*([km])?\b/i);
    if (min) params['valueMin'] = parseAmount(min[1], min[2]);
  }

  if (id === 'deal.update') {
    const account = extractAccount(prompt);
    if (account) params['account'] = account;
    const stage = prompt.match(
      /\b(negotiation|proposal|discovery|closed[- ]won|closed[- ]lost)\b/i,
    );
    if (stage) params['stage'] = stage[1].toLowerCase().replace(/\s+/g, '-');
    const value = prompt.match(/\$(\d+(?:\.\d+)?)\s*([km])?\b/i);
    if (value) params['value'] = parseAmount(value[1], value[2]);
  }

  if (id === 'email.draft') {
    const recipient = prompt.match(/\b(?:to|email)\s+([A-Z][a-z]+)\b/);
    if (recipient) params['recipient'] = recipient[1];
    const topic = prompt.match(/\babout\s+(.+)$/i);
    if (topic) params['topic'] = topic[1].trim().replace(/\.$/, '');
  }

  if (id === 'email.summarize') {
    const account = extractAccount(prompt);
    if (account) params['account'] = account;
    const window = prompt.match(/\b(this week|last week|today|yesterday|this month|last month)\b/i);
    if (window) params['window'] = window[1].toLowerCase();
  }

  if (id === 'email.send') {
    if (/\ball customers\b/i.test(prompt)) params['audience'] = 'all customers';
    const template = prompt.match(/\b(launch announcement|announcement|newsletter)\b/i);
    if (template) params['template'] = template[1].toLowerCase();
  }

  if (id === 'research.comparison') {
    const subjects = extractSubjects(prompt);
    if (subjects.length > 0) params['subjects'] = subjects;
  }

  if (id === 'research.market') {
    const topic =
      prompt.match(/\b(?:in|about)\s+the\s+(.+?)\s+space\b/i) ??
      prompt.match(/\b(?:research|about)\s+(.+)$/i);
    if (topic) params['topic'] = topic[1].trim();
  }

  if (id === 'plan.long-horizon') {
    const horizon = prompt.match(/\b(\d+[- ](?:month|week|year)s?)\b/i);
    if (horizon) params['horizon'] = horizon[1].toLowerCase().replace(/\s+/g, '-');
    params['topic'] = prompt.trim();
  }

  if (id === 'report.summarize') {
    const period = prompt.match(/\b(Q[1-4]|20\d{2})\b/i);
    if (period) params['period'] = period[1].toUpperCase();
    const subject = prompt.match(/\b(?:summarize|pull)\s+(?:the\s+)?(.+)$/i);
    if (subject) params['subject'] = subject[1].trim();
  }

  if (id === 'calendar.create') {
    const when = prompt.match(/\b(?:for|on)\s+(.+)$/i);
    if (when) params['when'] = when[1].trim();
    const title = prompt.match(
      /\b(?:schedule|put)\s+(?:me\s+)?(?:a\s+)?(.+?)(?:\s+(?:for|on)\b|$)/i,
    );
    if (title) params['title'] = title[1].trim();
  }

  if (id === 'world.query') {
    const account = extractAccount(prompt);
    if (account) params['subject'] = account;
  }

  if (id === 'task.add') {
    const title = extractTitle(prompt);
    if (title) params['title'] = title;
  }

  if (id === 'task.complete' || id === 'task.uncomplete' || id === 'task.delete') {
    let task = prompt
      .replace(
        /^(please\s+)?(complete|finish|mark|reopen|uncomplete|delete|remove|clear)\b\s*/i,
        '',
      )
      .replace(/\b(task|to-?do)\b/gi, ' ')
      .replace(/\b(as\s+)?done\b/gi, ' ')
      .replace(/\s+as\s*$/i, ' ')
      .trim();
    if (/\bcompleted\b/i.test(prompt)) params['scope'] = 'completed';
    else if (/\ball\b/i.test(prompt)) params['scope'] = 'all';
    task = task.replace(/\s+/g, ' ').trim();
    if (task) params['task'] = task;
  }

  if (id === 'task.rename') {
    const match = prompt.match(/\brename\s+(.+?)\s+to\s+(.+)$/i);
    if (match) {
      params['task'] = match[1].trim();
      params['title'] = match[2].trim().replace(/\.$/, '');
    }
  }

  if (id === 'task.filter') {
    if (/\bactive\b/i.test(prompt)) params['filter'] = 'active';
    else if (/\bcompleted\b/i.test(prompt)) params['filter'] = 'completed';
    else if (/\ball\b/i.test(prompt)) params['filter'] = 'all';
  }

  if (id === 'task.plan') {
    params['goal'] = prompt.trim();
  }

  if (id === 'memory.remember') {
    const content = prompt.replace(/^.*?\bremember\b(\s+that)?\s*/i, '').trim();
    if (content) params['content'] = content;
  }

  if (id === 'memory.recall') {
    params['query'] = prompt.trim();
  }

  if (id === 'memory.forget') {
    const query = prompt.replace(/^.*?\bforget\b\s*/i, '').trim();
    if (query) params['query'] = query;
  }

  return params;
}

export function detectInjection(
  prompt: string,
  strict: boolean,
): { flags: string[]; reason?: string } {
  const flags: string[] = [];
  let reason: string | undefined;
  for (const { kind, pattern, strictOnly } of INJECTION_PATTERNS) {
    if (strictOnly && !strict) continue;
    if (pattern.test(prompt)) {
      flags.push(kind);
      reason ??= `blocked ${kind} pattern`;
    }
  }
  if (strict && /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(prompt)) {
    flags.push('control-bytes');
    reason ??= 'blocked control characters';
  }
  return { flags, reason };
}

export function redactSensitive(prompt: string): string[] {
  const redactions: string[] = [];
  if (EMAIL_PATTERN.test(prompt)) {
    redactions.push('email');
    EMAIL_PATTERN.lastIndex = 0;
  }
  if (PHONE_PATTERN.test(prompt)) {
    redactions.push('phone');
    PHONE_PATTERN.lastIndex = 0;
  }
  return redactions;
}

export function assessRisk(args: {
  prompt: string;
  intent: IntentDefinition;
  user?: UserRef;
  surface: string;
  strict: boolean;
}): RiskAssessment {
  const injection = detectInjection(args.prompt, args.strict);
  const flags = [...injection.flags];
  const redactions = redactSensitive(args.prompt);
  const approvals: ApprovalRecord[] = [];

  if (injection.flags.length > 0) {
    return {
      level: 'block',
      flags,
      redactions,
      reason: injection.reason,
      approvals: [],
    };
  }

  const role = args.user?.role;
  const roleAllowed =
    args.intent.roles.includes('*') || (role ? args.intent.roles.includes(role) : false);
  if (!roleAllowed) {
    flags.push('role-not-allowed');
    return {
      level: 'block',
      flags,
      redactions,
      reason: `role "${role ?? 'anonymous'}" cannot invoke ${args.intent.id}`,
      approvals: [],
    };
  }

  if (!args.intent.surfaces.includes(args.surface)) {
    flags.push('surface-not-allowed');
    return {
      level: 'block',
      flags,
      redactions,
      reason: `surface "${args.surface}" cannot invoke ${args.intent.id}`,
      approvals: [],
    };
  }

  let level: RiskLevel = args.intent.riskClass;
  const approvalCapability = args.intent.capabilities.some((capability) =>
    ['approval.require', 'email.send', 'world.assert'].includes(capability),
  );
  if (approvalCapability || args.intent.riskClass === 'high') {
    level = 'high';
  }
  if (DESTRUCTIVE.test(args.prompt) && !/^task\.(list|filter|summary|plan)$/.test(args.intent.id)) {
    if (level === 'low') level = 'medium';
    if (/\b(all|every|everything)\b/i.test(args.prompt)) level = 'high';
  }

  if (level === 'high') {
    approvals.push({
      kind: 'user-confirm',
      status: 'required',
      reason: `${args.intent.id} is a high-risk action`,
    });
    flags.push('approval-required');
  }

  return { level, flags, redactions, approvals };
}
