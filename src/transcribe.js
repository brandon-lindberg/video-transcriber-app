// src/transcribe.js

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function transcribeAudio(filePath, apiKey) {
  try {
    const fileStream = fs.createReadStream(filePath);

    const formData = new FormData();
    formData.append('file', fileStream);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json'); // Get timestamps
    formData.append('language', 'en'); // Specify the language if known

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
    // Save the transcription data to a JSON file
    fs.writeFileSync('transcription.json', JSON.stringify(transcriptionData, null, 2));

    // Get tokens used
    const usage = response.data.usage || {};
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
