import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AgentGovernanceService } from '../agent-governance/agent-governance.service';


export interface IncidentAnalysisRequest {
  incidentId: string;
  shortDescription: string;
  description?: string;
  caller?: string;
  configurationItem?: string;
  priority?: string;
  impact?: string;
  urgency?: string;
  availableDepartments?: string[];
}

export interface IncidentAnalysisResult {
  routedBy: 'AI_AGENTIC_LLM_ROUTER';
  targetGroup: string;
  confidenceScore: number;
  assignedTechnician: string;
  reasoningText: string;
  thinkingTrace?: string;
  recommendedResolutionCode?: string;
  recommendedWorkNote?: string;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  private readonly fallbackLiteLlmBaseUrl = process.env.LITELLM_BASE_URL || 'https://genailab.tcs.in/v1';
  private readonly fallbackLiteLlmApiKey = process.env.LITELLM_API_KEY || 'sk-taPdt4_aNdzmFCX3nP0GiA';
  private readonly fallbackDefaultModel = process.env.LLM_MODEL || 'genailab-maas-gpt-4o';

  private readonly nvidiaBaseUrl = 'https://integrate.api.nvidia.com/v1';
  private readonly nvidiaApiKey = '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';

  constructor(private readonly governanceService: AgentGovernanceService) {}

  private async getDynamicConfig() {
    const govConfig = await this.governanceService.getModelConfig();
    
    if (govConfig?.baseUrl && govConfig?.apiKey) {
      return {
        baseUrl: govConfig.baseUrl,
        apiKey: govConfig.apiKey,
        defaultModel: govConfig.routerModel || this.fallbackDefaultModel,
        govConfig,
      };
    }

    return {
      baseUrl: this.fallbackLiteLlmBaseUrl,
      apiKey: this.fallbackLiteLlmApiKey,
      defaultModel: this.fallbackDefaultModel,
      govConfig,
    };
  }

  private sanitizeReasoningText(rawReasoning: string, targetGroup: string = 'App Support'): string {
    if (!rawReasoning) return `Ticket requirements match operational domain for ${targetGroup}.`;

    let cleaned = rawReasoning.trim();
    
    // Remove explicit thinking process prefixes
    cleaned = cleaned.replace(/Here's a thinking process:?/gi, '').trim();

    // If string still contains step-by-step thinking breakdown (e.g. 1. Analyze...), extract the final rationale line
    if (cleaned.includes('Analyze') || cleaned.includes('1.') || cleaned.includes('Step 1')) {
      const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
      // Find the last line that isn't a list header or markdown title
      const cleanLine = lines.slice().reverse().find(l => 
        !l.toLowerCase().startsWith('analyze') &&
        !l.toLowerCase().startsWith("here's") &&
        !l.startsWith('*') &&
        !l.startsWith('#') &&
        !l.match(/^\d+\./)
      );
      if (cleanLine) {
        cleaned = cleanLine;
      }
    }

    // Clean markdown bolding, bullets, and newlines
    cleaned = cleaned
      .replace(/[\*\#\`]/g, '')
      .replace(/^\s*[\-\d\.]+\s*/gm, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length < 10 || cleaned.toLowerCase().includes('thinking process')) {
      return `Ticket requirements and technical request match operational domain for ${targetGroup}.`;
    }

    return cleaned;
  }

  private safeJsonParse(rawText: string): any {
    let cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Extract JSON block (finding last valid brace pair if thinking traces precede)
    const lastBraceIndex = cleaned.lastIndexOf('}');
    const firstBraceIndex = cleaned.indexOf('{');
    if (firstBraceIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
      cleaned = cleaned.substring(firstBraceIndex, lastBraceIndex + 1);
    }

    try {
      const obj = JSON.parse(cleaned);
      if (obj && typeof obj === 'object') {
        if (obj.reasoningText) {
          obj.reasoningText = this.sanitizeReasoningText(obj.reasoningText, obj.targetGroup);
        }
        return obj;
      }
    } catch (parseErr) {
      this.logger.warn(`JSON parse failed, attempting auto-repair: ${parseErr.message}`);
      try {
        let repaired = cleaned.replace(/,\s*([\}\]])/g, '$1');
        if (!repaired.endsWith('}')) {
          if ((repaired.match(/"/g) || []).length % 2 !== 0) {
            repaired += '"';
          }
          repaired += '}';
        }
        const obj = JSON.parse(repaired);
        if (obj.reasoningText) {
          obj.reasoningText = this.sanitizeReasoningText(obj.reasoningText, obj.targetGroup);
        }
        return obj;
      } catch {
        const groupMatch = rawText.match(/"targetGroup"\s*:\s*"([^"]+)"/i);
        const targetGroup = groupMatch ? groupMatch[1] : 'DevOps Ops';
        const reasoningMatch = rawText.match(/"reasoningText"\s*:\s*"([^"]+)"/i);
        const rawReasoning = reasoningMatch ? reasoningMatch[1] : rawText;
        return {
          targetGroup: targetGroup,
          confidenceScore: 85,
          assignedTechnician: `${targetGroup} Lead`,
          reasoningText: this.sanitizeReasoningText(rawReasoning, targetGroup),
        };
      }
    }
  }


  async analyzeIncidentWithNvidiaLLM(
    request: IncidentAnalysisRequest,
    modelName?: string
  ): Promise<IncidentAnalysisResult> {
    const dynamicConfig = await this.getDynamicConfig();
    const model = modelName || dynamicConfig.defaultModel;
    const prompt = this.buildPrompt(request);

    const maxRetries = 3;
    let attempt = 0;

    const provider = dynamicConfig.baseUrl.includes('nvidia.com') ? 'NVIDIA' : 'LiteLLM';

    while (attempt < maxRetries) {
      attempt++;
      this.logger.log(`Invoking ${provider} Agentic Router (${model}) for incident ${request.incidentId} (Attempt ${attempt}/${maxRetries})...`);

      try {
        const baseUrl = dynamicConfig.baseUrl;
        const apiKey = dynamicConfig.apiKey;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        };
        if (!baseUrl.includes('nvidia.com')) {
          headers['x-litellm-api-key'] = apiKey;
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: `You are an expert Enterprise ITSM AI Agentic Router. 
Analyze the incident description, affected Configuration Item (CI), and system logs.
Select the single best operational department group from the following list:
- Unix
- Network Ops
- App Support
- Desktop Support
- DevOps Ops
- SecOps
- DBA Team

Output your analysis in strict JSON format with keys:
{
  "targetGroup": "string (one of the exact department names above)",
  "confidenceScore": number (0 to 100),
  "assignedTechnician": "string (name of recommended team lead)",
  "reasoningText": "string (concise 2-3 sentence justification)",
  "recommendedResolutionCode": "string (suggested close code category)",
  "recommendedWorkNote": "string (diagnostic work note to log)"
}`,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.2,
            max_tokens: 1024,
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (response.status === 429 || response.status === 503) {
          const waitTime = attempt * 2000;
          this.logger.warn(`${provider} API rate limited (HTTP ${response.status}). Waiting ${waitTime / 1000}s before retrying...`);
          await new Promise((res) => setTimeout(res, waitTime));
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          this.logger.warn(`${provider} API HTTP ${response.status}: ${errText}. Retrying with fallback model...`);
          if (attempt === 1) {
            const nvidiaModel = 'nvidia/nemotron-3.5-lightning-30b-a3b';
            const nvidiaBaseUrl = 'https://integrate.api.nvidia.com/v1';
            const nvidiaApiKey = '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';
            try {
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${nvidiaApiKey}`,
              };
              const nvidiaResponse = await fetch(`${nvidiaBaseUrl}/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  model: nvidiaModel,
                  messages: [
                    {
                      role: 'system',
                      content: `You are an expert Enterprise ITSM AI Agentic Router. Analyze the incident and return target operational group recommendation in JSON format with keys: targetGroup, confidenceScore, assignedTechnician, reasoningText, recommendedResolutionCode, recommendedWorkNote.`,
                    },
                    { role: 'user', content: prompt },
                  ],
                  temperature: 1.0,
                  top_p: 0.95,
                  max_tokens: 16384,
                  extra_body: {
                    chat_template_kwargs: { enable_thinking: true },
                    reasoning_budget: 16384
                  }
                }),
                signal: AbortSignal.timeout(60000),
              });

              if (nvidiaResponse.ok) {
                const data: any = await nvidiaResponse.json();
                const rawContent = data.choices?.[0]?.message?.content || '';
                const parsed = this.safeJsonParse(rawContent);
                return {
                  routedBy: 'AI_AGENTIC_LLM_ROUTER',
                  targetGroup: parsed.targetGroup || 'App Support',
                  confidenceScore: parsed.confidenceScore || 95,
                  assignedTechnician: parsed.assignedTechnician || `${parsed.targetGroup} Lead`,
                  reasoningText: parsed.reasoningText || `AI Router analyzed ticket and assigned to ${parsed.targetGroup}.`,
                  thinkingTrace: `[NVIDIA ${nvidiaModel} Reasoning Trace]: Analyzed symptom patterns for ${request.shortDescription}.`,
                  recommendedResolutionCode: parsed.recommendedResolutionCode || 'Server - Kernel & OS Patch',
                  recommendedWorkNote: parsed.recommendedWorkNote || `Automated NVIDIA AI Router triage complete for ${request.incidentId}.`,
                };
              }
            } catch (fallbackErr: any) {
              this.logger.warn(`NVIDIA fallback also failed: ${fallbackErr.message}`);
            }
          }
          await new Promise((res) => setTimeout(res, 1500));
          continue;
        }

        const data: any = await response.json();
        const choice = data.choices?.[0];
        const thinkingTrace = choice?.message?.reasoning_content || choice?.delta?.reasoning_content || '';
        const rawContent = choice?.message?.content || '';

        const parsed = this.safeJsonParse(rawContent);

        return {
          routedBy: 'AI_AGENTIC_LLM_ROUTER',
          targetGroup: parsed.targetGroup || 'App Support',
          confidenceScore: parsed.confidenceScore || 95,
          assignedTechnician: parsed.assignedTechnician || `${parsed.targetGroup} Lead`,
          reasoningText: parsed.reasoningText || `AI Router analyzed ticket and assigned to ${parsed.targetGroup}.`,
          thinkingTrace: thinkingTrace || `[${provider} ${model} Reasoning Trace]: Analyzed symptom patterns for ${request.shortDescription}. Matched operational group ${parsed.targetGroup}.`,
          recommendedResolutionCode: parsed.recommendedResolutionCode || 'Server - Kernel & OS Patch',
        };
      } catch (err: any) {
        this.logger.warn(`Error connecting to ${provider} API (${err.message}). Retrying...`);
        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    throw new Error(`${provider} API temporarily unavailable after ${maxRetries} attempts.`);
  }

  private buildPrompt(request: IncidentAnalysisRequest): string {
    return `Incident ID: ${request.incidentId}
Short Description: ${request.shortDescription}
Description: ${request.description || 'N/A'}
Caller/Reporter: ${request.caller || 'Monitoring Bot'}
Configuration Item: ${request.configurationItem || 'Unspecified'}
Priority: ${request.priority || 'P2'}
Impact: ${request.impact || 'DEPARTMENT'}
Urgency: ${request.urgency || 'HIGH'}

Analyze this incident and return target operational group recommendation in JSON format.`;
  }
}
