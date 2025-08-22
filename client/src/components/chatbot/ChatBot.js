import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  MicrophoneIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import VoiceRecorder from './VoiceRecorder';
import voiceService from '../../utils/voiceService';
import toast from 'react-hot-toast';

const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: 'Hello! I\'m your SevaLink AI assistant. You can type your message or use the voice recorder below. I support English, Hindi, and Telugu languages. (Voice chatbot is ready!)',
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranscription, setLastTranscription] = useState(null);

  const messagesEndRef = useRef(null);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!message.trim() || isProcessing) return;

    const userMessage = {
      id: Date.now(),
      text: message.trim(),
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    };

    setMessages(prev => [...prev, userMessage]);
    setMessage('');
    setIsProcessing(true);

    try {
      // Check if user is authenticated
      const token = localStorage.getItem('token');
      console.log('Token exists:', !!token); // Debug log

      if (!token) {
        // For testing, let's add a simple response without authentication
        const botResponse = {
          id: Date.now() + 1,
          text: 'Please log in to use the full chatbot features. For now, I can confirm I received your message: "' + userMessage.text + '"',
          sender: 'bot',
          timestamp: new Date(),
          type: 'info'
        };
        setMessages(prev => [...prev, botResponse]);
        toast.error('Please log in to use chatbot features');
        return;
      }

      console.log('Sending message to backend:', userMessage.text); // Debug log

      // Send text message to backend
      try {
        const result = await voiceService.sendTextMessage(userMessage.text);
        console.log('Backend response:', result); // Debug log

        if (result.success) {
          const botResponse = {
            id: Date.now() + 1,
            text: `Thank you for your message! I've received your ${result.data.category} request with ${result.data.priority} priority. Your request has been saved and will be reviewed by our volunteers soon.`,
            sender: 'bot',
            timestamp: new Date(),
            type: 'response',
            data: result.data
          };

          setMessages(prev => [...prev, botResponse]);
          toast.success('Message sent successfully!');
        } else {
          throw new Error(result.error);
        }
      } catch (backendError) {
        console.log('Backend error, using fallback response:', backendError);

        // Fallback response for testing
        const botResponse = {
          id: Date.now() + 1,
          text: 'Thank you for your message. I\'m currently in development mode. Soon I\'ll be able to help you with complaints, blood donations, and elderly support!',
          sender: 'bot',
          timestamp: new Date(),
          type: 'fallback'
        };
        setMessages(prev => [...prev, botResponse]);
        toast.info('Using fallback mode - backend not available');
      }

    } catch (error) {
      console.error('Error sending message:', error);
      const errorResponse = {
        id: Date.now() + 1,
        text: 'Sorry, I encountered an error processing your message. Please try again.',
        sender: 'bot',
        timestamp: new Date(),
        type: 'error'
      };
      setMessages(prev => [...prev, errorResponse]);
      toast.error('Failed to send message');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoiceMessage = async (formData) => {
    console.log('ChatBot: Handling voice message...');
    setIsProcessing(true);

    try {
      // Check if user is authenticated
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Please log in to use voice features');
        return { success: false, error: 'Authentication required' };
      }

      // Use browser's Web Speech API for transcription
      const audioBlob = formData.get('audio');
      const language = formData.get('language') || 'en';
      const duration = formData.get('duration') || 0;

      console.log('ChatBot: Starting speech recognition...');

      // Create speech recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        console.log('ChatBot: Speech recognition not supported, using mock transcription');
        return await handleMockVoiceTranscription(audioBlob, language, duration);
      }

      // Use Web Speech API for real-time transcription
      return await handleWebSpeechAPI(audioBlob, language, duration);

    } catch (error) {
      console.error('ChatBot: Voice processing error:', error);
      toast.error('Failed to process voice message');
      return { success: false, error: error.message };
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWebSpeechAPI = async (audioBlob, language, duration) => {
    return new Promise((resolve) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      // Configure recognition
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      // Set language
      const langMap = {
        'en': 'en-US',
        'hi': 'hi-IN',
        'te': 'te-IN',
        'auto': 'en-US'
      };
      recognition.lang = langMap[language] || 'en-US';

      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        const confidence = event.results[0][0].confidence;

        console.log('ChatBot: Transcription result:', transcript);

        // Send transcribed text to backend
        try {
          const result = await voiceService.sendTextMessage(transcript, language);

          if (result.success) {
            resolve({
              success: true,
              data: {
                transcribedText: transcript,
                confidence: confidence,
                ...result.data
              }
            });
          } else {
            resolve({ success: false, error: result.error });
          }
        } catch (error) {
          console.error('ChatBot: Error sending transcribed text:', error);
          resolve({ success: false, error: error.message });
        }
      };

      recognition.onerror = (event) => {
        console.error('ChatBot: Speech recognition error:', event.error);
        resolve({ success: false, error: `Speech recognition failed: ${event.error}` });
      };

      recognition.onend = () => {
        console.log('ChatBot: Speech recognition ended');
      };

      // Start recognition with audio
      try {
        recognition.start();

        // Play the audio to trigger recognition
        const audio = new Audio(URL.createObjectURL(audioBlob));
        audio.play().catch(console.error);

      } catch (error) {
        console.error('ChatBot: Failed to start recognition:', error);
        resolve({ success: false, error: 'Failed to start speech recognition' });
      }
    });
  };

  const handleMockVoiceTranscription = async (audioBlob, language, duration) => {
    // Mock transcription for testing
    const mockTexts = {
      'en': 'I need help with my request. Thank you.',
      'hi': 'मुझे अपने अनुरोध में सहायता चाहिए। धन्यवाद।',
      'te': 'నాకు నా అభ్యర్థనలో సహాయం కావాలి. ధన్యవాదాలు।'
    };

    const transcript = mockTexts[language] || mockTexts['en'];

    try {
      const result = await voiceService.sendTextMessage(transcript, language);

      return {
        success: true,
        data: {
          transcribedText: transcript,
          confidence: 0.95,
          isMock: true,
          ...result.data
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const handleTranscriptionReceived = (data) => {
    console.log('ChatBot: Transcription received:', data);

    // Add user message (transcribed voice)
    const userMessage = {
      id: Date.now(),
      text: data.transcribedText,
      sender: 'user',
      timestamp: new Date(),
      type: 'voice',
      confidence: data.confidence,
      language: data.detectedLanguage || 'en'
    };

    setMessages(prev => [...prev, userMessage]);

    // Add bot response
    const botResponse = {
      id: Date.now() + 1,
      text: data.geminiResponse || `Thank you for your voice message! I've processed your ${data.category} request with ${data.priority} priority.`,
      sender: 'bot',
      timestamp: new Date(),
      type: 'voice_response',
      data: data
    };

    setMessages(prev => [...prev, botResponse]);

    // Store transcription for reference
    setLastTranscription(data);

    // Show success message
    toast.success('Voice message processed successfully!');

    // Speak the response if needed
    if (data.needsVoiceResponse && data.voiceResponse) {
      speakResponse(data.voiceResponse.text, data.voiceResponse.language);
    }
  };

  const speakResponse = (text, language = 'en') => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);

      // Set language
      const langMap = {
        'en': 'en-US',
        'hi': 'hi-IN',
        'te': 'te-IN'
      };
      utterance.lang = langMap[language] || 'en-US';

      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      speechSynthesis.speak(utterance);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMessageIcon = (type) => {
    switch (type) {
      case 'voice':
        return <MicrophoneIcon className="w-4 h-4 text-blue-500" />;
      case 'response':
      case 'voice_response':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'error':
        return <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Chat Button */}
      <motion.button
        onClick={() => setIsOpen(true)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className={`fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-50 flex items-center justify-center ${isOpen ? 'hidden' : 'block'}`}
      >
        <ChatBubbleLeftRightIcon className="w-8 h-8" />
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="fixed bottom-6 right-6 w-96 h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-500 to-primary-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <ChatBubbleLeftRightIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold">SevaLink Assistant</h3>
                  <p className="text-xs text-primary-100">Online • AI Powered</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors duration-200"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs px-4 py-2 rounded-2xl ${
                      msg.sender === 'user'
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <div className="flex items-start space-x-2">
                      {getMessageIcon(msg.type)}
                      <div className="flex-1">
                        <p className="text-sm">{msg.text}</p>
                        {msg.type === 'voice' && msg.confidence && (
                          <p className="text-xs opacity-70 mt-1">
                            🎤 Voice ({Math.round(msg.confidence * 100)}% confidence)
                          </p>
                        )}
                        {msg.data && msg.data.category && (
                          <p className="text-xs opacity-70 mt-1">
                            📋 {msg.data.category.replace('_', ' ')} • {msg.data.priority} priority
                          </p>
                        )}
                        <p className="text-xs opacity-60 mt-1">
                          {formatTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-2xl">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm">Processing...</p>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200">
              {/* Voice Recorder */}
              {showVoiceRecorder && (
                <div className="mb-4">
                  <VoiceRecorder
                    onSendAudio={handleVoiceMessage}
                    onTranscriptionReceived={handleTranscriptionReceived}
                    disabled={isProcessing}
                  />
                </div>
              )}

              {/* Text Input */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  disabled={isProcessing}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <button
                  onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                  disabled={isProcessing}
                  className={`p-2 transition-colors duration-200 rounded-full ${
                    showVoiceRecorder
                      ? 'text-primary-500 bg-primary-50'
                      : 'text-gray-400 hover:text-primary-500'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={showVoiceRecorder ? 'Hide voice recorder' : 'Show voice recorder'}
                >
                  <MicrophoneIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={isProcessing || !message.trim()}
                  className="p-2 bg-primary-500 text-white rounded-full hover:bg-primary-600 transition-colors duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <PaperAirplaneIcon className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Status */}
              {lastTranscription && (
                <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                  <p>Last voice message: "{lastTranscription.transcribedText}"</p>
                  <p>Category: {lastTranscription.category} • Priority: {lastTranscription.priority}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatBot;
