import axios from 'axios';

export class DeepLAdapter {
  private apiKey: string;

  constructor() {
    const apiKey = process.env.DEEPL_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPL_API_KEY environment variable must be set');
    }
    this.apiKey = apiKey;
  }

  async translate(_content: string, sourceLang: string, targetLang: string): Promise<string> {
    // TODO: Implement DeepL API translation
    throw new Error(
      `DeepL translation is not yet implemented (${sourceLang} -> ${targetLang}). Use model 'gpt-4' instead.`
    );
  }
}
