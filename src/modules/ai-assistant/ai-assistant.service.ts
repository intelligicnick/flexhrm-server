import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiAssistantService {
  constructor(private readonly configService: ConfigService) {}

  async chat(tenantId: string | undefined, message: string): Promise<{ reply: string }> {
    const apiKey = this.configService.get<string>('openAiApiKey') ?? '';
    const model = this.configService.get<string>('openAiModel') ?? 'gpt-4o-mini';

    if (!apiKey) {
      return {
        reply:
          'AI assistant is not configured. Set OPENAI_API_KEY to enable HR query assistance.',
      };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are Flex HRM AI Assistant. Answer HR, payroll, attendance, and leave policy questions concisely. Tenant context: ' +
              (tenantId ?? 'default'),
          },
          { role: 'user', content: message },
        ],
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      return { reply: 'AI service temporarily unavailable. Please try again later.' };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return { reply: data.choices?.[0]?.message?.content ?? 'No response generated.' };
  }

  async generateDocument(
    type: 'offer_letter' | 'policy' | 'job_description',
    context: Record<string, string>,
  ): Promise<{ content: string }> {
    const prompts: Record<string, string> = {
      offer_letter: `Generate a professional offer letter for ${context.candidateName ?? 'candidate'} joining as ${context.role ?? 'Employee'} with CTC ${context.ctc ?? 'as discussed'}.`,
      policy: `Generate an HR policy document about: ${context.topic ?? 'leave policy'}.`,
      job_description: `Generate a job description for: ${context.title ?? 'HR Executive'} in ${context.department ?? 'HR'}.`,
    };

    const result = await this.chat(undefined, prompts[type] ?? context.topic ?? '');
    return { content: result.reply };
  }
}
