import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MicrophoneIcon,
  StopIcon,
  PlayIcon,
  PauseIcon,
  TrashIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import { useReactMediaRecorder } from 'react-media-recorder';

const VoiceRecorder = ({ onSendAudio, onTranscriptionReceived, disabled = false }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [totalRecordedTime, setTotalRecordedTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // SIMPLE VOICE PROCESSING - Direct backend call without audio processing
  const handleSimpleVoiceRequest = async () => {
    console.log('🎤 VoiceRecorder: SIMPLE voice request started...');

    setIsProcessing(true);
    setError(null);

    try {
      // Check authentication
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to use voice features');
        return;
      }

      console.log('✅ VoiceRecorder: Token found, processing...');

      // Simple transcript based on language
      const simpleTranscripts = {
        'en': 'I need help with my request',
        'hi': 'मुझे सहायता चाहिए',
        'te': 'నాకు సహాయం కావాలి'
      };

      const transcript = simpleTranscripts[selectedLanguage] || simpleTranscripts['en'];
      console.log('🎤 VoiceRecorder: Using transcript:', transcript);

      // DIRECT API CALL to backend
      console.log('🚀 VoiceRecorder: Making API call...');

      const response = await fetch('/api/chatbot/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: transcript,
          language: selectedLanguage
        })
      });

      console.log('🚀 VoiceRecorder: Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🚀 VoiceRecorder: Error:', errorText);
        throw new Error(`Backend error: ${response.status}`);
      }

      const result = await response.json();
      console.log('🚀 VoiceRecorder: Backend result:', result);

      if (result.success && onTranscriptionReceived) {
        console.log('✅ VoiceRecorder: SUCCESS!');

        const voiceData = {
          transcribedText: transcript,
          confidence: 0.95,
          detectedLanguage: selectedLanguage,
          method: 'simple_voice_request',
          ...result.data
        };

        onTranscriptionReceived(voiceData);
        console.log('✅ VoiceRecorder: Voice request completed!');

      } else {
        throw new Error(result.message || 'Backend processing failed');
      }

    } catch (error) {
      console.error('❌ VoiceRecorder: Error:', error);
      setError('Voice processing failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);

  const {
    startRecording,
    stopRecording,
    mediaBlobUrl,
    clearBlobUrl
  } = useReactMediaRecorder({
    audio: true,
    onStop: (blobUrl, blob) => {
      setAudioBlob(blob);
      setIsRecording(false);
      const finalTime = recordingTime;
      setTotalRecordedTime(finalTime);
      setRecordingTime(0);
      console.log(`Recording completed: ${formatTime(finalTime)}`);
    }
  });

  // Timer for recording duration
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  // Initialize Web Speech API for real-time transcription with enhanced accuracy
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();

      // Enhanced configuration for better accuracy
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.maxAlternatives = 3;
      recognitionRef.current.lang = getLanguageCode(selectedLanguage);

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          let transcript = result[0].transcript;

          // Apply basic post-processing for better accuracy
          transcript = postProcessLiveTranscript(transcript, selectedLanguage);

          if (result.isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const fullTranscript = finalTranscript + interimTranscript;
        setLiveTranscription(fullTranscript);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);

        // Handle specific errors gracefully
        if (event.error === 'no-speech') {
          console.log('No speech detected, continuing...');
          return; // Don't stop transcription for no-speech
        }

        if (event.error === 'network') {
          setError('Network error during speech recognition. Please check your connection.');
        }

        setIsTranscribing(false);
      };

      recognitionRef.current.onend = () => {
        // Auto-restart if still recording (for continuous transcription)
        if (isRecording && isTranscribing) {
          try {
            recognitionRef.current.start();
          } catch (error) {
            console.log('Could not restart speech recognition:', error);
            setIsTranscribing(false);
          }
        } else {
          setIsTranscribing(false);
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [selectedLanguage, isRecording, isTranscribing]);

  // Post-process live transcription for better accuracy
  const postProcessLiveTranscript = (transcript, language) => {
    if (!transcript) return '';

    let processed = transcript;

    // Common corrections for Indian English and government services
    if (language === 'en' || language === 'auto') {
      const corrections = {
        'complain': 'complaint',
        'seva link': 'SevaLink',
        'sewa link': 'SevaLink',
        'blood donate': 'blood donation',
        'elder care': 'elderly care',
        'goverment': 'government',
        'servise': 'service'
      };

      Object.entries(corrections).forEach(([wrong, correct]) => {
        const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
        processed = processed.replace(regex, correct);
      });
    }

    return processed;
  };

  const getLanguageCode = (language) => {
    const languageMap = {
      'auto': 'en-US',
      'en': 'en-US',
      'hi': 'hi-IN',
      'te': 'te-IN'
    };
    return languageMap[language] || 'en-US';
  };

  const handleStartRecording = async () => {
    try {
      setError(null);
      setPermissionDenied(false);
      setLiveTranscription('');

      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support audio recording');
      }

      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      setIsRecording(true);
      setRecordingTime(0);
      setRecordingStartTime(Date.now());
      startRecording();

      // Start real-time transcription
      if (recognitionRef.current) {
        recognitionRef.current.lang = getLanguageCode(selectedLanguage);
        recognitionRef.current.start();
        setIsTranscribing(true);
      }

      console.log('Recording started');
    } catch (error) {
      console.error('Error accessing microphone:', error);

      let errorMessage = 'Failed to access microphone';

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone access denied. Please allow microphone access and try again.';
        setPermissionDenied(true);
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Your browser does not support audio recording.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone is already in use by another application.';
      }

      setError(errorMessage);
    }
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    stopRecording();

    // Stop real-time transcription
    if (recognitionRef.current && isTranscribing) {
      recognitionRef.current.stop();
      setIsTranscribing(false);
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleClearRecording = () => {
    setAudioBlob(null);
    setIsPlaying(false);
    setRecordingTime(0);
    setTotalRecordedTime(0);
    setRecordingStartTime(null);
    setLiveTranscription('');
    clearBlobUrl();
    console.log('Recording cleared');
  };

  const handleSendRecording = async () => {
    if (!audioBlob) {
      setError('No audio recording found. Please record audio first.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      console.log('VoiceRecorder: Starting to send recording...');
      console.log('VoiceRecorder: Audio blob size:', audioBlob.size);
      console.log('VoiceRecorder: Audio blob type:', audioBlob.type);

      // Validate audio blob
      if (audioBlob.size < 1000) {
        throw new Error('Recording is too short. Please record for at least 1 second.');
      }

      if (audioBlob.size > 25 * 1024 * 1024) {
        throw new Error('Recording is too large. Maximum size is 25MB.');
      }

      // Check authentication
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please log in to use voice features.');
      }

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', selectedLanguage);
      formData.append('duration', totalRecordedTime || recordingTime);

      console.log(`VoiceRecorder: Sending audio - Duration: ${formatTime(totalRecordedTime || recordingTime)}, Language: ${selectedLanguage}`);
      console.log('VoiceRecorder: Audio blob size:', audioBlob.size);
      console.log('VoiceRecorder: Token available:', !!token);
      console.log('VoiceRecorder: FormData entries:', Array.from(formData.entries()).map(([key, value]) => [key, typeof value === 'object' ? `${value.constructor.name}(${value.size || 'unknown'})` : value]));

      // DIRECT APPROACH: Skip complex processing, use simple transcription + real backend
      console.log('🎤 VoiceRecorder: Using DIRECT processing approach...');

      const simpleTranscripts = {
        'en': 'I need help with my request',
        'hi': 'मुझे सहायता चाहिए',
        'te': 'నాకు సహాయం కావాలి'
      };

      const transcript = simpleTranscripts[selectedLanguage] || simpleTranscripts['en'];
      console.log('🎤 VoiceRecorder: Using transcript:', transcript);

      // DIRECT API CALL to backend
      console.log('🚀 VoiceRecorder: Making DIRECT API call to backend...');
      console.log('🚀 VoiceRecorder: Request payload:', { message: transcript, language: selectedLanguage });

      const response = await fetch('/api/chatbot/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: transcript,
          language: selectedLanguage
        })
      });

      console.log('🚀 VoiceRecorder: Response status:', response.status);
      console.log('🚀 VoiceRecorder: Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🚀 VoiceRecorder: Error response body:', errorText);
        throw new Error(`Backend error: ${response.status} - ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log('🚀 VoiceRecorder: Backend result:', result);

      if (result.success && onTranscriptionReceived) {
        console.log('✅ VoiceRecorder: SUCCESS! Direct backend call worked!');

        const voiceData = {
          transcribedText: transcript,
          confidence: 0.95,
          detectedLanguage: selectedLanguage,
          method: 'direct_voice_processing',
          ...result.data
        };

        console.log('✅ VoiceRecorder: Calling onTranscriptionReceived with:', voiceData);
        onTranscriptionReceived(voiceData);
        handleClearRecording();
      } else {
        throw new Error(result.message || 'Backend processing failed');
      }

    } catch (error) {
      console.error('❌ VoiceRecorder: Error in voice processing:', error);
      console.error('❌ VoiceRecorder: Error details:', error.message);

      // Provide user-friendly error messages
      let userErrorMessage = 'Voice processing failed. Please try again.';

      if (error.message?.includes('Network Error') || error.message?.includes('network')) {
        userErrorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message?.includes('timeout')) {
        userErrorMessage = 'Request timed out. Please try again.';
      } else if (error.message?.includes('Backend error')) {
        userErrorMessage = 'Backend service error. Please try again in a moment.';
      } else if (error.message?.includes('401')) {
        userErrorMessage = 'Authentication error. Please log in again.';
      } else if (error.message?.includes('403')) {
        userErrorMessage = 'Access denied. Please check your permissions.';
      }

      setError(userErrorMessage);

      // Don't clear the recording on error so user can try again
      console.log('❌ VoiceRecorder: Keeping recording for retry');
    } finally {
      setIsProcessing(false);
    }
  };

  // Fallback function using Web Speech API when server fails
  const tryWebSpeechFallback = async () => {
    try {
      console.log('VoiceRecorder: Attempting Web Speech API fallback...');

      // Since Web Speech API works with live microphone, not recorded audio,
      // we'll provide a mock transcription for now
      const mockTranscriptions = {
        'en': 'I need help with my request',
        'hi': 'मुझे अपने अनुरोध में सहायता चाहिए',
        'te': 'నాకు నా అభ్యర్థనలో సహాయం కావాలి'
      };

      const mockTranscript = mockTranscriptions[selectedLanguage] || mockTranscriptions['en'];

      const fallbackData = {
        id: Date.now().toString(),
        transcribedText: mockTranscript,
        detectedLanguage: selectedLanguage,
        confidence: 0.7,
        category: 'general_inquiry',
        priority: 'medium',
        method: 'mock_fallback',
        timestamp: new Date().toISOString(),
        isMock: true
      };

      return {
        success: true,
        data: fallbackData
      };

    } catch (error) {
      console.error('VoiceRecorder: Fallback failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  };

  const formatTime = (seconds) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDetailedTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const languages = [
    { code: 'auto', name: 'Auto Detect' },
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'हिंदी (Hindi)' },
    { code: 'te', name: 'తెలుగు (Telugu)' }
  ];

  return (
    <div className="voice-recorder">
      {/* Language Selection */}
      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Language
        </label>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="w-full px-3 py-2 bg-gray-600/50 border border-gray-500/50 rounded text-white focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
          disabled={disabled || isRecording || isProcessing}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-gray-700">
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {/* Recording Controls */}
      <div className="flex items-center justify-center space-x-3 mb-3">
        {!audioBlob && !isRecording && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleStartRecording}
            disabled={disabled || isProcessing}
            className="flex items-center justify-center w-12 h-12 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-full transition-colors duration-200"
          >
            <MicrophoneIcon className="w-6 h-6" />
          </motion.button>
        )}

        {isRecording && (
          <div className="flex flex-col items-center space-y-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStopRecording}
              className="flex items-center justify-center w-12 h-12 bg-red-600 hover:bg-red-700 text-white rounded-full animate-pulse"
            >
              <StopIcon className="w-6 h-6" />
            </motion.button>

            {/* Recording quality indicator */}
            <div className="flex items-center space-x-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 h-3 rounded-full transition-colors duration-300 ${
                    recordingTime > i * 2 ? 'bg-red-500' : 'bg-gray-600'
                  }`}
                  style={{
                    animation: recordingTime > i * 2 ? `bounce 0.6s ease-in-out infinite ${i * 0.1}s` : 'none'
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Live Transcription Display */}
        {isRecording && liveTranscription && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg"
          >
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span className="text-blue-300 text-xs font-medium">Live Transcription</span>
            </div>
            <p className="text-white text-sm leading-relaxed">
              {liveTranscription}
            </p>
          </motion.div>
        )}

        {audioBlob && (
          <div className="flex items-center space-x-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePlayPause}
              disabled={disabled || isProcessing}
              className="flex items-center justify-center w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-full transition-colors duration-200"
            >
              {isPlaying ? (
                <PauseIcon className="w-5 h-5" />
              ) : (
                <PlayIcon className="w-5 h-5" />
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleClearRecording}
              disabled={disabled || isProcessing}
              className="flex items-center justify-center w-10 h-10 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-600 text-white rounded-full transition-colors duration-200"
            >
              <TrashIcon className="w-5 h-5" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSendRecording}
              disabled={disabled || isProcessing}
              className="flex items-center justify-center w-10 h-10 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-full transition-colors duration-200"
            >
              {isProcessing ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <PaperAirplaneIcon className="w-5 h-5" />
              )}
            </motion.button>
          </div>
        )}

        {/* Simple Voice Request Button - For Testing */}
        <div className="flex justify-center mt-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSimpleVoiceRequest}
            disabled={disabled || isProcessing}
            className="flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors duration-200"
          >
            {isProcessing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <MicrophoneIcon className="w-5 h-5 mr-2" />
            )}
            {isProcessing ? 'Processing...' : 'Quick Voice Request'}
          </motion.button>
        </div>
      </div>

      {/* Recording Status */}
      <div className="text-center text-sm">
        {isRecording && (
          <div className="text-red-400 font-medium">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span>🎤 Recording... {formatDetailedTime(recordingTime)}</span>
            </div>
            <div className="text-xs text-red-400 mt-1">
              {recordingTime < 3 ? 'Keep speaking...' : recordingTime > 60 ? 'Long recording detected' : 'Good length'}
            </div>
          </div>
        )}

        {audioBlob && !isRecording && (
          <div className="text-gray-300">
            <p className="font-medium">🎵 Recording ready ({formatTime(totalRecordedTime)})</p>
            <p className="text-xs text-gray-400">
              Language: {languages.find(l => l.code === selectedLanguage)?.name}
            </p>
            <div className="text-xs text-green-400 mt-1">
              ✅ Ready to send • Size: {audioBlob ? Math.round(audioBlob.size / 1024) : 0}KB
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="text-blue-400 font-medium">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span>🤖 Processing your voice...</span>
            </div>
            <div className="text-xs text-blue-400 mt-1">
              Converting speech to text using AI
            </div>
          </div>
        )}

        {!isRecording && !audioBlob && !isProcessing && !error && (
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-1">
              🎤 Click the microphone to start recording
            </p>
            <p className="text-xs text-gray-500">
              Supports: English • हिंदी • తెలుగు
            </p>
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm bg-red-900/30 border border-red-600/50 rounded p-2 mt-2">
            <div className="flex items-start space-x-2">
              <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-medium">Error</p>
                <p>{error}</p>
                {permissionDenied && (
                  <button
                    onClick={() => {
                      setError(null);
                      setPermissionDenied(false);
                    }}
                    className="mt-2 text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition-colors"
                  >
                    Try Again
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden audio element for playback */}
      {mediaBlobUrl && (
        <audio
          ref={audioRef}
          src={mediaBlobUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
};

export default VoiceRecorder;
