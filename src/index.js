// src/index.js

const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('./transcribe');
const { translateSubtitles } = require('./translate');
const ffmpeg = require('fluent-ffmpeg');

/**
 * Processes a video file by extracting audio, splitting it, transcribing, and translating subtitles.
 *
 * @param {string} videoPath - Path to the video file.
 * @param {Array<string>} targetLanguages - Array of target language codes.
 * @param {string} apiKey - OpenAI API key.
 * @param {string} model - OpenAI model name for translation (e.g., 'gpt-4o').
 * @param {string} saveDirectory - Directory to save SRT files.
 * @param {function} progressCallback - Callback to update progress with percentage and message.
 * @returns {object} - Aggregated token usage and API call counts.
 */
async function processVideo(
  videoPath,
  targetLanguages,
  apiKey,
  model,
  saveDirectory,
  progressCallback
) {
  try {
    // Verify video file exists
    if (!fs.existsSync(videoPath)) {
      throw new Error('Video file not found at the specified path.');
    }

    // Step 1: Extract and Split Audio
    progressCallback(0, 'Extracting and splitting audio...');
    await new Promise((resolve, reject) => {
      splitAudio(videoPath, (error) => {
        if (error) {
          return reject(error);
        }
        progressCallback(10, 'Audio extraction and splitting completed.');
        resolve();
      });
    });

    // Step 2: Transcribe Audio Chunks
    const transcriptionSegments = await transcribeChunks(
      apiKey,
      model,
      saveDirectory,
      progressCallback
    );

    // Step 3: Merge Transcriptions into a Single SRT
    progressCallback(50, 'Merging transcriptions...');
    const detectedLanguage = mergeTranscriptions(transcriptionSegments, saveDirectory);
    progressCallback(60, 'SRT file generated.');

    // Step 4: Translate the Single SRT File
    const translationStats = await translateSRT(
      saveDirectory,
      detectedLanguage,
      targetLanguages,
      apiKey,
      model,
      progressCallback
    );

    // Step 5: Cleanup Temporary Files
    cleanupTemporaryFiles(saveDirectory);
    progressCallback(100, 'Processing completed.');

    return {
      tokensUsed: translationStats.tokensUsed,
      inputTokens: translationStats.inputTokens,
      outputTokens: translationStats.outputTokens,
      apiCalls: translationStats.apiCalls,
      detectedLanguage: detectedLanguage,
    };
  } catch (error) {
    console.error('Error in processVideo:', error);
    throw error;
  }
}

/**
 * Splits audio from the video into smaller chunks using FFmpeg.
 *
 * @param {string} videoPath - Path to the video file.
 * @param {function} callback - Callback to handle completion.
 */
function splitAudio(videoPath, callback) {
  const outputPattern = path.join(__dirname, '..', 'output_audio_part%03d.mp3');
  const segmentDuration = 300; // 5 minutes in seconds

  ffmpeg(videoPath)
    .noVideo() // Exclude video streams
    .audioCodec('libmp3lame') // Re-encode audio to MP3
    .audioBitrate('192k') // Set audio bitrate
    .outputOptions([
      '-f', 'segment',
      '-segment_time', segmentDuration.toString(),
      '-reset_timestamps', '1',
    ])
    .output(outputPattern)
    .on('start', function (commandLine) {
      console.log('FFmpeg command:', commandLine);
    })
    .on('error', function (err, stdout, stderr) {
      console.error('FFmpeg error:', err.message);
      console.error('FFmpeg stderr:', stderr);
      callback(err);
    })
    .on('end', function () {
      console.log('Audio extraction and splitting completed.');
      callback(null);
    })
    .run();
}

/**
 * Transcribes each audio chunk and collects all transcription segments with adjusted timestamps.
 *
 * @param {string} apiKey - OpenAI API key.
 * @param {string} model - OpenAI model name for transcription.
 * @param {string} saveDirectory - Directory to save SRT files.
 * @param {function} progressCallback - Callback to update progress with percentage and message.
 * @returns {Array<object>} - Array of all transcription segments with adjusted timestamps.
 */
async function transcribeChunks(apiKey, model, saveDirectory, progressCallback) {
  const audioDir = path.join(__dirname, '..');
  const audioFiles = fs
    .readdirSync(audioDir)
    .filter((file) => file.startsWith('output_audio_part') && file.endsWith('.mp3'));
  console.log(`Found ${audioFiles.length} audio files to transcribe.`);

  const allSegments = [];
  let cumulativeDuration = 0; // Tracks total duration processed so far

  const totalAudioChunks = audioFiles.length;
  for (let i = 0; i < totalAudioChunks; i++) {
    const file = audioFiles[i];
    const filePath = path.join(audioDir, file);
    console.log(`Starting transcription for: ${filePath}`);
    progressCallback(
      10 + ((i + 1) / (totalAudioChunks + 4)) * 40,
      `Transcribing chunk ${i + 1}/${totalAudioChunks}...`
    );

    const transcriptionResult = await transcribeAudio(filePath, apiKey, 'whisper-1'); // Ensure 'whisper-1' is used

    if (transcriptionResult && transcriptionResult.transcriptionData && transcriptionResult.transcriptionData.segments) {
      console.log(`Transcription successful for: ${file}`);
      const segments = transcriptionResult.transcriptionData.segments;

      // Adjust timestamps for each segment based on cumulativeDuration
      const adjustedSegments = segments.map((segment) => ({
        ...segment,
        start: segment.start + cumulativeDuration,
        end: segment.end + cumulativeDuration,
      }));

      allSegments.push(...adjustedSegments);

      // Update cumulativeDuration based on audio chunk duration
      const metadata = await getAudioDuration(filePath);
      cumulativeDuration += metadata.duration;
      console.log(`Cumulative duration after ${file}: ${cumulativeDuration} seconds`);
    } else {
      console.error(`Transcription failed for chunk: ${file}`);
      throw new Error(`Transcription failed for chunk: ${file}`);
    }
  }

  console.log(`Total transcription segments collected: ${allSegments.length}`);
  return allSegments;
}

/**
 * Retrieves the duration of an audio file in seconds.
 *
 * @param {string} filePath - Path to the audio file.
 * @returns {Promise<{duration: number}>} - Duration in seconds.
 */
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error(`Error retrieving metadata for ${filePath}:`, err);
        return reject(err);
      }
      const duration = metadata.format.duration;
      resolve({ duration });
    });
  });
}

/**
 * Merges all transcription segments into a single SRT file.
 *
 * @param {Array<object>} allSegments - Array of all transcription segments with adjusted timestamps.
 * @param {string} saveDirectory - Directory to save SRT files.
 * @returns {string} - Detected language code.
 */
function mergeTranscriptions(allSegments, saveDirectory) {
  if (allSegments.length === 0) {
    throw new Error('No transcription segments to merge.');
  }

  // Sort segments by start time
  allSegments.sort((a, b) => a.start - b.start);

  // Assume all segments are in the same language; take the language from the first segment
  const detectedLanguage = allSegments[0].language || 'en';

  // Generate SRT entries
  const srtEntries = allSegments.map((segment, index) => {
    const id = index + 1;
    const startTime = secondsToSRTTime(segment.start);
    const endTime = secondsToSRTTime(segment.end);
    const text = segment.text.trim();

    return `${id}\n${startTime} --> ${endTime}\n${text}\n`;
  });

  const srtContent = srtEntries.join('\n');

  // Save the merged SRT file
  const outputFilePath = path.join(saveDirectory, 'subtitles_original.srt');
  fs.writeFileSync(outputFilePath, srtContent);
  console.log(`Merged SRT file generated: ${outputFilePath}`);

  return detectedLanguage;
}

/**
 * Translates the single SRT file into target languages.
 *
 * @param {string} saveDirectory - Directory where SRT files are saved.
 * @param {string} detectedLanguage - Detected source language code.
 * @param {Array<string>} targetLanguages - Array of target language codes.
 * @param {string} apiKey - OpenAI API key.
 * @param {string} model - OpenAI model name for translation (e.g., 'gpt-4o').
 * @param {function} progressCallback - Callback to update progress with percentage and message.
 * @returns {object} - Aggregated token usage and API call counts.
 */
async function translateSRT(saveDirectory, detectedLanguage, targetLanguages, apiKey, model, progressCallback) {
  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalAPICalls = 0;

  const originalSrtPath = path.join(saveDirectory, 'subtitles_original.srt');
  const totalTranslations = targetLanguages.length;

  for (let i = 0; i < totalTranslations; i++) {
    const lang = targetLanguages[i];
    const currentPercentage = 60 + ((i + 1) / totalTranslations) * 30; // 60% to 90%
    progressCallback(
      currentPercentage,
      `Translating subtitles to ${getLanguageName(lang)} (${lang})...`
    );
    console.log(`Translating to ${lang} (${getLanguageName(lang)})`);

    const translationResult = await translateSubtitles(
      originalSrtPath,
      detectedLanguage,
      lang,
      apiKey,
      model,
      saveDirectory
    );

    if (translationResult) {
      totalTokens += translationResult.tokensUsed;
      totalInputTokens += translationResult.inputTokens;
      totalOutputTokens += translationResult.outputTokens;
      totalAPICalls += translationResult.apiCalls;

      const finalPercentage = 60 + ((i + 1) / totalTranslations) * 30; // Ensure it doesn't exceed 90%
      progressCallback(
        finalPercentage,
        `Translated SRT file generated for ${getLanguageName(lang)}.`
      );
      console.log(`Translated to ${lang}: ${getLanguageName(lang)}`);
    } else {
      const errorPercentage = 60 + ((i + 1) / totalTranslations) * 30;
      progressCallback(
        errorPercentage,
        `Failed to translate to ${getLanguageName(lang)}.`
      );
      console.warn(`Translation result for ${lang} is undefined.`);
    }
  }

  return {
    tokensUsed: totalTokens,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    apiCalls: totalAPICalls,
  };
}

/**
 * Cleans up temporary audio chunk files and output_audio.json files to conserve storage.
 *
 * @param {string} saveDirectory - Directory where SRT files are saved.
 */
function cleanupTemporaryFiles(saveDirectory) {
  const audioDir = path.join(__dirname, '..');

  // Delete MP3 files
  const audioFiles = fs
    .readdirSync(audioDir)
    .filter((file) => file.startsWith('output_audio_part') && file.endsWith('.mp3'));

  audioFiles.forEach((file) => {
    const filePath = path.join(audioDir, file);
    fs.unlinkSync(filePath);
    console.log(`Deleted temporary audio file: ${filePath}`);
  });

  // Delete output_audio.json files
  const jsonFiles = fs
    .readdirSync(audioDir)
    .filter((file) => file.startsWith('output_audio') && file.endsWith('.json'));

  jsonFiles.forEach((file) => {
    const filePath = path.join(audioDir, file);
    fs.unlinkSync(filePath);
    console.log(`Deleted temporary JSON file: ${filePath}`);
  });
}

/**
 * Converts seconds to SRT time format (HH:MM:SS,mmm).
 *
 * @param {number} totalSeconds - Total seconds.
 * @returns {string} - Formatted time string.
 */
function secondsToSRTTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  const milliseconds = Math.floor((totalSeconds % 1) * 1000)
    .toString()
    .padStart(3, '0');

  return `${hours}:${minutes}:${seconds},${milliseconds}`;
}

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

module.exports = { processVideo };
