const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

class GeminiVoiceService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.enableVoiceResponses = process.env.ENABLE_VOICE_RESPONSES === 'true';
    this.useGeminiAPI = process.env.USE_GEMINI_API !== 'false'; // Default to true unless explicitly disabled
    this.geminiAvailable = false;
    this.quotaExceeded = false;
    this.quotaExceededTime = null;
    this.quotaResetTime = null;

    if (!this.useGeminiAPI) {
      console.log('🚫 GeminiVoiceService: Gemini API disabled via USE_GEMINI_API=false - using fallback mode only');
      this.geminiAvailable = false;
    } else if (!this.apiKey || this.apiKey === 'your-actual-gemini-api-key-here') {
      console.warn('GEMINI_API_KEY not configured - using fallback mode');
      console.log('To enable Gemini: Get API key from https://makersuite.google.com/app/apikey');
      this.geminiAvailable = false;
    } else {
      try {
        this.genAI = new GoogleGenerativeAI(this.apiKey);
        // Use the new model name - gemini-1.5-flash is the current free model
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        this.geminiAvailable = true;
        console.log('GeminiVoiceService: Initialized with Gemini 1.5 Flash');
      } catch (error) {
        console.error('GeminiVoiceService: Failed to initialize Gemini:', error.message);
        this.geminiAvailable = false;
      }
    }

    console.log('GeminiVoiceService: Gemini available:', this.geminiAvailable);
    console.log('GeminiVoiceService: Voice responses enabled:', this.enableVoiceResponses);

    // Reset quota status on initialization (fresh start)
    if (this.geminiAvailable) {
      this.resetQuotaStatus();
    }
  }

  /**
   * Check if quota is exceeded and if we should try again
   */
  isQuotaExceeded() {
    if (!this.quotaExceeded) return false;

    // Check if it's been more than 24 hours since quota exceeded
    if (this.quotaExceededTime && Date.now() - this.quotaExceededTime > 24 * 60 * 60 * 1000) {
      console.log('GeminiVoiceService: 24 hours passed, resetting quota status');
      this.quotaExceeded = false;
      this.quotaExceededTime = null;
      this.quotaResetTime = null;
      return false;
    }

    return true;
  }

  /**
   * Mark quota as exceeded
   */
  markQuotaExceeded(retryDelay = null) {
    if (!this.quotaExceeded) {
      console.log('🚫 GeminiVoiceService: Quota exceeded - switching to fallback mode for 24 hours');
      this.quotaExceeded = true;
      this.quotaExceededTime = Date.now();

      if (retryDelay) {
        // Parse retry delay (e.g., "21s", "1h")
        const delay = this.parseRetryDelay(retryDelay);
        this.quotaResetTime = Date.now() + delay;
        console.log(`GeminiVoiceService: Quota will reset in ${retryDelay}`);
      }
    }
  }

  /**
   * Parse retry delay string to milliseconds
   */
  parseRetryDelay(delayStr) {
    const match = delayStr.match(/(\d+)([smh])/);
    if (!match) return 24 * 60 * 60 * 1000; // Default to 24 hours

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Get current quota status for debugging
   */
  getQuotaStatus() {
    return {
      quotaExceeded: this.quotaExceeded,
      quotaExceededTime: this.quotaExceededTime,
      quotaResetTime: this.quotaResetTime,
      geminiAvailable: this.geminiAvailable,
      timeUntilReset: this.quotaResetTime ? Math.max(0, this.quotaResetTime - Date.now()) : null
    };
  }

  /**
   * Reset quota status (useful when switching API keys)
   */
  resetQuotaStatus() {
    this.quotaExceeded = false;
    this.quotaExceededTime = null;
    this.quotaResetTime = null;
    console.log('✅ GeminiVoiceService: Quota status reset - ready to use Gemini API');
  }

  /**
   * Convert audio to text using browser's Web Speech API (client-side)
   * This is a fallback method - actual implementation will be on frontend
   */
  async transcribeAudio(audioBuffer, options = {}) {
    try {
      const { language = 'en' } = options;
      
      console.log('GeminiVoiceService: Processing audio transcription...');
      
      // For now, we'll use a mock transcription since Gemini Pro doesn't directly support audio
      // The actual transcription will happen on the frontend using Web Speech API
      const mockTranscriptions = {
        'en': 'I need help with my request',
        'hi': 'मुझे अपने अनुरोध में सहायता चाहिए',
        'te': 'నాకు నా అభ్యర్థనలో సహాయం కావాలి'
      };

      const transcribedText = mockTranscriptions[language] || mockTranscriptions['en'];
      
      return {
        success: true,
        text: transcribedText,
        language: language,
        confidence: 0.95,
        method: 'gemini_mock'
      };
    } catch (error) {
      console.error('GeminiVoiceService: Transcription error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process text with Gemini Pro and generate intelligent response
   */
  async processTextWithGemini(text, context = {}) {
    try {
      const { userType = 'citizen', language = 'en', inputMethod = 'text' } = context;

      console.log('GeminiVoiceService: Processing text...');
      console.log('GeminiVoiceService: Input text:', text);
      console.log('GeminiVoiceService: Gemini available:', this.geminiAvailable);

      // Check if quota is exceeded
      if (this.isQuotaExceeded()) {
        const status = this.getQuotaStatus();
        const hoursUntilReset = status.timeUntilReset ? Math.ceil(status.timeUntilReset / (1000 * 60 * 60)) : 24;
        console.log(`🚫 GeminiVoiceService: Quota exceeded - using fallback mode (resets in ~${hoursUntilReset}h)`);
        const fallbackResponse = this.getFallbackResponse(text, context);
        return {
          success: true,
          originalText: text,
          response: fallbackResponse.response,
          category: fallbackResponse.category,
          priority: fallbackResponse.priority,
          language: context.language || 'en',
          inputMethod: inputMethod,
          needsVoiceResponse: inputMethod === 'voice' && this.enableVoiceResponses,
          usingFallback: true
        };
      }

      if (!this.geminiAvailable) {
        console.log('GeminiVoiceService: Using fallback mode (no Gemini)');
        const fallbackResponse = this.getFallbackResponse(text, context);
        return {
          success: true,
          originalText: text,
          response: fallbackResponse.response,
          category: fallbackResponse.category,
          priority: fallbackResponse.priority,
          language: context.language || 'en',
          inputMethod: inputMethod,
          needsVoiceResponse: inputMethod === 'voice' && this.enableVoiceResponses,
          usingFallback: true
        };
      }

      // Create a comprehensive prompt for Gemini
      const prompt = this.createGeminiPrompt(text, context);

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const generatedText = response.text();

      console.log('GeminiVoiceService: Gemini response:', generatedText);

      // Parse the response to extract structured data
      const parsedResponse = this.parseGeminiResponse(generatedText, text);

      return {
        success: true,
        originalText: text,
        response: parsedResponse.response,
        category: parsedResponse.category,
        priority: parsedResponse.priority,
        language: context.language || 'en',
        inputMethod: inputMethod,
        needsVoiceResponse: inputMethod === 'voice' && this.enableVoiceResponses,
        usingFallback: false
      };

    } catch (error) {
      console.error('GeminiVoiceService: Gemini processing error:', error);

      // Check if this is a quota exceeded error
      if (error.status === 429 || error.message.includes('quota') || error.message.includes('Too Many Requests')) {
        // Extract retry delay if available
        let retryDelay = null;
        if (error.errorDetails) {
          const retryInfo = error.errorDetails.find(detail => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
          if (retryInfo && retryInfo.retryDelay) {
            retryDelay = retryInfo.retryDelay;
          }
        }
        this.markQuotaExceeded(retryDelay);
      }

      console.log('GeminiVoiceService: Falling back to basic processing');
      const fallbackResponse = this.getFallbackResponse(text, context);
      return {
        success: true,
        originalText: text,
        response: fallbackResponse.response,
        category: fallbackResponse.category,
        priority: fallbackResponse.priority,
        language: context.language || 'en',
        inputMethod: context.inputMethod || 'text',
        needsVoiceResponse: (context.inputMethod === 'voice') && this.enableVoiceResponses,
        usingFallback: true,
        error: error.message
      };
    }
  }

  /**
   * Create a comprehensive prompt for Gemini Pro
   */
  createGeminiPrompt(text, context) {
    const { language = 'en', userType = 'citizen' } = context;
    
    const languageInstructions = {
      'en': 'Respond in English',
      'hi': 'Respond in Hindi (हिंदी)',
      'te': 'Respond in Telugu (తెలుగు)'
    };

    return `
You are SevaLink AI Assistant, a helpful and knowledgeable AI assistant. Answer any question the user asks naturally and conversationally.

User Input: "${text}"
User Language: ${language}
Response Language: ${languageInstructions[language] || 'English'}

Instructions:
1. Answer the user's question directly and helpfully
2. Be natural, conversational, and informative
3. For any topic - health, science, math, general knowledge, advice, etc. - provide a good answer
4. If it's a service request (blood, elder care, complaints), also categorize it appropriately
5. Always be helpful and friendly

Categories (only for service requests):
- blood_request: Blood donation needs, transfusion requests
- elder_support: Help for elderly citizens, medicine, groceries, care
- complaint: Infrastructure issues, broken services, civic problems
- emergency: Urgent situations requiring immediate help
- general_inquiry: Everything else (questions, conversations, information requests)

Priority levels:
- urgent: Emergency situations
- high: Important requests
- medium: Standard requests
- low: General questions and conversations

Format as JSON:
{
  "response": "Your natural, helpful answer to their question",
  "category": "appropriate_category",
  "priority": "appropriate_priority",
  "nextSteps": []
}

Examples:
- "Tell me about fever" → Explain what fever is, causes, symptoms, when to see doctor
- "1+1" → "1 + 1 = 2"
- "How to cook rice" → Provide cooking instructions
- "I need blood" → Help with blood request AND categorize as blood_request
`;
  }

  /**
   * Parse Gemini's response to extract structured data
   */
  parseGeminiResponse(geminiText, originalText) {
    try {
      // Try to parse as JSON first
      const jsonMatch = geminiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          response: parsed.response || geminiText,
          category: parsed.category || this.fallbackCategorize(originalText),
          priority: parsed.priority || this.fallbackPriority(originalText),
          nextSteps: parsed.nextSteps || ['Request saved', 'Volunteers notified']
        };
      }
    } catch (error) {
      console.log('GeminiVoiceService: Could not parse JSON, using fallback');
    }

    // Fallback parsing
    return {
      response: geminiText,
      category: this.fallbackCategorize(originalText),
      priority: this.fallbackPriority(originalText),
      nextSteps: ['Request saved', 'Volunteers will be notified']
    };
  }

  /**
   * Fallback categorization if Gemini doesn't provide structured response
   */
  fallbackCategorize(text) {
    const lowerText = text.toLowerCase().trim();

    // Math questions - clearly general
    if (/^\s*\d+\s*[\+\-\*\/]\s*\d+\s*$/.test(lowerText)) {
      return 'general_inquiry';
    }

    // Greetings and casual conversation - clearly general
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|namaste|hola|how are you|what's up|thank you|thanks|bye|goodbye)$/i.test(lowerText)) {
      return 'general_inquiry';
    }

    // General knowledge questions - clearly general
    if (/what is|who is|when is|where is|how to|tell me about|explain|define|capital of|time is it/i.test(lowerText)) {
      return 'general_inquiry';
    }

    // Blood request patterns
    if (/blood|donate|donation|transfusion|plasma|platelets|रक्त|खून|రక్తం|donor|o\+|o-|a\+|a-|b\+|b-|ab\+|ab-|surgery|operation|hospital|patient/.test(lowerText)) {
      return 'blood_request';
    }

    // Emergency patterns (check before other categories)
    if (/emergency|urgent|critical|immediate|asap|help.*urgent|आपातकाल|तुरंत|అత్యవసరం|911|108|ambulance/.test(lowerText)) {
      return 'emergency';
    }

    // Elder support patterns
    if (/elderly|old|senior|medicine|grocery|care|caregiver|nursing|assistance|बुजुर्ग|दवा|వృద్ధులు|మందులు|grandfather|grandmother|parent|mom|dad|mother|father/.test(lowerText)) {
      return 'elder_support';
    }

    // Complaint patterns
    if (/complaint|problem|issue|broken|not working|damaged|fault|repair|fix|शिकायत|समस्या|ఫిర్యాదు|సమస్య|street|light|road|water|electricity|garbage|sewage|drainage|pothole|noise|pollution/.test(lowerText)) {
      return 'complaint';
    }

    return 'general_inquiry';
  }

  /**
   * Fallback priority detection
   */
  fallbackPriority(text) {
    const lowerText = text.toLowerCase();
    
    if (/emergency|urgent|critical|आपातकाल|तुरंत|అత్యవసరం/.test(lowerText)) return 'urgent';
    if (/important|asap|soon|जल्दी|త్వరగా/.test(lowerText)) return 'high';
    if (/whenever|no rush|जब समय हो|సమయం ఉన్నప్పుడు/.test(lowerText)) return 'low';
    
    return 'medium';
  }

  /**
   * Get fallback response if Gemini fails - generate dynamic responses based on input
   */
  getFallbackResponse(text, context) {
    const { language = 'en' } = context;
    const category = this.fallbackCategorize(text);
    const priority = this.fallbackPriority(text);

    // Generate dynamic responses based on the actual input content
    return this.generateDynamicResponse(text, category, priority, language);
  }

  /**
   * Generate dynamic responses that reference the actual user input
   */
  generateDynamicResponse(text, category, priority, language = 'en') {
    const lowerText = text.toLowerCase().trim();

    // Handle general questions and conversations first
    if (category === 'general_inquiry') {
      return this.handleGeneralQuestion(text, lowerText);
    }

    // Extract specific details from the text for service requests
    let bloodType = null;
    let urgencyWords = [];

    // Extract blood type if mentioned
    const bloodTypeMatch = text.match(/\b(o\+|o-|a\+|a-|b\+|b-|ab\+|ab-|o positive|o negative|a positive|a negative|b positive|b negative|ab positive|ab negative)\b/i);
    if (bloodTypeMatch) {
      bloodType = bloodTypeMatch[0].toUpperCase().replace('POSITIVE', '+').replace('NEGATIVE', '-');
    }

    // Extract urgency indicators
    if (/urgent|emergency|asap|immediately|critical|serious/i.test(text)) {
      urgencyWords.push('urgent');
    }

    // Generate category-specific responses for service requests
    switch (category) {
      case 'blood_request':
        let bloodResponse = `Thank you for your blood donation request. `;
        if (bloodType) {
          bloodResponse += `I understand you need ${bloodType} blood. `;
        }
        if (urgencyWords.length > 0) {
          bloodResponse += `I can see this is urgent. `;
        }
        bloodResponse += `Your request has been categorized as a ${priority} priority blood request and will be shared with our volunteer donors immediately.`;
        return {
          response: bloodResponse,
          category: category,
          priority: priority
        };

      case 'elder_support':
        let elderResponse = `Thank you for reaching out about elder care support. `;
        if (/medicine|medication|pills|tablets/i.test(text)) {
          elderResponse += `I understand you need help with medication management. `;
        } else if (/grocery|shopping|food/i.test(text)) {
          elderResponse += `I see you need assistance with grocery shopping. `;
        } else if (/care|assistance|help/i.test(text)) {
          elderResponse += `I understand you need general care assistance. `;
        }
        elderResponse += `Your elder support request has been marked as ${priority} priority and our volunteers will be notified.`;
        return {
          response: elderResponse,
          category: category,
          priority: priority
        };

      case 'complaint':
        let complaintResponse = `Thank you for bringing this issue to our attention. `;
        if (/service|staff|employee/i.test(text)) {
          complaintResponse += `I understand you have concerns about service quality. `;
        } else if (/delay|late|slow/i.test(text)) {
          complaintResponse += `I see you're experiencing delays. `;
        } else if (/problem|issue|trouble/i.test(text)) {
          complaintResponse += `I understand you're facing some difficulties. `;
        }
        complaintResponse += `Your complaint has been registered with ${priority} priority and will be forwarded to the appropriate authorities for resolution.`;
        return {
          response: complaintResponse,
          category: category,
          priority: priority
        };

      case 'emergency':
        return {
          response: `🚨 EMERGENCY REQUEST RECEIVED 🚨\n\nI understand this is an urgent situation requiring immediate attention. Your emergency request has been marked as URGENT priority and emergency volunteers are being notified RIGHT NOW. You should receive contact within 30 minutes.\n\nFor life-threatening emergencies, please also call 108 (ambulance) or 112 (emergency services).`,
          category: category,
          priority: 'urgent'
        };

      default:
        return this.handleGeneralQuestion(text, lowerText);
    }
  }

  /**
   * Handle general questions when Gemini is not available - try to be helpful
   */
  handleGeneralQuestion(text, lowerText) {
    // Math questions
    if (/^\s*\d+\s*[\+\-\*\/]\s*\d+\s*$/.test(lowerText)) {
      try {
        // Simple math evaluation (safe for basic operations)
        const result = Function('"use strict"; return (' + lowerText.replace(/[^0-9+\-*/().]/g, '') + ')')();
        return {
          response: `${text} = ${result}`,
          category: 'general_inquiry',
          priority: 'low'
        };
      } catch (e) {
        return {
          response: `I can help with simple math! Could you rephrase your calculation?`,
          category: 'general_inquiry',
          priority: 'low'
        };
      }
    }

    // Health-related questions
    if (/fever|temperature|cold|cough|headache|pain|sick|illness|disease|symptoms/i.test(lowerText)) {
      if (/fever/i.test(lowerText)) {
        return {
          response: `Fever is your body's natural response to infection or illness. Normal body temperature is around 98.6°F (37°C). A fever is generally considered 100.4°F (38°C) or higher. Common causes include infections, flu, colds, or other illnesses. Stay hydrated, rest, and consider seeing a doctor if fever persists over 3 days or is very high. For serious symptoms, consult a healthcare professional.`,
          category: 'general_inquiry',
          priority: 'low'
        };
      }
      return {
        response: `I understand you're asking about health symptoms. While I can provide general information, it's always best to consult with a healthcare professional for medical advice. If you're experiencing concerning symptoms, please consider seeing a doctor.`,
        category: 'general_inquiry',
        priority: 'low'
      };
    }

    // Basic greetings
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|namaste)$/i.test(lowerText)) {
      return {
        response: `Hello! I'm your SevaLink AI assistant. I can answer questions, help with information, or assist with community services. What would you like to know?`,
        category: 'general_inquiry',
        priority: 'low'
      };
    }

    // For everything else, try to be helpful but acknowledge limitations
    return {
      response: `I'd be happy to help with your question about "${text}". While I have some general knowledge, I work best with community service requests like blood donations, elder support, and complaints. For detailed information on specific topics, you might want to consult specialized resources. Is there anything specific I can help you with?`,
      category: 'general_inquiry',
      priority: 'low'
    };
  }

  /**
   * Generate audio response using Web Speech API (client-side implementation)
   */
  prepareVoiceResponse(text, language = 'en') {
    // This will be implemented on the frontend using Web Speech API
    return {
      text: text,
      language: language,
      shouldSpeak: this.enableVoiceResponses,
      voiceSettings: {
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0
      }
    };
  }

  /**
   * Get service status
   */
  async getServiceStatus() {
    try {
      // Test Gemini connection
      const testResult = await this.model.generateContent('Hello');
      const response = await testResult.response;

      return {
        available: true,
        service: 'gemini-pro',
        voiceEnabled: this.enableVoiceResponses,
        status: 'operational'
      };
    } catch (error) {
      return {
        available: false,
        service: 'gemini-pro',
        voiceEnabled: this.enableVoiceResponses,
        status: 'error',
        error: error.message
      };
    }
  }
}

module.exports = new GeminiVoiceService();
