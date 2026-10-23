// Scout Intent public types. These mirror the AGENTS.md contract while
// staying framework-free so the core can run in the browser and under the
// Node conformance/eval harness.

export type RiskClass = 'low' | 'medium' | 'high';
export type RiskLevel = RiskClass | 'block';
export type ConfidenceBand = 'high' | 'medium' | 'low' | 'reject';

export interface ParameterProperty {
  type?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  items?: { type?: string };
  description?: string;
}

export interface ParameterSchema {
  type?: string;
  properties?: Record<string, ParameterProperty>;
  required?: string[];
}

export interface IntentDefinition {
  id: string;
  category: string;
  description: string;
  parameters: ParameterSchema;
  capabilities: string[];
  riskClass: RiskClass;
  surfaces: string[];
  roles: string[];
  examples: string[];
  version: number;
  /** Optional deterministic Stage-1 triggers, expressed as regular expressions. */
  triggers?: string[];
}

export interface IntentRegistry {
  version: number;
  intents: IntentDefinition[];
}

export interface UserRef {
  id: string;
  role?: string;
}

export interface DecisionInput {
  prompt: string;
  user?: UserRef;
  surface?: string;
  context?: unknown;
}

export interface IntentCandidate {
  intent: string;
  score: number;
  band: ConfidenceBand;
  span?: [number, number];
}

export interface BoundIntent {
  primary: {
    id: string;
    category: string;
    confidence: number;
    band: ConfidenceBand;
    parameters: Record<string, unknown>;
    references: Record<string, unknown>;
  };
  alternates: IntentCandidate[];
}

export interface ApprovalRecord {
  kind: 'user-confirm' | 'operator-review';
  status: 'required' | 'approved' | 'rejected';
  reason: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  flags: string[];
  redactions: string[];
  reason?: string;
  approvals: ApprovalRecord[];
}

export interface ToolStep {
  capability: string;
  tool: string;
  input: Record<string, unknown>;
}

export interface ModelProfileRef {
  id: string;
  provider: 'local' | 'remote';
  model: string;
}

export interface ExecutionScope {
  user: UserRef;
  surface: string;
  capabilities: string[];
  deadline?: string;
  budget?: number;
}

export interface ExecutionContract {
  contractId: string;
  parentId?: string;
  traceId: string;
  intent: BoundIntent;
  risk: RiskAssessment;
  toolPlan: ToolStep[];
  modelProfile: ModelProfileRef;
  scope: ExecutionScope;
  issuedAt: string;
  expiresAt: string;
  registryVersion: number;
  policyPackVersion: string;
  signature: string;
  signedBy: 'scout';
}

export interface ClarificationOption {
  label: string;
  intent?: string;
  prompt?: string;
}

export interface Clarification {
  question: string;
  options: ClarificationOption[];
  trigger: 'low-band' | 'tie' | 'params' | 'high-risk' | 'underspecified' | 'reference-unresolved';
}

export interface Decision {
  prompt: string;
  candidates: IntentCandidate[];
  intent: BoundIntent;
  risk: RiskAssessment;
  toolPlan: ToolStep[];
  clarification?: Clarification;
  executionContract: ExecutionContract;
  secondaryIntents: IntentCandidate[];
  latencyMs: number;
}

export interface ScoutOptions {
  intentRegistry: IntentRegistry;
  policyPack?: string | string[];
  modelProfiles?: unknown;
  signingSecret?: string;
  clock?: () => number;
  /** Optional Stage-2 rescoring hook; Stage 1 stands when absent. */
  semanticScorer?: (prompt: string, intent: IntentDefinition) => number;
}

export interface ClassifyInput {
  prompt: string;
  surface?: string;
}

export interface ReplanInput {
  parent: string;
  reason: string;
  state?: unknown;
}
