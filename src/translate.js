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
 * Retrieves the translation rules based on the target language.
 *
 * @param {string} targetLanguage - ISO 639-1 code of the target language.
 * @returns {string} - Translation rules as a string.
 */
function getTranslationRules(targetLanguage) {
  const rules = {
    en: `
English Translation Rules:

1. **Accuracy of Translation**
   Ensure the meaning of the original dialogue is accurately conveyed.
   Avoid word-for-word translations if they hinder comprehension; prioritize the message.
2. **Readability**
   Limit the number of characters per line (usually 37–42 characters) to ensure subtitles are easily readable.
   Use two lines per subtitle screen at most.
3. **Subtitle Display Time**
   Ensure the subtitle stays on screen long enough to be read. A general rule is 1 second for every 12 characters.
   Minimum display time: 1 second, maximum display time: 7 seconds.
4. **Timing and Synchronization**
   Subtitles should be in sync with the audio, appearing and disappearing when the dialogue is spoken.
   Avoid having subtitles that linger after the character has stopped speaking.
5. **Line Breaks**
   Break lines at natural pauses or punctuation marks (e.g., after commas or conjunctions).
   Keep related words (like subject and verb) on the same line to maintain flow and comprehension.
6. **Punctuation**
   Use standard punctuation (periods, commas, question marks) to reflect the tone and meaning of the dialogue.
   Use ellipses (…) for pauses or trailing off.
7. **Conciseness**
   Subtitles should be concise, capturing the essence of the dialogue without unnecessary words.
   Eliminate filler words like "um" and "uh," unless crucial for character portrayal.
8. **Grammar and Spelling**
   Ensure subtitles use correct grammar, spelling, and capitalization.
   Use lowercase for common words, but capitalize proper nouns and titles.
9. **Slang and Cultural References**
   If slang or cultural references are used, make sure they are understandable by a broad audience, possibly using adapted or explanatory translations.
10. **Speaker Identification**
    When multiple people are speaking, ensure it's clear who is saying what by using hyphens (-) for different speakers on the same subtitle screen.
    Do not put the name of the person speaking in the subtitle.
11. **Language Consistency**
    Maintain consistent terminology and phrasing throughout a series or film to ensure clarity for viewers, especially when dealing with technical terms or character names.
    `,
    ja: `
日本語翻訳ルール:

1. **自然で簡潔な翻訳**
   原文に忠実でありながら、自然な日本語に意訳する。直訳ではなく、話者の意図を理解しやすい形で伝える。
2. **文字数制限**
   1行あたりの文字数は13～15文字を目安にする。1回の字幕表示で最大2行までに制限する。
   長い文章は適切な箇所で分割し、簡潔にまとめる。
3. **適切なタイミングと表示時間**
   1秒あたり約4～5文字を目安とし、視聴者が無理なく字幕を読めるように表示時間を調整する。
   最低でも1.5秒、最大でも7秒の表示時間を確保する。
4. **改行のルール**
   改行は意味の切れ目や自然な場所で行い、関連する言葉やフレーズを分断しないようにする。主語と述語や助詞と動詞はできるだけ一緒に表示する。
5. **句読点の使用**
   日本語の自然なリズムを保つために、適切な句読点の場合「、」は半角スペース、「。」がある場合は全角スペースを使用する。疑問文には「？」、感嘆文には「！」を使い、話者のトーンを反映する。
6. **敬語・口語の使用**
   話者のトーンや口調を反映し、適切な敬語や口語を使用する。話者のキャラクターやスタイルに応じた翻訳を行う。
7. **固有名詞や専門用語**
   固有名詞や専門用語、ブランド名は可能な限り原文を保持しつつ、必要であれば説明や注釈を加える。
8. **音声要素の翻訳**
   効果音や音楽、重要な音声イベントは字幕で表示する（例：「[笑い]」「[拍手]」）。これにより聴覚障害者にも分かりやすくする。
9. **スラングや文化特有の表現**
   スラングや文化特有の表現は、視聴者に分かりやすく意訳する。意味が伝わりにくい場合、適切な表現に置き換える。
10. **一貫したスタイルの維持**
    字幕のフォーマットやスタイルは、一貫性を保つ。全体で同じ翻訳ルールを適用する。
11. **複数人が同時に話している場合**
    同一画面内で複数の話者が話す場合、各話者のセリフの前にハイフンを使用して区別する。
    話者の名前は字幕として表示しない。
    `,
  };
  
  return rules[targetLanguage] || '';
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

    // Retrieve translation rules based on target language
    const translationRules = getTranslationRules(targetLanguage);

    // Prepare translation prompt with dynamic source language and rules
    const basePrompt = `Translate the following subtitles from ${getLanguageName(
      sourceLanguage
    )} to ${getLanguageName(
      targetLanguage
    )}. Preserve the SRT format exactly, including numbering and timestamps. Only translate the subtitle text. Do not alter any numbers or timestamps. Do not include any markdown or code block syntax in your response. Apply the following translation rules:\n\n${translationRules}\n\nExample:\n\n1\n00:00:01,000 --> 00:00:04,000\nHello, world!\n\nTranslated Example:\n\n1\n00:00:01,000 --> 00:00:04,000\nこんにちは、世界！\n\nNow, translate the following subtitles:`;

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
