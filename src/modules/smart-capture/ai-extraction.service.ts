import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExtractedCandidateData {
  fullName: string;
  mobile: string;
  email: string;
  address: string;
  currentLocation: string;
  dateOfBirth: string;
  skills: string[];
  experience: Array<{
    company: string;
    designation: string;
    duration: string;
    description: string;
  }>;
  currentCompany: string;
  previousCompanies: string[];
  designation: string;
  industry: string;
  salary: string;
  expectedSalary: string;
  noticePeriod: string;
  education: Array<{
    degree: string;
    college: string;
    university: string;
    passingYear: string;
  }>;
  certifications: string[];
  languages: string[];
  linkedInUrl: string;
  portfolioUrl: string;
  fieldConfidences: Array<{ field: string; confidence: number; value: string }>;
  overallConfidence: number;
}

const EMPTY_EXTRACTION: ExtractedCandidateData = {
  fullName: '',
  mobile: '',
  email: '',
  address: '',
  currentLocation: '',
  dateOfBirth: '',
  skills: [],
  experience: [],
  currentCompany: '',
  previousCompanies: [],
  designation: '',
  industry: '',
  salary: '',
  expectedSalary: '',
  noticePeriod: '',
  education: [],
  certifications: [],
  languages: [],
  linkedInUrl: '',
  portfolioUrl: '',
  fieldConfidences: [],
  overallConfidence: 0,
};

@Injectable()
export class AiExtractionService {
  constructor(private readonly configService: ConfigService) {}

  async extract(content: string): Promise<ExtractedCandidateData> {
    const trimmed = content.trim();
    if (!trimmed) return { ...EMPTY_EXTRACTION };

    const openAiKey = process.env.OPENAI_API_KEY?.trim();
    if (openAiKey) {
      try {
        return await this.extractWithOpenAI(trimmed, openAiKey);
      } catch {
        // Fall through to rule-based extraction
      }
    }

    return this.extractWithRules(trimmed);
  }

  private async extractWithOpenAI(
    content: string,
    apiKey: string,
  ): Promise<ExtractedCandidateData> {
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract recruiter/HR candidate data from the provided text. Return JSON with keys: fullName, mobile, email, address, currentLocation, dateOfBirth, skills (array), experience (array of {company, designation, duration, description}), currentCompany, previousCompanies (array), designation, industry, salary, expectedSalary, noticePeriod, education (array of {degree, college, university, passingYear}), certifications (array), languages (array), linkedInUrl, portfolioUrl, fieldConfidences (array of {field, confidence 0-1, value}), overallConfidence (0-1). Use empty strings/arrays when unknown.',
          },
          { role: 'user', content: content.slice(0, 12000) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<ExtractedCandidateData>;
    return this.normalize(parsed);
  }

  private extractWithRules(content: string): ExtractedCandidateData {
    const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = content.match(/(?:\+?\d{1,3}[-.\s]?)?\d{10,12}/);
    const linkedInMatch = content.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i);
    const portfolioMatch = content.match(/https?:\/\/[^\s)]+/i);

    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const fullName = lines[0]?.length <= 60 ? lines[0] : '';

    const skillsSection = this.extractSection(content, ['skills', 'technical skills', 'core competencies']);
    const skills = skillsSection
      ? skillsSection.split(/[,;|•·\n]/).map((s) => s.trim()).filter((s) => s.length > 1 && s.length < 40)
      : [];

    const fieldConfidences: ExtractedCandidateData['fieldConfidences'] = [];
    const addField = (field: string, value: string, confidence: number) => {
      if (value) fieldConfidences.push({ field, confidence, value });
    };

    addField('email', emailMatch?.[0] ?? '', emailMatch ? 0.95 : 0);
    addField('mobile', phoneMatch?.[0] ?? '', phoneMatch ? 0.9 : 0);
    addField('fullName', fullName, fullName ? 0.7 : 0);
    addField('linkedInUrl', linkedInMatch?.[0] ?? '', linkedInMatch ? 0.95 : 0);
    if (portfolioMatch && !linkedInMatch) {
      addField('portfolioUrl', portfolioMatch[0], 0.8);
    }

    const overallConfidence =
      fieldConfidences.length > 0
        ? fieldConfidences.reduce((sum, f) => sum + f.confidence, 0) / fieldConfidences.length
        : 0.3;

    return {
      ...EMPTY_EXTRACTION,
      fullName,
      email: emailMatch?.[0] ?? '',
      mobile: phoneMatch?.[0] ?? '',
      linkedInUrl: linkedInMatch?.[0] ?? '',
      portfolioUrl: linkedInMatch ? '' : portfolioMatch?.[0] ?? '',
      skills: skills.slice(0, 30),
      fieldConfidences,
      overallConfidence,
    };
  }

  private extractSection(content: string, headers: string[]): string {
    const lower = content.toLowerCase();
    for (const header of headers) {
      const idx = lower.indexOf(header);
      if (idx === -1) continue;
      const slice = content.slice(idx + header.length, idx + header.length + 500);
      return slice.replace(/^[\s:.-]+/, '').split(/\n\n/)[0] ?? '';
    }
    return '';
  }

  private normalize(parsed: Partial<ExtractedCandidateData>): ExtractedCandidateData {
    return {
      fullName: String(parsed.fullName ?? ''),
      mobile: String(parsed.mobile ?? ''),
      email: String(parsed.email ?? ''),
      address: String(parsed.address ?? ''),
      currentLocation: String(parsed.currentLocation ?? ''),
      dateOfBirth: String(parsed.dateOfBirth ?? ''),
      skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : [],
      experience: Array.isArray(parsed.experience)
        ? parsed.experience.map((e) => ({
            company: String((e as { company?: string }).company ?? ''),
            designation: String((e as { designation?: string }).designation ?? ''),
            duration: String((e as { duration?: string }).duration ?? ''),
            description: String((e as { description?: string }).description ?? ''),
          }))
        : [],
      currentCompany: String(parsed.currentCompany ?? ''),
      previousCompanies: Array.isArray(parsed.previousCompanies)
        ? parsed.previousCompanies.map(String)
        : [],
      designation: String(parsed.designation ?? ''),
      industry: String(parsed.industry ?? ''),
      salary: String(parsed.salary ?? ''),
      expectedSalary: String(parsed.expectedSalary ?? ''),
      noticePeriod: String(parsed.noticePeriod ?? ''),
      education: Array.isArray(parsed.education)
        ? parsed.education.map((e) => ({
            degree: String((e as { degree?: string }).degree ?? ''),
            college: String((e as { college?: string }).college ?? ''),
            university: String((e as { university?: string }).university ?? ''),
            passingYear: String((e as { passingYear?: string }).passingYear ?? ''),
          }))
        : [],
      certifications: Array.isArray(parsed.certifications)
        ? parsed.certifications.map(String)
        : [],
      languages: Array.isArray(parsed.languages) ? parsed.languages.map(String) : [],
      linkedInUrl: String(parsed.linkedInUrl ?? ''),
      portfolioUrl: String(parsed.portfolioUrl ?? ''),
      fieldConfidences: Array.isArray(parsed.fieldConfidences)
        ? parsed.fieldConfidences.map((f) => ({
            field: String((f as { field?: string }).field ?? ''),
            confidence: Number((f as { confidence?: number }).confidence ?? 0),
            value: String((f as { value?: string }).value ?? ''),
          }))
        : [],
      overallConfidence: Number(parsed.overallConfidence ?? 0.5),
    };
  }
}
