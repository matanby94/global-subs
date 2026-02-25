import axios from 'axios';

export class GoogleAdapter {
  private apiKey: string;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable must be set');
    }
    this.apiKey = apiKey;
  }

  async translate(_content: string, sourceLang: string, targetLang: string): Promise<string> {
    // TODO: Implement Gemini API translation
    throw new Error(
      `Google/Gemini translation is not yet implemented (${sourceLang} -> ${targetLang}). Use model 'gpt-4' instead.`
    );
  }
}
