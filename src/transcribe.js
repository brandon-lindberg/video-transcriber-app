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

    return transcriptionData;
  } catch (error) {
    console.error('Error during transcription:', error.response ? error.response.data : error.message);
    return null;
  }
}

module.exports = { transcribeAudio };
