// src/translate.js

const fs = require('fs');
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');

async function translateSubtitles(inputFile, targetLanguage, apiKey, model, saveDirectory) {
  try {
    // Initialize OpenAI client with user-provided API key
    const configuration = new Configuration({
      apiKey: apiKey,
    });
    const openai = new OpenAIApi(configuration);

    const srtContent = fs.readFileSync(inputFile, 'utf8');
    const entries = srtContent.split('\n\n').filter(Boolean);

    const translatedEntries = [];

    for (const entry of entries) {
      const [id, time, ...textLines] = entry.split('\n');
      const text = textLines.join(' ');

      // Translate text using OpenAI's Chat Completion API
      const messages = [
        {
          role: 'system',
          content: `You are a helpful assistant that translates text from English to ${getLanguageName(
            targetLanguage
          )}. Do not include any additional text or explanations in your response.`,
        },
        { role: 'user', content: text },
      ];

      const response = await openai.createChatCompletion({
        model: model, // Use the user-selected model
        messages: messages,
        max_tokens: 1000,
        temperature: 0.3,
      });

      const translation = response.data.choices[0].message.content.trim();

      translatedEntries.push(`${id}\n${time}\n${translation}\n`);
    }

    const translatedSrtContent = translatedEntries.join('\n\n');

    const outputFileName = `subtitles_${targetLanguage}.srt`;
    const outputFilePath = path.join(saveDirectory, outputFileName);
    fs.writeFileSync(outputFilePath, translatedSrtContent);
    console.log(`Translated SRT file generated: ${outputFilePath}`);
  } catch (error) {
    console.error('Error during translation:', error.response ? error.response.data : error.message);
  }
}

// Helper function to get language name from code
function getLanguageName(code) {
  const languages = {
    en: 'English',
    ja: 'Japanese',
    es: 'Spanish',
    fr: 'French',
    // Add more language codes and names as needed
  };
  return languages[code] || code;
}

module.exports = { translateSubtitles };
