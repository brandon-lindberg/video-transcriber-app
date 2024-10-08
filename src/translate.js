// src/translate.js

const fs = require('fs');
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');
const { encoding_for_model } = require('@dqbd/tiktoken');

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

// Function to count tokens in chat messages
function countMessageTokens(messages, model) {
  const encoding = encoding_for_model(model);
  let tokensPerMessage = 3; // Assuming gpt-4o follows the same pattern as gpt-4
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
  numTokens += 3; // Every reply is primed with <|start|>assistant<|message|>
  encoding.free();
  return numTokens;
}

async function translateSubtitles(
  inputFile,
  targetLanguage,
  apiKey,
  model,
  saveDirectory
) {
  try {
    // Initialize OpenAI client with the provided API key
    const configuration = new Configuration({
      apiKey: apiKey,
    });
    const openai = new OpenAIApi(configuration);

    // Load the appropriate tokenizer
    const encoding = encoding_for_model(model);

    const srtContent = fs.readFileSync(inputFile, 'utf8').trim();

    // Prepare the base prompt
    const basePrompt = `Translate the following subtitles from English to ${getLanguageName(
      targetLanguage
    )}. Preserve the SRT format exactly, including numbering and timestamps. Only translate the subtitle text. Do not alter any numbers or timestamps.`;

    const basePromptTokens = encoding.encode(basePrompt).length;

    // Determine the context window size for the model
    let maxModelTokens;
    if (model === 'gpt-4o') {
      maxModelTokens = 4096; // Corrected context window for 'gpt-4o'
    } else if (model.startsWith('gpt-3.5')) {
      maxModelTokens = 4096;
    } else if (model.startsWith('gpt-4')) {
      maxModelTokens = 8192;
    } else {
      maxModelTokens = 2048; // Default context window for other models
    }

    const reservedTokens = 500; // Reserve tokens for safety
    const tokensPerRequest = maxModelTokens - reservedTokens;

    // Split SRT content into entries
    const srtEntries = srtContent.split('\n\n').filter(Boolean);

    // Define maximum entries per chunk to ensure we don't exceed token limits
    const maxEntriesPerChunk = 15; // Adjusted to create ~25 chunks from 353 entries

    // Build chunks ensuring they fit within token limits and max entries
    const chunks = [];
    let currentChunkEntries = [];
    let currentChunkTokens = basePromptTokens;

    for (const entry of srtEntries) {
      const entryTokens = encoding.encode(entry + '\n\n').length;
      const estimatedTranslationTokens = Math.ceil(entryTokens * 2.0); // Expansion factor of 2.0

      // Check if adding this entry exceeds the maxEntriesPerChunk or token limits
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

    // Push the last chunk
    if (currentChunkEntries.length > 0) {
      chunks.push(currentChunkEntries.join('\n\n'));
      console.log(`Created chunk ${chunks.length} with ${currentChunkEntries.length} entries.`);
    }

    // Ensure we do not exceed maxApiCalls
    const maxApiCalls = 25;
    if (chunks.length > maxApiCalls) {
      // Recalculate entriesPerChunk to fit within maxApiCalls
      const entriesPerChunk = Math.ceil(srtEntries.length / maxApiCalls);
      // Rebuild chunks
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

      // Ensure maxResponseTokens is positive
      if (maxResponseTokens <= 0) {
        console.error(
          `Error: Max response tokens is non-positive (${maxResponseTokens}). Reduce the chunk size.`
        );
        return;
      }

      // Make the API call
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

      // Accumulate tokens used
      const usage = response.data.usage;
      if (usage && usage.total_tokens) {
        totalTokens += usage.total_tokens;
        inputTokens += usage.prompt_tokens;
        outputTokens += usage.completion_tokens;
        apiCalls += 1;
      }

      // Progress update
      console.log(
        `Translated chunk ${index + 1}/${chunks.length} for ${getLanguageName(
          targetLanguage
        )}. Tokens used: ${usage.total_tokens}`
      );
    }

    // Save the translated content
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
