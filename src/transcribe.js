// src/transcribe.js

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/**
 * Transcribes audio from a given file using OpenAI's Whisper API with auto language detection.
 *
 * @param {string} filePath - Path to the audio file.
 * @param {string} apiKey - OpenAI API key.
 * @returns {object} - Transcription data including detected language and token usage.
 */
async function transcribeAudio(filePath, apiKey) {
  try {
    const fileStream = fs.createReadStream(filePath);

    const formData = new FormData();
    formData.append('file', fileStream);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json'); // Get detailed transcription data

    // Removed the 'language' parameter to allow auto-detection

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${apiKey}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const transcriptionData = response.data;
    console.log('Transcription successful!');

    // Save the transcription data to a JSON file for debugging (optional)
    fs.writeFileSync('transcription.json', JSON.stringify(transcriptionData, null, 2));

    // Extract token usage information
    const usage = transcriptionData.usage || {};
    const tokensUsed = usage.total_tokens || 0;
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const apiCalls = 1;

    return {
      transcriptionData,
      tokensUsed,
      inputTokens,
      outputTokens,
      apiCalls,
    };
  } catch (error) {
    console.error('Error during transcription:', error.response ? error.response.data : error.message);
    return {
      transcriptionData: null,
      tokensUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      apiCalls: 0,
    };
  }
}

module.exports = { transcribeAudio };
