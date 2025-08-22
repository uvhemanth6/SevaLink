import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  PaperAirplaneIcon,
  MicrophoneIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import VoiceRecorder from '../components/chatbot/VoiceRecorder';
import WebSpeechRecorder from '../components/chatbot/WebSpeechRecorder';
import voiceService from '../utils/voiceService';
import toast from 'react-hot-toast';
import { AuthContext } from '../contexts/AuthContext';

const ChatAIPage = () => {
  const { user, isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: 'Welcome to SevaLink AI Assistant! 🤖\n\nI can help you with:\n• Blood donation requests\n• Elder support services\n• Filing complaints\n• General inquiries\n\nYou can type your message or use voice recording in English, Hindi, or Telugu.',
      sender: 'bot',
      timestamp: new Date(),
      type: 'welcome'
    }
  ]);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranscription, setLastTranscription] = useState(null);
  const [useWebSpeech, setUseWebSpeech] = useState(true); // Default to Web Speech API

  const messagesEndRef = useRef(null);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check authentication on component mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !isAuthenticated) {
      console.log('No valid authentication found');
      // Don't redirect immediately, let the user see the page first
    }
  }, [isAuthenticated, navigate]);

  // Show loading or login prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
          <SparklesIcon className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-6">Please log in to access the AI Assistant</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

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

    // Add typing indicator
    const typingMessage = {
      id: Date.now() + 0.5,
      text: 'AI is thinking...',
      sender: 'bot',
      timestamp: new Date(),
      type: 'typing'
    };
    setMessages(prev => [...prev, typingMessage]);

    try {
      // Check authentication before sending
      const token = localStorage.getItem('token');
      console.log('ChatAI: Sending message, token exists:', !!token);
      console.log('ChatAI: User authenticated:', isAuthenticated);

      if (!token || !isAuthenticated) {
        throw new Error('AUTHENTICATION_REQUIRED');
      }

      console.log('ChatAI: Calling voiceService.sendTextMessage with:', userMessage.text);
      const result = await voiceService.sendTextMessage(userMessage.text);
      console.log('ChatAI: Received result:', result);

      // Remove typing indicator
      setMessages(prev => prev.filter(msg => msg.type !== 'typing'));

      if (result.success) {
        const categoryDisplay = result.data.category === 'blood_request' ? 'Blood Request' :
                               result.data.category === 'elder_support' ? 'Elder Support' :
                               result.data.category === 'complaint' ? 'Complaint' :
                               result.data.category.replace('_', ' ').toUpperCase();

        // Use Gemini's response if available, otherwise use default
        const responseText = result.data.geminiResponse ||
          `✅ **Request Submitted Successfully!**\n\n📝 **Your Message:** "${userMessage.text}"\n\n🏷️ **Category:** ${categoryDisplay}\n⚡ **Priority:** ${result.data.priority.toUpperCase()}\n\n📋 **What Happens Next:**\n• Your request has been saved to your account\n• Check "My Requests" in the dashboard to track progress\n• Volunteers will be notified and can respond\n• You'll receive updates via notifications\n\n🔔 **Estimated Response Time:** 2-4 hours\n\n💡 **Tip:** Visit Dashboard → My Requests to see all your submissions`;

        const botResponse = {
          id: Date.now() + 1,
          text: responseText,
          sender: 'bot',
          timestamp: new Date(),
          type: 'success',
          data: result.data
        };

        setMessages(prev => [...prev, botResponse]);

        // Show appropriate success message
        if (result.data.usingFallback) {
          toast.success('Request processed successfully! (Basic mode - add Gemini API key for AI features)');
        } else {
          toast.success('Request processed with AI assistance!');
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error sending message:', error);

      // Remove typing indicator
      setMessages(prev => prev.filter(msg => msg.type !== 'typing'));

      let errorMessage = '❌ **Error Processing Request**\n\nSorry, I encountered an error. Please try again or contact support.';

      if (error.message === 'AUTHENTICATION_REQUIRED' || error.response?.status === 401) {
        errorMessage = '🔐 **Authentication Required**\n\nYour session has expired. Redirecting to login...';
        toast.error('Session expired - redirecting to login');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else if (error.response?.status === 500) {
        errorMessage = '🔧 **Server Error**\n\nOur servers are experiencing issues. Please try again in a few minutes.';
      }

      const errorResponse = {
        id: Date.now() + 1,
        text: errorMessage,
        sender: 'bot',
        timestamp: new Date(),
        type: 'error'
      };
      setMessages(prev => [...prev, errorResponse]);

      if (error.message !== 'AUTHENTICATION_REQUIRED') {
        toast.error('Failed to process request');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendAudio = async (formData) => {
    setIsProcessing(true);

    // Add processing message
    const processingMessage = {
      id: Date.now(),
      text: '🎤 Processing your voice message...',
      sender: 'bot',
      timestamp: new Date(),
      type: 'processing'
    };
    setMessages(prev => [...prev, processingMessage]);

    try {
      // Check authentication before sending
      const token = localStorage.getItem('token');
      console.log('ChatAI Voice: Token exists:', !!token);
      console.log('ChatAI Voice: User authenticated:', isAuthenticated);
      console.log('ChatAI Voice: User object:', user);

      if (!token || !isAuthenticated || !user) {
        throw new Error('AUTHENTICATION_REQUIRED');
      }

      console.log('ChatAI Voice: Calling voiceService.uploadAudio...');
      const result = await voiceService.uploadAudio(formData);
      console.log('ChatAI Voice: Upload result:', result);

      // Remove processing message
      setMessages(prev => prev.filter(msg => msg.type !== 'processing'));

      if (result.success) {
        // Create a temporary response while processing
        const tempResponse = {
          ...result.data,
          transcribedText: result.data.transcribedText || 'Voice received! Processing transcription...'
        };
        return { success: true, data: tempResponse };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error processing audio:', error);

      // Remove processing message
      setMessages(prev => prev.filter(msg => msg.type !== 'processing'));

      let errorMessage = '🎤 **Voice Processing Failed**\n\nCouldn\'t process your voice message. Please try again or type your message.';

      if (error.message === 'AUTHENTICATION_REQUIRED' || error.response?.status === 401) {
        errorMessage = '🔐 **Authentication Required**\n\nYour session has expired. Redirecting to login...';
        toast.error('Session expired - redirecting to login');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }

      const errorResponse = {
        id: Date.now() + 1,
        text: errorMessage,
        sender: 'bot',
        timestamp: new Date(),
        type: 'error'
      };
      setMessages(prev => [...prev, errorResponse]);

      if (error.message !== 'AUTHENTICATION_REQUIRED') {
        toast.error('Voice processing failed');
      }
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTranscriptionReceived = (transcriptionData) => {
    setLastTranscription(transcriptionData);

    // Add user's voice message
    const userMessage = {
      id: Date.now(),
      text: transcriptionData.transcribedText,
      sender: 'user',
      timestamp: new Date(),
      type: 'voice',
      metadata: {
        language: transcriptionData.detectedLanguage,
        confidence: transcriptionData.confidence,
        category: transcriptionData.category,
        priority: transcriptionData.priority,
        isMock: transcriptionData.isMock
      }
    };

    setMessages(prev => [...prev, userMessage]);

    // Add bot response
    const languageName = getLanguageName(transcriptionData.detectedLanguage);
    const mockNote = transcriptionData.isMock ? '\n\n🔧 **Note:** Using demo mode (Hugging Face API not configured)' : '';

    const categoryDisplay = transcriptionData.category === 'blood' ? 'Blood Request' :
                           transcriptionData.category === 'elder_support' ? 'Elder Support' :
                           transcriptionData.category === 'complaint' ? 'Complaint' :
                           transcriptionData.category.replace('_', ' ').toUpperCase();

    const botResponse = {
      id: Date.now() + 1,
      text: `🎤 **Voice Message Processed!**\n\n🗣️ **Transcribed Text:** "${transcriptionData.transcribedText}"\n\n🌐 **Language:** ${languageName}\n📊 **Confidence:** ${Math.round(transcriptionData.confidence * 100)}%\n\n✅ **Request Details:**\n🏷️ **Category:** ${categoryDisplay}\n⚡ **Priority:** ${transcriptionData.priority.toUpperCase()}\n\n📋 **Saved Successfully!**\n• Added to your "My Requests" list\n• Volunteers will be notified\n• Check dashboard for updates\n\n💡 **Tip:** Visit Dashboard → My Requests to track progress${mockNote}`,
      sender: 'bot',
      timestamp: new Date(),
      type: 'voice_success',
      data: transcriptionData
    };

    setMessages(prev => [...prev, botResponse]);

    if (transcriptionData.isMock) {
      toast.success('Voice message processed (demo mode)!');
    } else {
      toast.success('Voice message processed successfully!');
    }
  };

  const getLanguageName = (code) => {
    const languages = {
      'en': 'English',
      'hi': 'Hindi (हिंदी)',
      'te': 'Telugu (తెలుగు)'
    };
    return languages[code] || 'Unknown';
  };

  const toggleVoiceRecorder = () => {
    setShowVoiceRecorder(!showVoiceRecorder);
  };

  // Handle Web Speech API transcription
  const handleWebSpeechTranscription = async (transcriptionData) => {
    setLastTranscription(transcriptionData);

    // Add user's voice message
    const userMessage = {
      id: Date.now(),
      text: transcriptionData.transcribedText,
      sender: 'user',
      timestamp: new Date(),
      type: 'voice',
      metadata: {
        language: transcriptionData.detectedLanguage,
        confidence: transcriptionData.confidence,
        method: transcriptionData.method
      }
    };

    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);

    // Add typing indicator
    const typingMessage = {
      id: Date.now() + 0.5,
      text: '🤖 AI is processing your voice message...',
      sender: 'bot',
      timestamp: new Date(),
      type: 'typing'
    };
    setMessages(prev => [...prev, typingMessage]);

    try {
      // Send to new voice-text endpoint
      const response = await fetch('/api/chatbot/voice-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          message: transcriptionData.transcribedText,
          language: transcriptionData.detectedLanguage,
          confidence: transcriptionData.confidence,
          voiceMetadata: {
            method: transcriptionData.method,
            timestamp: transcriptionData.timestamp
          }
        })
      });

      const result = await response.json();

      // Remove typing indicator
      setMessages(prev => prev.filter(msg => msg.type !== 'typing'));

      if (result.success) {
        const categoryDisplay = result.data.category === 'blood_request' ? 'Blood Request' :
                               result.data.category === 'elder_support' ? 'Elder Support' :
                               result.data.category === 'complaint' ? 'Complaint' :
                               result.data.category.replace('_', ' ').toUpperCase();

        const botResponse = {
          id: Date.now() + 1,
          text: result.data.geminiResponse || `✅ **Voice Message Processed!**\n\n🗣️ **You said:** "${transcriptionData.transcribedText}"\n\n🏷️ **Category:** ${categoryDisplay}\n⚡ **Priority:** ${result.data.priority.toUpperCase()}\n\n📋 Your request has been saved and volunteers will be notified!`,
          sender: 'bot',
          timestamp: new Date(),
          type: 'voice_success',
          data: result.data
        };

        setMessages(prev => [...prev, botResponse]);

        // Speak the response if voice response is enabled
        if (result.data.needsVoiceResponse && result.data.voiceResponse) {
          speakResponse(result.data.voiceResponse.text, result.data.voiceResponse.language);
        }

        toast.success('Voice message processed successfully!');
      } else {
        throw new Error(result.error || 'Failed to process voice message');
      }

    } catch (error) {
      console.error('Error processing voice message:', error);

      // Remove typing indicator
      setMessages(prev => prev.filter(msg => msg.type !== 'typing'));

      const errorResponse = {
        id: Date.now() + 1,
        text: '❌ **Voice Processing Failed**\n\nSorry, I couldn\'t process your voice message. Please try again or type your message.',
        sender: 'bot',
        timestamp: new Date(),
        type: 'error'
      };
      setMessages(prev => [...prev, errorResponse]);
      toast.error('Failed to process voice message');
    } finally {
      setIsProcessing(false);
    }
  };

  // Speak response using Web Speech API
  const speakResponse = (text, language = 'en') => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'hi' ? 'hi-IN' : language === 'te' ? 'te-IN' : 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      window.speechSynthesis.speak(utterance);
    }
  };

  const getMessageIcon = (type) => {
    switch (type) {
      case 'success':
      case 'voice_success':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'error':
        return <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />;
      case 'welcome':
        return <SparklesIcon className="w-5 h-5 text-blue-500" />;
      case 'voice':
        return <MicrophoneIcon className="w-5 h-5 text-purple-500" />;
      default:
        return <ChatBubbleLeftRightIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Simplified Header */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white p-4 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/30">
            <SparklesIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Assistant</h1>
            <p className="text-blue-100 text-sm">🎤 Voice-enabled • 🌐 Multilingual</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-2xl px-4 py-3 rounded-xl shadow-md ${
                msg.sender === 'user'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border border-blue-400'
                  : msg.type === 'error'
                  ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-800 border border-red-200'
                  : msg.type === 'success' || msg.type === 'voice_success'
                  ? 'bg-gradient-to-r from-green-50 to-green-100 text-green-800 border border-green-200'
                  : msg.type === 'processing' || msg.type === 'typing'
                  ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-white text-gray-800 border border-gray-200 shadow-sm'
              }`}
            >
              {msg.sender === 'bot' && (
                <div className="flex items-center space-x-2 mb-2">
                  {getMessageIcon(msg.type)}
                  <span className="text-sm font-medium">AI Assistant</span>
                </div>
              )}

              <div className="text-sm">
                {msg.type === 'typing' || msg.type === 'processing' ? (
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span>{msg.text}</span>
                  </div>
                ) : (
                  <p className="whitespace-pre-line">{msg.text}</p>
                )}

                {/* Voice message metadata */}
                {msg.type === 'voice' && msg.metadata && (
                  <div className="mt-2 pt-2 border-t border-white/20 text-xs opacity-75">
                    <div className="flex items-center space-x-3">
                      <span>🌐 {getLanguageName(msg.metadata.language)}</span>
                      <span>📊 {Math.round(msg.metadata.confidence * 100)}% confidence</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-xs opacity-60 mt-2">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Voice Recorder */}
      {showVoiceRecorder && (
        <div className="p-4 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
          <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
            {/* Toggle between Web Speech API and File Upload */}
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Voice Input</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setUseWebSpeech(true)}
                  className={`px-3 py-1 rounded text-sm ${useWebSpeech ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                >
                  🎤 Live Speech
                </button>
                <button
                  onClick={() => setUseWebSpeech(false)}
                  className={`px-3 py-1 rounded text-sm ${!useWebSpeech ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                >
                  📁 File Upload
                </button>
              </div>
            </div>

            {useWebSpeech ? (
              <WebSpeechRecorder
                onTranscriptionReceived={handleWebSpeechTranscription}
                disabled={isProcessing}
                language={lastTranscription?.detectedLanguage || 'en'}
              />
            ) : (
              <VoiceRecorder
                onSendAudio={handleSendAudio}
                onTranscriptionReceived={handleTranscriptionReceived}
                disabled={isProcessing}
              />
            )}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200 bg-white shadow-lg">
        <div className="flex items-center space-x-3">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isProcessing && handleSendMessage()}
            placeholder="Type your message here... 💬"
            disabled={isProcessing}
            className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition-all duration-200"
          />

          <button
            onClick={toggleVoiceRecorder}
            disabled={isProcessing}
            className={`p-3 transition-all duration-200 rounded-xl shadow-md ${
              showVoiceRecorder
                ? 'text-blue-600 bg-blue-50 border-2 border-blue-200 scale-105'
                : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-2 border-gray-200 hover:border-blue-200'
            } disabled:text-gray-300 disabled:cursor-not-allowed`}
            title={showVoiceRecorder ? 'Hide voice recorder' : 'Show voice recorder'}
          >
            <MicrophoneIcon className="w-6 h-6" />
          </button>

          <button
            onClick={handleSendMessage}
            disabled={isProcessing || !message.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2 font-semibold transition-colors"
          >
            {isProcessing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <PaperAirplaneIcon className="w-5 h-5" />
            )}
            <span>Send</span>
          </button>
        </div>

        {/* Status indicators */}
        {lastTranscription && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-sm text-green-700 font-medium">
              ✅ Last transcription: {getLanguageName(lastTranscription.detectedLanguage)}
              {lastTranscription.confidence && ` (${Math.round(lastTranscription.confidence * 100)}% confidence)`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatAIPage;
