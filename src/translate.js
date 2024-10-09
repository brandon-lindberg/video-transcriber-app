// src/translate.js

const fs = require('fs');
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');
const { encoding_for_model } = require('@dqbd/tiktoken');

/**
 * Maps language codes to their respective language names.
 *
 * @param {string} code - ISO 639-1 language code.
 * @returns {string} - Full language name.
 */
function getLanguageName(code) {
  const languages = {
    en: 'English',
    ja: 'Japanese',
    es: 'Spanish',
    fr: 'French',
    // Add more languages as needed
  };
  return languages[code] || code;
}

/**
 * Counts the number of tokens in chat messages based on the model.
 *
 * @param {Array} messages - Array of chat messages.
 * @param {string} model - OpenAI model name.
 * @returns {number} - Total token count.
 */
function countMessageTokens(messages, model) {
  const encoding = encoding_for_model(model);
  let tokensPerMessage = 3; // Adjust based on model
  let tokensPerName = 1;

  let numTokens = 0;
  for (const message of messages) {
    numTokens += tokensPerMessage;
    for (const key of ['role', 'content', 'name']) {
      if (message[key]) {
        numTokens += encoding.encode(message[key]).length;
      }
    }
    if (message['name']) {
      numTokens += tokensPerName;
    }
  }
  numTokens += 3; // Priming tokens
  encoding.free();
  return numTokens;
}

/**
 * Translates subtitles from a source language to a target language.
 *
 * @param {string} inputFile - Path to the input SRT file.
 * @param {string} sourceLanguage - ISO 639-1 code of the source language.
 * @param {string} targetLanguage - ISO 639-1 code of the target language.
 * @param {string} apiKey - OpenAI API key.
 * @param {string} model - OpenAI model name.
 * @param {string} saveDirectory - Directory to save the translated SRT file.
 * @returns {object} - Translation token usage and API call count.
 */
async function translateSubtitles(
  inputFile,
  sourceLanguage,
  targetLanguage,
  apiKey,
  model,
  saveDirectory
) {
  try {
    // Initialize OpenAI client
    const configuration = new Configuration({
      apiKey: apiKey,
    });
    const openai = new OpenAIApi(configuration);

    // Load tokenizer
    const encoding = encoding_for_model(model);

    const srtContent = fs.readFileSync(inputFile, 'utf8').trim();

    // Prepare translation prompt with dynamic source language
    const basePrompt = `Translate the following subtitles from ${getLanguageName(
      sourceLanguage
    )} to ${getLanguageName(
      targetLanguage
    )}. Preserve the SRT format exactly, including numbering and timestamps. Only translate the subtitle text. Do not alter any numbers or timestamps. Do not include any markdown or code block syntax in your response.`;

    const basePromptTokens = encoding.encode(basePrompt).length;

    // Determine model's context window size
    let maxModelTokens;
    if (model === 'gpt-4o') {
      maxModelTokens = 4096; // Example value; adjust as needed
    } else if (model.startsWith('gpt-3.5')) {
      maxModelTokens = 4096;
    } else if (model.startsWith('gpt-4')) {
      maxModelTokens = 8192;
    } else {
      maxModelTokens = 2048; // Default
    }

    const reservedTokens = 500; // Safety buffer
    const tokensPerRequest = maxModelTokens - reservedTokens;

    // Split SRT into entries
    const srtEntries = srtContent.split('\n\n').filter(Boolean);

    // Define max entries per chunk
    const maxEntriesPerChunk = 15;

    // Build chunks
    const chunks = [];
    let currentChunkEntries = [];
    let currentChunkTokens = basePromptTokens;

    for (const entry of srtEntries) {
      const entryTokens = encoding.encode(entry + '\n\n').length;
      const estimatedTranslationTokens = Math.ceil(entryTokens * 2.0); // Estimated

      if (
        (currentChunkEntries.length + 1 > maxEntriesPerChunk) ||
        (currentChunkTokens + entryTokens + estimatedTranslationTokens > tokensPerRequest)
      ) {
        if (currentChunkEntries.length > 0) {
          chunks.push(currentChunkEntries.join('\n\n'));
          console.log(`Created chunk ${chunks.length} with ${currentChunkEntries.length} entries.`);
        }
        currentChunkEntries = [entry];
        currentChunkTokens = basePromptTokens + entryTokens;
      } else {
        currentChunkEntries.push(entry);
        currentChunkTokens += entryTokens;
      }
    }

    // Push last chunk
    if (currentChunkEntries.length > 0) {
      chunks.push(currentChunkEntries.join('\n\n'));
      console.log(`Created chunk ${chunks.length} with ${currentChunkEntries.length} entries.`);
    }

    // Ensure max API calls
    const maxApiCalls = 25;
    if (chunks.length > maxApiCalls) {
      const entriesPerChunk = Math.ceil(srtEntries.length / maxApiCalls);
      const newChunks = [];
      for (let i = 0; i < srtEntries.length; i += entriesPerChunk) {
        const chunkEntries = srtEntries.slice(i, i + entriesPerChunk);
        newChunks.push(chunkEntries.join('\n\n'));
      }
      chunks.length = 0;
      chunks.push(...newChunks);
      console.log(`Re-chunked into ${chunks.length} chunks to fit within maxApiCalls.`);
    }

    console.log(`Total chunks to translate: ${chunks.length}`);

    let translatedSrtContent = '';
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let apiCalls = 0;

    for (const [index, chunk] of chunks.entries()) {
      const messages = [
        {
          role: 'user',
          content: `${basePrompt}\n\n${chunk}`,
        },
      ];

      const promptTokens = countMessageTokens(messages, model);
      const maxResponseTokens = maxModelTokens - promptTokens - reservedTokens;

      if (maxResponseTokens <= 0) {
        console.error(
          `Error: Max response tokens is non-positive (${maxResponseTokens}). Reduce the chunk size.`
        );
        return;
      }

      // API call
      const response = await openai.createChatCompletion({
        model: model,
        messages: messages,
        max_tokens: maxResponseTokens,
        temperature: 0.3,
        top_p: 1,
        n: 1,
        stop: null,
      });

      const translation = response.data.choices[0].message.content.trim();
      translatedSrtContent += translation + '\n\n';

      // Token usage
      const usage = response.data.usage;
      if (usage && usage.total_tokens) {
        totalTokens += usage.total_tokens;
        inputTokens += usage.prompt_tokens;
        outputTokens += usage.completion_tokens;
        apiCalls += 1;
      } else {
        console.warn(`Usage data missing for chunk ${index + 1}.`);
      }

      console.log(
        `Translated chunk ${index + 1}/${chunks.length} for ${getLanguageName(
          targetLanguage
        )}. Tokens used: ${usage ? usage.total_tokens : 'N/A'}`
      );
    }

    // Save translated SRT
    const outputFileName = `subtitles_${targetLanguage}.srt`;
    const outputFilePath = path.join(saveDirectory, outputFileName);
    fs.writeFileSync(outputFilePath, translatedSrtContent.trim());
    console.log(`Translated SRT file generated: ${outputFilePath}`);

    // Clean up tokenizer
    encoding.free();

    return {
      tokensUsed: totalTokens,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      apiCalls: apiCalls,
    };
  } catch (error) {
    console.error(
      'Error during translation:',
      error.response ? error.response.data : error.message
    );
    return {
      tokensUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      apiCalls: 0,
    };
  }
}

module.exports = { translateSubtitles };

