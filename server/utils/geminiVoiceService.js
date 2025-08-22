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
You are SevaLink AI Assistant, a helpful government service chatbot for citizens in India.

User Input: "${text}"
User Language: ${language}
Response Language: ${languageInstructions[language] || 'English'}

Your task:
1. Analyze the user's request and categorize it
2. Provide a helpful, empathetic response
3. Give clear next steps
4. Format your response as JSON with these fields:
   - response: Your helpful response text
   - category: One of [blood_request, elder_support, complaint, emergency, general_inquiry]
   - priority: One of [low, medium, high, urgent]
   - nextSteps: Array of actionable next steps

Categories (in order of priority):
- blood_request: Blood donation needs, transfusion requests, blood types (O+, O-, A+, A-, B+, B-, AB+, AB-), surgery blood needs, hospital blood requirements
- elder_support: Help for elderly citizens, medicine, groceries, care
- complaint: Infrastructure issues, broken services, civic problems
- emergency: Non-medical urgent situations (fire, accident, crime) - NOTE: Blood requests should be categorized as blood_request even if urgent
- general_inquiry: General questions, information requests

IMPORTANT: If the message mentions blood, blood types, donation, transfusion, surgery, or hospital blood needs, it should ALWAYS be categorized as "blood_request" regardless of urgency keywords.

Priority levels:
- urgent: Emergency situations, critical health needs
- high: Important but not life-threatening
- medium: Standard requests
- low: General inquiries, non-urgent matters

Respond with empathy and provide practical guidance. Keep responses concise but helpful.

Example response format:
{
  "response": "I understand you need help with blood donation. I've categorized this as a high-priority blood request.",
  "category": "blood_request",
  "priority": "high",
  "nextSteps": ["Your request has been saved", "Volunteers will be notified", "Check your dashboard for updates"]
}
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
    const lowerText = text.toLowerCase();

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
   * Get fallback response if Gemini fails
   */
  getFallbackResponse(text, context) {
    const { language = 'en' } = context;
    const category = this.fallbackCategorize(text);
    const priority = this.fallbackPriority(text);

    // Create contextual responses based on category
    const responses = {
      'blood_request': {
        'en': `✅ **Blood Request Received**\n\nI understand you need blood donation assistance. Your request has been categorized as a blood request with ${priority} priority.\n\n**Next Steps:**\n• Your request is saved in the system\n• Volunteers will be notified\n• You'll receive updates on your dashboard\n\n**Estimated Response Time:** 2-4 hours for urgent requests, 24 hours for others.`,
        'hi': `✅ **रक्तदान अनुरोध प्राप्त**\n\nमैं समझता हूं कि आपको रक्तदान सहायता की आवश्यकता है। आपका अनुरोध ${priority} प्राथमिकता के साथ रक्त अनुरोध के रूप में वर्गीकृत किया गया है।`,
        'te': `✅ **రక్తదాన అభ్యర్థన స్వీకరించబడింది**\n\nమీకు రక్తదాన సహాయం అవసరమని నేను అర్థం చేసుకున్నాను। మీ అభ్యర్థన ${priority} ప్రాధాన్యతతో రక్త అభ్యర్థనగా వర్గీకరించబడింది।`
      },
      'elder_support': {
        'en': `✅ **Elder Support Request Received**\n\nI understand you need assistance for elderly care. Your request has been categorized as elder support with ${priority} priority.\n\n**Next Steps:**\n• Volunteers specializing in elder care will be notified\n• You'll receive contact from suitable helpers\n• Check your dashboard for updates`,
        'hi': `✅ **बुजुर्ग सहायता अनुरोध प्राप्त**\n\nमैं समझता हूं कि आपको बुजुर्गों की देखभाल के लिए सहायता चाहिए।`,
        'te': `✅ **వృద్ధుల సహాయ అభ్యర్థన స్వీకరించబడింది**\n\nమీకు వృద్ధుల సంరక్షణ కోసం సహాయం అవసరమని నేను అర్థం చేసుకున్నాను।`
      },
      'complaint': {
        'en': `✅ **Complaint Registered**\n\nI've received your complaint about the issue you're facing. Your complaint has been categorized with ${priority} priority.\n\n**Next Steps:**\n• Your complaint is logged in the system\n• Relevant authorities will be notified\n• You'll receive updates on resolution progress\n• Track status in your dashboard`,
        'hi': `✅ **शिकायत दर्ज**\n\nमैंने आपकी समस्या के बारे में आपकी शिकायत प्राप्त की है।`,
        'te': `✅ **ఫిర్యాదు నమోదు చేయబడింది**\n\nమీరు ఎదుర్కొంటున్న సమస్య గురించి మీ ఫిర్యాదును నేను స్వీకరించాను।`
      },
      'emergency': {
        'en': `🚨 **Emergency Request Received**\n\nI understand this is an urgent situation. Your emergency request has been marked with URGENT priority.\n\n**Immediate Actions:**\n• Emergency volunteers are being notified NOW\n• Your request is at the top of the queue\n• You should receive contact within 30 minutes\n\n**For life-threatening emergencies, please also call 108 (ambulance) or 112 (emergency services).**`,
        'hi': `🚨 **आपातकालीन अनुरोध प्राप्त**\n\nमैं समझता हूं कि यह एक तत्काल स्थिति है।`,
        'te': `🚨 **అత్యవసర అభ్యర్థన స్వీకరించబడింది**\n\nఇది అత్యవసర పరిస్థితి అని నేను అర్థం చేసుకున్నాను।`
      },
      'general_inquiry': {
        'en': `✅ **Message Received**\n\nThank you for contacting SevaLink. I've received your message and it will be reviewed by our team.\n\n**Next Steps:**\n• Your message is saved in the system\n• Appropriate volunteers will be contacted\n• You'll receive updates via dashboard\n\n**Response Time:** Usually within 24 hours.`,
        'hi': `✅ **संदेश प्राप्त**\n\nSevaLink से संपर्क करने के लिए धन्यवाद।`,
        'te': `✅ **సందేశం స్వీకరించబడింది**\n\nSevaLinkని సంప్రదించినందుకు ధన్యవాదాలు।`
      }
    };

    const categoryResponses = responses[category] || responses['general_inquiry'];
    const response = categoryResponses[language] || categoryResponses['en'];

    return {
      response: response,
      category: category,
      priority: priority
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
