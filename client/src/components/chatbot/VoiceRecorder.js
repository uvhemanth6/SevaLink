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
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  
  const audioRef = useRef(null);
  const timerRef = useRef(null);

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

  const handleStartRecording = async () => {
    try {
      setError(null);
      setPermissionDenied(false);

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

      // Call the parent component's send function
      if (onSendAudio) {
        console.log('VoiceRecorder: Calling onSendAudio...');
        const result = await onSendAudio(formData);
        console.log('VoiceRecorder: Received result:', result);

        if (result && result.success && onTranscriptionReceived) {
          console.log('VoiceRecorder: Calling onTranscriptionReceived...');
          onTranscriptionReceived(result.data);
          // Clear the recording after successful sending
          handleClearRecording();
        } else {
          throw new Error(result?.error || 'Failed to process audio');
        }
      } else {
        throw new Error('No audio handler provided');
      }

    } catch (error) {
      console.error('VoiceRecorder: Error sending audio:', error);
      setError(error.message || 'Failed to send audio. Please try again.');
    } finally {
      setIsProcessing(false);
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
    <div className="voice-recorder bg-gray-50 rounded-lg p-4 border border-gray-200">
      {/* Language Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Language
        </label>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          disabled={disabled || isRecording || isProcessing}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {/* Recording Controls */}
      <div className="flex items-center justify-center space-x-4 mb-4">
        {!audioBlob && !isRecording && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleStartRecording}
            disabled={disabled || isProcessing}
            className="flex items-center justify-center w-16 h-16 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-full shadow-lg transition-colors duration-200"
          >
            <MicrophoneIcon className="w-8 h-8" />
          </motion.button>
        )}

        {isRecording && (
          <div className="flex flex-col items-center space-y-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStopRecording}
              className="flex items-center justify-center w-16 h-16 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg"
              style={{
                animation: 'pulse 1.5s ease-in-out infinite'
              }}
            >
              <StopIcon className="w-8 h-8" />
            </motion.button>

            {/* Recording quality indicator */}
            <div className="flex items-center space-x-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 h-4 rounded-full transition-colors duration-300 ${
                    recordingTime > i * 2 ? 'bg-red-500' : 'bg-gray-300'
                  }`}
                  style={{
                    animation: recordingTime > i * 2 ? `bounce 0.6s ease-in-out infinite ${i * 0.1}s` : 'none'
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {audioBlob && (
          <div className="flex items-center space-x-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePlayPause}
              disabled={disabled || isProcessing}
              className="flex items-center justify-center w-12 h-12 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-full shadow-md transition-colors duration-200"
            >
              {isPlaying ? (
                <PauseIcon className="w-6 h-6" />
              ) : (
                <PlayIcon className="w-6 h-6" />
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleClearRecording}
              disabled={disabled || isProcessing}
              className="flex items-center justify-center w-12 h-12 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white rounded-full shadow-md transition-colors duration-200"
            >
              <TrashIcon className="w-6 h-6" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSendRecording}
              disabled={disabled || isProcessing}
              className="flex items-center justify-center w-12 h-12 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-full shadow-md transition-colors duration-200"
            >
              {isProcessing ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <PaperAirplaneIcon className="w-6 h-6" />
              )}
            </motion.button>
          </div>
        )}
      </div>

      {/* Recording Status */}
      <div className="text-center">
        {isRecording && (
          <div className="text-red-600 font-medium">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span>🎤 Recording... {formatDetailedTime(recordingTime)}</span>
            </div>
            <div className="text-xs text-red-500 mt-1">
              {recordingTime < 3 ? 'Keep speaking...' : recordingTime > 60 ? 'Long recording detected' : 'Good length'}
            </div>
          </div>
        )}

        {audioBlob && !isRecording && (
          <div className="text-gray-600">
            <p className="font-medium">🎵 Recording ready ({formatTime(totalRecordedTime)})</p>
            <p className="text-sm text-gray-500">
              Language: {languages.find(l => l.code === selectedLanguage)?.name}
            </p>
            <div className="text-xs text-green-600 mt-1">
              ✅ Ready to send • Size: {audioBlob ? Math.round(audioBlob.size / 1024) : 0}KB
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="text-blue-600 font-medium">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>Processing audio...</span>
            </div>
          </div>
        )}

        {!isRecording && !audioBlob && !isProcessing && !error && (
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-2">
              🎤 Click the microphone to start recording
            </p>
            <p className="text-xs text-gray-400">
              Supports: English • हिंदी • తెలుగు
            </p>
          </div>
        )}

        {isProcessing && (
          <div className="text-blue-600 font-medium">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>🤖 Processing your voice...</span>
            </div>
            <div className="text-xs text-blue-500 mt-1 text-center">
              Converting speech to text using AI
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
            <div className="flex items-start space-x-2">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
                    className="mt-2 text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors"
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
