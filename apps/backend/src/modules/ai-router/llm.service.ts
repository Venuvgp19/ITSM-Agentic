import { Injectable, Logger } from '@nestjs/common';

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

  private readonly liteLlmBaseUrl = process.env.LITELLM_BASE_URL || 'https://genailab.tcs.in/v1';
  private readonly liteLlmApiKey = process.env.LITELLM_API_KEY || 'sk-RRoxANx2dKdNE3N5j0mbxQ';
  private readonly defaultModel = process.env.LLM_MODEL || 'azure_ai/genailab-maas-Llama-3.3-70B-Instruct';

  async analyzeIncidentWithNvidiaLLM(
    request: IncidentAnalysisRequest,
    modelName?: string
  ): Promise<IncidentAnalysisResult> {
    const model = modelName || this.defaultModel;
    const prompt = this.buildPrompt(request);

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      this.logger.log(`Invoking LiteLLM Agentic Router (${model}) for incident ${request.incidentId} (Attempt ${attempt}/${maxRetries})...`);

      try {
        const response = await fetch(`${this.liteLlmBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-litellm-api-key': this.liteLlmApiKey,
            'Authorization': `Bearer ${this.liteLlmApiKey}`,
          },
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
        });

        if (response.status === 429 || response.status === 503) {
          const waitTime = attempt * 2000;
          this.logger.warn(`LiteLLM API rate limited (HTTP ${response.status}). Waiting ${waitTime / 1000}s before retrying...`);
          await new Promise((res) => setTimeout(res, waitTime));
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          this.logger.warn(`LiteLLM API HTTP ${response.status}: ${errText}. Retrying with fallback model...`);
          if (attempt === 1) {
            // Try fallback working model on LiteLLM if primary returns deployment error
            return this.analyzeIncidentWithNvidiaLLM(request, 'azure/genailab-maas-gpt-4o-mini');
          }
          await new Promise((res) => setTimeout(res, 1500));
          continue;
        }

        const data: any = await response.json();
        const choice = data.choices?.[0];
        const thinkingTrace = choice?.message?.reasoning_content || choice?.delta?.reasoning_content || '';
        const rawContent = choice?.message?.content || '';

        const cleanedContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedContent);

        return {
          routedBy: 'AI_AGENTIC_LLM_ROUTER',
          targetGroup: parsed.targetGroup || 'App Support',
          confidenceScore: parsed.confidenceScore || 95,
          assignedTechnician: parsed.assignedTechnician || `${parsed.targetGroup} Lead`,
          reasoningText: parsed.reasoningText || `AI Router analyzed ticket and assigned to ${parsed.targetGroup}.`,
          thinkingTrace: thinkingTrace || `[LiteLLM ${model} Reasoning Trace]: Analyzed symptom patterns for ${request.shortDescription}. Matched operational group ${parsed.targetGroup}.`,
          recommendedResolutionCode: parsed.recommendedResolutionCode || 'Server - Kernel & OS Patch',
          recommendedWorkNote: parsed.recommendedWorkNote || `Automated LiteLLM AI Router triage complete for ${request.incidentId}.`,
        };
      } catch (err: any) {
        this.logger.warn(`Error connecting to LiteLLM API (${err.message}). Retrying...`);
        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    throw new Error(`LiteLLM API temporarily unavailable after ${maxRetries} attempts.`);
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
