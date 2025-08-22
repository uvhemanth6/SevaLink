import axios from 'axios';

class VoiceService {
  constructor() {
    this.baseURL = '/api/chatbot';
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor to add auth token
    axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          console.log('VoiceService: Adding token to request:', config.url);
        } else {
          console.warn('VoiceService: No token found for request:', config.url);
        }
        return config;
      },
      (error) => {
        console.error('VoiceService: Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    axios.interceptors.response.use(
      (response) => {
        console.log('VoiceService: Successful response from:', response.config.url);
        return response;
      },
      (error) => {
        console.error('VoiceService: Response error:', error.response?.status, error.response?.data);

        if (error.response?.status === 401) {
          // Token expired or invalid - but don't redirect automatically
          console.warn('VoiceService: Authentication failed - token may be invalid');
          // Don't remove token here, let AuthContext handle it
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Upload and process audio file
   * @param {FormData} formData - Form data containing audio file and metadata
   * @returns {Promise<Object>} Processing result
   */
  async uploadAudio(formData) {
    try {
      // Ensure we have a valid token
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required - no token found');
      }

      console.log('VoiceService: Uploading audio with token:', token.substring(0, 20) + '...');

      const response = await axios.post(`${this.baseURL}/voice`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`, // Explicitly set token
        },
        timeout: 60000, // 60 seconds timeout for audio processing
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          console.log(`VoiceService: Upload Progress: ${percentCompleted}%`);
        }
      });

      return {
        success: true,
        data: response.data.data,
        message: response.data.message
      };

    } catch (error) {
      console.error('Audio upload error:', error);
      
      let errorMessage = 'Failed to process audio';
      
      if (error.response) {
        // Server responded with error status
        errorMessage = error.response.data?.message || errorMessage;
        
        if (error.response.status === 400) {
          errorMessage = error.response.data?.errors?.join(', ') || errorMessage;
        }
      } else if (error.request) {
        // Network error
        errorMessage = 'Network error. Please check your connection.';
      } else if (error.code === 'ECONNABORTED') {
        // Timeout error
        errorMessage = 'Request timeout. Please try again.';
      }

      return {
        success: false,
        error: errorMessage,
        details: error.response?.data
      };
    }
  }

  /**
   * Send text message (manual input)
   * @param {string} message - Text message
   * @param {string} language - Language code
   * @returns {Promise<Object>} Processing result
   */
  async sendTextMessage(message, language = 'en') {
    try {
      // Ensure we have a valid token
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required - no token found');
      }

      console.log('VoiceService: Sending text message with token:', token.substring(0, 20) + '...');

      const response = await axios.post(`${this.baseURL}/text`, {
        message,
        language
      }, {
        headers: {
          'Authorization': `Bearer ${token}`, // Explicitly set token
        }
      });

      return {
        success: true,
        data: response.data.data,
        message: response.data.message
      };

    } catch (error) {
      console.error('Text message error:', error);
      
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to process text message',
        details: error.response?.data
      };
    }
  }

  /**
   * Get user's voice requests
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Voice requests list
   */
  async getVoiceRequests(params = {}) {
    try {
      const response = await axios.get(`${this.baseURL}/voice-requests`, {
        params
      });

      return {
        success: true,
        data: response.data.data,
        pagination: response.data.pagination
      };

    } catch (error) {
      console.error('Error fetching voice requests:', error);
      
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch voice requests',
        details: error.response?.data
      };
    }
  }

  /**
   * Get specific voice request details
   * @param {string} requestId - Voice request ID
   * @returns {Promise<Object>} Voice request details
   */
  async getVoiceRequest(requestId) {
    try {
      const response = await axios.get(`${this.baseURL}/voice-requests/${requestId}`);

      return {
        success: true,
        data: response.data.data
      };

    } catch (error) {
      console.error('Error fetching voice request:', error);
      
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch voice request',
        details: error.response?.data
      };
    }
  }

  /**
   * Validate audio file before upload
   * @param {File} file - Audio file
   * @returns {Object} Validation result
   */
  validateAudioFile(file) {
    const maxSize = 25 * 1024 * 1024; // 25MB
    const supportedTypes = [
      'audio/webm',
      'audio/mp3',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/m4a'
    ];

    const validation = {
      isValid: true,
      errors: []
    };

    // Check file type
    if (!supportedTypes.includes(file.type)) {
      validation.isValid = false;
      validation.errors.push(`Unsupported file type: ${file.type}`);
    }

    // Check file size
    if (file.size > maxSize) {
      validation.isValid = false;
      validation.errors.push(`File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds maximum limit of 25MB`);
    }

    // Check minimum size
    if (file.size < 1000) {
      validation.isValid = false;
      validation.errors.push('Audio file is too small');
    }

    return validation;
  }

  /**
   * Get audio duration from file
   * @param {File} file - Audio file
   * @returns {Promise<number>} Duration in seconds
   */
  getAudioDuration(file) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const objectUrl = URL.createObjectURL(file);
      
      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(objectUrl);
        resolve(audio.duration);
      });
      
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load audio file'));
      });
      
      audio.src = objectUrl;
    });
  }

  /**
   * Convert blob to file with proper name and type
   * @param {Blob} blob - Audio blob
   * @param {string} filename - File name
   * @param {string} mimeType - MIME type
   * @returns {File} File object
   */
  blobToFile(blob, filename = 'recording.webm', mimeType = 'audio/webm') {
    return new File([blob], filename, {
      type: mimeType,
      lastModified: Date.now()
    });
  }

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration for display
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Get supported languages
   * @returns {Array} List of supported languages
   */
  getSupportedLanguages() {
    return [
      { code: 'auto', name: 'Auto Detect', nativeName: 'Auto Detect' },
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
      { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' }
    ];
  }
}

// Create and export singleton instance
const voiceService = new VoiceService();
export default voiceService;
